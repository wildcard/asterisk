/**
 * Field Preview List Component
 *
 * Shows which fields will be filled with individual toggles
 * and value previews (masked for sensitive fields).
 */

import type { FormSnapshot, FillPlan, FieldNode } from '@asterisk/core';

interface FieldPreviewListProps {
  form: FormSnapshot;
  fillPlan: FillPlan;
  fieldToggles: Record<string, boolean>;
  onToggleField: (fieldId: string) => void;
  vaultItems?: Map<string, string>; // vaultKey → value
}

interface FieldPreview {
  field: FieldNode;
  vaultKey: string;
  confidence: number;
  reason: string;
  value: string;
  enabled: boolean;
}

export function FieldPreviewList({
  form,
  fillPlan,
  fieldToggles,
  onToggleField,
  vaultItems,
}: FieldPreviewListProps) {
  // Build preview list by matching recommendations to fields
  const previews: FieldPreview[] = fillPlan.recommendations
    .filter(rec => rec.confidence > 0)
    .map(rec => {
      const field = form.fields.find(f => f.id === rec.fieldId);
      if (!field) return null;

      const value = vaultItems?.get(rec.vaultKey) || rec.vaultKey;
      const enabled = fieldToggles[rec.fieldId] !== false; // default to true

      return {
        field,
        vaultKey: rec.vaultKey,
        confidence: rec.confidence,
        reason: rec.reason,
        value,
        enabled,
      };
    })
    .filter((p): p is FieldPreview => p !== null);

  if (previews.length === 0) {
    return null;
  }

  return (
    <div className="field-preview-section">
      <div className="field-preview-header">
        <span className="field-preview-title">Fields to Fill</span>
        <button
          className="btn-link"
          onClick={() => {
            // Toggle all fields
            const allEnabled = previews.every(p => p.enabled);
            previews.forEach(p => {
              if (allEnabled) {
                onToggleField(p.field.id); // disable all
              } else if (!p.enabled) {
                onToggleField(p.field.id); // enable disabled ones
              }
            });
          }}
        >
          {previews.every(p => p.enabled) ? 'Deselect All' : 'Select All'}
        </button>
      </div>

      <div className="field-preview-list">
        {previews.map(preview => (
          <FieldPreviewItem
            key={preview.field.id}
            preview={preview}
            onToggle={() => onToggleField(preview.field.id)}
          />
        ))}
      </div>
    </div>
  );
}

interface FieldPreviewItemProps {
  preview: FieldPreview;
  onToggle: () => void;
}

function FieldPreviewItem({ preview, onToggle }: FieldPreviewItemProps) {
  const { field, value, confidence, reason, enabled } = preview;

  // Mask sensitive fields
  const displayValue = maskSensitiveValue(field, value);

  // Get confidence level color
  const confidenceClass = getConfidenceClass(confidence);

  return (
    <div className={`field-preview-item ${enabled ? '' : 'disabled'}`}>
      <label className="field-preview-toggle">
        <input
          type="checkbox"
          checked={enabled}
          onChange={onToggle}
        />
        <div className="field-preview-content">
          <div className="field-preview-header-row">
            <span className="field-preview-label">{field.label}</span>
            {field.required && (
              <span className="field-required-badge">Required</span>
            )}
          </div>

          <div className="field-preview-details">
            <span className="field-preview-value">{displayValue}</span>
            <span className={`field-preview-confidence ${confidenceClass}`}>
              {Math.round(confidence * 100)}%
            </span>
          </div>

          <div className="field-preview-reason">{reason}</div>
        </div>
      </label>
    </div>
  );
}

/**
 * Mask sensitive field values for preview
 */
function maskSensitiveValue(field: FieldNode, value: string): string {
  const sensitiveTypes: string[] = ['password', 'creditCard', 'cvv', 'ssn'];

  if (field.type === 'password' || sensitiveTypes.includes(field.semantic)) {
    return '••••••••';
  }

  // Truncate long values
  if (value.length > 30) {
    return value.substring(0, 27) + '...';
  }

  return value;
}

/**
 * Get CSS class based on confidence level
 */
function getConfidenceClass(confidence: number): string {
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.5) return 'medium';
  return 'low';
}
