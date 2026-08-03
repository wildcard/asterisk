/**
 * Deterministic, fail-closed DS-160 dossier readiness validator.
 *
 * `validateDossierReadiness(dossier)` is a pure function of its input: it
 * never reads wall-clock time (`Date.now()`/bare `new Date()`), so the same
 * dossier always produces the same report regardless of when it's run. All
 * chronology checks are relative to `dossier.asOf` (see `types.ts`).
 *
 * Fail-closed rules enforced here (see the acceptance criteria this module
 * implements, tracked in beads issue `asterisk-3z3`):
 *  - Missing, `candidate`, or `unknown` answers block readiness.
 *  - Unreviewed answers block readiness, even if otherwise confirmed. A
 *    `reviewed: true` review state also requires a valid `reviewedAt` that
 *    is not after `dossier.asOf` - a review claim with no (or a malformed,
 *    or future-dated) timestamp is treated the same as not being reviewed.
 *  - `confirmed`/`candidate` answers without provenance block readiness.
 *  - Contradictory answers (a confirmed value where a conditional gate
 *    resolved "not applicable", or vice versa; an empty repeatable section
 *    declared non-empty, or vice versa) block readiness.
 *  - Invalidly formatted values (bad enum, malformed date, wrong type,
 *    missing required sub-field) block readiness.
 *  - Conditionally unresolved items (the gate they depend on isn't itself
 *    confirmed yet) block readiness rather than guessing either way.
 *  - A repeatable section's coverage declaration must be confirmed,
 *    reviewed, and internally consistent (`isEmpty`/`exhaustive`/`count`
 *    against the actual `entries`) - see `types.ts`'s `RepeatableCoverage`.
 *
 * Because *every* checklist item (including every repeatable section's
 * coverage declaration) must resolve cleanly, a dossier built from only a
 * sparse subset of fields - e.g. just the ~15 fields the fill-mapped vault
 * covers (`../fieldMap.ts`) - always leaves the remaining items `missing`
 * and can never produce `ready: true`.
 */

import type { ChecklistFamily, ChecklistItemDef, ConditionalRule, FieldSpec } from './checklist';
import { DS160_READINESS_CHECKLIST, getChecklistItem } from './checklist';
import type { AnswerProvenance, Dossier, DossierAnswer, RepeatableCoverage, RepeatableSection, ReviewState } from './types';

// ============================================================================
// ISO date validation - deterministic, no reliance on JS Date leniency
// ============================================================================

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12) return false;
  const daysInMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const max = daysInMonth[month - 1] ?? 31;
  return day >= 1 && day <= max;
}

/** True when `value` is a well-formed, calendar-valid ISO 8601 date or date-time string. */
export function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = ISO_DATE_RE.exec(value);
  if (!match) return false;
  return isValidCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

/** Compares two ISO date/date-time strings by calendar date (day granularity). Assumes both are valid. */
function compareIsoDates(a: string, b: string): number {
  const dayA = a.slice(0, 10);
  const dayB = b.slice(0, 10);
  return dayA < dayB ? -1 : dayA > dayB ? 1 : 0;
}

// ============================================================================
// Report shape - the machine-readable output and exact HITL review queue
// ============================================================================

export type ReadinessIssueCode =
  | 'missing'
  | 'not_confirmed'
  | 'unreviewed'
  | 'provenance_missing'
  | 'invalid_format'
  | 'contradictory'
  | 'conditional_unresolved'
  | 'coverage_incomplete'
  | 'coverage_mismatch';

/** One blocking finding, addressable to a specific checklist item (and repeatable entry, if applicable). */
export interface ReadinessIssue {
  /** Checklist item id, e.g. `passport.expiration_date`. Repeatable entries append `[entryId]`. */
  checklistId: string;
  family: ChecklistFamily;
  code: ReadinessIssueCode;
  message: string;
}

export interface FamilySummary {
  total: number;
  confirmed: number;
  blocking: number;
}

export interface ReadinessReport {
  ready: boolean;
  dossierAsOf: string;
  totalChecklistItems: number;
  confirmedCount: number;
  /** Every blocking finding, sorted deterministically by family then checklist id. This *is* the HITL review queue. */
  issues: ReadinessIssue[];
  familySummary: Record<ChecklistFamily, FamilySummary>;
}

// ============================================================================
// Conditional applicability resolution - fail-closed
// ============================================================================

export type Applicability = 'applicable' | 'not_applicable' | 'unresolved';

function evaluateCondition(rule: ConditionalRule, gateValue: unknown): boolean {
  if (rule.equals !== undefined) return gateValue === rule.equals;
  if (rule.in !== undefined) return rule.in.some((candidate) => candidate === gateValue);
  if (rule.notEquals !== undefined) return gateValue !== rule.notEquals;
  return false;
}

/**
 * Resolves whether a checklist item applies to this dossier. Items with no
 * `conditional` are always `applicable`. A conditional item resolves
 * `unresolved` - never a guess - whenever the gate it depends on is not
 * itself confirmed (or is itself unresolved/not-applicable), so an
 * unanswered gate can never silently let its dependents through.
 */
export function resolveApplicability(
  dossier: Dossier,
  item: ChecklistItemDef,
  memo: Map<string, Applicability> = new Map(),
  visiting: Set<string> = new Set()
): Applicability {
  if (!item.conditional) return 'applicable';

  const cached = memo.get(item.id);
  if (cached) return cached;

  if (visiting.has(item.id)) {
    // A cycle indicates a catalog bug, not a dossier data problem; fail closed.
    return 'unresolved';
  }
  visiting.add(item.id);

  const gateItem = getChecklistItem(item.conditional.dependsOn);
  const gateApplicability = gateItem ? resolveApplicability(dossier, gateItem, memo, visiting) : 'applicable';

  let result: Applicability;
  if (gateApplicability === 'unresolved') {
    result = 'unresolved';
  } else if (gateApplicability === 'not_applicable') {
    // The gate itself doesn't apply, so nothing gated by it applies either.
    result = 'not_applicable';
  } else {
    const gateAnswer = dossier.answers[item.conditional.dependsOn];
    if (!gateAnswer || gateAnswer.status !== 'confirmed') {
      result = 'unresolved';
    } else {
      result = evaluateCondition(item.conditional, gateAnswer.value) ? 'applicable' : 'not_applicable';
    }
  }

  visiting.delete(item.id);
  memo.set(item.id, result);
  return result;
}

// ============================================================================
// Shared answer/value checks - used for scalars, repeatable coverage, and
// repeatable entries alike, so every code path enforces the same rules.
// ============================================================================

function checkValue(
  value: unknown,
  valueKind: FieldSpec['valueKind'],
  enumValues: string[] | undefined,
  fields: FieldSpec[] | undefined,
  label: string,
  errors: string[]
): void {
  switch (valueKind) {
    case 'string':
      if (typeof value !== 'string' || value.trim().length === 0) {
        errors.push(`${label}: expected a non-empty string`);
      }
      break;
    case 'boolean':
      if (typeof value !== 'boolean') {
        errors.push(`${label}: expected a boolean`);
      }
      break;
    case 'date':
      if (!isValidIsoDate(value)) {
        errors.push(`${label}: expected a valid ISO 8601 date`);
      }
      break;
    case 'enum':
      if (typeof value !== 'string' || !(enumValues ?? []).includes(value)) {
        errors.push(`${label}: expected one of [${(enumValues ?? []).join(', ')}]`);
      }
      break;
    case 'object': {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        errors.push(`${label}: expected an object`);
        break;
      }
      const record = value as Record<string, unknown>;
      for (const field of fields ?? []) {
        const fieldValue = record[field.key];
        if (fieldValue === undefined || fieldValue === null || fieldValue === '') {
          if (!field.optional) {
            errors.push(`${label}.${field.key}: required sub-field is missing`);
          }
          continue;
        }
        checkValue(fieldValue, field.valueKind, field.enumValues, undefined, `${label}.${field.key}`, errors);
      }
      break;
    }
  }
}

function checkProvenance(provenance: AnswerProvenance | undefined, dossierAsOf: string, label: string, errors: string[]): void {
  if (!provenance) {
    errors.push(`${label}: provenance is required for a confirmed/candidate answer`);
    return;
  }
  if (typeof provenance.source !== 'string' || provenance.source.trim().length === 0) {
    errors.push(`${label}: provenance.source must be a non-empty string`);
  }
  if (!isValidIsoDate(provenance.asOf)) {
    errors.push(`${label}: provenance.asOf must be a valid ISO 8601 date`);
  } else if (isValidIsoDate(dossierAsOf) && compareIsoDates(provenance.asOf, dossierAsOf) > 0) {
    errors.push(`${label}: provenance.asOf (${provenance.asOf}) is after the dossier's asOf (${dossierAsOf})`);
  }
}

function checkReview(review: ReviewState | undefined, dossierAsOf: string, label: string, errors: string[]): void {
  if (!review || review.reviewed !== true) {
    errors.push(`${label}: has not been reviewed`);
    return;
  }
  if (!isValidIsoDate(review.reviewedAt)) {
    errors.push(`${label}: review.reviewedAt is required and must be a valid ISO 8601 date/time when reviewed is true`);
    return;
  }
  if (isValidIsoDate(dossierAsOf) && compareIsoDates(review.reviewedAt, dossierAsOf) > 0) {
    errors.push(`${label}: review.reviewedAt (${review.reviewedAt}) is after the dossier's asOf (${dossierAsOf})`);
  }
}

/** `unreviewed` when the review is genuinely missing; `invalid_format` when it's present but malformed (e.g. a bad `reviewedAt`). */
function reviewIssueCode(answer: DossierAnswer): ReadinessIssueCode {
  return answer.review?.reviewed ? 'invalid_format' : 'unreviewed';
}

/**
 * Validates one `DossierAnswer` against the item's declared shape, given
 * whether it's actually applicable. Returns a list of human-readable
 * problems (empty when the answer fully passes); the caller maps each
 * problem to a `ReadinessIssue` with the appropriate code.
 *
 * This single function is reused for non-repeatable scalar answers,
 * repeatable-section coverage declarations, and every repeatable entry -
 * the same fail-closed rules apply uniformly everywhere a value is
 * asserted in the dossier.
 */
function checkAnswer(
  answer: DossierAnswer | undefined,
  applicability: Applicability,
  itemLike: { optional?: boolean; valueKind: FieldSpec['valueKind']; enumValues?: string[]; fields?: FieldSpec[] },
  dossierAsOf: string,
  label: string
): { code: ReadinessIssueCode; message: string } | undefined {
  if (applicability === 'unresolved') {
    return { code: 'conditional_unresolved', message: `${label}: applicability could not be resolved (its gate is not confirmed)` };
  }

  if (!answer) {
    return { code: 'missing', message: `${label}: no answer present in the dossier` };
  }

  if (applicability === 'not_applicable') {
    if (answer.status !== 'not_applicable') {
      return {
        code: 'contradictory',
        message: `${label}: resolved not applicable (its gate says so) but the dossier answer status is "${answer.status}"`,
      };
    }
    const errors: string[] = [];
    checkReview(answer.review, dossierAsOf, label, errors);
    if (errors.length > 0) return { code: reviewIssueCode(answer), message: errors[0] as string };
    return undefined;
  }

  // applicability === 'applicable'
  if (answer.status === 'not_applicable') {
    if (itemLike.optional) {
      const errors: string[] = [];
      checkReview(answer.review, dossierAsOf, label, errors);
      if (errors.length > 0) return { code: reviewIssueCode(answer), message: errors[0] as string };
      return undefined;
    }
    return { code: 'contradictory', message: `${label}: marked not_applicable but this item is required` };
  }

  if (answer.status === 'candidate' || answer.status === 'unknown') {
    return { code: 'not_confirmed', message: `${label}: status is "${answer.status}", not confirmed` };
  }

  if (answer.status !== 'confirmed') {
    return { code: 'invalid_format', message: `${label}: unrecognized answer status "${String(answer.status)}"` };
  }

  // status === 'confirmed'
  const formatErrors: string[] = [];
  checkValue(answer.value, itemLike.valueKind, itemLike.enumValues, itemLike.fields, label, formatErrors);
  if (formatErrors.length > 0) {
    return { code: 'invalid_format', message: formatErrors[0] as string };
  }

  const provenanceErrors: string[] = [];
  checkProvenance(answer.provenance, dossierAsOf, label, provenanceErrors);
  if (provenanceErrors.length > 0) {
    const code: ReadinessIssueCode = answer.provenance ? 'invalid_format' : 'provenance_missing';
    return { code, message: provenanceErrors[0] as string };
  }

  const reviewErrors: string[] = [];
  checkReview(answer.review, dossierAsOf, label, reviewErrors);
  if (reviewErrors.length > 0) {
    return { code: reviewIssueCode(answer), message: reviewErrors[0] as string };
  }

  return undefined;
}

function checkRepeatableCoverage(
  section: RepeatableSection | undefined,
  applicability: Applicability,
  dossierAsOf: string,
  label: string
): { code: ReadinessIssueCode; message: string } | undefined {
  if (applicability === 'unresolved') {
    return { code: 'conditional_unresolved', message: `${label}: applicability could not be resolved (its gate is not confirmed)` };
  }
  if (!section) {
    return { code: 'missing', message: `${label}: no repeatable section present in the dossier` };
  }

  const coverageResult = checkAnswer(
    section.coverage,
    applicability,
    { valueKind: 'object', fields: COVERAGE_FIELDS },
    dossierAsOf,
    `${label}.coverage`
  );
  if (coverageResult) return coverageResult;

  if (applicability === 'not_applicable') {
    if (section.entries.length > 0) {
      return { code: 'contradictory', message: `${label}: has ${section.entries.length} entries despite being not applicable` };
    }
    return undefined;
  }

  // applicable and coverage passed its own checks
  const coverage = section.coverage.value as RepeatableCoverage;
  if (coverage.isEmpty) {
    if (section.entries.length > 0) {
      return { code: 'contradictory', message: `${label}: coverage declares isEmpty but ${section.entries.length} entries are present` };
    }
    return undefined;
  }

  if (section.entries.length === 0) {
    return { code: 'contradictory', message: `${label}: coverage declares non-empty but no entries are present` };
  }
  if (!coverage.exhaustive) {
    return { code: 'coverage_incomplete', message: `${label}: coverage is not declared exhaustive - the list may be partial` };
  }
  if (coverage.count !== section.entries.length) {
    return {
      code: 'coverage_mismatch',
      message: `${label}: declared count (${coverage.count}) does not match the number of entries (${section.entries.length})`,
    };
  }
  return undefined;
}

// `count` is deliberately excluded here (there is no numeric `ValueKind`) -
// `checkCoverageValueShape` below validates it as a non-negative integer.
const COVERAGE_FIELDS: FieldSpec[] = [
  { key: 'isEmpty', valueKind: 'boolean' },
  { key: 'exhaustive', valueKind: 'boolean' },
];

// ============================================================================
// Cross-field chronology / consistency checks
// ============================================================================

function pushIfDefined(
  issues: ReadinessIssue[],
  family: ChecklistFamily,
  checklistId: string,
  result: { code: ReadinessIssueCode; message: string } | undefined
): void {
  if (result) {
    issues.push({ checklistId, family, code: result.code, message: result.message });
  }
}

function crossFieldChecks(dossier: Dossier, issues: ReadinessIssue[]): void {
  const dob = dossier.answers['identity.date_of_birth'];
  if (dob?.status === 'confirmed' && typeof dob.value === 'string' && isValidIsoDate(dob.value) && isValidIsoDate(dossier.asOf)) {
    if (compareIsoDates(dob.value, dossier.asOf) >= 0) {
      issues.push({
        checklistId: 'identity.date_of_birth',
        family: 'identity',
        code: 'contradictory',
        message: `identity.date_of_birth (${dob.value}) is not before the dossier's asOf date (${dossier.asOf})`,
      });
    }
  }

  const issuance = dossier.answers['passport.issuance_date'];
  const expiration = dossier.answers['passport.expiration_date'];
  if (
    issuance?.status === 'confirmed' &&
    expiration?.status === 'confirmed' &&
    typeof issuance.value === 'string' &&
    typeof expiration.value === 'string' &&
    isValidIsoDate(issuance.value) &&
    isValidIsoDate(expiration.value)
  ) {
    if (compareIsoDates(expiration.value, issuance.value) <= 0) {
      issues.push({
        checklistId: 'passport.expiration_date',
        family: 'passport',
        code: 'contradictory',
        message: `passport.expiration_date (${expiration.value}) is not after passport.issuance_date (${issuance.value})`,
      });
    }
  }
  if (expiration?.status === 'confirmed' && typeof expiration.value === 'string' && isValidIsoDate(expiration.value) && isValidIsoDate(dossier.asOf)) {
    if (compareIsoDates(expiration.value, dossier.asOf) <= 0) {
      issues.push({
        checklistId: 'passport.expiration_date',
        family: 'passport',
        code: 'contradictory',
        message: `passport.expiration_date (${expiration.value}) is on or before the dossier's asOf date (${dossier.asOf}) - the passport is not valid as of the dossier`,
      });
    }
  }

  const occupation = dossier.answers['present_employment.primary_occupation_category'];
  const employer = dossier.answers['present_employment.employer_details'];
  if (
    occupation?.status === 'confirmed' &&
    ['employed', 'self_employed'].includes(occupation.value as string) &&
    employer?.status === 'confirmed' &&
    typeof employer.value === 'object' &&
    employer.value !== null
  ) {
    const startDate = (employer.value as Record<string, unknown>).startDate;
    if (typeof startDate === 'string' && isValidIsoDate(startDate) && isValidIsoDate(dossier.asOf)) {
      if (compareIsoDates(startDate, dossier.asOf) > 0) {
        issues.push({
          checklistId: 'present_employment.employer_details',
          family: 'present_employment',
          code: 'contradictory',
          message: `present_employment.employer_details.startDate (${startDate}) is after the dossier's asOf date (${dossier.asOf})`,
        });
      }
    }
  }
}

// ============================================================================
// Coverage's numeric `count` field needs a light custom check since the
// generic `checkValue` only knows string/boolean/date/enum/object kinds.
// ============================================================================

function checkCoverageValueShape(section: RepeatableSection, label: string): { code: ReadinessIssueCode; message: string } | undefined {
  if (section.coverage.status !== 'confirmed') return undefined;
  const value = section.coverage.value as RepeatableCoverage | undefined;
  if (!value || typeof value !== 'object') {
    return { code: 'invalid_format', message: `${label}.coverage: expected a RepeatableCoverage object` };
  }
  if (typeof value.isEmpty !== 'boolean') {
    return { code: 'invalid_format', message: `${label}.coverage.isEmpty: expected a boolean` };
  }
  if (typeof value.exhaustive !== 'boolean') {
    return { code: 'invalid_format', message: `${label}.coverage.exhaustive: expected a boolean` };
  }
  if (typeof value.count !== 'number' || !Number.isInteger(value.count) || value.count < 0) {
    return { code: 'invalid_format', message: `${label}.coverage.count: expected a non-negative integer` };
  }
  return undefined;
}

// ============================================================================
// Top-level entry point
// ============================================================================

/**
 * Validates a dossier against the complete DS-160 readiness checklist and
 * returns a machine-readable report whose `issues` array *is* the exact
 * HITL review queue - every entry names the checklist item that still
 * needs a human's attention before the application can be considered ready
 * to prepare for the live DS-160 form (never submitted by this project;
 * see `../../../../docs/ds160-dossier-readiness.md`).
 */
export function validateDossierReadiness(dossier: Dossier): ReadinessReport {
  const issues: ReadinessIssue[] = [];
  const familySummary: Record<string, FamilySummary> = {};

  const bump = (family: ChecklistFamily, confirmed: boolean, blocking: boolean): void => {
    const summary = familySummary[family] ?? { total: 0, confirmed: 0, blocking: 0 };
    summary.total += 1;
    if (confirmed) summary.confirmed += 1;
    if (blocking) summary.blocking += 1;
    familySummary[family] = summary;
  };

  if (!isValidIsoDate(dossier.asOf)) {
    issues.push({
      checklistId: '__dossier__.asOf',
      family: 'identity',
      code: 'invalid_format',
      message: `Dossier asOf ("${dossier.asOf}") is not a valid ISO 8601 date`,
    });
  }

  let confirmedCount = 0;

  for (const item of DS160_READINESS_CHECKLIST) {
    const applicability = resolveApplicability(dossier, item);

    if (item.repeatable) {
      const section = dossier.repeatables[item.id];
      let result = checkRepeatableCoverage(section, applicability, dossier.asOf, item.id);
      if (!result && section) {
        result = checkCoverageValueShape(section, item.id);
      }
      if (!result && section && applicability === 'applicable') {
        for (const entry of section.entries) {
          const entryLabel = `${item.id}[${entry.entryId}]`;
          const entryResult = checkAnswer(entry.answer, 'applicable', item, dossier.asOf, entryLabel);
          if (entryResult) {
            issues.push({ checklistId: entryLabel, family: item.family, code: entryResult.code, message: entryResult.message });
          } else {
            confirmedCount += 1;
          }
        }
      }
      pushIfDefined(issues, item.family, item.id, result);
      const isConfirmed = !result && applicability !== 'not_applicable';
      bump(item.family, isConfirmed, Boolean(result));
      if (isConfirmed) confirmedCount += 1;
      continue;
    }

    const answer = dossier.answers[item.id];
    const result = checkAnswer(answer, applicability, item, dossier.asOf, item.id);
    pushIfDefined(issues, item.family, item.id, result);
    const isConfirmed = !result && applicability === 'applicable' && answer?.status === 'confirmed';
    bump(item.family, isConfirmed, Boolean(result));
    if (isConfirmed) confirmedCount += 1;
  }

  crossFieldChecks(dossier, issues);

  issues.sort((a, b) => (a.family === b.family ? a.checklistId.localeCompare(b.checklistId) : a.family.localeCompare(b.family)));

  const summaryRecord = familySummary as Record<ChecklistFamily, FamilySummary>;

  return {
    ready: issues.length === 0,
    dossierAsOf: dossier.asOf,
    totalChecklistItems: DS160_READINESS_CHECKLIST.length,
    confirmedCount,
    issues,
    familySummary: summaryRecord,
  };
}
