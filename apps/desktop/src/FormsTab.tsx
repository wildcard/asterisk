import { useEffect, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

// Mirror the JSON types from Rust
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

export function FormsTab() {
  const [snapshot, setSnapshot] = useState<FormSnapshotJson | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const loadSnapshot = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await invoke<FormSnapshotJson | null>('get_latest_form_snapshot');
      setSnapshot(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load and auto-refresh
  useEffect(() => {
    loadSnapshot();

    if (autoRefresh) {
      const interval = setInterval(loadSnapshot, 2000); // Poll every 2 seconds
      return () => clearInterval(interval);
    }
  }, [loadSnapshot, autoRefresh]);

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString();
    } catch {
      return isoString;
    }
  };

  const getFieldTypeIcon = (type: string): string => {
    switch (type) {
      case 'email': return '📧';
      case 'password': return '🔒';
      case 'tel': return '📞';
      case 'url': return '🔗';
      case 'number': return '🔢';
      case 'date': return '📅';
      case 'select': return '📋';
      case 'textarea': return '📝';
      case 'checkbox': return '☑️';
      case 'radio': return '⭕';
      default: return '📄';
    }
  };

  return (
    <div className="forms-tab">
      <div className="forms-header">
        <h2>Detected Forms</h2>
        <div className="forms-controls">
          <label className="auto-refresh-toggle">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh
          </label>
          <button onClick={loadSnapshot} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {!snapshot && !loading && !error && (
        <div className="empty-state">
          <p>No form detected yet.</p>
          <p className="hint">
            Open a page with a form in Chrome with the Asterisk extension installed.
          </p>
        </div>
      )}

      {snapshot && (
        <div className="snapshot-card">
          <div className="snapshot-header">
            <div className="snapshot-domain">{snapshot.domain}</div>
            <div className="snapshot-time">Captured: {formatTime(snapshot.capturedAt)}</div>
          </div>

          <div className="snapshot-meta">
            <div className="meta-item">
              <span className="meta-label">Page</span>
              <span className="meta-value" title={snapshot.url}>{snapshot.title}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Fields</span>
              <span className="meta-value">{snapshot.fingerprint.fieldCount}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Required</span>
              <span className="meta-value">{snapshot.fingerprint.requiredCount}</span>
            </div>
          </div>

          <div className="fields-section">
            <h3>Fields</h3>
            <div className="fields-list">
              {snapshot.fields.map((field, index) => (
                <div key={field.id || index} className="field-row">
                  <span className="field-icon">{getFieldTypeIcon(field.type)}</span>
                  <span className="field-label">
                    {field.label || field.name || `Field ${index + 1}`}
                  </span>
                  <span className="field-type">{field.type}</span>
                  {field.required && <span className="field-required">Required</span>}
                  {field.autocomplete && (
                    <span className="field-autocomplete" title={`autocomplete="${field.autocomplete}"`}>
                      {field.autocomplete}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="fingerprint-section">
            <details>
              <summary>Fingerprint Details</summary>
              <pre>{JSON.stringify(snapshot.fingerprint, null, 2)}</pre>
            </details>
          </div>
        </div>
      )}
    </div>
  );
}

export default FormsTab;
