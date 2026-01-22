import { useEffect, useState, useCallback, useMemo } from 'react';
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
  FillCommand,
  FieldFill,
} from '@asterisk/core';
import { matchByLLM, isLLMMatchingAvailable } from './llm-matching';
import {
  FillPlanReviewDialog,
  type FieldInfo,
  type VaultItemInfo,
} from './components/fillplan';
import type { LastAppliedOperation, AuditEntry } from './types/audit';

// Check if we're running in Tauri context
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// ============================================================================
// Settings
// ============================================================================

interface Settings {
  apiKey: string;
  useLlmMatching: boolean;
  llmModel: string;
}

const SETTINGS_KEY = 'asterisk_settings';

function loadSettings(): Settings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn('Failed to load settings:', e);
  }
  return { apiKey: '', useLlmMatching: false, llmModel: 'claude-sonnet-4-5-20250929' };
}

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
  const [llmLoading, setLlmLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [lastApplied, setLastApplied] = useState<LastAppliedOperation | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);

  // Build field info map for review dialog
  const fieldInfoMap = useMemo(() => {
    const map = new Map<string, FieldInfo>();
    if (snapshot) {
      for (const field of snapshot.fields) {
        map.set(field.id, {
          id: field.id,
          label: field.label || field.name || field.id,
          type: field.type,
        });
      }
    }
    return map;
  }, [snapshot]);

  // Build vault item info map for review dialog
  const vaultItemMap = useMemo(() => {
    const map = new Map<string, VaultItemInfo>();
    for (const item of vaultItems) {
      map.set(item.key, {
        key: item.key,
        value: item.value,
        label: item.label,
      });
    }
    return map;
  }, [vaultItems]);

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

  // Run LLM analysis on unmatched fields
  const runLLMAnalysis = useCallback(async () => {
    if (!fillPlan || !snapshot || fillPlan.unmatchedFields.length === 0) return;

    console.log('[LLM Analysis] Starting analysis...');
    console.log('[LLM Analysis] Unmatched fields:', fillPlan.unmatchedFields);

    // Check if LLM matching is available
    const available = await isLLMMatchingAvailable();
    console.log('[LLM Analysis] API key available:', available);

    if (!available) {
      setError('Please configure your Claude API key in Settings to use AI matching.');
      return;
    }

    setLlmLoading(true);
    setError(null);

    try {
      // Get the unmatched fields from the snapshot
      const formSnapshot = toFormSnapshot(snapshot);
      const unmatchedFieldNodes = formSnapshot.fields.filter(
        f => fillPlan.unmatchedFields.includes(f.id)
      );

      console.log('[LLM Analysis] Found', unmatchedFieldNodes.length, 'unmatched field nodes');

      if (unmatchedFieldNodes.length === 0) return;

      const items = toVaultItems(vaultItems);
      console.log('[LLM Analysis] Vault items:', items.map(i => i.key));

      // Call LLM matching for each field
      const llmRecommendations: FillRecommendation[] = [];
      for (const field of unmatchedFieldNodes) {
        console.log(`[LLM Analysis] Analyzing field: ${field.label} (${field.id})`);
        try {
          const recommendation = await matchByLLM(field, items);
          if (recommendation) {
            console.log(`[LLM Analysis] ✓ Match found: ${field.label} → ${recommendation.vaultKey} (${Math.round(recommendation.confidence * 100)}%)`);
            llmRecommendations.push(recommendation);
          } else {
            console.log(`[LLM Analysis] ✗ No match for: ${field.label}`);
          }
        } catch (err) {
          console.error(`[LLM Analysis] Failed to analyze field ${field.id}:`, err);
          // Continue with other fields
        }
      }

      console.log('[LLM Analysis] Total LLM recommendations:', llmRecommendations.length);

      if (llmRecommendations.length > 0) {
        // Merge LLM recommendations into existing fill plan
        const newRecommendations = [...fillPlan.recommendations, ...llmRecommendations];
        const newUnmatchedFields = fillPlan.unmatchedFields.filter(
          id => !llmRecommendations.some(r => r.fieldId === id)
        );

        // Recalculate statistics
        const requiredFieldsCovered = formSnapshot.fields.filter(
          f => f.required && newRecommendations.some(r => r.fieldId === f.id)
        ).length;

        const overallConfidence =
          newRecommendations.length > 0
            ? newRecommendations.reduce((sum, r) => sum + r.confidence, 0) /
              newRecommendations.length
            : 0;

        setFillPlan({
          ...fillPlan,
          recommendations: newRecommendations,
          unmatchedFields: newUnmatchedFields,
          requiredFieldsCovered,
          overallConfidence,
          warnings: newUnmatchedFields.length > 0
            ? [`${newUnmatchedFields.length} field(s) still unmatched after AI analysis`]
            : undefined,
        });
      } else {
        setError('AI analysis could not find additional matches.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLlmLoading(false);
    }
  }, [fillPlan, snapshot, vaultItems, settings]);

  // Open review dialog
  const openReviewDialog = useCallback(() => {
    if (!fillPlan || fillPlan.recommendations.length === 0) return;
    setIsReviewOpen(true);
  }, [fillPlan]);

  // Capture old values from DOM (placeholder - actual capture happens in extension)
  const captureOldValues = useCallback(async (): Promise<Map<string, string>> => {
    // In a real implementation, this would query the extension for current field values
    // For now, return empty map (old values will show as "(empty)")
    return new Map<string, string>();
  }, []);

  // Apply selected fills from review dialog
  const handleApply = useCallback(async (selectedFieldIds: string[], auditEntry: AuditEntry) => {
    if (!fillPlan || !snapshot) return;

    setApplying(true);
    setError(null);
    setSuccess(null);

    try {
      // Get recommendations for selected fields only
      const selectedRecs = fillPlan.recommendations.filter(
        rec => selectedFieldIds.includes(rec.fieldId)
      );

      // Convert recommendations to fills with actual values
      const fills: FieldFill[] = selectedRecs
        .map(rec => {
          const vaultItem = vaultItems.find(v => v.key === rec.vaultKey);
          if (!vaultItem) return null;
          return {
            fieldId: rec.fieldId,
            value: vaultItem.value,
          };
        })
        .filter((f): f is FieldFill => f !== null);

      if (fills.length === 0) {
        setError('No values to fill - vault items not found');
        return;
      }

      // Create fill command
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes

      const command: FillCommand = {
        id: `fill-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        targetDomain: snapshot.domain,
        targetUrl: snapshot.url,
        fills,
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
      };

      // Send to backend
      const response = await fetch('http://127.0.0.1:17373/v1/fill-commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(command),
      });

      if (!response.ok) {
        throw new Error(`Failed to send fill command: ${response.statusText}`);
      }

      // Track for undo support
      const oldValues: Record<string, string> = {};
      const newValues: Record<string, string> = {};
      for (const fill of fills) {
        oldValues[fill.fieldId] = ''; // Would come from captureOldValues
        newValues[fill.fieldId] = fill.value;
      }

      setLastApplied({
        entryId: auditEntry.id,
        domain: snapshot.domain,
        oldValues,
        newValues,
        appliedAt: new Date().toISOString(),
      });

      // Store audit entry to backend
      if (isTauri) {
        try {
          await invoke('audit_append', { entry: auditEntry });
          console.log('Audit entry stored:', auditEntry.id);
        } catch (auditErr) {
          console.warn('Failed to store audit entry:', auditErr);
          // Non-fatal: don't block fill operation if audit fails
        }
      }

      setSuccess(`Fill command sent! ${fills.length} field(s) ready to fill on ${snapshot.domain}`);
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setApplying(false);
    }
  }, [fillPlan, snapshot, vaultItems]);

  // Undo last applied operation
  const handleUndo = useCallback(async () => {
    if (!lastApplied) return;

    try {
      // Create undo fill command with old values
      const fills: FieldFill[] = Object.entries(lastApplied.oldValues).map(
        ([fieldId, value]) => ({ fieldId, value })
      );

      const now = new Date();
      const expiresAt = new Date(now.getTime() + 5 * 60 * 1000);

      const command: FillCommand = {
        id: `undo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        targetDomain: lastApplied.domain,
        targetUrl: snapshot?.url || '',
        fills,
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
      };

      const response = await fetch('http://127.0.0.1:17373/v1/fill-commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(command),
      });

      if (!response.ok) {
        throw new Error(`Failed to send undo command: ${response.statusText}`);
      }

      setLastApplied(null);
      setSuccess('Undo command sent!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [lastApplied, snapshot]);

  // Check API key status
  const checkApiKeyStatus = useCallback(async () => {
    const available = await isLLMMatchingAvailable();
    setHasApiKey(available);
  }, []);

  // Reload settings when tab becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        setSettings(loadSettings());
        checkApiKeyStatus();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [checkApiKeyStatus]);

  // Initial load
  useEffect(() => {
    loadSnapshot();
    loadVaultItems();
    checkApiKeyStatus();
  }, [loadSnapshot, loadVaultItems, checkApiKeyStatus]);

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
        <div className="header-buttons">
          <button onClick={generatePlan} disabled={loading} className="generate-btn">
            {loading ? 'Generating...' : 'Generate Fill Plan'}
          </button>
          {fillPlan && fillPlan.recommendations.length > 0 && (
            <button
              onClick={openReviewDialog}
              disabled={applying}
              className="apply-btn"
              title="Review and apply fill recommendations"
            >
              {applying ? 'Sending...' : 'Review & Apply'}
            </button>
          )}
        </div>
      </div>

      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}

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
              <div className="unmatched-header">
                <h3>Unmatched Fields ({fillPlan.unmatchedFields.length})</h3>
                <button
                  onClick={runLLMAnalysis}
                  disabled={llmLoading || !hasApiKey}
                  className="llm-btn"
                  title={!hasApiKey ? 'Configure API key in Settings' : 'Analyze with Claude AI'}
                >
                  {llmLoading ? 'Analyzing...' : 'Analyze with AI'}
                </button>
              </div>
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
              {!hasApiKey && (
                <p className="unmatched-hint">
                  Configure your Claude API key in Settings to enable AI-powered matching.
                </p>
              )}
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

      {/* Review Dialog */}
      {fillPlan && snapshot && (
        <FillPlanReviewDialog
          isOpen={isReviewOpen}
          onClose={() => setIsReviewOpen(false)}
          fillPlan={fillPlan}
          domain={snapshot.domain}
          url={snapshot.url}
          fingerprint={snapshot.fingerprint.hash}
          fieldInfoMap={fieldInfoMap}
          vaultItemMap={vaultItemMap}
          onApply={handleApply}
          captureOldValues={captureOldValues}
          lastApplied={lastApplied}
          onUndo={handleUndo}
        />
      )}
    </div>
  );
}

export default MatchingPanel;
