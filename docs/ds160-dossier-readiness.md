# DS-160 dossier readiness

Tracked in beads issue `asterisk-3z3`. This document is PII-free by design -
it describes the mechanism, never any specific applicant's data. Beads
metadata is exported to tracked JSONL in this public repository, so it must
never contain run-specific facts; a real applicant's dossier lives only in
the gitignored local workflow described below
(`packages/core/src/ds160/dossier/local/README.md`).

## Scope

A private-dossier-compatible JSON model, a complete DS-160 answer checklist,
and a deterministic, fail-closed validator that turns a filled-in dossier
into a machine-readable readiness report plus an exact human-review queue.

**Explicitly out of scope for this module** (and for this project, full
stop): accessing, filling, saving, signing, or submitting the live DS-160
government form. Nothing in this codebase does that - readiness is a
prerequisite *signal*, checked entirely offline against a local file, for
the separate, human-only process of actually preparing the live form. See
`docs/ds160-acceptance.md` for the (also non-submitting) exact
field-mapping/fill-plan mechanism this complements.

## Why this exists

`docs/ds160-acceptance.md`'s exact field-mapping table
(`packages/core/src/ds160/fieldMap.ts`) covers ~15 fields that are
genuinely reusable, cacheable facts about an applicant - a passport number,
a home country. That was never meant to be a complete picture of "ready to
apply": a full DS-160 asks well over a hundred distinct questions across
family, employment and education history, every country visited, every
security and background question, and more, many of them conditional on
each other. Filling only the vault-mapped subset and calling it "ready"
would be a false positive with real consequences. This module is the
missing completeness check.

## What's implemented

| Piece | Location |
|---|---|
| JSON model (`Dossier`, `DossierAnswer`, `RepeatableSection`, ...) | `packages/core/src/ds160/dossier/types.ts` |
| Complete checklist catalog (~170 items across 19 families) | `packages/core/src/ds160/dossier/checklist.ts` |
| Deterministic, fail-closed validator | `packages/core/src/ds160/dossier/validator.ts` (`validateDossierReadiness`) |
| PII-free synthetic fixtures for tests | `packages/core/src/ds160/dossier/fixtures.ts` |
| Empty-skeleton generator (the real local starting point) | `packages/core/src/ds160/dossier/skeleton.ts` (`buildEmptyDossierSkeleton`) |
| Local-only, gitignored real-dossier workflow | `packages/core/src/ds160/dossier/local/README.md` |
| Unit tests | `packages/core/src/ds160/dossier/__tests__/dossier.test.ts` |

All of the above is re-exported from `packages/core/src/ds160/index.ts` and
`packages/core/src/index.ts`, alongside the existing exact field-mapping
exports - `import { validateDossierReadiness } from '@asterisk/core'` works
the same way `import { generateDs160FillPlan } from '@asterisk/core'`
already does.

## Checklist IDs are not CEAC selectors

Every checklist item id (`identity.date_of_birth`,
`security_background.criminal.arrested_or_convicted`, ...) is a stable
*semantic* identifier this project invented for its own checklist, report,
and review-queue model. It is deliberately unrelated to any DOM element id,
field name, or question number on the live CEAC DS-160 form - this project
never accesses, scrapes, or fills that form. See the module doc comment in
`checklist.ts` for the full stance, which mirrors the existing "not a live
scrape" provenance note in `fieldMap.ts`.

## Checklist coverage

`DS160_READINESS_CHECKLIST` covers every family a full, submitted DS-160
application requires:

- **Identity**: legal name, other names used, native-alphabet name,
  telecode, sex, marital status, date/place of birth, nationality, other
  nationality, permanent residence elsewhere, national ID, U.S. SSN/ITIN,
  clan/tribe.
- **Residency**: home and mailing address.
- **Contact**: phone(s), email(s), social media (a representative closed
  set of named platforms plus an "other platforms" list).
- **Passport**: type, number, book number, issuing location, issuance/
  expiration dates, lost/stolen document history.
- **Travel**: purpose, specific vs. approximate plans, address while in the
  U.S., who's paying, travel companions, traveling as part of a group or
  organization.
- **Previous U.S. travel**: prior visits, U.S. driver's license, previously
  issued visa (including visa number, same visa type, same issuing/
  applying location, applying in the country of principal residence),
  visa lost/stolen, visa cancelled/revoked, visa refusal, immigrant
  petitions filed.
- **U.S. contact**: person/organization, relationship, address, phone,
  email.
- **Family**: parents, spouse/partner (conditional on marital status),
  other relatives in the U.S.
- **Present and previous employment**: current occupation category and
  employer details (address including state/province and postal code,
  phone, monthly income - required for employed/self-employed, duties),
  full previous-employment history (address including state/province and
  postal code, phone, duties).
- **Education**: institutions attended, including state/province and
  postal code.
- **Languages, country travel, organizations**: each a repeatable section
  with an explicit coverage declaration.
- **Specialized skills, military service, paramilitary involvement**: each
  a gated Yes/No with conditional detail.
- **Security and background**: ~31 individual question families
  (health, criminal, security-related/terrorism, immigration violations -
  including being the subject of a removal or deportation hearing,
  distinct from failing to attend one or having already been removed -
  miscellaneous, including public elementary/F-status or post-1996 public
  secondary school attendance without reimbursement), each a boolean gate
  plus a conditional explanation - every one of them, not a representative
  sample.
- **Application admin**: filing location, self- vs. other-completed
  (preparer details conditional), interpreter used (details conditional).

Several items intentionally bundle closely-related DS-160 sub-questions
into one structured answer (e.g. `previous_us_travel.visa_details` covers
visa type/number/issue date/same-type/same-location/principal-residence/
ten-print together) rather than inventing a checklist id for every CEAC
micro-question - a representative, maintainable contract at the family
granularity the acceptance criteria describe, consistent with the existing
exact-mapping module's own stance. Distinct Yes/No questions with their
own conditional "explain" follow-up (visa lost/stolen, visa cancelled/
revoked, subject of a removal hearing, ...) each get their own checklist
id instead, since those are independently true/false/inapplicable facts,
not sub-fields of one answer.

### Content-audit follow-up (2026-08-02)

An independent content audit against the prior full DS-160 print found the
checklist above was missing several explicit questions/subfields:
traveling as part of a group/organization; previous visa number, same
visa type, same issuing/applying location, applying in the country of
principal residence, visa lost/stolen, visa cancelled/revoked; present
and previous employer phone/state-province/postal-code (plus previous
employer duties, and present employer monthly salary now required rather
than optional for employed/self-employed applicants); education state/
province and postal code; clan/tribe; being the subject of a removal or
deportation hearing; and public elementary (F status) or post-1996 public
secondary school attendance without reimbursement. All of these are now
covered - see `checklist.ts` and the "omitted-question audit additions"
test suite in `__tests__/dossier.test.ts`.

This project does not have the original print artifact on hand to diff
against mechanically; the fix above was driven by the audit's explicit
findings, plus a best-effort manual re-check against general DS-160
question-family knowledge for anything else obviously missing. That
manual re-check did not surface further clear omissions, but - as with
any representative, non-scraped contract - it is not a guarantee of exact
1:1 completeness against the live form; further gaps may still surface
from a future audit against the actual print.

## The JSON model

```ts
interface Dossier {
  schemaVersion: 1;
  asOf: string;                 // ISO date this dossier claims to be true as of
  applicantRef?: string;        // opaque local reference - never PII
  answers: Record<string, DossierAnswer>;
  repeatables: Record<string, RepeatableSection>;
}

interface DossierAnswer<T = unknown> {
  status: 'confirmed' | 'candidate' | 'unknown' | 'not_applicable';
  value?: T;                    // present only for confirmed/candidate
  provenance?: { source: string; asOf: string; note?: string };
  review: { reviewed: boolean; reviewedAt?: string; reviewedBy?: string };
  notes?: string;
}
```

`candidate` is the dossier-model analog of the existing vault's
`ConfirmationGate` (`packages/core/src/types.ts`) - a plausible value that
hasn't been explicitly reconfirmed as current. Both `candidate` and
`unknown` always block readiness; only `confirmed` (or a properly reviewed
`not_applicable`) can pass.

### Repeatable sections and their coverage declaration

Every repeatable checklist item (previous employers, countries visited,
family members in the U.S., ...) is a `RepeatableSection`:

```ts
interface RepeatableSection<T> {
  coverage: DossierAnswer<{ isEmpty: boolean; exhaustive: boolean; count: number }>;
  entries: Array<{ entryId: string; answer: DossierAnswer<T> }>;
}
```

The `coverage` declaration is itself a full, reviewable answer - so "I
haven't gotten to this section yet" (`unknown`) and "I confirm there are
none" (`confirmed`, `isEmpty: true`) are distinguishable and both
auditable. This is what makes empty or missing histories fail closed
instead of silently passing: an absent or `unknown` coverage declaration
always blocks readiness, a non-`exhaustive` list ("I've added some but not
all yet") always blocks readiness, and a `count` that doesn't match the
actual number of `entries` always blocks readiness.

### Conditional applicability resolves fail-closed

Many items only apply depending on another answer - `passport.loss_history`
only applies if `passport.ever_lost_or_stolen` is `true`;
`present_employment.employer_details` only applies if
`present_employment.primary_occupation_category` is `employed` or
`self_employed`. `resolveApplicability` (`validator.ts`) resolves each
conditional item to `applicable`, `not_applicable`, or `unresolved`:

- If the gate it depends on is not itself `confirmed`, the result is
  `unresolved` - **never a guess in either direction**. An unconfirmed
  gate blocks its dependents from ever passing, even if the dependent
  already has a fully filled-in, confirmed value sitting in the dossier.
- If the gate resolves `not_applicable` itself (chained conditionals), its
  dependents resolve `not_applicable` too.
- The dossier's stored answer status must match the resolved applicability
  exactly - a `confirmed` answer where the gate says "not applicable", or a
  `not_applicable` answer where the gate says "applicable", is reported as
  `contradictory`.

## Why sparse data can never pass

Because *every* checklist item - including every repeatable section's
coverage declaration - must independently resolve to a passing state,
building a dossier from only the ~15 fields the existing exact vault
mapping covers (`fieldMap.ts`) leaves well over a hundred items `missing`.
`packages/core/src/ds160/dossier/__tests__/dossier.test.ts` proves this
directly (`buildSparseFillMappedOnlyDossier`) and goes further: a
full-inventory test removes each applicable checklist item from a complete,
otherwise-passing dossier one at a time and asserts readiness breaks every
single time - not just for a sample.

## Determinism

`validateDossierReadiness` is a pure function of its input: it never reads
wall-clock time. All chronology checks (date of birth before the dossier's
declared `asOf`, passport expiration after issuance and after `asOf`,
employment start date not in the future) compare ISO date strings already
present in the dossier - never `Date.now()` or a bare `new Date()`. The same
dossier always produces the same report, run today or a year from now. The
test suite verifies this by swapping in a `Date` implementation that throws
if constructed, and confirming `validateDossierReadiness` still succeeds.

## The report and the HITL review queue

```ts
interface ReadinessReport {
  ready: boolean;
  dossierAsOf: string;
  totalChecklistItems: number;
  confirmedCount: number;
  issues: ReadinessIssue[];     // the exact HITL review queue
  familySummary: Record<ChecklistFamily, { total: number; confirmed: number; blocking: number }>;
}

interface ReadinessIssue {
  checklistId: string;          // repeatable entries append `[entryId]`
  family: ChecklistFamily;
  code:
    | 'missing' | 'not_confirmed' | 'unreviewed' | 'provenance_missing'
    | 'invalid_format' | 'contradictory' | 'conditional_unresolved'
    | 'coverage_incomplete' | 'coverage_mismatch';
  message: string;
}
```

`report.issues` **is** the review queue - every entry names the exact
checklist item still blocking readiness and why, sorted deterministically
by family then checklist id. There is no separate "warnings vs. errors"
tier: everything in `issues` is blocking, by design (fail-closed).

## Local workflow for a real applicant

A real dossier is never committed to this repository. See
`packages/core/src/ds160/dossier/local/README.md` for the full,
gitignored procedure: generate an empty skeleton with
`buildEmptyDossierSkeleton`, fill it in as evidence is gathered and
confirmed, and iterate with `validateDossierReadiness` until the review
queue is empty. This follows the same "local-only, gitignored intake"
pattern `packages/core/src/ds160/fixtures/local/` already established for
the smaller vault-item case.

## Relationship to the existing DS-160 acceptance workflow

This module does not replace or modify `docs/ds160-acceptance.md`'s exact
field-mapping and fill-plan mechanism - it's a separate, additive
completeness check that sits upstream of it. A dossier reaching
`ready: true` is a statement about the *whole* application being
accounted for; the fill-plan mechanism remains the mechanism for getting
individual confirmed vault facts into a reviewed, gated fill plan for the
fields that overlap. Beads issue `asterisk-kkf` (the real acceptance run)
notes that live-form work is deferred pending exactly this: a complete
private dossier, deterministic readiness validation, and HITL review.
