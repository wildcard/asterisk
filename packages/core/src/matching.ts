/**
 * Form-to-Vault Matching Logic
 *
 * Implements a tiered matching strategy:
 * - Tier 1: Autocomplete attributes (highest confidence)
 * - Tier 2: Pattern matching on labels/names (medium confidence)
 * - Tier 3: LLM semantic analysis (variable confidence) - handled separately
 */

import type {
  FieldNode,
  VaultItem,
  VaultCategory,
  FillRecommendation,
  FillPlan,
  FormSnapshot,
  MatchTier,
} from './types';

import { AUTOCOMPLETE_MAPPINGS, PATTERN_RULES } from './types';

// ============================================================================
// Tier 1: Autocomplete-based Matching
// ============================================================================

/**
 * Find vault items matching a specific category and optional key pattern
 */
function findVaultItemByPattern(
  vaultItems: VaultItem[],
  category: VaultCategory,
  keyPattern?: string
): VaultItem | undefined {
  // First try exact key pattern match within category
  if (keyPattern) {
    const exactMatch = vaultItems.find(
      item =>
        item.category === category &&
        item.key.toLowerCase().includes(keyPattern.toLowerCase())
    );
    if (exactMatch) return exactMatch;
  }

  // Fallback to category match
  return vaultItems.find(item => item.category === category);
}

/**
 * Match a field using its autocomplete attribute (Tier 1)
 *
 * @returns FillRecommendation if matched, undefined otherwise
 */
export function matchByAutocomplete(
  field: FieldNode,
  vaultItems: VaultItem[]
): FillRecommendation | undefined {
  if (!field.autocomplete) return undefined;

  // Normalize: autocomplete can be space-separated tokens
  // e.g., "shipping given-name" -> take the last part
  const tokens = field.autocomplete.toLowerCase().split(/\s+/);
  const autocompleteValue = tokens[tokens.length - 1];
  if (!autocompleteValue) return undefined;

  const mapping = AUTOCOMPLETE_MAPPINGS[autocompleteValue];
  if (!mapping) return undefined;

  const vaultItem = findVaultItemByPattern(
    vaultItems,
    mapping.category,
    mapping.keyPattern
  );

  if (!vaultItem) return undefined;

  return {
    fieldId: field.id,
    vaultKey: vaultItem.key,
    confidence: mapping.confidence,
    reason: `Matched via autocomplete="${field.autocomplete}"`,
    required: field.required,
    matchTier: 'autocomplete' as MatchTier,
  };
}

// ============================================================================
// Tier 2: Pattern-based Matching
// ============================================================================

/**
 * Normalize text for pattern matching
 */
function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[_-]/g, ' ').trim();
}

/**
 * Check if text contains any of the patterns
 */
function containsPattern(text: string, patterns: string[]): boolean {
  const normalized = normalizeText(text);
  return patterns.some(pattern => normalized.includes(pattern));
}

/**
 * Match a field using label/name patterns (Tier 2)
 *
 * @returns FillRecommendation if matched, undefined otherwise
 */
export function matchByPattern(
  field: FieldNode,
  vaultItems: VaultItem[]
): FillRecommendation | undefined {
  // Combine all searchable text from the field
  const searchText = [field.label, field.name, field.placeholder]
    .filter(Boolean)
    .join(' ');

  for (const rule of PATTERN_RULES) {
    // Check if label patterns match
    if (!containsPattern(searchText, rule.labelPatterns)) continue;

    // Check input type if specified
    if (rule.inputType && field.type !== rule.inputType) continue;

    // Find matching vault item
    const vaultItem = findVaultItemByPattern(
      vaultItems,
      rule.category,
      rule.keyPattern
    );

    if (!vaultItem) continue;

    return {
      fieldId: field.id,
      vaultKey: vaultItem.key,
      confidence: rule.confidence,
      reason: `Matched via pattern in "${field.label || field.name}"`,
      required: field.required,
      matchTier: 'pattern' as MatchTier,
    };
  }

  return undefined;
}

// ============================================================================
// Fill Plan Generation
// ============================================================================

/**
 * Generate a complete fill plan for a form
 *
 * Uses tiered matching strategy:
 * 1. Try autocomplete match (highest confidence)
 * 2. Try pattern match (medium confidence)
 * 3. Mark as unmatched (for LLM analysis later)
 */
export function generateFillPlan(
  form: FormSnapshot,
  vaultItems: VaultItem[]
): FillPlan {
  const recommendations: FillRecommendation[] = [];
  const unmatchedFields: string[] = [];
  const warnings: string[] = [];

  // Skip certain field types that shouldn't be autofilled
  const skipTypes = new Set(['password', 'checkbox', 'radio']);

  for (const field of form.fields) {
    // Skip password fields and checkboxes/radios
    if (skipTypes.has(field.type)) {
      continue;
    }

    // Try Tier 1: Autocomplete
    let recommendation = matchByAutocomplete(field, vaultItems);

    // Try Tier 2: Pattern matching
    if (!recommendation) {
      recommendation = matchByPattern(field, vaultItems);
    }

    if (recommendation) {
      recommendations.push(recommendation);
    } else {
      unmatchedFields.push(field.id);
    }
  }

  // Calculate statistics
  const requiredFields = form.fields.filter(f => f.required && !skipTypes.has(f.type));
  const totalRequiredFields = requiredFields.length;
  const requiredFieldsCovered = requiredFields.filter(f =>
    recommendations.some(r => r.fieldId === f.id)
  ).length;

  // Calculate overall confidence (average of recommendations)
  const overallConfidence =
    recommendations.length > 0
      ? recommendations.reduce((sum, r) => sum + r.confidence, 0) /
        recommendations.length
      : 0;

  // Add warnings
  if (requiredFieldsCovered < totalRequiredFields) {
    const missing = totalRequiredFields - requiredFieldsCovered;
    warnings.push(`${missing} required field(s) could not be matched`);
  }

  if (vaultItems.length === 0) {
    warnings.push('No vault items available for matching');
  }

  return {
    formFingerprint: form.fingerprint.hash,
    formId: form.url, // Using URL as form ID for now
    recommendations,
    unmatchedFields,
    overallConfidence,
    generatedAt: new Date(),
    requiredFieldsCovered,
    totalRequiredFields,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get human-readable description of a match tier
 */
export function getMatchTierDescription(tier: MatchTier): string {
  switch (tier) {
    case 'autocomplete':
      return 'High confidence (HTML autocomplete attribute)';
    case 'pattern':
      return 'Medium confidence (label/name pattern match)';
    case 'llm':
      return 'AI-inferred (semantic analysis)';
  }
}

/**
 * Get confidence level category for UI display
 */
export function getConfidenceLevel(
  confidence: number
): 'high' | 'medium' | 'low' {
  if (confidence >= 0.9) return 'high';
  if (confidence >= 0.7) return 'medium';
  return 'low';
}
