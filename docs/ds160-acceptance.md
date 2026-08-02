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
and what's intentionally excluded" for the full reasoning, and beads issue
`asterisk-0s1` for the tracked follow-up on further expansion.

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

## Known limitations / follow-ups

- `ConfirmationGate` was added only to the TypeScript `VaultItem`/
  `FillRecommendation` types (`packages/core/src/types.ts`); the Rust
  `VaultItem` struct (`crates/vault/src/lib.rs`) does not have a matching
  field yet. This is safe for now because the DS-160 fill-plan logic in
  this slice is a pure `packages/core` library not yet wired to any Tauri
  command - the Rust vault backend never sees a `VaultItem` produced by
  this code path. Adding Rust parity is required before the gate can flow
  through the actual desktop vault backend. (Tracked as beads issue
  `asterisk-04p`.)
- Section coverage, while now broader (see "Section coverage" above), still
  excludes Family, Previous U.S. Travel, and Security and Background
  entirely, and most of Travel beyond "purpose of trip." Tracked as beads
  issue `asterisk-0s1`.
- `apps/desktop` has no test harness yet (no vitest/RTL config), so the UI
  wiring (`getDisposition` call sites, audit `notes`) is covered by manual
  code reading, not an automated test. `packages/core`'s pure logic (the
  exact mapping and the gate itself) is unit-tested. (Tracked as beads
  issue `asterisk-iaw`.)
