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
 * Call Tauri backend to analyze a single field
 */
async function analyzeSingleField(
  field: FieldNode,
  vaultItems: VaultItem[]
): Promise<{ vaultKey: string | null; confidence: number; reasoning: string }> {
  // Check if running in Tauri
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  if (!isTauri) {
    throw new Error('LLM matching is only available in the Tauri desktop app');
  }

  const { invoke } = await import('@tauri-apps/api/core');

  // Prepare request
  const request = {
    label: field.label,
    name: field.name,
    type: field.type,
    placeholder: field.placeholder || null,
    semantic: field.semantic || null,
    available_keys: vaultItems.map(item => item.key),
  };

  // Call Rust backend
  const response = await invoke<{ vault_key: string | null; confidence: number; reasoning: string }>(
    'llm_analyze_field',
    { request }
  );

  return {
    vaultKey: response.vault_key,
    confidence: response.confidence,
    reasoning: response.reasoning,
  };
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
 * Match a single field using LLM analysis (Tier 3) via Tauri backend
 *
 * @param field - Field to analyze (should be unmatched from Tier 1 & 2)
 * @param vaultItems - Available vault items to match against
 * @returns Recommendation if matched, undefined otherwise
 */
export async function matchByLLM(
  field: FieldNode,
  vaultItems: VaultItem[]
): Promise<FillRecommendation | undefined> {
  if (vaultItems.length === 0) return undefined;

  try {
    const result = await analyzeSingleField(field, vaultItems);

    if (!result.vaultKey) {
      return undefined;
    }

    // Find the vault item
    const vaultItem = vaultItems.find(item => item.key === result.vaultKey);
    if (!vaultItem) {
      console.warn(`LLM suggested key "${result.vaultKey}" not found in vault`);
      return undefined;
    }

    return {
      fieldId: field.id,
      vaultKey: vaultItem.key,
      confidence: result.confidence,
      reason: result.reasoning,
      required: field.required,
      matchTier: 'llm' as MatchTier,
    };
  } catch (error) {
    console.error('LLM matching failed:', error);
    throw error;
  }
}

/**
 * Check if LLM matching is available (has API key configured in Tauri backend)
 */
export async function isLLMMatchingAvailable(): Promise<boolean> {
  try {
    // Check if running in Tauri
    const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
    if (!isTauri) {
      return false;
    }

    const { invoke } = await import('@tauri-apps/api/core');
    const hasKey = await invoke<boolean>('has_api_key');
    return hasKey;
  } catch (error) {
    console.error('Failed to check API key:', error);
    return false;
  }
}
