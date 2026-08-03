/**
 * PII-free synthetic dossier fixtures for tests.
 *
 * Unlike `../fixtures.ts` (which loads static JSON files for the vault/form
 * snapshot fixtures), the "complete" dossier fixture here is *generated*
 * from `DS160_READINESS_CHECKLIST` itself (`checklist.ts`). A hand-authored
 * JSON file covering 100+ checklist items would silently drift out of sync
 * every time the catalog grows; generating it from the same catalog the
 * validator walks means it can never desync; if a new checklist item is
 * added without fixture support, `buildCompleteSyntheticDossier` fails
 * loudly (via the validator's own `missing` check in tests) rather than
 * quietly producing a stale "complete" example.
 *
 * All values below are fictional ("Jordan Applicant", "Meridian Testing
 * Co.") - see the repository's no-PII fixture policy in
 * `../fixtures/README.md`.
 */

import { resolveApplicability } from './validator';
import { DS160_READINESS_CHECKLIST } from './checklist';
import type { ChecklistItemDef, FieldSpec, ValueKind } from './checklist';
import type { AnswerProvenance, Dossier, ReviewState } from './types';

/** The dossier's declared "as of" date - all chronology in the fixture is relative to this. */
export const DOSSIER_AS_OF = '2026-06-01';
/** Default evidence date for synthesized provenance - before `DOSSIER_AS_OF`. */
const EVIDENCE_AS_OF = '2026-05-01';
/** Default value for generically-synthesized `date` fields - well before `DOSSIER_AS_OF`. */
const DEFAULT_PAST_DATE = '2019-06-01';

function provenance(asOf: string = EVIDENCE_AS_OF): AnswerProvenance {
  return { source: 'synthetic fixture', asOf, note: 'PII-free synthetic example, no real applicant data' };
}

function reviewed(): ReviewState {
  return { reviewed: true, reviewedAt: DOSSIER_AS_OF, reviewedBy: 'fixture' };
}

function synthesizeByKind(valueKind: ValueKind, enumValues: string[] | undefined, fields: FieldSpec[] | undefined, label: string): unknown {
  switch (valueKind) {
    case 'string':
      return `Example value for ${label}`;
    case 'boolean':
      return false;
    case 'date':
      return DEFAULT_PAST_DATE;
    case 'enum':
      return enumValues?.[0] ?? 'other';
    case 'object': {
      const obj: Record<string, unknown> = {};
      for (const field of fields ?? []) {
        obj[field.key] = synthesizeByKind(field.valueKind, field.enumValues, undefined, `${label}.${field.key}`);
      }
      return obj;
    }
  }
}

function synthesizeEntry(fields: FieldSpec[] | undefined, overrides: Record<string, unknown>, label: string): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const field of fields ?? []) {
    obj[field.key] =
      overrides[field.key] !== undefined
        ? overrides[field.key]
        : synthesizeByKind(field.valueKind, field.enumValues, undefined, `${label}.${field.key}`);
  }
  return obj;
}

/**
 * Explicit scalar/enum/date overrides for the "complete" fixture's
 * narrative (a boring, clean applicant with a few populated histories).
 * Anything not listed here gets a generic synthesized value - `false` for
 * unlisted boolean gates (so every unmentioned conditional branch defaults
 * to its simplest/"no history" resolution), the first enum value for
 * unlisted enums, and a placeholder string/date otherwise.
 */
const VALUE_OVERRIDES: Record<string, unknown> = {
  'identity.date_of_birth': '1990-04-12',
  'identity.marital_status': 'married',
  'identity.has_used_other_names': true,
  'identity.has_national_id': true,
  'identity.has_clan_or_tribe': true,
  'passport.has_book_number': true,
  'passport.issuance_date': '2021-03-01',
  'passport.expiration_date': '2031-03-01',
  'travel.has_specific_plans': true,
  'travel.payer': 'other_person',
  'previous_us_travel.been_to_us_before': true,
  'previous_us_travel.previously_issued_visa': true,
  'previous_employment.was_previously_employed': true,
  'present_employment.primary_occupation_category': 'employed',
  'contact.social_media.facebook.has_account': true,
  'application_admin.completed_by_self': true,
  'travel.traveling_with_group': true,
};

/** Optional (non-conditional) items explicitly declared not applicable in the fixture. */
const NOT_APPLICABLE_OPTIONAL = new Set<string>(['identity.full_name_native_alphabet', 'us_contact.email']);

/** Repeatable sections given explicit, non-empty entries. Anything not listed defaults to `confirmed_empty`. */
const REPEATABLE_ENTRY_OVERRIDES: Record<string, Array<Record<string, unknown>>> = {
  'identity.other_names_used': [{ fullName: 'Jordan A. Applicant' }],
  'contact.other_emails': [{ email: 'jordan.applicant.alt@example.test' }],
  'contact.social_media_other': [{ platform: 'mastodon', handle: '@jordan@example.social' }],
  'travel.companions': [{ fullName: 'Casey Companion', relationship: 'friend' }],
  'previous_us_travel.visits': [
    { arrivalDateApprox: '2018-07-01', lengthOfStay: '2 weeks', purpose: 'tourism' },
  ],
  'previous_employment.entries': [
    {
      employerName: 'Prior Example Co.',
      addressLine1: '1 Prior Street',
      city: 'Example City',
      country: 'Exampleland',
      jobTitle: 'Analyst',
      startDate: '2015-01-05',
      endDate: '2018-12-20',
    },
  ],
  'education.institutions': [
    {
      institutionName: 'Example State University',
      addressLine1: '100 Campus Way',
      city: 'Example City',
      country: 'Exampleland',
      courseOfStudy: 'Applied Mathematics',
      startDate: '2008-09-01',
      endDate: '2012-06-15',
    },
  ],
  'languages.spoken': [{ language: 'English' }],
  'country_travel.countries_visited': [{ country: 'Canada', purpose: 'tourism' }],
};

/**
 * Builds a fully-populated, internally-consistent synthetic dossier that
 * `validateDossierReadiness` accepts with `ready: true`. Every checklist
 * item is walked in catalog order, applicability is resolved with the same
 * `resolveApplicability` the validator uses (so this can never drift from
 * validator behavior), and each applicable item is filled with either an
 * explicit override (above) or a generic synthesized placeholder.
 */
export function buildCompleteSyntheticDossier(): Dossier {
  const dossier: Dossier = {
    schemaVersion: 1,
    asOf: DOSSIER_AS_OF,
    applicantRef: 'fixture-complete-applicant',
    answers: {},
    repeatables: {},
  };

  for (const item of DS160_READINESS_CHECKLIST) {
    const applicability = resolveApplicability(dossier, item);

    if (item.repeatable) {
      if (applicability === 'not_applicable') {
        dossier.repeatables[item.id] = { coverage: { status: 'not_applicable', review: reviewed() }, entries: [] };
        continue;
      }
      const overrideEntries = REPEATABLE_ENTRY_OVERRIDES[item.id];
      if (overrideEntries) {
        const entries = overrideEntries.map((raw, index) => ({
          entryId: `entry-${index + 1}`,
          answer: {
            status: 'confirmed' as const,
            value: synthesizeEntry(item.fields, raw, `${item.id}[${index}]`),
            provenance: provenance(),
            review: reviewed(),
          },
        }));
        dossier.repeatables[item.id] = {
          coverage: {
            status: 'confirmed',
            value: { isEmpty: false, exhaustive: true, count: entries.length },
            provenance: provenance(),
            review: reviewed(),
          },
          entries,
        };
      } else {
        dossier.repeatables[item.id] = {
          coverage: {
            status: 'confirmed',
            value: { isEmpty: true, exhaustive: true, count: 0 },
            provenance: provenance(),
            review: reviewed(),
          },
          entries: [],
        };
      }
      continue;
    }

    if (applicability === 'not_applicable') {
      dossier.answers[item.id] = { status: 'not_applicable', review: reviewed() };
      continue;
    }

    if (NOT_APPLICABLE_OPTIONAL.has(item.id)) {
      dossier.answers[item.id] = { status: 'not_applicable', review: reviewed() };
      continue;
    }

    const value = item.id in VALUE_OVERRIDES ? VALUE_OVERRIDES[item.id] : synthesizeByKind(item.valueKind, item.enumValues, item.fields, item.id);
    dossier.answers[item.id] = { status: 'confirmed', value, provenance: provenance(), review: reviewed() };
  }

  return dossier;
}

/** Convenience alias matching the naming pattern of `../fixtures.ts`'s loaders. */
export function loadCompleteDossierFixture(): Dossier {
  return buildCompleteSyntheticDossier();
}

/**
 * A dossier populated with *only* the handful of fields the existing
 * DS-160 exact vault mapping covers (`../fieldMap.ts`'s ~15 entries),
 * translated into their dossier-checklist equivalents. Everything else -
 * every other family, every repeatable coverage declaration, every
 * security/background question - is entirely absent. Used to prove
 * (acceptance criteria) that a sparse, fill-mapped-only subset can never
 * produce `ready: true`.
 */
export function buildSparseFillMappedOnlyDossier(): Dossier {
  const provenanceValue = provenance();
  const review = reviewed();
  return {
    schemaVersion: 1,
    asOf: DOSSIER_AS_OF,
    applicantRef: 'fixture-sparse-applicant',
    answers: {
      'identity.surname': { status: 'confirmed', value: 'Applicant', provenance: provenanceValue, review },
      'identity.given_names': { status: 'confirmed', value: 'Jordan', provenance: provenanceValue, review },
      'contact.primary_email': { status: 'confirmed', value: 'jordan.applicant@example.test', provenance: provenanceValue, review },
      'contact.primary_phone': { status: 'confirmed', value: '+1-555-0100', provenance: provenanceValue, review },
      'passport.number': { status: 'confirmed', value: 'X1234567', provenance: provenanceValue, review },
      'passport.expiration_date': { status: 'confirmed', value: '2031-03-01', provenance: provenanceValue, review },
      'travel.purpose': { status: 'confirmed', value: 'Business visit', provenance: provenanceValue, review },
      'us_contact.name': { status: 'confirmed', value: 'Casey Contact', provenance: provenanceValue, review },
      'us_contact.phone': { status: 'confirmed', value: '+1-555-0199', provenance: provenanceValue, review },
    },
    repeatables: {},
  };
}

/** Deep clone via JSON round-trip - safe because `Dossier` is, by design, a plain JSON-serializable shape. */
export function cloneDossier(dossier: Dossier): Dossier {
  return JSON.parse(JSON.stringify(dossier)) as Dossier;
}

export type { ChecklistItemDef };
