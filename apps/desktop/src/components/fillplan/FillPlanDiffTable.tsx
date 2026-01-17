/**
 * FillPlanDiffTable - Displays fill recommendations in a diff-style table.
 *
 * Each row shows:
 * - Checkbox to toggle apply
 * - Field label (with fieldId tooltip)
 * - Confidence (% + disposition badge)
 * - Old value (captured from DOM before apply)
 * - New value (candidate from vault)
 * - Source (vault key)
 * - Reason (match tier description)
 */

import { useState, useCallback } from 'react';
import type { FillRecommendation } from '@asterisk/core';
import {
  getDispositionClass,
  getDispositionLabel,
  type Disposition,
} from './confidence';

/**
 * Extended recommendation with selection state and old value.
 */
export interface DiffRow {
  /** The original recommendation from the fill plan */
  recommendation: FillRecommendation;
  /** Field label from form snapshot */
  label: string;
  /** Field type (text, email, etc.) */
  fieldType: string;
  /** Old value captured from DOM (empty string if not captured) */
  oldValue: string;
  /** New value to fill (from vault) */
  newValue: string;
  /** Source vault key */
  source: string;
  /** Whether this row is selected for apply */
  selected: boolean;
  /** Computed disposition based on confidence */
  disposition: Disposition;
  /** Whether this is a sensitive field */
  isSensitive: boolean;
}

interface FillPlanDiffTableProps {
  /** Rows to display */
  rows: DiffRow[];
  /** Callback when selection changes */
  onSelectionChange: (fieldId: string, selected: boolean) => void;
  /** Callback to toggle all rows */
  onToggleAll: (selected: boolean) => void;
  /** Whether "only safe" filter is active */
  onlySafe: boolean;
  /** Callback when "only safe" changes */
  onOnlySafeChange: (onlySafe: boolean) => void;
}

/**
 * FillPlanDiffTable component for reviewing fill recommendations.
 */
export function FillPlanDiffTable({
  rows,
  onSelectionChange,
  onToggleAll,
  onlySafe,
  onOnlySafeChange,
}: FillPlanDiffTableProps) {
  // Track which rows have revealed sensitive values
  const [revealedRows, setRevealedRows] = useState<Set<string>>(new Set());

  const toggleReveal = useCallback((fieldId: string) => {
    setRevealedRows((prev) => {
      const next = new Set(prev);
      if (next.has(fieldId)) {
        next.delete(fieldId);
      } else {
        next.add(fieldId);
      }
      return next;
    });
  }, []);

  // Calculate summary stats
  const safeCount = rows.filter((r) => r.disposition === 'safe').length;
  const reviewCount = rows.filter((r) => r.disposition === 'review').length;
  const blockedCount = rows.filter((r) => r.disposition === 'blocked').length;
  const selectedCount = rows.filter((r) => r.selected).length;

  // Check if all rows are selected
  const allSelected = rows.length > 0 && rows.every((r) => r.selected);
  const someSelected = rows.some((r) => r.selected) && !allSelected;

  // Mask a value for display
  const maskValue = (value: string): string => {
    if (!value || value.length <= 2) return '••••';
    return value[0] + '•'.repeat(Math.min(value.length - 2, 8)) + value[value.length - 1];
  };

  // Get display value considering reveal state
  const getDisplayValue = (row: DiffRow, value: string, isOld: boolean): string => {
    if (!row.isSensitive) return value || (isOld ? '(empty)' : '');
    if (revealedRows.has(row.recommendation.fieldId)) return value || (isOld ? '(empty)' : '');
    return maskValue(value);
  };

  return (
    <div className="fill-plan-diff-table">
      {/* Summary bar */}
      <div className="diff-summary">
        <span className="summary-stat safe">{safeCount} safe</span>
        <span className="summary-stat review">{reviewCount} need review</span>
        <span className="summary-stat blocked">{blockedCount} blocked</span>
        <span className="summary-divider">|</span>
        <span className="summary-selected">{selectedCount} selected</span>
      </div>

      {/* Controls */}
      <div className="diff-controls">
        <label className="only-safe-checkbox">
          <input
            type="checkbox"
            checked={onlySafe}
            onChange={(e) => onOnlySafeChange(e.target.checked)}
          />
          Only apply safe (&ge; 98%)
        </label>
      </div>

      {/* Table */}
      <table className="diff-table">
        <thead>
          <tr>
            <th className="col-checkbox">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected;
                }}
                onChange={(e) => onToggleAll(e.target.checked)}
                title="Toggle all"
              />
            </th>
            <th className="col-field">Field</th>
            <th className="col-confidence">Confidence</th>
            <th className="col-old">Old Value</th>
            <th className="col-new">New Value</th>
            <th className="col-source">Source</th>
            <th className="col-reason">Reason</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const { recommendation } = row;
            const isBlocked = row.disposition === 'blocked';
            const isReview = row.disposition === 'review';
            const isRevealed = revealedRows.has(recommendation.fieldId);

            return (
              <tr
                key={recommendation.fieldId}
                className={`diff-row ${getDispositionClass(row.disposition)} ${row.selected ? 'selected' : ''}`}
              >
                {/* Checkbox */}
                <td className="col-checkbox">
                  <input
                    type="checkbox"
                    checked={row.selected}
                    onChange={(e) => onSelectionChange(recommendation.fieldId, e.target.checked)}
                    disabled={onlySafe && row.disposition !== 'safe'}
                  />
                </td>

                {/* Field label */}
                <td className="col-field" title={`ID: ${recommendation.fieldId}`}>
                  <span className="field-label">{row.label || recommendation.fieldId}</span>
                  {row.isSensitive && <span className="sensitive-badge">Sensitive</span>}
                </td>

                {/* Confidence */}
                <td className="col-confidence">
                  <span className={`confidence-badge ${getDispositionClass(row.disposition)}`}>
                    {Math.round(recommendation.confidence * 100)}%
                  </span>
                  {(isBlocked || isReview) && (
                    <span className="disposition-label">{getDispositionLabel(row.disposition)}</span>
                  )}
                </td>

                {/* Old value */}
                <td className="col-old">
                  <span className="value-display old-value">
                    {getDisplayValue(row, row.oldValue, true)}
                  </span>
                </td>

                {/* New value */}
                <td className="col-new">
                  <span className="value-display new-value">
                    {getDisplayValue(row, row.newValue, false)}
                  </span>
                  {row.isSensitive && (
                    <button
                      type="button"
                      className="reveal-toggle"
                      onClick={() => toggleReveal(recommendation.fieldId)}
                      title={isRevealed ? 'Hide value' : 'Reveal value'}
                    >
                      {isRevealed ? 'Hide' : 'Reveal'}
                    </button>
                  )}
                </td>

                {/* Source */}
                <td className="col-source">
                  <span className="source-key">{row.source}</span>
                </td>

                {/* Reason */}
                <td className="col-reason">
                  <span className="reason-text">{recommendation.reason || recommendation.matchTier}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {rows.length === 0 && (
        <div className="diff-empty">No recommendations to review.</div>
      )}
    </div>
  );
}

export default FillPlanDiffTable;
