# Adding Tests

This guide shows how to add new test cases to the Asterisk QA suite.

## Quick Reference

| Test Type | File to Edit | When to Use |
|-----------|-------------|-------------|
| Playwright | `e2e-tests/extension-popup.spec.ts` | UI rendering, empty states |
| Native macOS | `scripts/native_extension_test.py` | Form detection, fill functionality |

---

## Adding Playwright Tests

### 1. Basic Test Structure

```typescript
test.describe('Feature Name', () => {
  let context: BrowserContext;
  let extensionId: string;
  let popupPage: Page;

  test.beforeAll(async () => {
    const ctx = await createExtensionContext();
    context = ctx.context;
    extensionId = ctx.extensionId;
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.beforeEach(async () => {
    popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(500);
  });

  test.afterEach(async () => {
    await popupPage?.close();
  });

  test('your test name', async () => {
    // Your test code
  });
});
```

### 2. Common Assertions

```typescript
// Element visibility
const element = popupPage.locator('.my-selector');
await expect(element).toBeVisible();
await expect(element).toBeHidden();

// Text content
await expect(element).toHaveText('exact text');
await expect(element).toContainText('partial text');
await expect(element).toContainText(/regex pattern/i);

// Attributes
await expect(element).toHaveAttribute('disabled');
await expect(element).toHaveClass(/active/);

// Counts
const items = popupPage.locator('.list-item');
await expect(items).toHaveCount(3);

// Screenshots (visual regression)
await expect(popupPage).toHaveScreenshot('my-feature.png', {
  maxDiffPixels: 100,
});
```

### 3. Testing Error States

```typescript
test('shows error when desktop app offline', async () => {
  // Mock the desktop app being offline
  await popupPage.route('http://127.0.0.1:17373/**', route =>
    route.abort('failed')
  );

  await popupPage.reload();
  await popupPage.waitForTimeout(500);

  const errorMessage = popupPage.locator('.error-message');
  await expect(errorMessage).toBeVisible();
  await expect(errorMessage).toContainText(/Desktop app not connected/i);
});
```

### 4. Skipping Tests in CI

```typescript
test.describe('Desktop Connection Tests', () => {
  test.skip(process.env.CI === 'true', 'Requires local desktop app');

  test('shows connected status', async () => {
    // Test requires real desktop app
  });
});
```

### 5. Test Helpers

Add reusable helpers to `fixtures/extension-context.ts`:

```typescript
/**
 * Helper to check if running in CI
 */
export function skipInCI() {
  return process.env.CI === 'true';
}

/**
 * Helper to mock desktop app offline state
 */
export async function mockDesktopOffline(page: Page) {
  await page.route('http://127.0.0.1:17373/**', route =>
    route.abort('failed')
  );
}

/**
 * Helper to wait for popup to finish loading
 */
export async function waitForPopupReady(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(500);

  // Wait for loading spinner to disappear
  const spinner = page.locator('.loading-spinner');
  await spinner.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {
    // Spinner may not exist, that's ok
  });
}
```

---

## Adding Native macOS Tests

### 1. Adding Verification Methods

Edit `scripts/native_extension_test.py` and add methods to the `ChromeExtensionTester` class:

```python
def verify_fill_button_enabled(self):
    """Verify the fill button is enabled and clickable"""
    print("🔍 Checking fill button state...")

    script = """
    tell application "System Events"
        tell process "Google Chrome"
            set fillButton to button "Fill All Matched Fields" of front window
            return enabled of fillButton
        end tell
    end tell
    """

    result = subprocess.run(
        ["osascript", "-e", script],
        capture_output=True,
        text=True
    )

    is_enabled = "true" in result.stdout.lower()
    print(f"   Fill button enabled: {is_enabled}")
    return is_enabled

def click_fill_button(self):
    """Click the fill button using AppleScript"""
    print("🖱️  Clicking fill button...")

    script = """
    tell application "System Events"
        tell process "Google Chrome"
            click button "Fill All Matched Fields" of front window
        end tell
    end tell
    """

    subprocess.run(["osascript", "-e", script], check=True)
    time.sleep(1)
    print("✅ Fill button clicked")

def get_form_field_value(self, field_id):
    """Get value of a form field using JavaScript injection"""
    print(f"🔍 Reading form field: {field_id}")

    script = f"""
    tell application "Google Chrome"
        tell active tab of window 1
            execute javascript "document.getElementById('{field_id}').value"
        end tell
    end tell
    """

    result = subprocess.run(
        ["osascript", "-e", script],
        capture_output=True,
        text=True
    )

    value = result.stdout.strip()
    print(f"   Value: {value}")
    return value
```

### 2. Adding Full Test Flows

```python
def test_form_fill_workflow(self):
    """Test the complete form fill workflow"""
    print("\n" + "="*50)
    print("TEST: Form Fill Workflow")
    print("="*50)

    # 1. Open popup
    icon_pos = self.find_extension_icon()
    self.click_extension_icon(*icon_pos)

    # 2. Verify form detected
    assert self.verify_popup_content(), "Form detection failed"

    # 3. Check fill button is enabled
    assert self.verify_fill_button_enabled(), "Fill button not enabled"

    # 4. Click fill button
    self.click_fill_button()

    # 5. Verify fields were filled
    email = self.get_form_field_value('email')
    assert email == 'test@example.com', f"Email not filled correctly: {email}"

    name = self.get_form_field_value('name')
    assert name == 'John Doe', f"Name not filled correctly: {name}"

    # 6. Take screenshot
    self.take_screenshot("form-filled")

    print("✅ Form fill workflow passed")
```

### 3. Running Your New Test

```python
def run(self):
    """Run the full test suite"""
    try:
        if not self.check_prerequisites():
            return False

        self.launch_chrome()

        # Run original tests
        icon_pos = self.find_extension_icon()
        self.click_extension_icon(*icon_pos)
        self.take_screenshot("popup-open")
        verification_passed = self.verify_popup_content()

        # Run new test
        new_test_passed = self.test_form_fill_workflow()

        # Overall result
        all_passed = verification_passed and new_test_passed

        print("\n" + "="*50)
        if all_passed:
            print("✅ ALL TESTS PASSED")
        else:
            print("❌ SOME TESTS FAILED")
        print("="*50)

        return all_passed

    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        self.cleanup()
```

---

## Test Data Management

### Seeding Vault Data

Use the `seedVaultData` helper to populate test data:

```typescript
import vaultItems from '../fixtures/vault-items.json' with { type: 'json' };

test.beforeEach(async () => {
  await seedVaultData(vaultItems);
  // Now popup will have data to match against
});
```

### Custom Test Data

Create a new fixture file:

```json
// fixtures/custom-vault-items.json
[
  {
    "id": "test-item-1",
    "name": "Test Login",
    "username": "test@example.com",
    "password": "password123",
    "fields": [
      { "name": "email", "value": "test@example.com" },
      { "name": "username", "value": "testuser" }
    ]
  }
]
```

---

## Visual Regression Testing

### Taking Screenshots

```typescript
test('feature matches expected design', async () => {
  await expect(popupPage).toHaveScreenshot('feature-name.png', {
    maxDiffPixels: 100,
  });
});
```

### Updating Screenshots

When the UI intentionally changes:

```bash
# Update all screenshots
cd apps/qa
pnpm test:extension --update-snapshots

# Update specific test
pnpm test:extension --update-snapshots -g "feature name"
```

### Screenshot Location

Screenshots are stored in:
- **Baseline:** `apps/qa/e2e-tests/extension-popup.spec.ts-snapshots/`
- **Diff images:** `apps/qa/test-results/` (when tests fail)

---

## Testing Checklist

Before submitting a PR with new tests:

- [ ] Tests pass locally
- [ ] Test names clearly describe what they verify
- [ ] CI-incompatible tests are marked with `.skip(process.env.CI)`
- [ ] Test data is in fixtures, not hardcoded
- [ ] Screenshots are updated if UI changed
- [ ] Documentation updated if test strategy changed

---

## Examples to Follow

### Good Playwright Test
```typescript
test('displays connection status in footer', async () => {
  const footer = popupPage.locator('.popup-footer');
  await expect(footer).toBeVisible();

  const status = popupPage.locator('.connection-status');
  await expect(status).toContainText(/Desktop app/i);
});
```

**Why it's good:**
- ✅ Clear test name
- ✅ Tests UI rendering only
- ✅ Uses semantic selectors
- ✅ Works without tab context

### Good Native Test
```python
def verify_form_detection(self):
    """Verify extension detects form fields on page"""
    script = """
    tell application "System Events"
        tell process "Google Chrome"
            set statusText to value of static text 1 of front window
            return statusText contains "Form Detected"
        end tell
    end tell
    """

    result = subprocess.run(
        ["osascript", "-e", script],
        capture_output=True,
        text=True
    )

    return "true" in result.stdout.lower()
```

**Why it's good:**
- ✅ Tests real extension behavior
- ✅ Uses AppleScript for accurate verification
- ✅ Returns boolean for easy assertion
- ✅ Includes helpful print statements

---

## Troubleshooting

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for common issues when adding tests.
