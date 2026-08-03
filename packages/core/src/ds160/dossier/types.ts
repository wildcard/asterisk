/**
 * Private-dossier-compatible JSON model for DS-160 readiness.
 *
 * A "dossier" here is a local, gitignored, per-applicant JSON document that
 * answers the full DS-160 checklist (see `checklist.ts`). It is a superset
 * of what a `VaultItem[]` can express: the vault holds a flat list of
 * reusable facts keyed by string, while a dossier needs to represent
 * structured multi-field answers (an address, a passport-loss event),
 * repeated rows (every previous employer, every country visited), and an
 * explicit "no such history exists" declaration that must be reviewed like
 * any other fact - never inferred from absence.
 *
 * Nothing in this module reads or writes an actual dossier file; it only
 * defines the shape and the deterministic validator (`validator.ts`) that
 * consumes it. See `../../../../docs/ds160-dossier-readiness.md` for the
 * local-only workflow this is designed to support.
 */

/**
 * Confidence/verification state of a single answer.
 *
 * - `confirmed`: the applicant (or an authoritative document) has verified
 *   this value as currently true. The only status a validator may accept
 *   for a readiness=true result.
 * - `candidate`: a plausible value exists (e.g. imported from a prior
 *   document or snapshot) but has not been explicitly reconfirmed as
 *   current - the dossier-model analog of `VaultItem.confirmationGate`
 *   (see `../../types.ts`). Always blocks readiness.
 * - `unknown`: no value is available yet. Always blocks readiness.
 * - `not_applicable`: the question does not apply to this applicant, either
 *   because the DS-160 form itself marks the field optional
 *   (`ChecklistItemDef.optional`) or because a conditional gate this item
 *   depends on resolved to "does not apply" (`ChecklistItemDef.conditional`
 *   in `checklist.ts`). Still requires `review.reviewed === true` - an
 *   unreviewed inapplicability is not distinguishable from a skipped
 *   question and must not silently pass.
 */
export type AnswerStatus = 'confirmed' | 'candidate' | 'unknown' | 'not_applicable';

/** Top-level grouping for every checklist item; mirrors the DS-160 section families. */
export type ChecklistFamily =
  | 'identity'
  | 'residency'
  | 'contact'
  | 'passport'
  | 'travel'
  | 'previous_us_travel'
  | 'us_contact'
  | 'family'
  | 'present_employment'
  | 'previous_employment'
  | 'education'
  | 'languages'
  | 'country_travel'
  | 'organizations'
  | 'specialized_skills'
  | 'military_service'
  | 'paramilitary'
  | 'security_background'
  | 'application_admin';

/**
 * Where a `confirmed`/`candidate` answer's value came from and when it was
 * true. Required for any answer that isn't `unknown`/`not_applicable` -
 * see the "provenance-free" rejection rule in `validator.ts`.
 */
export interface AnswerProvenance {
  /** Free-text description of the source, e.g. "user_entered", "passport scan dated 2026-01-10". */
  source: string;
  /** ISO 8601 date the evidence reflects/was true as of. Must not be after `Dossier.asOf`. */
  asOf: string;
  /** Optional free-text elaboration. */
  note?: string;
}

/**
 * Explicit human review state for a single answer. Distinct from
 * `AnswerStatus.confirmed`: a value can be confirmed-as-currently-true by
 * its source (e.g. a passport scan) while still awaiting a human's
 * sign-off that it was correctly transcribed into the dossier. Both axes
 * must pass for the validator to accept the answer.
 */
export interface ReviewState {
  reviewed: boolean;
  /** ISO 8601 date/time of review. Required (and validated) when `reviewed` is true. */
  reviewedAt?: string;
  /** Free-text reviewer identity, e.g. "applicant", "preparer". Never a real name. */
  reviewedBy?: string;
}

/**
 * One answer in the dossier: a scalar/object value plus its status,
 * provenance, and review state. `T` is the value's shape (string, boolean,
 * or a flat object of named sub-fields per `ChecklistItemDef.fields`).
 */
export interface DossierAnswer<T = unknown> {
  status: AnswerStatus;
  /** Present only when `status` is `confirmed` or `candidate`. */
  value?: T;
  /** Required whenever `status` is `confirmed` or `candidate`. */
  provenance?: AnswerProvenance;
  review: ReviewState;
  notes?: string;
}

/**
 * The explicit "have you accounted for the whole list" declaration that
 * makes an empty or partial repeatable section fail closed instead of
 * silently passing. See the "Repeatable sections" doc section in
 * `checklist.ts`.
 */
export interface RepeatableCoverage {
  /** True: the applicant affirmatively has zero items for this section. */
  isEmpty: boolean;
  /**
   * True: `entries` below represents the *complete* list, not a partial
   * sample. Must be true whenever `isEmpty` is false - a non-exhaustive
   * list is treated as incomplete and blocks readiness.
   */
  exhaustive: boolean;
  /** Declared entry count; validated to equal `entries.length` exactly. */
  count: number;
}

/** One row in a repeatable section, itself independently reviewable. */
export interface RepeatableEntry<T = Record<string, unknown>> {
  /** Stable within the dossier (e.g. a short local id); never derived from PII. */
  entryId: string;
  answer: DossierAnswer<T>;
}

/**
 * A repeatable, list-shaped checklist item (previous employers, countries
 * visited, family members in the U.S., ...). The `coverage` declaration is
 * itself a full `DossierAnswer` (status/provenance/review) so "I haven't
 * gotten to this section yet" and "I confirm there are none" are
 * distinguishable and both auditable.
 */
export interface RepeatableSection<T = Record<string, unknown>> {
  coverage: DossierAnswer<RepeatableCoverage>;
  entries: RepeatableEntry<T>[];
}

/**
 * The complete private dossier for one applicant. Never committed to this
 * repository - see `docs/ds160-dossier-readiness.md` for the gitignored
 * local workflow, following the same pattern as
 * `../fixtures/local/` for the vault-item intake.
 */
export interface Dossier {
  schemaVersion: 1;
  /**
   * ISO 8601 date this dossier claims to truthfully reflect the
   * applicant's situation as of. All chronology validation
   * (`validator.ts`) is relative to this date, never to wall-clock time -
   * the validator is a pure function of its input, so the same dossier
   * always produces the same report regardless of when it's run.
   */
  asOf: string;
  /** Opaque local reference (e.g. a vault key prefix) - never a name or other PII. */
  applicantRef?: string;
  /** Non-repeatable answers, keyed by `ChecklistItemDef.id`. */
  answers: Record<string, DossierAnswer>;
  /** Repeatable sections, keyed by `ChecklistItemDef.id`. */
  repeatables: Record<string, RepeatableSection>;
}
