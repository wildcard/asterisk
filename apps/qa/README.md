# Asterisk QA Automation

Automated end-to-end testing for the Asterisk desktop application.

## Setup

```bash
# Install dependencies
pnpm install

# Set Claude API key for LLM tests (optional - will use placeholder if not set)
export CLAUDE_API_KEY="sk-ant-..."
```

## Running Tests

```bash
# Setup test environment (post test form to HTTP bridge)
pnpm setup

# Run all tests (headless)
pnpm test

# Run setup + tests
pnpm test:full

# Run with UI mode (interactive)
pnpm test:ui

# Run in headed mode (see browser)
pnpm test:headed

# Debug mode
pnpm test:debug
```

## Test Structure

```
apps/qa/
├── e2e-tests/          # Playwright E2E tests
│   └── llm-matching.spec.ts
├── fixtures/           # Test data
│   └── vault-items.json
├── test-plans/         # Manual test documentation
│   └── llm-matching-manual.md
└── playwright.config.ts
```

## Test Coverage

### LLM Matching E2E (`llm-matching.spec.ts`)

- ✅ Phase 1: Vault item setup
- ✅ Phase 2: API key configuration
- ✅ Phase 3: Pattern + LLM matching workflow
- ✅ Phase 4: Review dialog verification
- ✅ Phase 5: Error handling (no API key, invalid fields)
- ✅ Success Criteria: Full workflow integration

## Requirements

- Desktop app must be running on `localhost:1420` (or use `webServer` config to auto-start)
- HTTP bridge on `127.0.0.1:17373` (for form posting)
- Valid Claude API key (for LLM tests)

## CI/CD

Tests can run in CI with:
```bash
CI=1 pnpm test
```

This enables:
- Retry on failure (2 retries)
- Single worker (no parallelism)
- HTML reporter for artifacts
