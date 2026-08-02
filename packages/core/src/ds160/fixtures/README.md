# DS-160 fixtures

Fixtures backing the DS-160 acceptance workflow (`packages/core/src/ds160/`).
Tracked in beads issue `asterisk-kkf`.

## What's here

- `ds160-form-structure.json` - a `FormSnapshot`: structural contract
  covering Personal Information, Address and Phone, Present Employment,
  Passport, Travel (purpose only), and U.S. Contact sections (15 fields).
  Field IDs, labels, and types only - no user values, matching the
  existing `FormSnapshot` security contract ("this intentionally excludes
  all user-entered values", `types.ts`).
- `ds160-vault-example.json` - a synthetic `VaultItem[]` for a fictional
  applicant ("Alex Example") used to exercise the exact field mapping
  (`../fieldMap.ts`) and the confirmation-gate mechanism (`../plan.ts`) in
  tests.
- `local/` - a gitignored, local-only mechanism/template for loading a
  *real* applicant's confirmed data for a live acceptance run without ever
  committing it. See `local/README.md`.

## Section coverage and what's intentionally excluded

Coverage is scoped to DS-160 fields that are genuinely *reusable* facts
worth caching in a vault - not every question on the form fits that model.
See the module doc comment in `../fieldMap.ts` for the full reasoning; in
short: real per-trip specifics (arrival/departure dates, this trip's U.S.
address, who's paying) are excluded because they're inherently
one-off/per-application, not stable facts about the applicant. Family,
Previous U.S. Travel, and Security and Background sections are not yet
covered at all - see beads issue `asterisk-0s1` for the tracked follow-up
if/when they're added.

## Provenance of the form structure

This fixture is a **representative structural contract** built from the
publicly documented DS-160 section/question taxonomy (Personal Information,
Address and Phone, Work/Education/Training, Passport, Travel, U.S.
Contact). It is **not** a scrape or live capture of the CEAC DS-160 form -
this project does not access, fill, save, sign, or submit the live
government form, ever. Field `id`/`name` values are synthetic (e.g.
`ds160_present_employer_name` / `present_occupation`) rather than copied
DOM element IDs. Treat this as a representative contract to validate the
mapping and gating mechanism, not as a certified 1:1 replica of every
DS-160 field.

## No PII in this directory

`ds160-vault-example.json` uses a fictional applicant, employer, and U.S.
contact ("Alex Example" / "Example Holdings LLC" / "Jordan Sample") -
deliberately, per project policy that real personal data must never be
committed to fixtures. `dateOfBirth` and the (optional) U.S. contact email
are intentionally omitted from the example vault to exercise the
unmatched-field path for both a required and an optional field.

A real applicant's data (for example, the specific case tracked in
`asterisk-kkf`) is supplied at runtime from the user's local vault - never
from a file in this repository. See `local/README.md` for the documented,
gitignored template/mechanism for staging real confirmed data locally
before loading it into the desktop app's vault; do not add real data here.

## The confirmation gate

`ds160-vault-example.json`'s `jobTitle`, `company`, and
`passportExpiryDate` items carry a `confirmationGate` (see
`ConfirmationGate` in `../../types.ts`): candidate values sourced from a
single, dated snapshot rather than a confirmed current source.
`passportExpiryDate` in particular demonstrates that the gate applies to
any time-sensitive fact, not just employment - a passport can be renewed
or reissued after the evidence (e.g. a scanned copy) was captured, so its
expiration date needs the same "confirm before use" treatment as a stale
employer fact. `generateDs160FillPlan` (`../plan.ts`) copies this onto the
resulting `FillRecommendation` as `requiresConfirmation` +
`confirmationReason`. The desktop review dialog
(`apps/desktop/src/components/fillplan/confidence.ts`, `getDisposition`)
treats `requiresConfirmation: true` as `blocked` unconditionally, regardless
of confidence - so a gated field can never be silently auto-applied. It can
only be applied after a human explicitly reviews and checks it in the
review-before-apply dialog (`FillPlanReviewDialog.tsx`).
