import { useEffect, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  generateFillPlan,
  getConfidenceLevel,
  getMatchTierDescription,
} from '@asterisk/core';
import type {
  FormSnapshot,
  VaultItem,
  FillPlan,
  FillRecommendation,
  FieldNode,
} from '@asterisk/core';

// Check if we're running in Tauri context
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// ============================================================================
// Types
// ============================================================================

// Mirror JSON types for Tauri IPC
interface FormSnapshotJson {
  url: string;
  domain: string;
  title: string;
  capturedAt: string;
  fingerprint: {
    fieldCount: number;
    fieldTypes: string[];
    requiredCount: number;
    hash: string;
  };
  fields: Array<{
    id: string;
    name: string;
    label: string;
    type: string;
    semantic: string;
    required: boolean;
    validation?: string;
    autocomplete?: string;
    maxLength?: number;
    minLength?: number;
    placeholder?: string;
    inputMode?: string;
    options?: Array<{ value: string; label: string }>;
  }>;
}

interface VaultItemJson {
  key: string;
  value: string;
  label: string;
  category: string;
  provenance: {
    source: string;
    timestamp: string;
    confidence: number;
    origin?: string;
  };
  metadata: {
    created: string;
    updated: string;
    last_used?: string;
    usage_count: number;
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert JSON types to core types for matching
 */
function toFormSnapshot(json: FormSnapshotJson): FormSnapshot {
  return {
    ...json,
    fields: json.fields.map(f => ({
      ...f,
      type: f.type as FieldNode['type'],
      semantic: f.semantic as FieldNode['semantic'],
    })),
  };
}

function toVaultItems(json: VaultItemJson[]): VaultItem[] {
  return json.map(item => ({
    ...item,
    category: item.category as VaultItem['category'],
    provenance: {
      ...item.provenance,
      source: item.provenance.source as VaultItem['provenance']['source'],
      timestamp: new Date(item.provenance.timestamp),
    },
    metadata: {
      created: new Date(item.metadata.created),
      updated: new Date(item.metadata.updated),
      lastUsed: item.metadata.last_used ? new Date(item.metadata.last_used) : undefined,
      usageCount: item.metadata.usage_count,
    },
  }));
}

// ============================================================================
// Component
// ============================================================================

export function MatchingPanel() {
  const [snapshot, setSnapshot] = useState<FormSnapshotJson | null>(null);
  const [vaultItems, setVaultItems] = useState<VaultItemJson[]>([]);
  const [fillPlan, setFillPlan] = useState<FillPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load form snapshot
  const loadSnapshot = useCallback(async () => {
    try {
      let result: FormSnapshotJson | null = null;

      if (isTauri) {
        result = await invoke<FormSnapshotJson | null>('get_latest_form_snapshot');
      } else {
        const response = await fetch('http://127.0.0.1:17373/v1/form-snapshots');
        if (response.ok) {
          result = await response.json();
        }
      }

      setSnapshot(result);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    }
  }, []);

  // Load vault items
  const loadVaultItems = useCallback(async () => {
    try {
      let result: VaultItemJson[] = [];

      if (isTauri) {
        result = await invoke<VaultItemJson[]>('vault_list');
      } else {
        const response = await fetch('http://127.0.0.1:17373/v1/vault');
        if (response.ok) {
          result = await response.json();
        }
      }

      setVaultItems(result);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return [];
    }
  }, []);

  // Generate fill plan
  const generatePlan = useCallback(async () => {
    setLoading(true);
    setError(null);
    setFillPlan(null);

    try {
      const [currentSnapshot, currentVaultItems] = await Promise.all([
        loadSnapshot(),
        loadVaultItems(),
      ]);

      if (!currentSnapshot) {
        setError('No form detected. Open a page with a form in Chrome.');
        return;
      }

      if (currentVaultItems.length === 0) {
        setError('No vault items available. Add some data to your vault first.');
        return;
      }

      // Convert to core types and generate plan
      const formSnapshot = toFormSnapshot(currentSnapshot);
      const items = toVaultItems(currentVaultItems);
      const plan = generateFillPlan(formSnapshot, items);

      setFillPlan(plan);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [loadSnapshot, loadVaultItems]);

  // Initial load
  useEffect(() => {
    loadSnapshot();
    loadVaultItems();
  }, [loadSnapshot, loadVaultItems]);

  // Get field by ID from snapshot
  const getField = (fieldId: string): FormSnapshotJson['fields'][0] | undefined => {
    return snapshot?.fields.find(f => f.id === fieldId);
  };

  // Get vault item by key
  const getVaultItem = (key: string): VaultItemJson | undefined => {
    return vaultItems.find(item => item.key === key);
  };

  // Confidence badge color
  const getConfidenceColor = (confidence: number): string => {
    const level = getConfidenceLevel(confidence);
    switch (level) {
      case 'high': return 'confidence-high';
      case 'medium': return 'confidence-medium';
      case 'low': return 'confidence-low';
    }
  };

  return (
    <div className="matching-panel">
      <div className="matching-header">
        <h2>Form Matching</h2>
        <button onClick={generatePlan} disabled={loading} className="generate-btn">
          {loading ? 'Generating...' : 'Generate Fill Plan'}
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {/* Summary Section */}
      <div className="matching-summary">
        <div className="summary-item">
          <span className="summary-label">Form</span>
          <span className="summary-value">
            {snapshot ? snapshot.domain : 'No form detected'}
          </span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Vault Items</span>
          <span className="summary-value">{vaultItems.length}</span>
        </div>
        {fillPlan && (
          <>
            <div className="summary-item">
              <span className="summary-label">Matches</span>
              <span className="summary-value">{fillPlan.recommendations.length}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Unmatched</span>
              <span className="summary-value">{fillPlan.unmatchedFields.length}</span>
            </div>
          </>
        )}
      </div>

      {/* Fill Plan Results */}
      {fillPlan && (
        <div className="fill-plan">
          {/* Overall Confidence */}
          <div className="plan-confidence">
            <span className={`confidence-badge ${getConfidenceColor(fillPlan.overallConfidence)}`}>
              {Math.round(fillPlan.overallConfidence * 100)}% confidence
            </span>
            <span className="coverage-info">
              {fillPlan.requiredFieldsCovered}/{fillPlan.totalRequiredFields} required fields covered
            </span>
          </div>

          {/* Warnings */}
          {fillPlan.warnings && fillPlan.warnings.length > 0 && (
            <div className="plan-warnings">
              {fillPlan.warnings.map((warning, i) => (
                <div key={i} className="warning-item">
                  {warning}
                </div>
              ))}
            </div>
          )}

          {/* Recommendations */}
          {fillPlan.recommendations.length > 0 && (
            <div className="recommendations-section">
              <h3>Recommendations</h3>
              <div className="recommendations-list">
                {fillPlan.recommendations.map((rec: FillRecommendation) => {
                  const field = getField(rec.fieldId);
                  const vaultItem = getVaultItem(rec.vaultKey);

                  return (
                    <div key={rec.fieldId} className="recommendation-row">
                      <div className="rec-field">
                        <span className="field-label">{field?.label || field?.name || rec.fieldId}</span>
                        {field?.required && <span className="required-badge">Required</span>}
                      </div>
                      <div className="rec-arrow">→</div>
                      <div className="rec-vault">
                        <span className="vault-label">{vaultItem?.label || rec.vaultKey}</span>
                        <span className="vault-value">{vaultItem?.value}</span>
                      </div>
                      <div className="rec-meta">
                        <span className={`confidence-badge ${getConfidenceColor(rec.confidence)}`}>
                          {Math.round(rec.confidence * 100)}%
                        </span>
                        <span className="match-tier" title={getMatchTierDescription(rec.matchTier)}>
                          {rec.matchTier}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Unmatched Fields */}
          {fillPlan.unmatchedFields.length > 0 && (
            <div className="unmatched-section">
              <h3>Unmatched Fields</h3>
              <div className="unmatched-list">
                {fillPlan.unmatchedFields.map(fieldId => {
                  const field = getField(fieldId);
                  return (
                    <div key={fieldId} className="unmatched-row">
                      <span className="field-label">{field?.label || field?.name || fieldId}</span>
                      <span className="field-type">{field?.type}</span>
                      {field?.required && <span className="required-badge">Required</span>}
                    </div>
                  );
                })}
              </div>
              <p className="unmatched-hint">
                Add matching data to your vault or enable LLM matching for better results.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!fillPlan && !loading && !error && (
        <div className="empty-state">
          <p>Click "Generate Fill Plan" to analyze the current form and find matches from your vault.</p>
        </div>
      )}
    </div>
  );
}

export default MatchingPanel;
