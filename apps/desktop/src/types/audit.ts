/**
 * Audit log types for tracking fill operations.
 *
 * The audit log is append-only and stores redacted values only.
 * No raw PII is ever stored in the audit log.
 */

import type { Disposition } from '../components/fillplan/confidence';

/**
 * Redaction level applied to a value in the audit log.
 */
export type RedactionLevel = 'none' | 'partial' | 'masked';

/**
 * A single field in an audit entry.
 */
export interface AuditItem {
  /** The DOM element ID of the field */
  fieldId: string;
  /** Human-readable label for the field */
  label: string;
  /** Field type (text, email, tel, etc.) */
  kind: string;
  /** Confidence score for the match (0-1) */
  confidence: number;
  /** Disposition category based on confidence */
  disposition: Disposition;
  /** Whether this field was actually applied */
  applied: boolean;
  /** The vault key that provided the value */
  source: string;
  /** Redacted version of the old (original) value */
  oldValueRedacted: string;
  /** Redacted version of the new (filled) value */
  newValueRedacted: string;
  /** Level of redaction applied */
  redaction: RedactionLevel;
  /** Whether user explicitly confirmed this field */
  userConfirmed: boolean;
  /** Optional notes (e.g., "undo", "user override") */
  notes?: string;
}

/**
 * Summary statistics for an audit entry.
 */
export interface AuditSummary {
  /** Total fields in the fill plan */
  plannedCount: number;
  /** Fields that were actually applied */
  appliedCount: number;
  /** Fields that were blocked (low confidence) */
  blockedCount: number;
  /** Fields that required user review */
  reviewedCount: number;
}

/**
 * A single audit log entry representing one fill operation.
 */
export interface AuditEntry {
  /** Unique identifier (UUID) */
  id: string;
  /** ISO timestamp when the operation occurred */
  createdAt: string;
  /** Full URL where the form was filled */
  url: string;
  /** Domain of the form */
  domain: string;
  /** Form fingerprint hash for identification */
  fingerprint: string;
  /** Summary statistics */
  summary: AuditSummary;
  /** Individual field items */
  items: AuditItem[];
}

/**
 * Response from audit_list command with pagination support.
 */
export interface AuditListResponse {
  /** List of audit entries */
  items: AuditEntry[];
  /** Cursor for next page, if more entries exist */
  nextCursor?: number;
}

/**
 * State for tracking the last applied operation (for undo support).
 */
export interface LastAppliedOperation {
  /** The audit entry ID */
  entryId: string;
  /** Domain where the fill was applied */
  domain: string;
  /** Map of fieldId to old value (for reverting) */
  oldValues: Record<string, string>;
  /** Map of fieldId to new value (what was applied) */
  newValues: Record<string, string>;
  /** Timestamp when applied */
  appliedAt: string;
}

/**
 * Redact a value for audit logging.
 *
 * Default: keep first 2 + last 2 chars, mask middle with "•"
 * Sensitive: fully masked "••••••"
 *
 * @param value - The value to redact
 * @param isSensitive - Whether this is a sensitive field
 * @param maxLength - Maximum length of output (default 64)
 * @returns Redacted value and redaction level
 */
export function redactValue(
  value: string,
  isSensitive: boolean,
  maxLength = 64
): { redacted: string; level: RedactionLevel } {
  if (!value || value.length === 0) {
    return { redacted: '', level: 'none' };
  }

  // Sensitive fields are fully masked
  if (isSensitive) {
    return { redacted: '••••••', level: 'masked' };
  }

  // Short values don't need redaction
  if (value.length <= 4) {
    return { redacted: value, level: 'none' };
  }

  // Partial redaction: first 2 + last 2 chars, middle masked
  const first = value.slice(0, 2);
  const last = value.slice(-2);
  const middleLength = Math.min(value.length - 4, maxLength - 4);
  const masked = '•'.repeat(middleLength);

  return {
    redacted: `${first}${masked}${last}`,
    level: 'partial',
  };
}

/**
 * Create a new audit entry from a fill operation.
 *
 * @param params - Parameters for creating the entry
 * @returns A new AuditEntry
 */
export function createAuditEntry(params: {
  url: string;
  domain: string;
  fingerprint: string;
  items: AuditItem[];
}): AuditEntry {
  const summary: AuditSummary = {
    plannedCount: params.items.length,
    appliedCount: params.items.filter((i) => i.applied).length,
    blockedCount: params.items.filter((i) => i.disposition === 'blocked').length,
    reviewedCount: params.items.filter((i) => i.disposition === 'review' && i.userConfirmed).length,
  };

  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    url: params.url,
    domain: params.domain,
    fingerprint: params.fingerprint,
    summary,
    items: params.items,
  };
}
