/**
 * DS-160 fill plan generation.
 *
 * Builds a `FillPlan` using the exact DS-160 field map instead of the
 * generic fuzzy matcher, and propagates each vault item's
 * `ConfirmationGate` (if any) onto the resulting recommendation so the
 * review-before-apply boundary in the desktop UI can block it regardless
 * of confidence. See `../types.ts` (`ConfirmationGate`) and
 * `apps/desktop/src/components/fillplan/confidence.ts` (`getDisposition`)
 * for the two ends of this contract.
 */

import type { FillPlan, FillRecommendation, FormSnapshot, VaultCategory, VaultItem } from '../types';
import { mapDs160Field } from './fieldMap';

/**
 * True when a vault item is gated pending explicit user confirmation.
 * Gated items must never be silently auto-applied, regardless of the
 * confidence recorded on their provenance.
 */
export function isGated(item: VaultItem): boolean {
  return item.confirmationGate?.status === 'pending_confirmation';
}

/**
 * Find the vault item for an exact DS-160 category + key pattern.
 *
 * Deliberately exact only (`category` and `key` must both match exactly) -
 * no substring/label fallback. A government form's exact-mapping contract
 * must not silently select a similarly-named or historical item (e.g. a
 * `companyOld` or `companyPrevious` key partially matching `company`).
 * Anything that isn't an exact key match is left unmatched and surfaces via
 * `FillPlan.unmatchedFields`, same as an entirely missing vault item.
 */
function findExactVaultItem(
  vaultItems: VaultItem[],
  category: VaultCategory,
  keyPattern: string
): VaultItem | undefined {
  return vaultItems.find((item) => item.category === category && item.key === keyPattern);
}

/**
 * Generate a DS-160 fill plan for a captured form snapshot against the
 * user's vault, using the exact field map (see `fieldMap.ts`).
 *
 * Fields with no entry in `DS160_FIELD_MAP`, or with no matching vault
 * item, land in `unmatchedFields`. Fields whose matched vault item carries
 * a `ConfirmationGate` still produce a recommendation (so the review UI
 * can show *why* it's blocked) but are flagged `requiresConfirmation` and
 * must be treated as blocked by any consumer, independent of confidence.
 */
export function generateDs160FillPlan(snapshot: FormSnapshot, vaultItems: VaultItem[]): FillPlan {
  const recommendations: FillRecommendation[] = [];
  const unmatchedFields: string[] = [];
  const warnings: string[] = [];

  for (const field of snapshot.fields) {
    const mapping = mapDs160Field(field.id);
    if (!mapping) {
      unmatchedFields.push(field.id);
      continue;
    }

    const vaultItem = findExactVaultItem(vaultItems, mapping.vaultCategory, mapping.vaultKeyPattern);
    if (!vaultItem) {
      unmatchedFields.push(field.id);
      continue;
    }

    const gated = isGated(vaultItem);

    const recommendation: FillRecommendation = {
      fieldId: field.id,
      vaultKey: vaultItem.key,
      confidence: vaultItem.provenance.confidence,
      reason: gated
        ? `Exact DS-160 field mapping (pending confirmation): ${mapping.fieldId} -> ${mapping.vaultKeyPattern}`
        : `Exact DS-160 field mapping: ${mapping.fieldId} -> ${mapping.vaultKeyPattern}`,
      required: field.required,
      matchTier: 'pattern',
      ...(gated
        ? { requiresConfirmation: true, confirmationReason: vaultItem.confirmationGate!.reason }
        : {}),
    };

    recommendations.push(recommendation);
  }

  const requiredFields = snapshot.fields.filter((f) => f.required);
  const totalRequiredFields = requiredFields.length;
  const requiredFieldsCovered = requiredFields.filter((f) =>
    recommendations.some((r) => r.fieldId === f.id)
  ).length;

  const overallConfidence =
    recommendations.length > 0
      ? recommendations.reduce((sum, r) => sum + r.confidence, 0) / recommendations.length
      : 0;

  const gatedCount = recommendations.filter((r) => r.requiresConfirmation).length;
  if (gatedCount > 0) {
    warnings.push(
      `${gatedCount} field(s) require explicit confirmation before they can be applied (unconfirmed/stale source data)`
    );
  }

  if (requiredFieldsCovered < totalRequiredFields) {
    const missing = totalRequiredFields - requiredFieldsCovered;
    warnings.push(`${missing} required field(s) could not be matched`);
  }

  if (vaultItems.length === 0) {
    warnings.push('No vault items available for matching');
  }

  return {
    formFingerprint: snapshot.fingerprint.hash,
    formId: snapshot.url,
    recommendations,
    unmatchedFields,
    overallConfidence,
    generatedAt: new Date(),
    requiredFieldsCovered,
    totalRequiredFields,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

export { DS160_FIELD_MAP, mapDs160Field } from './fieldMap';
export type { Ds160FieldMapping, Ds160Section } from './fieldMap';
