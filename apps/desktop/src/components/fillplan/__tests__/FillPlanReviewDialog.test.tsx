import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FillPlan, FillRecommendation } from '@asterisk/core';
import { FillPlanReviewDialog, type FieldInfo, type VaultItemInfo } from '../FillPlanReviewDialog';

/**
 * FillPlanReviewDialog - default-selection tests.
 *
 * The dialog's own effect (see FillPlanReviewDialog.tsx) computes each
 * row's initial `selected` state from `getDisposition(confidence,
 * requiresConfirmation)`: safe/review start checked, blocked starts
 * unchecked. These tests exercise that wiring end-to-end through the real
 * component (not by re-testing getDisposition in isolation - see
 * confidence.test.ts for that) - specifically the case getDisposition's
 * own tests can't cover: that a *high-confidence* gated recommendation
 * still renders unchecked, because the dialog is the thing a real user
 * actually sees and could accidentally apply from.
 */

function makeRecommendation(overrides: Partial<FillRecommendation>): FillRecommendation {
  return {
    fieldId: 'field-1',
    vaultKey: 'vault-1',
    confidence: 1.0,
    reason: 'test reason',
    required: false,
    matchTier: 'pattern',
    ...overrides,
  };
}

function makeFillPlan(recommendations: FillRecommendation[]): FillPlan {
  return {
    formFingerprint: 'test-fingerprint',
    formId: 'https://example.com/form',
    recommendations,
    unmatchedFields: [],
    overallConfidence: 1.0,
    generatedAt: new Date('2026-01-01T00:00:00Z'),
    requiredFieldsCovered: recommendations.length,
    totalRequiredFields: recommendations.length,
  };
}

function renderDialog(recommendations: FillRecommendation[]) {
  const fillPlan = makeFillPlan(recommendations);

  const fieldInfoMap = new Map<string, FieldInfo>(
    recommendations.map((r) => [r.fieldId, { id: r.fieldId, label: r.fieldId, type: 'text' }])
  );
  const vaultItemMap = new Map<string, VaultItemInfo>(
    recommendations.map((r) => [r.vaultKey, { key: r.vaultKey, value: 'some-value', label: r.vaultKey }])
  );

  const onApply = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  const onUndo = vi.fn().mockResolvedValue(undefined);
  const captureOldValues = vi.fn().mockResolvedValue(new Map<string, string>());

  render(
    <FillPlanReviewDialog
      isOpen={true}
      onClose={onClose}
      fillPlan={fillPlan}
      domain="example.com"
      url="https://example.com/form"
      fingerprint="test-fingerprint"
      fieldInfoMap={fieldInfoMap}
      vaultItemMap={vaultItemMap}
      onApply={onApply}
      captureOldValues={captureOldValues}
      lastApplied={null}
      onUndo={onUndo}
    />
  );

  return { onApply, onClose, onUndo, captureOldValues };
}

/** Find a row's checkbox by its field label text. */
async function getRowCheckbox(fieldId: string): Promise<HTMLInputElement> {
  const label = await screen.findByText(fieldId);
  const row = label.closest('tr');
  if (!row) throw new Error(`no <tr> ancestor found for field ${fieldId}`);
  const checkbox = row.querySelector('input[type="checkbox"]');
  if (!checkbox) throw new Error(`no checkbox found in row for field ${fieldId}`);
  return checkbox as HTMLInputElement;
}

describe('FillPlanReviewDialog - default row selection', () => {
  it('defaults a gated recommendation to unchecked even at maximum confidence', async () => {
    renderDialog([
      makeRecommendation({
        fieldId: 'gated-high-confidence',
        vaultKey: 'company',
        confidence: 1.0, // would be 'safe' (checked) if it weren't gated
        requiresConfirmation: true,
        confirmationReason: 'Sourced from a single prior snapshot, not reconfirmed as current',
      }),
    ]);

    const checkbox = await getRowCheckbox('gated-high-confidence');
    await waitFor(() => expect(checkbox.checked).toBe(false));
  });

  it('defaults a safe (high-confidence, ungated) recommendation to checked', async () => {
    renderDialog([
      makeRecommendation({
        fieldId: 'safe-field',
        vaultKey: 'firstName',
        confidence: 0.99,
      }),
    ]);

    const checkbox = await getRowCheckbox('safe-field');
    await waitFor(() => expect(checkbox.checked).toBe(true));
  });

  it('defaults a review-tier (mid-confidence, ungated) recommendation to checked', async () => {
    renderDialog([
      makeRecommendation({
        fieldId: 'review-field',
        vaultKey: 'phone',
        confidence: 0.95,
      }),
    ]);

    const checkbox = await getRowCheckbox('review-field');
    await waitFor(() => expect(checkbox.checked).toBe(true));
  });

  it('defaults a low-confidence ungated recommendation to unchecked (blocked, but for confidence, not the gate)', async () => {
    renderDialog([
      makeRecommendation({
        fieldId: 'low-confidence-field',
        vaultKey: 'jobTitle',
        confidence: 0.5,
      }),
    ]);

    const checkbox = await getRowCheckbox('low-confidence-field');
    await waitFor(() => expect(checkbox.checked).toBe(false));
  });

  it('mixed plan: only the gated row starts unchecked among otherwise-safe recommendations', async () => {
    renderDialog([
      makeRecommendation({ fieldId: 'safe-1', vaultKey: 'firstName', confidence: 1.0 }),
      makeRecommendation({ fieldId: 'safe-2', vaultKey: 'lastName', confidence: 1.0 }),
      makeRecommendation({
        fieldId: 'gated-1',
        vaultKey: 'company',
        confidence: 1.0,
        requiresConfirmation: true,
        confirmationReason: 'stale evidence',
      }),
    ]);

    await waitFor(async () => {
      expect((await getRowCheckbox('safe-1')).checked).toBe(true);
      expect((await getRowCheckbox('safe-2')).checked).toBe(true);
      expect((await getRowCheckbox('gated-1')).checked).toBe(false);
    });

    // The header subtitle's "N blocked" count should reflect exactly the
    // one gated field, confirming the dialog-level disposition tally (not
    // just the individual checkbox) treats it as blocked. Scoped to the
    // header specifically since the diff table below has its own,
    // separate "1 blocked" summary stat.
    const subtitle = document.querySelector('.dialog-subtitle');
    if (!subtitle) throw new Error('dialog subtitle not found');
    expect(within(subtitle as HTMLElement).getByText(/1 blocked/)).toBeInTheDocument();
  });

  it('a gated row can still be explicitly checked by the user (blocked is a default, not a lock)', async () => {
    renderDialog([
      makeRecommendation({
        fieldId: 'gated-explicit-override',
        vaultKey: 'company',
        confidence: 1.0,
        requiresConfirmation: true,
        confirmationReason: 'stale evidence',
      }),
    ]);

    const checkbox = await getRowCheckbox('gated-explicit-override');
    await waitFor(() => expect(checkbox.checked).toBe(false));

    const user = userEvent.setup();
    await user.click(checkbox);

    expect(checkbox.checked).toBe(true);
  });

  it('does not apply a gated field unless the user explicitly checks it', async () => {
    const { onApply } = renderDialog([
      makeRecommendation({ fieldId: 'safe-1', vaultKey: 'firstName', confidence: 1.0 }),
      makeRecommendation({
        fieldId: 'gated-1',
        vaultKey: 'company',
        confidence: 1.0,
        requiresConfirmation: true,
        confirmationReason: 'stale evidence',
      }),
    ]);

    await waitFor(async () => expect((await getRowCheckbox('gated-1')).checked).toBe(false));

    const user = userEvent.setup();
    const applyButton = await screen.findByRole('button', { name: /^Apply \d+ field/ });
    await user.click(applyButton);

    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
    const [selectedFieldIds] = onApply.mock.calls[0]!;
    expect(selectedFieldIds).toContain('safe-1');
    expect(selectedFieldIds).not.toContain('gated-1');
  });
});
