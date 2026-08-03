# Local-only DS-160 dossier intake (real applicant data)

This directory is where a **real** applicant's private dossier goes - kept
entirely out of git, exactly like `../../fixtures/local/` does for the
smaller vault-item intake. Nothing in this directory except this README and
`.gitignore` is tracked; everything else here is ignored by default
(opt-in tracking, not opt-out - see `.gitignore`).

See the repository-root `docs/ds160-dossier-readiness.md` for the full
picture of what the dossier readiness model is and why it exists. This
file is the step-by-step local procedure.

## Why this exists

`../checklist.ts` defines a complete DS-160 answer checklist (~160 items
across every family a submitted application requires - identity, address,
passport, travel, prior U.S. travel, family, employment, education,
languages, country travel, organizations, specialized skills, military,
paramilitary, every security/background question, and application
admin/preparer). `../validator.ts`'s `validateDossierReadiness` is a
deterministic, fail-closed function that checks a dossier against that
checklist and returns a machine-readable report plus an exact HITL
("human in the loop") review queue - the list of items still blocking
readiness.

A dossier is too large and too personal to ever be a static file in this
repository (unlike the ~15-field vault example fixture). This directory
documents the **procedure**, not the data.

## What this is not

- **Not a live-form integration.** Nothing in this repository - this
  directory included - accesses, fills, saves, signs, or submits the live
  CEAC DS-160 form, and this mechanism doesn't change that. Dossier
  readiness is a *prerequisite* signal for eventual, entirely human,
  off-repository DS-160 preparation - not a step toward automating it.
- **Not a place for real data to live "for later."** Do the readiness
  work, then delete `dossier-local.json` if you don't want it lingering on
  disk (it was never in git either way, so deleting it loses nothing from
  history).
- **Not something an agent should populate with guessed or inferred
  values.** Every `confirmed` answer requires `provenance` naming where it
  came from and a human `review.reviewed: true`. No agent working in this
  repository should invent, guess, or infer a real applicant's identity,
  history, or background-question answers - those only ever come from the
  applicant's own explicit, current confirmation. This is the same caution
  `../../fixtures/local/README.md` documents for the employer/occupation
  vault fields, generalized to the entire dossier.

## How to use it

### 1. Generate an empty skeleton

`buildEmptyDossierSkeleton` (exported from `@asterisk/core`) builds a
dossier with every checklist item present at `status: 'unknown'` - the
fail-closed starting point. Generating it from the checklist itself (not a
hand-copied template) means it can never omit an item the catalog has
grown to include:

```bash
node -e "
const { buildEmptyDossierSkeleton } = require('@asterisk/core');
const fs = require('fs');
const dossier = buildEmptyDossierSkeleton('2026-08-02', 'local-only-ref');
fs.writeFileSync('dossier-local.json', JSON.stringify(dossier, null, 2));
"
```

(Run from a context where `@asterisk/core` is built and resolvable - e.g.
`packages/core` after `pnpm build`, or from `apps/desktop` which already
depends on it. `packages/core` ships to a browser/webview context and has
no filesystem access itself, so there is no in-library file writer - this
is a one-time local script, same as `../../fixtures/local/README.md`'s
`curl` loading step.)

`dossier-local.json` is gitignored the moment it's created (see
`.gitignore` above) - nothing further to do to keep it out of git.

### 2. Fill in answers as you gather and confirm them

For each item you can personally confirm as of today, change its entry
from:

```json
{ "status": "unknown", "review": { "reviewed": false } }
```

to:

```json
{
  "status": "confirmed",
  "value": "...",
  "provenance": { "source": "passport scan dated 2026-07-01", "asOf": "2026-07-01" },
  "review": { "reviewed": true, "reviewedAt": "2026-08-02", "reviewedBy": "applicant" }
}
```

If a question genuinely doesn't apply (e.g. `identity.has_us_ssn` is
`false`, so `identity.us_ssn` should be `not_applicable`), still explicitly
set `status: "not_applicable"` with `review.reviewed: true` - **never**
leave it `unknown` and never delete the entry. An absent or `unknown`
answer always blocks readiness; that is the entire point of the fail-closed
design (see `docs/ds160-dossier-readiness.md`'s "Why sparse data can never
pass" section).

For repeatable sections (`dossier.repeatables[id]` - previous employers,
countries visited, family members in the U.S., ...), set the section's
`coverage` the same way, and add one entry per item with `entryId` unique
within the section:

```json
{
  "coverage": {
    "status": "confirmed",
    "value": { "isEmpty": false, "exhaustive": true, "count": 2 },
    "provenance": { "source": "applicant recall", "asOf": "2026-08-02" },
    "review": { "reviewed": true, "reviewedAt": "2026-08-02" }
  },
  "entries": [
    { "entryId": "entry-1", "answer": { "status": "confirmed", "value": { "...": "..." }, "provenance": { "...": "..." }, "review": { "reviewed": true } } },
    { "entryId": "entry-2", "answer": { "...": "..." } }
  ]
}
```

`coverage.value.count` must equal `entries.length` exactly, and
`exhaustive: true` is required whenever the list is non-empty - a partial,
"I'll finish this later" list is treated as incomplete on purpose (see
"Repeatable sections" in `docs/ds160-dossier-readiness.md`). If there
genuinely are none (e.g. no previous employers), set
`coverage.value: { "isEmpty": true, "exhaustive": true, "count": 0 }` and
leave `entries: []` - an explicit, reviewed "confirmed empty" declaration,
not silence.

### 3. Check readiness and work the review queue

```ts
import { validateDossierReadiness } from '@asterisk/core';
import dossier from './dossier-local.json';

const report = validateDossierReadiness(dossier);
console.log(`ready: ${report.ready}`);
console.log(`${report.issues.length} item(s) still need attention:`);
for (const issue of report.issues) {
  console.log(`  [${issue.family}] ${issue.checklistId}: ${issue.code} - ${issue.message}`);
}
```

`report.issues` **is** the exact HITL review queue - every entry names a
specific checklist item and a reason it's still blocking. Work through it,
update `dossier-local.json`, and re-run until `report.issues` is empty and
`report.ready` is `true`.

### 4. After readiness

`ready: true` means the dossier is internally complete, confirmed,
reviewed, and consistent per this checklist - it is a readiness signal for
a human to proceed with the entirely separate, off-repository, human-only
process of actually preparing the live DS-160 form. It is not itself a
submission, a fill, or a step this codebase takes on your behalf.
