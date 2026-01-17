/**
 * FillPlanReviewDialog - Modal dialog for reviewing and applying fill recommendations.
 *
 * Features:
 * - Displays domain and match statistics
 * - Contains FillPlanDiffTable for per-field review
 * - "Only apply safe" filter option
 * - Apply selected / Cancel actions
 * - Toast notification with Undo support
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import type { FillPlan } from '@asterisk/core';
import { FillPlanDiffTable, type DiffRow } from './FillPlanDiffTable';
import { getDisposition, isSensitiveField } from './confidence';
import type { LastAppliedOperation, AuditEntry, AuditItem } from '../../types/audit';
import { redactValue, createAuditEntry } from '../../types/audit';

/**
 * Field info from form snapshot.
 */
export interface FieldInfo {
  id: string;
  label: string;
  type: string;
}

/**
 * Vault item info for getting values.
 */
export interface VaultItemInfo {
  key: string;
  value: string;
  label: string;
}

interface FillPlanReviewDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Callback to close the dialog */
  onClose: () => void;
  /** The fill plan to review */
  fillPlan: FillPlan;
  /** Domain where the form is located */
  domain: string;
  /** Full URL of the form */
  url: string;
  /** Form fingerprint hash */
  fingerprint: string;
  /** Map of field ID to field info */
  fieldInfoMap: Map<string, FieldInfo>;
  /** Map of vault key to vault item */
  vaultItemMap: Map<string, VaultItemInfo>;
  /** Callback when apply is confirmed */
  onApply: (selectedFieldIds: string[], auditEntry: AuditEntry) => Promise<void>;
  /** Callback to capture old values from DOM */
  captureOldValues: () => Promise<Map<string, string>>;
  /** Last applied operation for undo */
  lastApplied: LastAppliedOperation | null;
  /** Callback to undo last operation */
  onUndo: () => Promise<void>;
}

/**
 * Toast notification state.
 */
interface ToastState {
  visible: boolean;
  message: string;
  canUndo: boolean;
}

/**
 * FillPlanReviewDialog component.
 */
export function FillPlanReviewDialog({
  isOpen,
  onClose,
  fillPlan,
  domain,
  url,
  fingerprint,
  fieldInfoMap,
  vaultItemMap,
  onApply,
  captureOldValues,
  lastApplied,
  onUndo,
}: FillPlanReviewDialogProps) {
  // State
  const [onlySafe, setOnlySafe] = useState(false);
  const [selections, setSelections] = useState<Map<string, boolean>>(new Map());
  const [oldValues, setOldValues] = useState<Map<string, string>>(new Map());
  const [isApplying, setIsApplying] = useState(false);
  const [toast, setToast] = useState<ToastState>({ visible: false, message: '', canUndo: false });

  // Initialize selections when dialog opens or plan changes
  useEffect(() => {
    if (isOpen && fillPlan) {
      // Capture old values from DOM
      captureOldValues().then(setOldValues);

      // Set default selections based on disposition
      const initial = new Map<string, boolean>();
      for (const rec of fillPlan.recommendations) {
        const disposition = getDisposition(rec.confidence);
        // Safe and review are checked by default, blocked is unchecked
        initial.set(rec.fieldId, disposition !== 'blocked');
      }
      setSelections(initial);
    }
  }, [isOpen, fillPlan, captureOldValues]);

  // Build diff rows
  const rows: DiffRow[] = useMemo(() => {
    if (!fillPlan) return [];

    return fillPlan.recommendations.map((rec) => {
      const fieldInfo = fieldInfoMap.get(rec.fieldId);
      const vaultItem = vaultItemMap.get(rec.vaultKey);
      const label = fieldInfo?.label || rec.fieldId;
      const disposition = getDisposition(rec.confidence);
      const sensitive = isSensitiveField(label);

      return {
        recommendation: rec,
        label,
        fieldType: fieldInfo?.type || 'text',
        oldValue: oldValues.get(rec.fieldId) || '',
        newValue: vaultItem?.value || '',
        source: rec.vaultKey,
        selected: selections.get(rec.fieldId) ?? disposition !== 'blocked',
        disposition,
        isSensitive: sensitive,
      };
    });
  }, [fillPlan, fieldInfoMap, vaultItemMap, oldValues, selections]);

  // Apply "only safe" filter to selections
  useEffect(() => {
    if (onlySafe) {
      setSelections((prev) => {
        const next = new Map(prev);
        for (const row of rows) {
          if (row.disposition !== 'safe') {
            next.set(row.recommendation.fieldId, false);
          }
        }
        return next;
      });
    }
  }, [onlySafe, rows]);

  // Statistics
  const safeCount = rows.filter((r) => r.disposition === 'safe').length;
  const reviewCount = rows.filter((r) => r.disposition === 'review').length;
  const blockedCount = rows.filter((r) => r.disposition === 'blocked').length;
  const selectedCount = rows.filter((r) => r.selected).length;

  // Handlers
  const handleSelectionChange = useCallback((fieldId: string, selected: boolean) => {
    setSelections((prev) => {
      const next = new Map(prev);
      next.set(fieldId, selected);
      return next;
    });
  }, []);

  const handleToggleAll = useCallback((selected: boolean) => {
    setSelections((prev) => {
      const next = new Map(prev);
      for (const row of rows) {
        // Respect "only safe" filter
        if (onlySafe && row.disposition !== 'safe') {
          next.set(row.recommendation.fieldId, false);
        } else {
          next.set(row.recommendation.fieldId, selected);
        }
      }
      return next;
    });
  }, [rows, onlySafe]);

  const handleApply = useCallback(async () => {
    setIsApplying(true);
    try {
      // Get selected field IDs
      const selectedFieldIds = rows
        .filter((r) => r.selected)
        .map((r) => r.recommendation.fieldId);

      if (selectedFieldIds.length === 0) {
        setToast({ visible: true, message: 'No fields selected', canUndo: false });
        setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3000);
        return;
      }

      // Build audit items
      const auditItems: AuditItem[] = rows.map((row) => {
        const isApplied = row.selected;
        const { redacted: oldRedacted, level: oldLevel } = redactValue(row.oldValue, row.isSensitive);
        const { redacted: newRedacted, level: newLevel } = redactValue(row.newValue, row.isSensitive);

        return {
          fieldId: row.recommendation.fieldId,
          label: row.label,
          kind: row.fieldType,
          confidence: row.recommendation.confidence,
          disposition: row.disposition,
          applied: isApplied,
          source: row.source,
          oldValueRedacted: oldRedacted,
          newValueRedacted: newRedacted,
          redaction: row.isSensitive ? 'masked' : (oldLevel === 'partial' || newLevel === 'partial' ? 'partial' : 'none'),
          userConfirmed: row.disposition !== 'safe' && isApplied,
        };
      });

      // Create audit entry
      const auditEntry = createAuditEntry({
        url,
        domain,
        fingerprint,
        items: auditItems,
      });

      // Apply the fill
      await onApply(selectedFieldIds, auditEntry);

      // Show success toast
      setToast({
        visible: true,
        message: `Applied ${selectedFieldIds.length} field${selectedFieldIds.length !== 1 ? 's' : ''}`,
        canUndo: true,
      });

      // Close dialog after short delay
      setTimeout(() => {
        onClose();
      }, 500);

    } catch (error) {
      console.error('Failed to apply fill plan:', error);
      setToast({
        visible: true,
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        canUndo: false,
      });
    } finally {
      setIsApplying(false);
    }
  }, [rows, url, domain, fingerprint, onApply, onClose]);

  const handleUndo = useCallback(async () => {
    try {
      await onUndo();
      setToast({
        visible: true,
        message: 'Undone',
        canUndo: false,
      });
      setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3000);
    } catch (error) {
      console.error('Failed to undo:', error);
      setToast({
        visible: true,
        message: `Undo failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        canUndo: false,
      });
    }
  }, [onUndo]);

  // Don't render if not open
  if (!isOpen) return null;

  return (
    <div className="fill-review-dialog-overlay" onClick={onClose}>
      <div className="fill-review-dialog" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="dialog-header">
          <h2>Review changes</h2>
          <p className="dialog-subtitle">
            {domain} &bull; {safeCount + reviewCount + blockedCount} matches
            {reviewCount > 0 && ` \u2022 ${reviewCount} require${reviewCount !== 1 ? '' : 's'} review`}
            {blockedCount > 0 && ` \u2022 ${blockedCount} blocked`}
          </p>
        </div>

        {/* Content */}
        <div className="dialog-content">
          <FillPlanDiffTable
            rows={rows}
            onSelectionChange={handleSelectionChange}
            onToggleAll={handleToggleAll}
            onlySafe={onlySafe}
            onOnlySafeChange={setOnlySafe}
          />
        </div>

        {/* Footer */}
        <div className="dialog-footer">
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            disabled={isApplying}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleApply}
            disabled={isApplying || selectedCount === 0}
          >
            {isApplying ? 'Applying...' : `Apply ${selectedCount} field${selectedCount !== 1 ? 's' : ''}`}
          </button>
        </div>

        {/* Toast */}
        {toast.visible && (
          <div className="fill-toast">
            <span className="toast-message">{toast.message}</span>
            {toast.canUndo && lastApplied && (
              <button type="button" className="toast-undo" onClick={handleUndo}>
                Undo
              </button>
            )}
            <button
              type="button"
              className="toast-close"
              onClick={() => setToast((t) => ({ ...t, visible: false }))}
            >
              &times;
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default FillPlanReviewDialog;
