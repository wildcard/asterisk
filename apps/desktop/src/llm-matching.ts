/**
 * LLM-based Matching (Tier 3)
 *
 * Uses Claude API to analyze ambiguous form fields that couldn't be matched
 * via autocomplete attributes or pattern rules.
 *
 * SECURITY: Only sends field metadata (label, type, placeholder) to the LLM.
 * NEVER sends vault values or user data.
 */

import type {
  FieldNode,
  VaultItem,
  FillRecommendation,
  MatchTier,
  FieldSemantic,
  VaultCategory,
} from '@asterisk/core';

// ============================================================================
// Types
// ============================================================================

export interface LLMMatchingOptions {
  apiKey: string;
  model: string;
  maxFields?: number; // Max fields to analyze in one batch
}

export interface FieldAnalysis {
  fieldId: string;
  semantic: FieldSemantic;
  confidence: number;
  reasoning: string;
}

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ClaudeResponse {
  content: Array<{ type: 'text'; text: string }>;
}

// ============================================================================
// Semantic to Vault Mapping
// ============================================================================

/**
 * Map LLM-inferred semantic type to vault category and key pattern
 */
const SEMANTIC_TO_VAULT: Record<FieldSemantic, { category: VaultCategory; keyPattern: string } | null> = {
  firstName: { category: 'identity', keyPattern: 'firstName' },
  lastName: { category: 'identity', keyPattern: 'lastName' },
  fullName: { category: 'identity', keyPattern: 'name' },
  email: { category: 'contact', keyPattern: 'email' },
  phone: { category: 'contact', keyPattern: 'phone' },
  street: { category: 'address', keyPattern: 'street' },
  city: { category: 'address', keyPattern: 'city' },
  state: { category: 'address', keyPattern: 'state' },
  zipCode: { category: 'address', keyPattern: 'zip' },
  country: { category: 'address', keyPattern: 'country' },
  creditCard: { category: 'financial', keyPattern: 'card' },
  cvv: { category: 'financial', keyPattern: 'cvv' },
  expiryDate: { category: 'financial', keyPattern: 'expiry' },
  username: null, // Don't autofill usernames
  password: null, // Never autofill passwords
  dateOfBirth: { category: 'identity', keyPattern: 'birthday' },
  company: { category: 'identity', keyPattern: 'company' },
  jobTitle: { category: 'identity', keyPattern: 'jobTitle' },
  unknown: null,
};

// ============================================================================
// LLM Prompt
// ============================================================================

/**
 * Generate the prompt for analyzing form fields
 */
function generateAnalysisPrompt(fields: FieldNode[]): string {
  const fieldDescriptions = fields.map((f, i) => {
    const parts = [`Field ${i + 1} (id: "${f.id}"):`];
    if (f.label) parts.push(`  Label: "${f.label}"`);
    if (f.name) parts.push(`  Name attribute: "${f.name}"`);
    if (f.placeholder) parts.push(`  Placeholder: "${f.placeholder}"`);
    parts.push(`  Input type: "${f.type}"`);
    if (f.inputMode) parts.push(`  Input mode: "${f.inputMode}"`);
    if (f.required) parts.push(`  Required: yes`);
    return parts.join('\n');
  }).join('\n\n');

  return `Analyze these form fields and determine what type of personal data each expects.

${fieldDescriptions}

For each field, respond with a JSON array containing objects with these properties:
- fieldId: the field's id
- semantic: one of: firstName, lastName, fullName, email, phone, street, city, state, zipCode, country, company, jobTitle, dateOfBirth, unknown
- confidence: a number from 0.5 to 0.9 indicating how confident you are
- reasoning: brief explanation (10 words max)

Important:
- Only use "unknown" if you genuinely cannot determine the field's purpose
- Be conservative with confidence scores (max 0.9 for LLM inference)
- Consider the context of surrounding fields

Respond ONLY with the JSON array, no other text.`;
}

// ============================================================================
// Claude API
// ============================================================================

/**
 * Call Claude API to analyze fields
 */
async function callClaudeAPI(
  prompt: string,
  options: LLMMatchingOptions
): Promise<FieldAnalysis[]> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': options.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: options.model,
      max_tokens: 1024,
      messages: [
        { role: 'user', content: prompt } as ClaudeMessage,
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Claude API error: ${error.error?.message || response.statusText}`);
  }

  const data: ClaudeResponse = await response.json();
  const text = data.content[0]?.text || '[]';

  // Parse JSON response
  try {
    // Extract JSON array from response (handle markdown code blocks)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn('LLM response did not contain JSON array:', text);
      return [];
    }
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.warn('Failed to parse LLM response:', text, e);
    return [];
  }
}

// ============================================================================
// Matching Functions
// ============================================================================

/**
 * Find vault item matching a semantic type
 */
function findVaultItemBySemantic(
  semantic: FieldSemantic,
  vaultItems: VaultItem[]
): VaultItem | undefined {
  const mapping = SEMANTIC_TO_VAULT[semantic];
  if (!mapping) return undefined;

  // First try exact key pattern match
  const exactMatch = vaultItems.find(
    item =>
      item.category === mapping.category &&
      item.key.toLowerCase().includes(mapping.keyPattern.toLowerCase())
  );
  if (exactMatch) return exactMatch;

  // Fallback to category match
  return vaultItems.find(item => item.category === mapping.category);
}

/**
 * Match a single field using LLM analysis result
 */
function createRecommendationFromAnalysis(
  analysis: FieldAnalysis,
  field: FieldNode,
  vaultItems: VaultItem[]
): FillRecommendation | undefined {
  if (analysis.semantic === 'unknown') return undefined;

  const vaultItem = findVaultItemBySemantic(analysis.semantic, vaultItems);
  if (!vaultItem) return undefined;

  return {
    fieldId: field.id,
    vaultKey: vaultItem.key,
    confidence: Math.min(analysis.confidence, 0.85), // Cap LLM confidence at 0.85
    reason: `AI inferred: ${analysis.reasoning}`,
    required: field.required,
    matchTier: 'llm' as MatchTier,
  };
}

/**
 * Match multiple fields using LLM analysis (Tier 3)
 *
 * @param fields - Fields to analyze (should be unmatched from Tier 1 & 2)
 * @param vaultItems - Available vault items to match against
 * @param options - LLM configuration
 * @returns Array of recommendations for matched fields
 */
export async function matchByLLM(
  fields: FieldNode[],
  vaultItems: VaultItem[],
  options: LLMMatchingOptions
): Promise<FillRecommendation[]> {
  if (fields.length === 0) return [];
  if (vaultItems.length === 0) return [];

  // Limit batch size
  const maxFields = options.maxFields || 10;
  const fieldsToAnalyze = fields.slice(0, maxFields);

  try {
    const prompt = generateAnalysisPrompt(fieldsToAnalyze);
    const analyses = await callClaudeAPI(prompt, options);

    const recommendations: FillRecommendation[] = [];

    for (const analysis of analyses) {
      const field = fieldsToAnalyze.find(f => f.id === analysis.fieldId);
      if (!field) continue;

      const recommendation = createRecommendationFromAnalysis(
        analysis,
        field,
        vaultItems
      );

      if (recommendation) {
        recommendations.push(recommendation);
      }
    }

    return recommendations;
  } catch (error) {
    console.error('LLM matching failed:', error);
    throw error;
  }
}

/**
 * Check if LLM matching is available (has valid API key)
 */
export function isLLMMatchingAvailable(apiKey: string | undefined): boolean {
  return Boolean(apiKey && apiKey.startsWith('sk-ant-') && apiKey.length > 20);
}
