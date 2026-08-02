# Local-only DS-160 profile intake (real applicant data)

This directory is where a **real** applicant's confirmed data goes for an
actual DS-160 acceptance run - kept entirely out of git. Nothing in this
directory except this README, `.gitignore`, and
`ds160-vault-local.template.json` is tracked; everything else here is
ignored by default (opt-in tracking, not opt-out - see `.gitignore`).

## Why this exists

The rest of `packages/core/src/ds160/fixtures/` is a shared, committed
test fixture using a fictional applicant ("Alex Example") - see the
parent directory's `README.md` "No PII" policy. A real run (e.g. the one
tracked in beads issue `asterisk-kkf`) needs real data, which must never
be committed. This directory documents exactly how to stage that data
locally, using the same `VaultItem[]` shape the rest of this module
already uses (`../ds160-vault-example.json`), so it can be loaded into
the desktop app's vault - or fed directly to `generateDs160FillPlan` in a
local script - without ever touching git.

This is a **procedure + template**, not new runtime code:
`packages/core` ships to a browser/webview context and deliberately has
no filesystem access, so there is no loader function to call here - just
the steps below.

## How to use it

1. Copy the template:

   ```bash
   cp ds160-vault-local.template.json ds160-vault-local.json
   ```

   (Anything other than `ds160-vault-local.template.json` itself in this
   directory is gitignored - `cp` alone will never accidentally stage
   the copy.)

2. Fill in **only** values you can personally confirm are current as of
   today. If you can't confirm a field, leave its placeholder value in
   place (an obviously-unmatched field is safer than a wrong one) or
   delete that array entry entirely so it's simply absent from the vault
   rather than wrong.

3. **`jobTitle` and `company` (employer/occupation) must stay gated.**
   The template pre-fills both with a `confirmationGate` set to
   `pending_confirmation` - do not remove that gate, and do not fill in
   `value` from an old snapshot, resume, or immigration-prep document,
   unless you have *just* explicitly reconfirmed current employment with
   the applicant. Per beads issue `asterisk-kkf`, as of 2026-08-02 the
   only employment evidence on file is a single June 2026 snapshot,
   explicitly treated as stale. **No agent working in this repository
   should infer, guess, or fill in a specific employer name on the
   applicant's behalf** - that value only ever comes from the applicant's
   own explicit, current confirmation. The same caution applies to any
   other field where the evidence is old or secondhand: add a
   `confirmationGate` (same shape as `jobTitle`/`company` in the
   template) rather than presenting an unconfirmed value as settled fact.

4. Load it into the running desktop app's vault, one item at a time, via
   the same HTTP bridge the QA fixtures already use
   (`apps/qa/fixtures/extension-context.ts`'s `seedVaultData` does the
   same POST, from TypeScript, for the test suite):

   ```bash
   curl -sf http://127.0.0.1:17373/health >/dev/null || {
     echo "Desktop app not running - start it first: cd apps/desktop && pnpm tauri dev"
     exit 1
   }
   jq -c '.[]' ds160-vault-local.json | while IFS= read -r item; do
     curl -sf -X POST http://127.0.0.1:17373/v1/vault \
       -H 'Content-Type: application/json' -d "$item"
   done
   ```

   (Or use the desktop app's own Vault tab "Add Item" form for the same
   effect, one field at a time - see `apps/desktop/src/App.tsx`'s
   `VaultTab`.)

5. Run the DS-160 fill plan against it exactly as the tests do:

   ```ts
   import { generateDs160FillPlan, loadDs160FormStructureFixture } from '@asterisk/core';
   const plan = generateDs160FillPlan(loadDs160FormStructureFixture(), yourRealVaultItems);
   ```

   or drive it through the desktop app's Match tab. Gated fields
   (`requiresConfirmation: true`) show as blocked in the review dialog
   regardless of confidence - see the parent `README.md`'s "The
   confirmation gate" section, and `docs/ds160-acceptance.md` at the repo
   root for the full review-before-apply boundary.

## What this is not

- Not a place for real data to live "for later." Do the run, then delete
  `ds160-vault-local.json` if you don't want it lingering on disk (it was
  never in git either way, so deleting it loses nothing from history).
- Not a bypass of the review-before-apply boundary. Loading data into the
  vault via this mechanism does not fill or submit anything - it only
  makes the data available for the same fill-plan/review flow every other
  vault item goes through.
- Not a live-form integration. Nothing in this repository accesses,
  fills, saves, signs, or submits the live CEAC DS-160 form, and this
  mechanism doesn't change that.
