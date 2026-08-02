# DS-160 acceptance workflow (first slice)

Tracked in beads issue `asterisk-kkf`. This document describes the mechanism
delivered by that issue's first slice; it deliberately does not restate any
specific applicant's personal data - see the beads issue itself (stored in
the local, gitignored Dolt DB, not in git) for run-specific context.

## Scope of this slice

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
| Unit tests | `packages/core/src/ds160/__tests__/ds160.test.ts` |
| Review UI wiring | `apps/desktop/src/components/fillplan/confidence.ts` (`getDisposition`), `FillPlanReviewDialog.tsx` |

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

## Current-employer/occupation gate

The example fixture (`ds160-vault-example.json`) models a fictional
applicant whose `company` (present employer) and `jobTitle` (present
occupation) vault items are both gated: sourced from a single, dated
snapshot rather than a reconfirmed-current source. This is the general
mechanism a specific run (e.g. the one tracked in `asterisk-kkf`, whose
only known employment evidence is a single dated snapshot) uses to keep
that candidate value out of any auto-applied fill until a human explicitly
reconfirms it. Loading a specific person's real candidate value uses this
same `VaultItem` + `ConfirmationGate` shape, supplied to the local vault at
runtime - never committed to this repository (see the fixtures README's
"No PII in this directory" section).

## Known limitations / follow-ups

- `ConfirmationGate` was added only to the TypeScript `VaultItem`/
  `FillRecommendation` types (`packages/core/src/types.ts`); the Rust
  `VaultItem` struct (`crates/vault/src/lib.rs`) does not have a matching
  field yet. This is safe for now because the DS-160 fill-plan logic in
  this slice is a pure `packages/core` library not yet wired to any Tauri
  command - the Rust vault backend never sees a `VaultItem` produced by
  this code path. Adding Rust parity is required before the gate can flow
  through the actual desktop vault backend.
- Section coverage is intentionally narrow for this first slice (Personal
  Information, Address and Phone, Present Employment). Expanding to the
  rest of the DS-160 is future work.
- `apps/desktop` has no test harness yet (no vitest/RTL config), so the UI
  wiring (`getDisposition` call sites, audit `notes`) is covered by manual
  code reading and the pre-existing `tsc` module-resolution limitation
  below, not by an automated test. `packages/core`'s pure logic (the exact
  mapping and the gate itself) is unit-tested.
- Pre-existing, unrelated to this slice: `packages/core`'s `tsc` build
  currently fails (`src/__tests__/matching.test.ts` imports non-exported
  `VaultItem`/`FieldNode` from `../matching`; `src/performance.ts` has
  several strict-mode type errors). Because `turbo`'s `test` task depends
  on `build`, `pnpm test` at the repo root does not currently reach any
  package's tests, and no package has a built `dist/`, so `apps/desktop`
  cannot resolve `@asterisk/core` via TypeScript either. This was true
  before this slice and this slice does not touch those files. Verified via
  `npx vitest run` directly (bypasses the turbo `build` dependency) and
  `npx tsc --noEmit`, run from `packages/core`.
