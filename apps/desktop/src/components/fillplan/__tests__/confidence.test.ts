import { describe, it, expect } from 'vitest';
import {
  getDisposition,
  getDispositionClass,
  getDispositionLabel,
  isSensitiveField,
  SAFE_AUTO_THRESHOLD,
  REVIEW_THRESHOLD,
} from '../confidence';

describe('getDisposition', () => {
  describe('confidence-only (requiresConfirmation omitted/false) - existing threshold behavior', () => {
    it('is safe at or above the safe-auto threshold', () => {
      expect(getDisposition(SAFE_AUTO_THRESHOLD)).toBe('safe');
      expect(getDisposition(1.0)).toBe('safe');
    });

    it('is review between the review and safe-auto thresholds', () => {
      expect(getDisposition(REVIEW_THRESHOLD)).toBe('review');
      expect(getDisposition(0.95)).toBe('review');
    });

    it('is blocked below the review threshold', () => {
      expect(getDisposition(REVIEW_THRESHOLD - 0.01)).toBe('blocked');
      expect(getDisposition(0)).toBe('blocked');
    });

    it('defaults requiresConfirmation to false when omitted', () => {
      expect(getDisposition(1.0)).toBe(getDisposition(1.0, false));
    });
  });

  describe('requiresConfirmation forces blocked regardless of confidence', () => {
    it('is blocked at maximum confidence (1.0) when gated', () => {
      expect(getDisposition(1.0, true)).toBe('blocked');
    });

    it('is blocked at the safe-auto threshold when gated', () => {
      expect(getDisposition(SAFE_AUTO_THRESHOLD, true)).toBe('blocked');
    });

    it('is blocked above the safe-auto threshold when gated', () => {
      // Confidence values this high would be 'safe' if ungated - this is
      // the exact scenario the gate exists to prevent: a high-confidence
      // match sourced from stale/unconfirmed evidence must never be
      // silently auto-applied.
      expect(getDisposition(0.99, true)).toBe('blocked');
    });

    it('is blocked in the review range when gated', () => {
      expect(getDisposition(0.95, true)).toBe('blocked');
    });

    it('is blocked at low confidence when gated (same result as ungated, for a different reason)', () => {
      expect(getDisposition(0.1, true)).toBe('blocked');
    });

    it('is blocked at confidence 0 when gated', () => {
      expect(getDisposition(0, true)).toBe('blocked');
    });
  });

  it('does not mutate SAFE_AUTO_THRESHOLD/REVIEW_THRESHOLD ordering assumptions', () => {
    // Sanity check the thresholds this whole module's behavior depends on.
    expect(SAFE_AUTO_THRESHOLD).toBeGreaterThan(REVIEW_THRESHOLD);
  });
});

describe('getDispositionClass', () => {
  it('maps each disposition to a distinct CSS class', () => {
    expect(getDispositionClass('safe')).toBe('disposition-safe');
    expect(getDispositionClass('review')).toBe('disposition-review');
    expect(getDispositionClass('blocked')).toBe('disposition-blocked');
  });
});

describe('getDispositionLabel', () => {
  it('maps each disposition to a human-readable label', () => {
    expect(getDispositionLabel('safe')).toBe('Safe');
    expect(getDispositionLabel('review')).toBe('Needs review');
    expect(getDispositionLabel('blocked')).toBe('Blocked');
  });
});

describe('isSensitiveField', () => {
  it('flags known sensitive labels case-insensitively', () => {
    expect(isSensitiveField('Social Security Number')).toBe(true);
    expect(isSensitiveField('passport number')).toBe(true);
    expect(isSensitiveField('Date of Birth (DOB)')).toBe(true);
  });

  it('does not flag ordinary labels', () => {
    expect(isSensitiveField('First Name')).toBe(false);
    expect(isSensitiveField('Email Address')).toBe(false);
  });
});
