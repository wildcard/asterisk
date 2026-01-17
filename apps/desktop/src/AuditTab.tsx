/**
 * AuditTab - Displays the audit log of fill operations.
 *
 * Features:
 * - Lists audit entries with pagination
 * - Expandable entries to show individual field details
 * - Summary statistics per entry
 * - Color-coded disposition badges
 */

import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { AuditEntry, AuditListResponse } from './types/audit';

// Check if we're running in Tauri context
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/**
 * Get CSS class for disposition badge.
 */
function getDispositionClass(disposition: string): string {
  switch (disposition) {
    case 'safe':
      return 'disposition-safe';
    case 'review':
      return 'disposition-review';
    case 'blocked':
      return 'disposition-blocked';
    default:
      return '';
  }
}

/**
 * Format ISO timestamp to human-readable date/time.
 */
function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString();
}

/**
 * AuditEntryCard - Single expandable audit entry.
 */
function AuditEntryCard({ entry }: { entry: AuditEntry }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="audit-entry-card">
      <div
        className="audit-entry-header"
        onClick={() => setExpanded(!expanded)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') setExpanded(!expanded);
        }}
      >
        <div className="entry-domain">
          <span className="expand-icon">{expanded ? '▼' : '▶'}</span>
          {entry.domain}
        </div>
        <div className="entry-summary">
          <span className="summary-badge safe">{entry.summary.appliedCount} applied</span>
          {entry.summary.blockedCount > 0 && (
            <span className="summary-badge blocked">{entry.summary.blockedCount} blocked</span>
          )}
          {entry.summary.reviewedCount > 0 && (
            <span className="summary-badge review">{entry.summary.reviewedCount} reviewed</span>
          )}
        </div>
        <div className="entry-time">{formatTimestamp(entry.createdAt)}</div>
      </div>

      {expanded && (
        <div className="audit-entry-details">
          <div className="entry-meta">
            <div className="meta-row">
              <span className="meta-label">URL:</span>
              <span className="meta-value url">{entry.url}</span>
            </div>
            <div className="meta-row">
              <span className="meta-label">Fingerprint:</span>
              <span className="meta-value fingerprint">{entry.fingerprint}</span>
            </div>
            <div className="meta-row">
              <span className="meta-label">Entry ID:</span>
              <span className="meta-value id">{entry.id}</span>
            </div>
          </div>

          <table className="audit-items-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Field</th>
                <th>Confidence</th>
                <th>Old Value</th>
                <th>New Value</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {entry.items.map((item) => (
                <tr key={item.fieldId} className={item.applied ? 'applied' : 'skipped'}>
                  <td>
                    <span className={`status-icon ${item.applied ? 'applied' : 'skipped'}`}>
                      {item.applied ? '✓' : '−'}
                    </span>
                  </td>
                  <td>
                    <span className="field-label">{item.label}</span>
                    <span className={`disposition-badge ${getDispositionClass(item.disposition)}`}>
                      {item.disposition}
                    </span>
                  </td>
                  <td>
                    <span className={`confidence-badge ${getDispositionClass(item.disposition)}`}>
                      {Math.round(item.confidence * 100)}%
                    </span>
                  </td>
                  <td>
                    <span className="value-redacted old">{item.oldValueRedacted || '(empty)'}</span>
                  </td>
                  <td>
                    <span className="value-redacted new">{item.newValueRedacted}</span>
                  </td>
                  <td>
                    <span className="source-key">{item.source}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * AuditTab component.
 */
export function AuditTab() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  // Load audit entries
  const loadEntries = useCallback(async (cursor?: number) => {
    if (!isTauri) {
      setError('Audit log is only available in the desktop app.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await invoke<AuditListResponse>('audit_list', {
        limit: 20,
        cursor: cursor ?? null,
      });

      if (cursor) {
        // Append to existing entries
        setEntries((prev) => [...prev, ...response.items]);
      } else {
        // Replace entries
        setEntries(response.items);
      }

      setNextCursor(response.nextCursor ?? null);
      setHasLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  // Load more handler
  const handleLoadMore = () => {
    if (nextCursor !== null) {
      loadEntries(nextCursor);
    }
  };

  // Refresh handler
  const handleRefresh = () => {
    setEntries([]);
    setNextCursor(null);
    loadEntries();
  };

  // Calculate totals
  const totalApplied = entries.reduce((sum, e) => sum + e.summary.appliedCount, 0);
  const totalEntries = entries.length;

  return (
    <div className="audit-tab">
      <div className="audit-header">
        <h2>Audit Log</h2>
        <div className="audit-controls">
          <button onClick={handleRefresh} disabled={loading} className="refresh-btn">
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {/* Summary stats */}
      {hasLoaded && entries.length > 0 && (
        <div className="audit-summary">
          <div className="summary-stat">
            <span className="stat-value">{totalEntries}</span>
            <span className="stat-label">Fill operations</span>
          </div>
          <div className="summary-stat">
            <span className="stat-value">{totalApplied}</span>
            <span className="stat-label">Fields filled</span>
          </div>
        </div>
      )}

      {/* Entries list */}
      <div className="audit-entries">
        {entries.map((entry) => (
          <AuditEntryCard key={entry.id} entry={entry} />
        ))}
      </div>

      {/* Empty state */}
      {hasLoaded && entries.length === 0 && !loading && (
        <div className="empty-state">
          <p>No audit entries yet.</p>
          <p className="hint">
            Use the Review & Apply feature to fill forms and create audit records.
          </p>
        </div>
      )}

      {/* Load more */}
      {nextCursor !== null && (
        <div className="load-more">
          <button onClick={handleLoadMore} disabled={loading}>
            {loading ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}
    </div>
  );
}

export default AuditTab;
