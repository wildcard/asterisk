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
} from '@asterisk/core';

// ============================================================================
// Types
// ============================================================================

export interface FieldAnalysis {
  fieldId: string;
  semantic: FieldSemantic;
  confidence: number;
  reasoning: string;
}

// ============================================================================
// Tauri Backend Integration
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
