# DS-160 fixtures

Fixtures backing the DS-160 acceptance workflow (`packages/core/src/ds160/`).
Tracked in beads issue `asterisk-kkf`.

## What's here

- `ds160-form-structure.json` - a `FormSnapshot`: structural contract for a
  first slice of the DS-160 (Personal Information, Address and Phone,
  Present Employment sections). Field IDs, labels, and types only - no
  user values, matching the existing `FormSnapshot` security contract
  ("this intentionally excludes all user-entered values", `types.ts`).
- `ds160-vault-example.json` - a synthetic `VaultItem[]` for a fictional
  applicant ("Alex Example") used to exercise the exact field mapping
  (`../fieldMap.ts`) and the confirmation-gate mechanism (`../plan.ts`) in
  tests.

## Provenance of the form structure

This fixture is a **representative structural contract** built from the
publicly documented DS-160 section/question taxonomy (Personal Information,
Address and Phone, Work/Education/Training). It is **not** a scrape or
live capture of the CEAC DS-160 form - this project does not access, fill,
save, sign, or submit the live government form, ever. Field `id`/`name`
values are synthetic (e.g. `ds160_present_employer_name` / `present_occupation`)
rather than copied DOM element IDs. Treat this as a first-slice contract to
validate the mapping and gating mechanism, not as a certified 1:1 replica of
every DS-160 field. Expanding section coverage is expected future work.

## No PII in this directory

`ds160-vault-example.json` uses a fictional applicant and fictional employer
("Alex Example" / "Example Holdings LLC") - deliberately, per project policy
that real personal data must never be committed to fixtures. `dateOfBirth`
is intentionally omitted from the example vault to exercise the
unmatched-required-field path.

A real applicant's data (for example, the specific case tracked in
`asterisk-kkf`) is supplied at runtime from the user's local vault - never
from a file in this repository. If you need to test against a real
person's data locally, load it into the desktop app's vault (or a
gitignored local JSON file outside this fixtures directory) using the same
`VaultItem` shape as `ds160-vault-example.json`; do not add it here.

## The confirmation gate

`ds160-vault-example.json`'s `jobTitle` and `company` items carry a
`confirmationGate` (see `ConfirmationGate` in `../../types.ts`):
candidate values sourced from a single, dated snapshot rather than a
confirmed current source. `generateDs160FillPlan` (`../plan.ts`) copies this
onto the resulting `FillRecommendation` as `requiresConfirmation` +
`confirmationReason`. The desktop review dialog
(`apps/desktop/src/components/fillplan/confidence.ts`, `getDisposition`)
treats `requiresConfirmation: true` as `blocked` unconditionally, regardless
of confidence - so a gated field can never be silently auto-applied. It can
only be applied after a human explicitly reviews and checks it in the
review-before-apply dialog (`FillPlanReviewDialog.tsx`).
