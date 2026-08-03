# DS-160 acceptance workflow

Tracked in beads issues `asterisk-kkf` (the acceptance run) and `asterisk-0s1`
(expanding section coverage beyond the first slice). This document describes
the mechanism those issues deliver; it deliberately does not restate any
specific applicant's personal data. Beads metadata is exported to tracked
JSONL in this public repository, so it must never contain run-specific facts;
keep those only in the gitignored local intake described below.

## Scope

A reproducible, structural DS-160 form contract plus an exact field-to-vault
mapping and a "confirmation gate" mechanism that blocks any candidate value
sourced from stale or unconfirmed evidence from ever being silently applied.
It reuses this project's existing Form Expert / User Vault separation and
review-before-apply dialog rather than inventing a parallel path.

**Explicitly out of scope for this slice** (and for this project, full
stop): accessing, filling, saving, signing, or submitting the live DS-160
government form. Nothing in this codebase does that. See
`packages/core/src/ds160/fixtures/README.md` for the fixture provenance
note.

## What's implemented

| Piece | Location |
|---|---|
| Structural form contract (fixture, no user values) | `packages/core/src/ds160/fixtures/ds160-form-structure.json` |
| Exact field ID -> vault mapping table | `packages/core/src/ds160/fieldMap.ts` |
| Fill plan generation using the exact map | `packages/core/src/ds160/plan.ts` (`generateDs160FillPlan`) |
| Confirmation-gate types | `packages/core/src/types.ts` (`ConfirmationGate`, `VaultItem.confirmationGate`, `FillRecommendation.requiresConfirmation`/`confirmationReason`) |
| Synthetic example vault (no real PII) exercising the gate | `packages/core/src/ds160/fixtures/ds160-vault-example.json` |
| Local-only, gitignored real-data intake template/procedure | `packages/core/src/ds160/fixtures/local/` (see its `README.md`) |
| Unit tests | `packages/core/src/ds160/__tests__/ds160.test.ts` |
| Review UI wiring | `apps/desktop/src/components/fillplan/confidence.ts` (`getDisposition`), `FillPlanReviewDialog.tsx` |

## Section coverage

`DS160_FIELD_MAP` (`packages/core/src/ds160/fieldMap.ts`) currently covers:
Personal Information, Address and Phone, Present Employment, Passport,
Travel (purpose of trip only), and U.S. Contact - 15 fields total. Coverage
is scoped to fields that are genuinely *reusable* facts worth caching in a
vault; per-application specifics (exact arrival/departure dates, this
trip's U.S. address, who's paying) don't fit that model and are
intentionally excluded, along with the Family, Previous U.S. Travel, and
Security and Background sections (not yet covered at all). See the module
doc comment in `fieldMap.ts` and `fixtures/README.md`'s "Section coverage
and what's intentionally excluded" for the full reasoning.

**Why coverage hasn't grown past this since (completion-gap audit note):**
every `DS160_FIELD_MAP` entry to date is a *representative* field id
(`ds160_passport_number`, etc.) - a structural contract built from public
knowledge of the DS-160's section/question layout, explicitly **not**
scraped from the live form (this project never accesses it - see "Scope"
above). That was an acceptable way to stand up the mapping + gate
mechanism for a first slice, but it doesn't scale honestly to Family or
Previous U.S. Travel: those sections have enough real structural
complexity (repeating family-member rows, conditional sub-questions) that
guessing field ids for them would be inventing selectors no real DS-160
session would actually have, rather than a defensible representative
contract. Doing that risks producing a mapping that looks authoritative
but silently wouldn't match the real form at all.

Given that, the higher-value next step - and the one actually implemented
in this pass - is improving the *capture mechanism* itself (see below),
so that if/when a human safely captures the real form's structure (a
read-only, non-submitting export, done by the human, never by an agent -
still out of scope for this project to do itself), the pipeline that
receives it actually works correctly. Further `DS160_FIELD_MAP` section
growth should wait for that real structure rather than more guessed ids.

## Capture mechanism: radio-button groups

**Gap found:** the extension's generic form-capture pipeline
(`apps/extension/src/content.ts`) previously emitted one `FieldNode` per
physical form *element*. For a radio-button group - multiple
`<input type="radio">` elements sharing a `name`, the standard way to ask
a single "pick one of N" question - that meant **one field per option**,
each with no `options` list and nothing that identified them as belonging
together. A Yes/No question became two disconnected, unfillable "radio"
fields instead of one fillable field with two choices. This matters a
great deal for a DS-160-style form, which asks dozens of Yes/No questions
this exact way ("Have you ever...", "Do you have...").

Notably, the existing *fill* side (`content.ts`'s `fillField()`) already
assumed the correct model - it targets a radio by `name` + target
`value`, re-querying the DOM rather than acting on one pre-resolved
element - so capture and fill were already inconsistent with each other
before this fix, independent of DS-160 specifically.

**Fix:** `apps/extension/src/content-improvements.ts` gained
`buildRadioGroupFieldNode()` (merges same-name radios into one `FieldNode`
with `options` populated exactly like a `<select>`'s options) and
`findRadioGroupLabel()` (resolves the group's question text via the
standard `<fieldset><legend>` pattern, falling back to joining the option
labels rather than guessing). `content.ts`'s two field-extraction call
sites now share one `extractFieldsFromElements()` helper that groups
same-name radios before building fields, and `findFieldElement()` resolves
the new `radio-group-<name>` id back to the DOM at fill time.

**Verified:**
- 11 unit tests (`apps/extension/src/__tests__/content-improvements.test.ts`)
  covering grouping, label resolution (with and without a fieldset),
  required-if-any-radio-required, hidden-radio exclusion, and the
  all-hidden/empty-group null cases.
- A real-browser E2E test
  (`apps/qa/e2e-tests/real-world-forms.spec.ts`, "Radio Button Groups")
  loads a synthetic (non-DS-160) Yes/No fixture
  (`apps/qa/fixtures/radio-group-test-form.html`), intercepts the
  extension's actual outgoing snapshot POST, and asserts the real captured
  `FormSnapshot` has exactly one `radio` field with both options - not the
  two disconnected fields the old code would have produced. This is a
  materially stronger check than most of this test file's other cases,
  which only assert on raw DOM structure rather than the content script's
  actual captured output.
- Full apps/extension (`102/102`) and apps/qa E2E (`47 passed / 5 skipped`,
  3 consecutive stable runs) suites pass; `tsc --noEmit` and `vite build`
  both clean.

**Not done in this pass** (explicitly out of scope, to keep this slice
bounded): checkbox *groups* (multi-select "choose all that apply", which
DS-160 also uses in a few places) get no equivalent treatment yet - only
radio groups. A checkbox group's semantics (0..N selections, not exactly
1) don't map onto the same `options`-on-one-field shape as cleanly, and
would need its own design pass.

## The review-before-apply boundary

1. `generateDs160FillPlan` matches each DS-160 field to a vault item via the
   exact field map (deterministic, not fuzzy label matching - appropriate
   for a government form's stable vocabulary).
2. If the matched `VaultItem` carries a `confirmationGate` (status
   `pending_confirmation`), the resulting `FillRecommendation` is flagged
   `requiresConfirmation: true` with a human-readable `confirmationReason`
   copied from the gate - regardless of the item's own confidence score.
3. The desktop app's `getDisposition(confidence, requiresConfirmation)`
   treats `requiresConfirmation: true` as `blocked` unconditionally. Blocked
   rows start unchecked in `FillPlanReviewDialog` and can only be applied
   by an explicit, informed user action (the same UX already used for
   low-confidence matches - no new UI paradigm).
4. If a gated field is applied, the audit entry's `notes` records the gate
   reason, so the append-only audit trail explains *why* it needed review.

## Time-sensitive fields and the confirmation gate

The example fixture (`ds160-vault-example.json`) models a fictional
applicant with three gated vault items:

- `company` (present employer) and `jobTitle` (present occupation), sourced
  from a single, dated immigration-prep snapshot rather than a
  reconfirmed-current source.
- `passportExpiryDate`, sourced from a scanned copy of the passport rather
  than the physical document - a passport can be renewed, reissued, or
  replaced after a scan was made, so its expiration date is exactly as
  time-sensitive as an employer fact and gets the same treatment.

This is the general mechanism: **any** vault item whose evidence might be
stale - not just employment - should carry a `ConfirmationGate`, and the
review-before-apply boundary treats all of them identically (blocked
regardless of confidence, until a human explicitly confirms). An acceptance
run uses this same pattern to keep any stale candidate value out of an
auto-applied fill. Loading a specific person's
real candidate values uses this same `VaultItem` + `ConfirmationGate`
shape, supplied to the local vault at runtime - never committed to this
repository (see the fixtures README's "No PII in this directory" section
and the next section below).

## Loading real applicant data for an actual run

`packages/core/src/ds160/fixtures/local/` documents a gitignored,
local-only procedure and template (`ds160-vault-local.template.json`) for
staging a real applicant's confirmed data and loading it into the running
desktop app's vault via its existing HTTP bridge - without ever
committing it. See that directory's `README.md` for the full procedure.

This is documentation plus a `curl` one-liner, not new runtime code:
`packages/core` ships to a browser/webview context and deliberately has no
filesystem access, so there is no in-library loader to call. The template
pre-gates the employer/occupation fields (`confirmationGate.status:
"pending_confirmation"`) and explicitly instructs that no agent working in
this repository should infer or guess an employer name on the applicant's
behalf - that value only ever comes from the applicant's own explicit,
current confirmation.

## Dossier readiness (completeness check, separate module)

The exact field-mapping/fill-plan mechanism above covers ~15 reusable
fields - it was never meant to answer "is this applicant's whole
application accounted for?" That completeness question is answered by a
separate, additive module: see `docs/ds160-dossier-readiness.md` for the
full DS-160 checklist (~160 items across every answer family), the
private-dossier JSON model, and the deterministic, fail-closed validator
(`packages/core/src/ds160/dossier/`). Nothing about this file's mechanism
changes - the dossier module sits upstream of it as a prerequisite
readiness signal.

## Known limitations / follow-ups

- Rust `VaultItem`/`ConfirmationGate` parity (`crates/vault/src/lib.rs`,
  `apps/desktop/src-tauri/src/lib.rs`'s `VaultItemJson` wire boundary) and
  the `apps/desktop` vitest/RTL harness are both done - see git history for
  the commits that closed beads issues `asterisk-04p` and `asterisk-iaw`.
- Section coverage, while broader than the first slice (see "Section
  coverage" above), still excludes Family, Previous U.S. Travel, and
  Security and Background entirely, and most of Travel beyond "purpose of
  trip" - and per this pass's audit, growing it further should wait for
  real captured structure rather than more representative/guessed ids
  (see "Section coverage" above for the reasoning).
- Radio-button *groups* are now captured correctly (see "Capture
  mechanism" above); checkbox groups (multi-select) are not yet handled
  the same way - each checkbox is still its own independent field, which
  is actually correct for a true multi-select but means there's no
  "these N checkboxes are one logical question" grouping the way radios
  now have.
- The capture-mechanism fix in this pass improves `apps/extension`'s
  generic form detection, which is a prerequisite for a real DS-160
  capture but doesn't itself perform one - nothing in this repository
  accesses, fills, saves, signs, or submits the live DS-160 form, and nor
  does this change. A real capture, if/when it happens, is a human action
  outside this codebase's scope, using the (now more correct) pipeline
  described above.
