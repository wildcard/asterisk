# Agent Teams Adoption Plan for Asterisk

This document outlines how to integrate Claude Code's **Agent Teams** feature into the Asterisk development workflow. Agent Teams let you coordinate multiple Claude Code instances working in parallel — one session acts as team lead while teammates work independently, each in its own context window, communicating directly with each other.

> **Status:** Agent Teams are experimental (requires opt-in via `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`).

---

## Table of Contents

1. [Setup and Configuration](#1-setup-and-configuration)
2. [Where Agent Teams Fit in Our Workflow](#2-where-agent-teams-fit-in-our-workflow)
3. [Concrete Team Templates for Asterisk](#3-concrete-team-templates-for-asterisk)
4. [Operating Procedures](#4-operating-procedures)
5. [When NOT to Use Agent Teams](#5-when-not-to-use-agent-teams)
6. [Hooks for Quality Gates](#6-hooks-for-quality-gates)
7. [Token Budget Considerations](#7-token-budget-considerations)
8. [Rollout Plan](#8-rollout-plan)

---

## 1. Setup and Configuration

### Enable the feature

Add to `.claude/settings.json`:

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

### Display mode

For solo developers, **in-process mode** (default) works in any terminal — use `Shift+Up/Down` to navigate teammates. For pair/mob sessions where visibility matters, **split-pane mode** via tmux gives each teammate its own pane:

```json
{
  "teammateMode": "tmux"
}
```

Install tmux if not present: `sudo apt install tmux` (Linux) or `brew install tmux` (macOS).

### Permission pre-approval

Teammate permission prompts bubble up to the lead, creating friction. Pre-approve common operations in your permission settings before spawning teams to reduce interruptions. At minimum, approve file reads, writes within the repo, and test/build commands.

---

## 2. Where Agent Teams Fit in Our Workflow

Asterisk is a monorepo with four distinct workspaces (`desktop`, `extension`, `core`, `qa`) plus Rust crates. This natural separation makes it a strong fit for Agent Teams because teammates can own different workspaces without file conflicts.

### Decision matrix

| Task Type | Use Agent Team? | Rationale |
|---|---|---|
| Cross-layer feature (extension + desktop + core) | **Yes** | Each teammate owns a layer, no file overlap |
| PR review (security + performance + tests) | **Yes** | Parallel review with distinct lenses |
| Bug investigation with unclear root cause | **Yes** | Competing hypotheses tested simultaneously |
| New module in a single workspace | **No** | Subagent or single session is sufficient |
| Quick bug fix in one file | **No** | Overhead exceeds benefit |
| Refactoring shared types in `@asterisk/core` | **No** | Sequential edits to the same files, conflicts likely |
| Architecture/design exploration | **Yes** | Multiple perspectives debated in parallel |

---

## 3. Concrete Team Templates for Asterisk

### Template A: Cross-Layer Feature Implementation

**When:** A feature touches the Chrome extension, desktop app, and shared core simultaneously.

```
Create an agent team for implementing [FEATURE]. Spawn three teammates:

1. "extension-dev": Implements the Chrome extension side in apps/extension/.
   Focus on content scripts, background service worker, and popup UI.
   The extension uses Manifest V3, React, and Vite with crxjs plugin.

2. "desktop-dev": Implements the Tauri desktop app side in apps/desktop/.
   This includes both the React frontend (apps/desktop/src/) and Rust
   backend (apps/desktop/src-tauri/). Uses Tauri 2.1 with IPC commands.

3. "core-types": Implements shared TypeScript types and matching logic in
   packages/core/src/. This teammate should finish first since others
   depend on these types. Also writes unit tests in vitest.

Task dependencies: core-types tasks should complete before extension-dev
and desktop-dev tasks that consume those types. Extension and desktop
work can proceed in parallel after core types are defined.

Require plan approval before any teammate makes changes.
```

**File ownership boundaries:**
- `extension-dev` owns `apps/extension/**`
- `desktop-dev` owns `apps/desktop/**` and `crates/vault/**`
- `core-types` owns `packages/core/**`

### Template B: Parallel Code Review

**When:** Reviewing a PR that touches security-sensitive code (vault, form data handling, CSP).

```
Create an agent team to review PR #[NUMBER]. Spawn three reviewers:

1. "security-reviewer": Review for security vulnerabilities. Focus on:
   - CSP compliance, message sender verification, data masking
   - Vault cache TTL, encrypted storage, audit logging
   - PII handling and redaction
   - Refer to docs/threat-model.md for our threat model

2. "correctness-reviewer": Review for bugs and logic errors. Focus on:
   - Form field matching accuracy and confidence scoring
   - TypeScript strict mode compliance (noUncheckedIndexedAccess, etc.)
   - Rust error handling (thiserror patterns in crates/)
   - Edge cases in matching.ts and performance.ts

3. "test-reviewer": Validate test coverage. Focus on:
   - Are new code paths covered by vitest unit tests?
   - Do E2E tests in apps/qa/ cover the user-facing changes?
   - Run `pnpm test` and `cargo test --workspace` to verify green
   - Check for missing edge case tests

Have each reviewer report findings with severity ratings.
```

### Template C: Bug Investigation (Competing Hypotheses)

**When:** A bug spans multiple layers and the root cause is unclear.

```
Users report [BUG DESCRIPTION]. Create an agent team to investigate.
Spawn 4 teammates with different hypotheses:

1. "hypothesis-extension": Investigate whether the bug originates in
   the Chrome extension content scripts or background worker.
   Check apps/extension/src/ for message passing issues.

2. "hypothesis-desktop": Investigate whether the Tauri IPC bridge
   or Rust vault logic is the root cause. Check apps/desktop/src-tauri/
   and crates/vault/.

3. "hypothesis-core": Investigate whether the shared matching or
   type logic in packages/core/ produces incorrect results for
   this scenario.

4. "hypothesis-integration": Check whether the HTTP bridge between
   extension and desktop (localhost-only) has timing or connection
   issues. Review E2E tests in apps/qa/ for related scenarios.

Have teammates share findings and challenge each other's theories.
Update a findings summary when consensus emerges.
```

### Template D: Rust + TypeScript Parallel Development

**When:** A feature requires coordinated changes in both the Rust vault crate and TypeScript consumers.

```
Create an agent team for [FEATURE]. Spawn two teammates:

1. "rust-dev": Implement the Rust side in crates/vault/src/.
   Use serde for serialization, thiserror for errors, chrono for
   timestamps. Write tests with `cargo test`. The vault crate
   is edition 2021 with these dependencies: serde, serde_json,
   thiserror, chrono, tiny_http, reqwest.

2. "ts-dev": Implement the TypeScript consumer side. Update types
   in packages/core/src/types.ts, add Tauri IPC commands in
   apps/desktop/src-tauri/, and update the React frontend.
   Run `pnpm typecheck` and `pnpm test` to verify.

The rust-dev teammate should define the API contract first (struct
definitions, command signatures). Then ts-dev can implement against
that contract. Use plan approval for both teammates.
```

### Template E: Test Suite Expansion

**When:** Expanding test coverage across all layers.

```
Create an agent team to expand test coverage. Spawn three teammates:

1. "unit-tester": Write vitest unit tests for packages/core/ and
   apps/extension/. Run with `pnpm test`. Target uncovered branches
   in matching.ts, performance.ts, and security utilities.

2. "e2e-tester": Write Playwright E2E tests in apps/qa/e2e-tests/.
   Config is at apps/qa/playwright.config.ts. Tests target chromium
   with projects for desktop-app (localhost:1420), extension-popup,
   and form-filling.

3. "rust-tester": Write Rust tests for crates/vault/. Focus on
   edge cases in encrypted storage, cache TTL expiration, and
   serialization roundtrips. Run with `cargo test --workspace`.

Each tester works independently — no file overlap.
```

---

## 4. Operating Procedures

### Before spawning a team

1. **Verify the task warrants a team.** If work is sequential or touches the same files, use a single session or subagents instead.
2. **Identify file ownership boundaries.** Each teammate should own a distinct set of files/directories. Our monorepo structure (`apps/extension`, `apps/desktop`, `packages/core`, `crates/vault`, `apps/qa`) provides natural boundaries.
3. **Pre-approve permissions** to avoid prompt fatigue during team execution.

### During team execution

1. **Use delegate mode** (`Shift+Tab`) to keep the lead focused on coordination rather than implementing.
2. **Require plan approval** for implementation tasks: `"Require plan approval before they make any changes."` This prevents wasted work.
3. **Set clear task dependencies.** Core types should finish before consumers. Rust API contracts should be defined before TypeScript consumers.
4. **Monitor progress** — check in on teammates with `Shift+Up/Down`. Redirect approaches that aren't working.
5. **Aim for 5-6 tasks per teammate** to keep everyone productive and allow work redistribution.

### After team completion

1. **Have the lead synthesize results** before cleanup.
2. **Run the full CI pipeline locally** before committing:
   ```bash
   pnpm typecheck && pnpm test && cargo test --workspace && pnpm build
   ```
3. **Clean up the team** through the lead: `"Clean up the team"`
4. **Shut down teammates first** if cleanup fails — teammates must exit before the lead can clean up.

---

## 5. When NOT to Use Agent Teams

- **Editing shared files** (`packages/core/src/types.ts`, `turbo.json`, root `package.json`): two teammates editing the same file causes overwrites.
- **Sequential refactoring**: renaming a type that flows through all layers requires one change at a time.
- **Small, focused fixes**: a one-file bug fix doesn't need coordination overhead.
- **Under token budget pressure**: each teammate is a separate Claude instance. A 3-teammate team uses roughly 3-4x the tokens of a single session.

---

## 6. Hooks for Quality Gates

Use Claude Code hooks to enforce standards when teammates complete work.

### TeammateIdle hook

Runs when a teammate is about to go idle. Exit with code 2 to send feedback and keep the teammate working:

```bash
#!/bin/bash
# .claude/hooks/teammate-idle.sh
# Ensure teammates run tests before going idle

cd /home/user/asterisk

# Check if there are uncommitted test failures
if ! pnpm test --run 2>/dev/null; then
  echo "Tests are failing. Fix test failures before completing."
  exit 2
fi

if ! cargo test --workspace 2>/dev/null; then
  echo "Rust tests are failing. Fix before completing."
  exit 2
fi
```

### TaskCompleted hook

Runs when a task is marked complete. Exit with code 2 to prevent completion:

```bash
#!/bin/bash
# .claude/hooks/task-completed.sh
# Verify type checking passes before marking tasks done

cd /home/user/asterisk

if ! pnpm typecheck 2>/dev/null; then
  echo "TypeScript type checking failed. Fix type errors before marking complete."
  exit 2
fi
```

---

## 7. Token Budget Considerations

| Team Size | Approximate Token Multiplier | Best For |
|---|---|---|
| 2 teammates | ~2.5x single session | Rust + TypeScript parallel dev |
| 3 teammates | ~3.5x single session | Cross-layer features, code review |
| 4+ teammates | ~4.5x+ single session | Bug investigation, architecture exploration |

**Cost optimization strategies:**
- Use `Sonnet` for teammate models when tasks are straightforward (test writing, linting, boilerplate): `"Use Sonnet for each teammate."`
- Reserve `Opus` for the lead and complex reasoning tasks.
- Start with research/review teams (lower risk, clearer boundaries) before moving to implementation teams.

---

## 8. Rollout Plan

### Phase 1: Read-Only Teams (Low Risk)

Start with tasks that don't modify code:

- **PR reviews** using Template B — three reviewers with distinct lenses
- **Bug investigation** using Template C — competing hypotheses
- **Architecture exploration** — multiple perspectives on design decisions

These tasks demonstrate value with minimal risk of file conflicts or wasted implementation work.

### Phase 2: Isolated Implementation Teams

Move to implementation with strict file boundaries:

- **Test suite expansion** using Template E — each tester owns a distinct test directory
- **Rust + TypeScript parallel dev** using Template D — clear API contract boundary

Require plan approval for all implementation teammates during this phase.

### Phase 3: Cross-Layer Feature Teams

Full implementation teams for features spanning multiple workspaces:

- **Cross-layer features** using Template A — extension, desktop, and core in parallel
- Enable delegate mode for the lead
- Use hooks (Section 6) for automated quality gates

### CLAUDE.md guidance

Once adopted, add guidance to a project-level `CLAUDE.md` so all sessions (including teammates) have context:

```markdown
## Agent Teams

This project supports Claude Code Agent Teams. When spawning teammates:
- extension-dev owns apps/extension/
- desktop-dev owns apps/desktop/ and crates/vault/
- core-types owns packages/core/
- qa-dev owns apps/qa/

Never have two teammates edit the same file. Run `pnpm typecheck && pnpm test`
before marking any task complete.
```
