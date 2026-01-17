/**
 * Confidence thresholds and disposition helpers for fill plan review.
 *
 * Dispositions determine how fields are handled in the review UI:
 * - safe: Auto-checked, applied without review (>= 98%)
 * - review: Checked but highlighted for review (90-98%)
 * - blocked: Unchecked, requires explicit user approval (< 90%)
 */

/** Fields at or above this confidence are auto-applied without review */
export const SAFE_AUTO_THRESHOLD = 0.98;

/** Fields below this confidence are blocked by default */
export const REVIEW_THRESHOLD = 0.90;

/** Disposition categories for fill recommendations */
export type Disposition = 'safe' | 'review' | 'blocked';

/**
 * Determine the disposition of a field based on its confidence score.
 *
 * @param confidence - Confidence score between 0 and 1
 * @returns The disposition category
 */
export const getDisposition = (confidence: number): Disposition => {
  if (confidence >= SAFE_AUTO_THRESHOLD) return 'safe';
  if (confidence >= REVIEW_THRESHOLD) return 'review';
  return 'blocked';
};

/**
 * Labels that indicate sensitive fields requiring extra protection.
 * Values in these fields should be redacted in audit logs.
 */
export const SENSITIVE_LABELS = [
  'ssn',
  'social',
  'passport',
  'id number',
  'dob',
  'birth',
  'social security',
  'tax id',
  'national id',
];

/**
 * Check if a field label indicates sensitive data.
 *
 * @param label - The field label to check
 * @returns True if the label matches sensitive patterns
 */
export const isSensitiveField = (label: string): boolean => {
  const lowerLabel = label.toLowerCase();
  return SENSITIVE_LABELS.some((pattern) => lowerLabel.includes(pattern));
};

/**
 * Get the CSS class or color for a disposition badge.
 *
 * @param disposition - The disposition category
 * @returns CSS class name for styling
 */
export const getDispositionClass = (disposition: Disposition): string => {
  switch (disposition) {
    case 'safe':
      return 'disposition-safe';
    case 'review':
      return 'disposition-review';
    case 'blocked':
      return 'disposition-blocked';
  }
};

/**
 * Get the human-readable label for a disposition.
 *
 * @param disposition - The disposition category
 * @returns Display label
 */
export const getDispositionLabel = (disposition: Disposition): string => {
  switch (disposition) {
    case 'safe':
      return 'Safe';
    case 'review':
      return 'Needs review';
    case 'blocked':
      return 'Blocked';
  }
};
