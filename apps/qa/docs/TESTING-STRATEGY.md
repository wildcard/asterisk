# Testing Strategy

This document explains when to use each test type in the Asterisk QA suite.

## Test Types Overview

| Test Type | Tool | Speed | Context Accuracy | CI Support | Use For |
|-----------|------|-------|------------------|------------|---------|
| **Playwright** | `pnpm test` | Fast | Limited | ✅ Yes | UI rendering, empty states, visual regression |
| **Native macOS** | `native_extension_test.py` | Medium | Full | ❌ Manual | Real extension behavior, form filling, tab context |
| **Manual** | Human tester | Slow | Full | ❌ Manual | Complex workflows, edge cases |

---

## Decision Tree

```
Does the test need real tab context (form detection, field matching)?
├─ YES → Native macOS automation
│         Examples: Form fill workflow, matched fields count, connection status
│
└─ NO → Does it test UI rendering only?
    ├─ YES → Playwright
    │         Examples: Empty states, header/footer, settings button
    │
    └─ NO → Manual testing
              Examples: Settings changes, multi-step workflows
```

---

## When to Use Playwright

**Strengths:**
- ✅ Fast execution (runs headless)
- ✅ Reliable selectors and assertions
- ✅ Screenshot comparison for visual regression
- ✅ Works in CI/CD pipelines
- ✅ Parallel test execution

**Limitations:**
- ❌ Popup opens without tab context (sees itself as active tab)
- ❌ Cannot test form detection or field matching
- ❌ Cannot test fill functionality

**Best For:**
- UI component rendering
- Empty state verification
- Connection status display
- Settings button presence
- Visual regression testing
- Error message rendering

**Example Tests:**
```typescript
// ✅ Good Playwright test
test('shows empty state when no form detected', async () => {
  const emptyState = popupPage.locator('.empty-state');
  await expect(emptyState).toBeVisible();
});

// ❌ Bad Playwright test (requires tab context)
test('shows matched field count', async () => {
  // This will fail - popup has no tab context
  const matchedFields = popupPage.locator('.matched-fields-count');
  await expect(matchedFields).toContainText('3 fields');
});
```

---

## When to Use Native macOS Automation

**Strengths:**
- ✅ Real Chrome extension behavior
- ✅ Full tab context (form page is active tab)
- ✅ Tests actual user workflow
- ✅ Can verify form fill functionality
- ✅ Screenshot verification

**Limitations:**
- ❌ Requires macOS and Chrome
- ❌ Cannot run in CI without macOS runners
- ❌ Slower than Playwright
- ❌ Requires calibration for extension icon coordinates

**Best For:**
- Form detection verification
- Matched fields display
- Fill button functionality
- Real form filling and validation
- Desktop app connection testing
- End-to-end user workflows

**Example Tests:**
```python
# ✅ Good native test
def test_form_detection(self):
    """Verify extension detects form on page"""
    self.click_extension_icon()
    screenshot = self.take_screenshot("form-detected")
    assert self.verify_form_status_in_screenshot(screenshot)

# Also good - tests full workflow
def test_fill_all_fields(self):
    """Verify clicking fill populates form fields"""
    self.click_extension_icon()
    self.click_fill_button()
    form_data = self.read_form_values()
    assert form_data['email'] == 'test@example.com'
```

---

## When to Use Manual Testing

**Best For:**
- Complex multi-step workflows
- Settings configuration changes
- OAuth or authentication flows
- Testing across different environments
- Edge cases not worth automating
- Exploratory testing

**Examples:**
- Installing extension from Chrome Web Store
- Testing with real 1Password data
- Multi-tab scenarios
- Browser restart persistence

---

## CI/CD Strategy

### What Runs in CI

**Playwright Tests:**
- ✅ All UI rendering tests
- ✅ Empty state verification
- ✅ Visual regression
- ⏭️ Skip tests that check desktop app connection (use `test.skip()`)

**Native Tests:**
- ❌ Cannot run in standard CI (requires macOS + GUI)
- ⚠️ Could run on self-hosted macOS runners (future enhancement)

### CI Environment Detection

Tests automatically detect CI environment via `process.env.CI`:

```typescript
test.describe('Desktop Connection', () => {
  test.skip(process.env.CI === 'true', 'Requires local desktop app');

  test('shows connected status', async () => {
    // Only runs locally
  });
});
```

---

## Test Coverage Goals

| Feature | Playwright | Native | Manual |
|---------|------------|--------|--------|
| Popup renders | ✅ | ✅ | ✅ |
| Empty state | ✅ | - | ✅ |
| Form detection | ❌ | ✅ | ✅ |
| Field matching | ❌ | ✅ | ✅ |
| Fill functionality | ❌ | ✅ | ✅ |
| Settings UI | ✅ | - | ✅ |
| Error handling | ✅ | ✅ | ✅ |

---

## Adding New Tests

Before adding a test, ask:

1. **Does it need tab context?**
   - NO → Playwright
   - YES → Native macOS

2. **Will it run in CI?**
   - YES → Playwright
   - NO → Native or Manual

3. **Is it testing visual appearance?**
   - YES → Playwright with screenshot comparison
   - NO → Consider native or API testing

See [ADDING-TESTS.md](./ADDING-TESTS.md) for implementation guides.

---

## Running Tests Locally

```bash
# Quick UI check (Playwright only)
cd apps/qa
pnpm test:extension

# Full local test (Native macOS)
cd apps/qa/scripts
python3 native_extension_test.py

# Interactive calibration (first time only)
cd apps/qa/scripts
./calibrate_extension_icon.sh
```

---

## References

- [ADDING-TESTS.md](./ADDING-TESTS.md) - How to write new tests
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - Common issues
- [Extension Testing Guide](../EXTENSION-TESTING-GUIDE.md) - Deep dive on limitations
