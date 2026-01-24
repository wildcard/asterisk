# Asterisk QA Testing

Comprehensive end-to-end testing suite for the Asterisk password manager, covering desktop app, browser extension, and LLM-powered form filling.

---

## 🚀 Quick Start

```bash
# Install dependencies
pnpm install

# Build extension (required for tests)
cd ../extension && pnpm build && cd ../qa

# Run Playwright tests (fast, headless)
pnpm test:extension

# Run native macOS tests (real Chrome, full context)
cd scripts
python3 native_extension_test.py
```

---

## 📋 Test Types

| Type | Tool | Speed | Context | CI | Best For |
|------|------|-------|---------|----|----|
| **Playwright** | TypeScript | Fast | Limited | ✅ | UI rendering, visual regression |
| **Native macOS** | Python + AppleScript | Medium | Full | ❌ | Form fill, real workflows |
| **LLM Matching** | TypeScript | Slow | Full | ⚠️ | AI field matching accuracy |

**See:** [Testing Strategy Guide](./docs/TESTING-STRATEGY.md) for when to use each type.

---

## 📖 Documentation

| Guide | Purpose |
|-------|---------|
| [Testing Strategy](./docs/TESTING-STRATEGY.md) | When to use each test type |
| [Adding Tests](./docs/ADDING-TESTS.md) | How to write new test cases |
| [Troubleshooting](./docs/TROUBLESHOOTING.md) | Common issues and fixes |
| [Calibration Guide](./docs/CALIBRATION-GUIDE.md) | Extension icon coordinate calibration |
| [Unpinned Extensions](./docs/UNPINNED-EXTENSION-HANDLING.md) | Automated pinning and fallback navigation |
| [Extension Testing](./EXTENSION-TESTING-GUIDE.md) | Deep dive on Playwright limitations |
| [Native Testing](./NATIVE-EXTENSION-TESTING.md) | macOS automation setup |

---

## 🧪 Running Tests

### Playwright Tests

```bash
# All Playwright tests
pnpm test

# Extension tests only
pnpm test:extension

# With UI (interactive)
pnpm test:ui

# Headed mode (see browser)
pnpm test:headed

# Debug mode (step through)
pnpm test:debug

# Update screenshots
pnpm test:extension --update-snapshots
```

### Native macOS Tests

```bash
cd scripts

# First time: pin the extension (recommended)
./pin-extension.sh

# Calibrate extension icon location
# (requires test server running - see below)
./calibrate_extension_icon.sh

# Run native tests
python3 native_extension_test.py
```

**Note:** Tests now automatically handle unpinned extensions via extensions menu fallback, but pinning provides better reliability.

### Test Server Commands

```bash
# Start HTTP server for calibration (port 8765)
# Required for native automation and calibration scripts
pnpm serve

# Setup desktop app integration (port 17373)
# Posts test data to HTTP bridge for Playwright tests
pnpm setup

# Full test run (setup + Playwright)
pnpm test:full
```

---

## 🏗️ Project Structure

```
apps/qa/
├── docs/                      # Documentation
│   ├── TESTING-STRATEGY.md    # When to use each test type
│   ├── ADDING-TESTS.md        # How to add tests
│   └── TROUBLESHOOTING.md     # Common issues
│
├── e2e-tests/                 # Playwright E2E tests
│   ├── extension-popup.spec.ts      # Extension UI tests (7 tests)
│   └── llm-matching.spec.ts         # LLM field matching tests
│
├── fixtures/                  # Test data
│   ├── extension-context.ts   # Extension loading helpers
│   └── vault-items.json        # Sample vault data
│
├── scripts/                   # Native automation
│   ├── calibrate_extension_icon.sh  # Interactive calibration
│   ├── native_extension_test.py     # macOS automation tests
│   ├── setup-test-form.sh           # Start test form server
│   └── .extension-coords            # Saved coordinates (git-ignored)
│
├── test-plans/                # Manual test docs
│   └── llm-matching-manual.md
│
└── playwright.config.ts       # Test configuration
```

---

## 🎯 Test Coverage

### Extension Popup Tests (Playwright)

**UI Rendering (7 tests):**
- ✅ Header displays correctly
- ✅ Footer shows connection status
- ✅ Settings button visible
- ✅ Empty state shown when no form
- ✅ Empty state displays clipboard icon
- ✅ No action buttons in empty state
- ✅ Visual regression baseline

**Native macOS Tests:**
- ✅ Extension icon click automation
- ✅ Popup content verification
- ✅ Screenshot capture
- ⏸️ Form fill workflow (manual verification)

### LLM Matching Tests (Playwright)

- ✅ Phase 1: Vault item setup
- ✅ Phase 2: API key configuration
- ✅ Phase 3: Pattern + LLM matching workflow
- ✅ Phase 4: Review dialog verification
- ✅ Phase 5: Error handling (no API key, invalid fields)

---

## 🔧 Prerequisites

### For Playwright Tests
- Node.js 20+
- pnpm 9+
- Extension built at `apps/extension/dist`

### For Native macOS Tests
- macOS (AppleScript automation)
- Chrome at `/Applications/Google Chrome.app`
- `cliclick` (installed via `brew install cliclick`)
- Extension built at `apps/extension/dist`

### For LLM Tests
- Desktop app running on `http://127.0.0.1:17373`
- Test form server on `http://127.0.0.1:8765`
- Valid Claude API key (`export CLAUDE_API_KEY="..."`)

---

## 🤖 CI/CD Integration

Tests automatically run in GitHub Actions when extension or QA code changes.

### What Runs in CI

**✅ Runs:**
- Playwright UI tests
- Visual regression tests
- Extension build verification

**❌ Skipped:**
- Desktop app connection tests (no app in CI)
- Native macOS tests (requires GUI)
- LLM tests (requires API key)

### Workflow Trigger

```yaml
# .github/workflows/extension-tests.yml
on:
  pull_request:
    paths:
      - 'apps/extension/**'
      - 'apps/qa/**'
```

### CI Environment Detection

Tests automatically skip desktop-dependent tests via:

```typescript
test.skip(process.env.CI === 'true', 'Requires local desktop app');
```

**See:** [Adding Tests Guide](./docs/ADDING-TESTS.md#skipping-tests-in-ci)

---

## 🐛 Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| Extension not found | Run `cd ../extension && pnpm build` |
| Screenshot diff failed | Run `pnpm test:extension --update-snapshots` |
| Native test clicks wrong spot | Run `./scripts/calibrate_extension_icon.sh` |
| Desktop app connection failed | Start app: `cd ../desktop && pnpm tauri dev` |
| Permission denied (macOS) | Grant Accessibility permission to Terminal |

**Full guide:** [Troubleshooting Guide](./docs/TROUBLESHOOTING.md)

---

## ➕ Adding New Tests

### Playwright Test (UI only)

```typescript
test('new feature renders correctly', async () => {
  const element = popupPage.locator('.my-feature');
  await expect(element).toBeVisible();
  await expect(element).toHaveText('Expected Text');
});
```

### Native Test (Full workflow)

```python
def test_new_workflow(self):
    self.click_extension_icon()
    self.click_button("Fill Form")
    value = self.get_form_field_value('email')
    assert value == 'expected@example.com'
```

**Full guide:** [Adding Tests Guide](./docs/ADDING-TESTS.md)

---

## 📊 Test Reports

After running tests, view results:

```bash
# Playwright HTML report
pnpm exec playwright show-report

# Or open manually
open playwright-report/index.html

# Screenshots from native tests
ls /tmp/extension-test-*.png
```

---

## 🔗 Related Documentation

- [Extension Testing Guide](./EXTENSION-TESTING-GUIDE.md) - Playwright limitations explained
- [Native Testing Guide](./NATIVE-EXTENSION-TESTING.md) - macOS automation setup
- [Quick Start Guide](./QUICK-START-NATIVE-TESTING.md) - Fast native test setup
- [Test Report](./TEST_REPORT.md) - Latest test results

---

## 🎓 Best Practices

1. **UI tests → Playwright** (fast, reliable, runs in CI)
2. **Workflow tests → Native macOS** (real Chrome, full context)
3. **Always calibrate** before running native tests (coordinates drift)
4. **Update screenshots** when UI intentionally changes
5. **Skip desktop tests in CI** using `test.skip(process.env.CI)`
6. **Use semantic selectors** (`.popup-header` not `.css-1x2y3z4`)

---

## 📝 Notes

### Playwright Limitations

Playwright tests open the popup via `chrome-extension://` URL, which means:
- ❌ Popup has no tab context (sees itself as active tab)
- ❌ Cannot test form detection or field matching
- ✅ Perfect for UI rendering and empty states

Use native macOS tests for full integration testing.

### Native Test Calibration

Extension icon coordinates change when:
- Chrome version updates
- Display resolution changes
- Chrome window is resized

Always re-run `./calibrate_extension_icon.sh` if tests start missing clicks.

---

## 🆘 Getting Help

1. Check [Troubleshooting Guide](./docs/TROUBLESHOOTING.md)
2. Run in debug mode: `PWDEBUG=1 pnpm test:extension`
3. Check test screenshots in `test-results/` or `/tmp/`
4. Open an issue with error message + environment details

---

## 🚢 Roadmap

- [ ] Add more Playwright tests for error states
- [ ] Expand native test coverage (fill verification, multiple forms)
- [ ] Add performance benchmarks for LLM matching
- [ ] Integrate native tests in CI (self-hosted macOS runner)
- [ ] Add visual regression for native screenshots

---

**Last Updated:** 2026-01-23
