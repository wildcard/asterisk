import { describe, it, expect } from 'vitest';
import { DS160_READINESS_CHECKLIST, CHECKLIST_FAMILIES, getChecklistItem } from '../checklist';
import type { ChecklistFamily } from '../checklist';
import {
  validateDossierReadiness,
  resolveApplicability,
  isValidIsoDate,
} from '../validator';
import {
  buildCompleteSyntheticDossier,
  buildSparseFillMappedOnlyDossier,
  cloneDossier,
  DOSSIER_AS_OF,
} from '../fixtures';
import { buildEmptyDossierSkeleton } from '../skeleton';
import type { Dossier, DossierAnswer, RepeatableCoverage, RepeatableSection } from '../types';

/** Non-undefined lookup helper - the fixtures always populate every catalog id, so a missing section is a test bug. */
function getSection(dossier: Dossier, id: string): RepeatableSection {
  const section = dossier.repeatables[id];
  if (!section) throw new Error(`test bug: expected repeatable section ${id} to exist`);
  return section;
}

const EXPECTED_FAMILIES: ChecklistFamily[] = [
  'identity',
  'residency',
  'contact',
  'passport',
  'travel',
  'previous_us_travel',
  'us_contact',
  'family',
  'present_employment',
  'previous_employment',
  'education',
  'languages',
  'country_travel',
  'organizations',
  'specialized_skills',
  'military_service',
  'paramilitary',
  'security_background',
  'application_admin',
];

// ============================================================================
// Checklist catalog self-consistency (proves "COMPLETE" coverage structurally)
// ============================================================================

describe('DS160_READINESS_CHECKLIST catalog', () => {
  it('has at least one item for every documented DS-160 answer family', () => {
    for (const family of EXPECTED_FAMILIES) {
      expect(CHECKLIST_FAMILIES).toContain(family);
    }
    // No undocumented families sneak in either - keeps this test authoritative.
    expect(new Set(CHECKLIST_FAMILIES)).toEqual(new Set(EXPECTED_FAMILIES));
  });

  it('has unique, non-empty ids for every item', () => {
    const ids = DS160_READINESS_CHECKLIST.map((item) => item.id);
    expect(ids.every((id) => id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has a resolvable dependsOn target for every conditional item', () => {
    for (const item of DS160_READINESS_CHECKLIST) {
      if (!item.conditional) continue;
      const gate = getChecklistItem(item.conditional.dependsOn);
      expect(gate, `${item.id} depends on unknown item ${item.conditional.dependsOn}`).toBeDefined();
    }
  });

  it('never has a conditional gate that is itself repeatable (repeatables cannot gate scalars)', () => {
    for (const item of DS160_READINESS_CHECKLIST) {
      if (!item.conditional) continue;
      const gate = getChecklistItem(item.conditional.dependsOn);
      expect(gate?.repeatable).toBeFalsy();
    }
  });

  it('covers the full set of documented DS-160 question families (identity through application_admin)', () => {
    // A structural proxy for "COMPLETE checklist": every family named in the
    // acceptance criteria has a non-trivial number of items, not just one
    // token entry.
    const counts = new Map<string, number>();
    for (const item of DS160_READINESS_CHECKLIST) {
      counts.set(item.family, (counts.get(item.family) ?? 0) + 1);
    }
    for (const family of EXPECTED_FAMILIES) {
      expect(counts.get(family) ?? 0, `family ${family} has too few checklist items`).toBeGreaterThan(0);
    }
    expect(counts.get('security_background')).toBeGreaterThanOrEqual(50); // ~29 questions x (gate + explanation)
  });

  it('gives every enum item a non-empty enumValues list', () => {
    for (const item of DS160_READINESS_CHECKLIST) {
      if (item.valueKind !== 'enum') continue;
      expect(item.enumValues?.length ?? 0, `${item.id} has no enumValues`).toBeGreaterThan(0);
    }
  });

  it('gives every object item at least one field', () => {
    for (const item of DS160_READINESS_CHECKLIST) {
      if (item.valueKind !== 'object') continue;
      expect(item.fields?.length ?? 0, `${item.id} has no fields`).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// Determinism - no wall-clock reads anywhere in the validator
// ============================================================================

describe('validateDossierReadiness determinism', () => {
  it('produces byte-identical reports across repeated runs on the same input', () => {
    const dossier = buildCompleteSyntheticDossier();
    const first = validateDossierReadiness(dossier);
    const second = validateDossierReadiness(cloneDossier(dossier));
    expect(second).toEqual(first);
  });

  it('never constructs a Date or reads wall-clock time', () => {
    const dossier = buildCompleteSyntheticDossier();
    const RealDate = globalThis.Date;
    class ThrowingDate {
      constructor() {
        throw new Error('validateDossierReadiness must not read wall-clock time via `new Date()`');
      }
      static now(): number {
        throw new Error('validateDossierReadiness must not read wall-clock time via `Date.now()`');
      }
    }
    // @ts-expect-error - intentionally swapping in a hostile stand-in for the duration of this test
    globalThis.Date = ThrowingDate;
    try {
      expect(() => validateDossierReadiness(dossier)).not.toThrow();
      const report = validateDossierReadiness(dossier);
      expect(report.ready).toBe(true);
    } finally {
      globalThis.Date = RealDate;
    }
  });
});

// ============================================================================
// The complete synthetic fixture is genuinely ready
// ============================================================================

describe('buildCompleteSyntheticDossier (positive fixture)', () => {
  const dossier = buildCompleteSyntheticDossier();
  const report = validateDossierReadiness(dossier);

  it('is accepted with ready: true and zero issues', () => {
    expect(report.issues).toEqual([]);
    expect(report.ready).toBe(true);
  });

  it('reports the full checklist size and a matching dossierAsOf', () => {
    expect(report.totalChecklistItems).toBe(DS160_READINESS_CHECKLIST.length);
    expect(report.dossierAsOf).toBe(DOSSIER_AS_OF);
  });

  it('produces a non-trivial confirmedCount (proves items were actually walked, not vacuously empty)', () => {
    expect(report.confirmedCount).toBeGreaterThan(100);
  });

  it('has a familySummary entry for every family with zero blocking items', () => {
    for (const family of EXPECTED_FAMILIES) {
      const summary = report.familySummary[family];
      expect(summary, `missing familySummary for ${family}`).toBeDefined();
      expect(summary.blocking).toBe(0);
      expect(summary.total).toBeGreaterThan(0);
    }
  });

  it('exercises at least one populated (non-empty) repeatable section and at least one confirmed_empty one', () => {
    const populated = Object.entries(dossier.repeatables).filter(([, s]) => s.entries.length > 0);
    const empty = Object.entries(dossier.repeatables).filter(
      ([, s]) => s.coverage.status === 'confirmed' && s.entries.length === 0
    );
    expect(populated.length).toBeGreaterThan(0);
    expect(empty.length).toBeGreaterThan(0);
  });

  it('exercises at least one legitimately not_applicable optional field alongside ready: true', () => {
    expect(dossier.answers['us_contact.email']?.status).toBe('not_applicable');
    expect(report.ready).toBe(true);
  });
});

// ============================================================================
// Sparse / fill-mapped-only dossiers can never be ready (acceptance criteria 3)
// ============================================================================

describe('sparse and fill-mapped-only dossiers never produce ready: true', () => {
  it('a dossier with only the ~9 fill-mapped identity/contact/passport/travel fields is not ready', () => {
    const dossier = buildSparseFillMappedOnlyDossier();
    const report = validateDossierReadiness(dossier);
    expect(report.ready).toBe(false);
    expect(report.issues.length).toBeGreaterThan(100);
  });

  it('an entirely empty dossier (no answers, no repeatables) is not ready', () => {
    const empty: Dossier = { schemaVersion: 1, asOf: DOSSIER_AS_OF, answers: {}, repeatables: {} };
    const report = validateDossierReadiness(empty);
    expect(report.ready).toBe(false);
    // Every top-level, unconditional, non-repeatable item is `missing`.
    expect(report.issues.some((i) => i.checklistId === 'identity.surname' && i.code === 'missing')).toBe(true);
    expect(report.issues.some((i) => i.checklistId === 'passport.number' && i.code === 'missing')).toBe(true);
  });

  it('full-inventory coverage: removing any single applicable non-repeatable answer from the complete fixture breaks readiness', () => {
    const base = buildCompleteSyntheticDossier();
    let checked = 0;
    for (const item of DS160_READINESS_CHECKLIST) {
      if (item.repeatable) continue;
      const applicability = resolveApplicability(base, item);
      if (applicability !== 'applicable') continue; // not_applicable items have no positive answer to remove
      const mutated = cloneDossier(base);
      delete mutated.answers[item.id];
      const report = validateDossierReadiness(mutated);
      expect(report.ready, `deleting ${item.id} should break readiness`).toBe(false);
      expect(
        report.issues.some((i) => i.checklistId === item.id && i.code === 'missing'),
        `deleting ${item.id} should surface a "missing" issue for it`
      ).toBe(true);
      checked += 1;
    }
    // Sanity: this loop actually exercised a large slice of the catalog, not zero items.
    expect(checked).toBeGreaterThan(90);
  });

  it('full-inventory coverage: removing any repeatable coverage declaration breaks readiness', () => {
    const base = buildCompleteSyntheticDossier();
    let checked = 0;
    for (const item of DS160_READINESS_CHECKLIST) {
      if (!item.repeatable) continue;
      const applicability = resolveApplicability(base, item);
      if (applicability !== 'applicable') continue;
      const mutated = cloneDossier(base);
      delete mutated.repeatables[item.id];
      const report = validateDossierReadiness(mutated);
      expect(report.ready, `deleting repeatable ${item.id} should break readiness`).toBe(false);
      expect(report.issues.some((i) => i.checklistId === item.id && i.code === 'missing')).toBe(true);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(5);
  });
});

// ============================================================================
// Fail-closed answer states
// ============================================================================

describe('fail-closed answer status handling', () => {
  const cases: Array<[string, DossierAnswer['status']]> = [
    ['identity.surname', 'candidate'],
    ['identity.surname', 'unknown'],
    ['passport.number', 'candidate'],
    ['us_contact.phone', 'unknown'],
  ];

  it.each(cases)('%s with status %s is rejected as not_confirmed', (id, status) => {
    const dossier = cloneDossier(buildCompleteSyntheticDossier());
    (dossier.answers[id] as DossierAnswer).status = status;
    const report = validateDossierReadiness(dossier);
    expect(report.ready).toBe(false);
    expect(report.issues.some((i) => i.checklistId === id && i.code === 'not_confirmed')).toBe(true);
  });

  it('rejects an unreviewed confirmed answer', () => {
    const dossier = cloneDossier(buildCompleteSyntheticDossier());
    (dossier.answers['identity.given_names'] as DossierAnswer).review.reviewed = false;
    const report = validateDossierReadiness(dossier);
    expect(report.ready).toBe(false);
    expect(report.issues.some((i) => i.checklistId === 'identity.given_names' && i.code === 'unreviewed')).toBe(true);
  });

  it('rejects a confirmed answer with no provenance at all', () => {
    const dossier = cloneDossier(buildCompleteSyntheticDossier());
    delete (dossier.answers['identity.given_names'] as DossierAnswer).provenance;
    const report = validateDossierReadiness(dossier);
    expect(report.ready).toBe(false);
    expect(report.issues.some((i) => i.checklistId === 'identity.given_names' && i.code === 'provenance_missing')).toBe(true);
  });

  it('rejects provenance dated after the dossier asOf date (future evidence)', () => {
    const dossier = cloneDossier(buildCompleteSyntheticDossier());
    const answer = dossier.answers['identity.given_names'] as DossierAnswer;
    answer.provenance = { source: 'x', asOf: '2099-01-01' };
    const report = validateDossierReadiness(dossier);
    expect(report.ready).toBe(false);
    expect(
      report.issues.some((i) => i.checklistId === 'identity.given_names' && i.code === 'invalid_format' && /after/.test(i.message))
    ).toBe(true);
  });
});

// ============================================================================
// Invalid formatting
// ============================================================================

describe('invalidly formatted values are rejected', () => {
  it('rejects an enum value outside the declared set', () => {
    const dossier = cloneDossier(buildCompleteSyntheticDossier());
    (dossier.answers['identity.sex'] as DossierAnswer).value = 'not-a-real-value';
    const report = validateDossierReadiness(dossier);
    expect(report.issues.some((i) => i.checklistId === 'identity.sex' && i.code === 'invalid_format')).toBe(true);
  });

  it('rejects a malformed date string', () => {
    const dossier = cloneDossier(buildCompleteSyntheticDossier());
    (dossier.answers['identity.date_of_birth'] as DossierAnswer).value = '13/40/2020';
    const report = validateDossierReadiness(dossier);
    expect(report.issues.some((i) => i.checklistId === 'identity.date_of_birth' && i.code === 'invalid_format')).toBe(true);
  });

  it('rejects a calendar-invalid date (Feb 30)', () => {
    expect(isValidIsoDate('2026-02-30')).toBe(false);
    expect(isValidIsoDate('2024-02-29')).toBe(true); // 2024 is a leap year
    expect(isValidIsoDate('2026-02-29')).toBe(false); // 2026 is not
  });

  it('rejects a required object sub-field left empty', () => {
    const dossier = cloneDossier(buildCompleteSyntheticDossier());
    const value = (dossier.answers['identity.place_of_birth'] as DossierAnswer).value as Record<string, unknown>;
    value.city = '';
    const report = validateDossierReadiness(dossier);
    expect(report.issues.some((i) => i.checklistId === 'identity.place_of_birth' && i.code === 'invalid_format')).toBe(true);
  });

  it('accepts an optional object sub-field left empty', () => {
    const dossier = cloneDossier(buildCompleteSyntheticDossier());
    const value = (dossier.answers['identity.place_of_birth'] as DossierAnswer).value as Record<string, unknown>;
    delete value.stateOrProvince; // optional per checklist.ts
    const report = validateDossierReadiness(dossier);
    expect(report.issues.some((i) => i.checklistId === 'identity.place_of_birth')).toBe(false);
  });
});

// ============================================================================
// Conditional applicability - fail-closed resolution
// ============================================================================

describe('conditional applicability resolves fail-closed', () => {
  it('flags a dependent item as conditional_unresolved when its gate is not confirmed', () => {
    const dossier = cloneDossier(buildCompleteSyntheticDossier());
    (dossier.answers['previous_us_travel.previously_issued_visa'] as DossierAnswer).status = 'unknown';
    const report = validateDossierReadiness(dossier);
    expect(report.ready).toBe(false);
    expect(
      report.issues.some((i) => i.checklistId === 'previous_us_travel.visa_details' && i.code === 'conditional_unresolved')
    ).toBe(true);
  });

  it('never lets a conditionally-unresolved item pass merely because it already has a confirmed value', () => {
    // Even if the applicant/preparer filled in visa_details already, an
    // unconfirmed gate must still block - the validator cannot assume the
    // gate would have resolved true just because a value exists.
    const dossier = cloneDossier(buildCompleteSyntheticDossier());
    (dossier.answers['previous_us_travel.previously_issued_visa'] as DossierAnswer).status = 'candidate';
    expect((dossier.answers['previous_us_travel.visa_details'] as DossierAnswer).status).toBe('confirmed');
    const report = validateDossierReadiness(dossier);
    expect(report.issues.some((i) => i.checklistId === 'previous_us_travel.visa_details' && i.code === 'conditional_unresolved')).toBe(
      true
    );
  });

  it('resolveApplicability chains through a gate that is itself not_applicable', () => {
    // family.spouse_partner_details depends on identity.marital_status; the
    // complete fixture sets marital_status to 'married', so this branch is
    // exercised via a mutated single-status gate instead.
    const dossier = cloneDossier(buildCompleteSyntheticDossier());
    (dossier.answers['identity.marital_status'] as DossierAnswer).value = 'single';
    const spouseItem = getChecklistItem('family.spouse_partner_details');
    expect(spouseItem).toBeDefined();
    if (spouseItem) {
      expect(resolveApplicability(dossier, spouseItem)).toBe('not_applicable');
    }
  });

  it('marks a required item contradictory if answered not_applicable despite its gate resolving applicable', () => {
    const dossier = cloneDossier(buildCompleteSyntheticDossier());
    (dossier.answers['present_employment.employer_details'] as DossierAnswer).status = 'not_applicable';
    const report = validateDossierReadiness(dossier);
    expect(report.issues.some((i) => i.checklistId === 'present_employment.employer_details' && i.code === 'contradictory')).toBe(
      true
    );
  });

  it('marks a not-applicable item contradictory if confirmed despite its gate resolving not applicable', () => {
    const dossier = cloneDossier(buildCompleteSyntheticDossier());
    // travel.payer is 'other_person' in the fixture, so payer_details is
    // applicable; flip payer to 'self' so payer_details' gate resolves
    // not_applicable while payer_details itself is still confirmed.
    (dossier.answers['travel.payer'] as DossierAnswer).value = 'self';
    const report = validateDossierReadiness(dossier);
    expect(report.issues.some((i) => i.checklistId === 'travel.payer_details' && i.code === 'contradictory')).toBe(true);
  });

  it('accepts an optional item explicitly marked not_applicable when reviewed', () => {
    const dossier = buildCompleteSyntheticDossier();
    const email = dossier.answers['us_contact.email'] as DossierAnswer;
    expect(email.status).toBe('not_applicable');
    expect(email.review.reviewed).toBe(true);
    const report = validateDossierReadiness(dossier);
    expect(report.issues.some((i) => i.checklistId === 'us_contact.email')).toBe(false);
  });

  it('rejects an optional item marked not_applicable but left unreviewed', () => {
    const dossier = cloneDossier(buildCompleteSyntheticDossier());
    (dossier.answers['us_contact.email'] as DossierAnswer).review.reviewed = false;
    const report = validateDossierReadiness(dossier);
    expect(report.issues.some((i) => i.checklistId === 'us_contact.email' && i.code === 'unreviewed')).toBe(true);
  });

  it('distinguishes a malformed reviewedAt (invalid_format) from a genuinely unreviewed answer, even on a not_applicable item', () => {
    const dossier = cloneDossier(buildCompleteSyntheticDossier());
    const email = dossier.answers['us_contact.email'] as DossierAnswer;
    email.review = { reviewed: true, reviewedAt: 'not-a-date' };
    const report = validateDossierReadiness(dossier);
    expect(report.issues.some((i) => i.checklistId === 'us_contact.email' && i.code === 'invalid_format')).toBe(true);
    expect(report.issues.some((i) => i.checklistId === 'us_contact.email' && i.code === 'unreviewed')).toBe(false);
  });
});

// ============================================================================
// Repeatable sections and coverage declarations
// ============================================================================

describe('repeatable sections and coverage declarations', () => {
  it('rejects a coverage declaration that is not exhaustive', () => {
    const dossier = cloneDossier(buildCompleteSyntheticDossier());
    const coverage = getSection(dossier, 'education.institutions').coverage;
    coverage.value = { ...(coverage.value as RepeatableCoverage), exhaustive: false };
    const report = validateDossierReadiness(dossier);
    expect(report.issues.some((i) => i.checklistId === 'education.institutions' && i.code === 'coverage_incomplete')).toBe(true);
  });

  it('rejects a coverage count that does not match the actual entry count', () => {
    const dossier = cloneDossier(buildCompleteSyntheticDossier());
    const coverage = getSection(dossier, 'education.institutions').coverage;
    coverage.value = { ...(coverage.value as RepeatableCoverage), count: 99 };
    const report = validateDossierReadiness(dossier);
    expect(report.issues.some((i) => i.checklistId === 'education.institutions' && i.code === 'coverage_mismatch')).toBe(true);
  });

  it('rejects isEmpty: true declared alongside non-empty entries', () => {
    const dossier = cloneDossier(buildCompleteSyntheticDossier());
    const coverage = getSection(dossier, 'education.institutions').coverage;
    coverage.value = { ...(coverage.value as RepeatableCoverage), isEmpty: true };
    const report = validateDossierReadiness(dossier);
    expect(report.issues.some((i) => i.checklistId === 'education.institutions' && i.code === 'contradictory')).toBe(true);
  });

  it('rejects isEmpty: false declared alongside zero entries', () => {
    const dossier = cloneDossier(buildCompleteSyntheticDossier());
    getSection(dossier, 'organizations.memberships').coverage.value = { isEmpty: false, exhaustive: true, count: 0 };
    const report = validateDossierReadiness(dossier);
    expect(report.issues.some((i) => i.checklistId === 'organizations.memberships' && i.code === 'contradictory')).toBe(true);
  });

  it('accepts a legitimately empty, exhaustively-declared, reviewed section', () => {
    const dossier = buildCompleteSyntheticDossier();
    expect(getSection(dossier, 'organizations.memberships').entries).toHaveLength(0);
    const report = validateDossierReadiness(dossier);
    expect(report.issues.some((i) => i.checklistId === 'organizations.memberships')).toBe(false);
  });

  it('rejects an unreviewed coverage declaration even when internally consistent', () => {
    const dossier = cloneDossier(buildCompleteSyntheticDossier());
    getSection(dossier, 'organizations.memberships').coverage.review.reviewed = false;
    const report = validateDossierReadiness(dossier);
    expect(report.issues.some((i) => i.checklistId === 'organizations.memberships' && i.code === 'unreviewed')).toBe(true);
  });

  it('rejects an individual repeatable entry that is itself only a candidate', () => {
    const dossier = cloneDossier(buildCompleteSyntheticDossier());
    const entry = getSection(dossier, 'education.institutions').entries[0];
    expect(entry).toBeDefined();
    if (entry) entry.answer.status = 'candidate';
    const report = validateDossierReadiness(dossier);
    expect(report.ready).toBe(false);
    expect(
      report.issues.some((i) => i.checklistId === `education.institutions[${entry?.entryId}]` && i.code === 'not_confirmed')
    ).toBe(true);
  });

  it('rejects an individual repeatable entry missing provenance', () => {
    const dossier = cloneDossier(buildCompleteSyntheticDossier());
    const entry = getSection(dossier, 'education.institutions').entries[0];
    if (entry) delete entry.answer.provenance;
    const report = validateDossierReadiness(dossier);
    expect(
      report.issues.some((i) => i.checklistId === `education.institutions[${entry?.entryId}]` && i.code === 'provenance_missing')
    ).toBe(true);
  });

  it('rejects a required sub-field missing inside a repeatable entry', () => {
    const dossier = cloneDossier(buildCompleteSyntheticDossier());
    const entry = getSection(dossier, 'education.institutions').entries[0];
    if (entry) (entry.answer.value as Record<string, unknown>).institutionName = '';
    const report = validateDossierReadiness(dossier);
    expect(
      report.issues.some((i) => i.checklistId === `education.institutions[${entry?.entryId}]` && i.code === 'invalid_format')
    ).toBe(true);
  });

  it('does not require entries when a conditional repeatable section resolves not_applicable', () => {
    const dossier = buildCompleteSyntheticDossier();
    // previous_us_travel.visits is conditional on been_to_us_before; the
    // fixture sets that true, so exercise the false branch separately.
    const mutated = cloneDossier(dossier);
    (mutated.answers['previous_us_travel.been_to_us_before'] as DossierAnswer).value = false;
    // Clear the now-inapplicable repeatable so it must be re-declared not_applicable.
    mutated.repeatables['previous_us_travel.visits'] = {
      coverage: { status: 'not_applicable', review: { reviewed: true } },
      entries: [],
    };
    const report = validateDossierReadiness(mutated);
    expect(report.issues.some((i) => i.checklistId === 'previous_us_travel.visits')).toBe(false);
  });

  it('rejects a repeatable section with leftover entries despite resolving not_applicable', () => {
    const dossier = buildCompleteSyntheticDossier();
    const mutated = cloneDossier(dossier);
    (mutated.answers['previous_us_travel.been_to_us_before'] as DossierAnswer).value = false;
    // Leave the (now inapplicable) visits section as previously populated.
    const report = validateDossierReadiness(mutated);
    expect(report.ready).toBe(false);
    expect(report.issues.some((i) => i.checklistId === 'previous_us_travel.visits' && i.code === 'contradictory')).toBe(true);
  });
});

// ============================================================================
// Explicit chronology and cross-field consistency
// ============================================================================

describe('chronology and current-employment consistency', () => {
  it('rejects a date of birth that is not before the dossier asOf date', () => {
    const dossier = cloneDossier(buildCompleteSyntheticDossier());
    (dossier.answers['identity.date_of_birth'] as DossierAnswer).value = DOSSIER_AS_OF;
    const report = validateDossierReadiness(dossier);
    expect(report.issues.some((i) => i.checklistId === 'identity.date_of_birth' && i.code === 'contradictory')).toBe(true);
  });

  it('rejects a passport expiration date on or before its issuance date', () => {
    const dossier = cloneDossier(buildCompleteSyntheticDossier());
    (dossier.answers['passport.expiration_date'] as DossierAnswer).value = (
      dossier.answers['passport.issuance_date'] as DossierAnswer
    ).value;
    const report = validateDossierReadiness(dossier);
    expect(report.issues.some((i) => i.checklistId === 'passport.expiration_date' && i.code === 'contradictory')).toBe(true);
  });

  it('rejects a passport that is already expired as of the dossier asOf date', () => {
    const dossier = cloneDossier(buildCompleteSyntheticDossier());
    (dossier.answers['passport.issuance_date'] as DossierAnswer).value = '2010-01-01';
    (dossier.answers['passport.expiration_date'] as DossierAnswer).value = '2020-01-01';
    const report = validateDossierReadiness(dossier);
    expect(report.issues.some((i) => i.checklistId === 'passport.expiration_date' && i.code === 'contradictory')).toBe(true);
  });

  it('accepts a passport valid as of the dossier asOf date', () => {
    const dossier = buildCompleteSyntheticDossier();
    const report = validateDossierReadiness(dossier);
    expect(report.issues.some((i) => i.checklistId === 'passport.expiration_date')).toBe(false);
  });

  it('rejects a present employer start date after the dossier asOf date, when currently employed', () => {
    const dossier = cloneDossier(buildCompleteSyntheticDossier());
    (dossier.answers['present_employment.employer_details'] as DossierAnswer).value = {
      employerName: 'x',
      addressLine1: 'x',
      city: 'x',
      country: 'x',
      jobTitle: 'x',
      startDate: '2099-01-01',
      dutiesDescription: 'x',
    };
    const report = validateDossierReadiness(dossier);
    expect(
      report.issues.some((i) => i.checklistId === 'present_employment.employer_details' && i.code === 'contradictory')
    ).toBe(true);
  });

  it('does not apply the employment start-date check when the applicant is not currently employed', () => {
    const dossier = cloneDossier(buildCompleteSyntheticDossier());
    (dossier.answers['present_employment.primary_occupation_category'] as DossierAnswer).value = 'unemployed';
    (dossier.answers['present_employment.employer_details'] as DossierAnswer).status = 'not_applicable';
    delete (dossier.answers['present_employment.employer_details'] as DossierAnswer).value;
    delete (dossier.answers['present_employment.employer_details'] as DossierAnswer).provenance;
    const report = validateDossierReadiness(dossier);
    expect(
      report.issues.some((i) => i.checklistId === 'present_employment.employer_details')
    ).toBe(false);
  });
});

// ============================================================================
// The empty skeleton - the real-world starting point for a human filling in
// their own local dossier - always fails closed and never crashes.
// ============================================================================

describe('buildEmptyDossierSkeleton', () => {
  it('has an entry for every checklist item, all unknown/unreviewed', () => {
    const skeleton = buildEmptyDossierSkeleton('2026-06-01', 'local-only-ref');
    for (const item of DS160_READINESS_CHECKLIST) {
      if (item.repeatable) {
        const section = skeleton.repeatables[item.id];
        expect(section, `missing repeatable skeleton entry for ${item.id}`).toBeDefined();
        expect(section?.coverage.status).toBe('unknown');
        expect(section?.entries).toHaveLength(0);
      } else {
        const answer = skeleton.answers[item.id];
        expect(answer, `missing skeleton answer for ${item.id}`).toBeDefined();
        expect(answer?.status).toBe('unknown');
        expect(answer?.review.reviewed).toBe(false);
      }
    }
  });

  it('is never ready and never throws', () => {
    const skeleton = buildEmptyDossierSkeleton('2026-06-01');
    const report = validateDossierReadiness(skeleton);
    expect(report.ready).toBe(false);
    expect(report.issues.length).toBeGreaterThan(0);
  });
});
