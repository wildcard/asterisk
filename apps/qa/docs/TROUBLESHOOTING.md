# Troubleshooting

Common issues and solutions when running Asterisk QA tests.

---

## Playwright Tests

### Issue: "Extension not found" or "Cannot find extension ID"

**Symptom:**
```
Error: Timeout waiting for service worker
```

**Cause:** Extension not built or build is outdated

**Solution:**
```bash
cd apps/extension
pnpm install
pnpm build

# Verify dist directory exists
ls dist/
```

---

### Issue: Tests fail with "Cannot access chrome-extension://"

**Symptom:**
```
Error: net::ERR_FAILED at chrome-extension://...
```

**Cause:** Extension not loaded in browser context

**Solution:**
1. Check that `EXTENSION_PATH` in `fixtures/extension-context.ts` is correct
2. Verify extension built successfully
3. Try deleting `node_modules/.cache` and running again

```bash
rm -rf node_modules/.cache
pnpm test:extension
```

---

### Issue: "Screenshot comparison failed"

**Symptom:**
```
Error: Screenshot comparison failed.
Expected: ...
Actual: ...
```

**Cause:** UI changed or baseline screenshot is outdated

**Solution:**

If the change is **intentional:**
```bash
# Update all screenshots
pnpm test:extension --update-snapshots

# Update specific test only
pnpm test:extension --update-snapshots -g "test name"
```

If the change is **unintentional:**
- Check recent commits for CSS changes
- Look at diff image in `test-results/`
- Fix the UI bug and re-run tests

---

### Issue: Tests timeout waiting for elements

**Symptom:**
```
Error: Timeout 30000ms exceeded waiting for locator('.my-element')
```

**Solutions:**

1. **Increase timeout for slow elements:**
```typescript
await expect(element).toBeVisible({ timeout: 10000 });
```

2. **Wait for loading to complete:**
```typescript
await popupPage.waitForLoadState('domcontentloaded');
await popupPage.waitForTimeout(500);
```

3. **Check if element selector is correct:**
```typescript
// Use Playwright Inspector
PWDEBUG=1 pnpm test:extension
```

---

### Issue: Desktop app connection tests fail in CI

**Symptom:**
```
Error: Desktop app not connected
```

**Expected:** This is normal - desktop app tests cannot run in CI

**Solution:**

Mark tests that need desktop app:
```typescript
test.describe('Desktop Connection', () => {
  test.skip(process.env.CI === 'true', 'Requires local desktop app');

  test('shows connected status', async () => {
    // Only runs locally
  });
});
```

---

## Native macOS Tests

### Issue: "cliclick command not found"

**Symptom:**
```bash
$ python3 native_extension_test.py
Error: cliclick not found
```

**Solution:**
```bash
brew install cliclick
```

---

### Issue: Extension icon click misses

**Symptom:**
- Script runs but popup doesn't open
- Click happens at wrong location

**Cause:** Extension icon coordinates not calibrated

**Solution:**

1. **Run calibration tool:**
```bash
cd apps/qa/scripts
./calibrate_extension_icon.sh
```

2. **Follow interactive prompts:**
- Click extension icon when prompted
- Coordinates saved to `.extension-coords`

3. **Re-run test:**
```bash
python3 native_extension_test.py
```

---

### Issue: AppleScript permission denied

**Symptom:**
```
System Events got an error: operation not permitted
```

**Cause:** macOS accessibility permissions not granted

**Solution:**

1. Open **System Settings → Privacy & Security → Accessibility**
2. Grant permission to:
   - Terminal (or iTerm)
   - Python
   - osascript (if listed)
3. Restart terminal and try again

**Alternative:** Run via GUI automation permission:
```bash
# Grant permission via command line
sudo sqlite3 /Library/Application\ Support/com.apple.TCC/TCC.db \
  "INSERT OR REPLACE INTO access VALUES('kTCCServiceAccessibility','com.apple.Terminal',0,1,1,NULL,NULL,NULL,'UNUSED',NULL,0,1541440109);"
```

---

### Issue: Chrome opens but form page doesn't load

**Symptom:**
- Chrome launches successfully
- Test form server not responding

**Cause:** Test form server not running

**Solution:**

1. **Check if server is running:**
```bash
curl http://127.0.0.1:8765/test-llm-form.html
```

2. **Start test form server:**
```bash
cd apps/qa
pnpm serve

# Or manually (runs Python HTTP server on port 8765)
cd scripts
./start-test-server.sh
```

**Note:** `pnpm setup` is different - it posts to the desktop app bridge (port 17373) for Playwright tests, not the calibration server.

---

### Issue: Screenshots saved but test still fails

**Symptom:**
- Screenshots appear in `/tmp/`
- Verification still reports failure

**Cause:** AppleScript cannot read popup content (accessibility API issue)

**Workaround:**

1. **Use screenshot-based verification instead:**
```python
def verify_via_screenshot(self):
    """Verify popup state by analyzing screenshot"""
    import subprocess
    from PIL import Image
    import pytesseract

    screenshot_path = self.take_screenshot("verify")

    # Use OCR to read text from screenshot
    img = Image.open(screenshot_path)
    text = pytesseract.image_to_string(img)

    return "Asterisk" in text or "Form Detected" in text
```

2. **Or use manual verification:**
- Check screenshots in `/tmp/extension-test-*.png`
- Manually verify popup opened correctly

---

### Issue: Chrome window not activating

**Symptom:**
- Chrome opens but stays in background
- Clicks don't work

**Solution:**

Add explicit window activation:
```python
subprocess.run([
    "osascript", "-e",
    'tell application "Google Chrome" to activate'
])
time.sleep(1)  # Wait for activation
```

---

## CI/CD Issues

### Issue: GitHub Actions fails with "Extension not built"

**Symptom:**
```
Error: ENOENT: no such file or directory 'apps/extension/dist'
```

**Cause:** Extension build step missing or failed

**Solution:**

Check workflow includes build step:
```yaml
- name: Build extension
  run: cd apps/extension && pnpm build

- name: Verify build
  run: ls -la apps/extension/dist
```

---

### Issue: Playwright install fails in CI

**Symptom:**
```
Error: Executable doesn't exist at /home/runner/.cache/ms-playwright/chromium-1234
```

**Solution:**

Add Playwright browser install step:
```yaml
- name: Install Playwright browsers
  run: cd apps/qa && npx playwright install chromium
```

---

### Issue: Path filters not working in GitHub Actions

**Symptom:**
- Workflow runs even when unrelated files change

**Cause:** Path filter syntax error

**Solution:**

Use correct glob patterns:
```yaml
on:
  pull_request:
    paths:
      - 'apps/extension/**'  # ✅ Correct
      - 'apps/qa/**'
      # - apps/extension/*   # ❌ Wrong (no quotes, wrong glob)
```

---

## Desktop App Issues

### Issue: Desktop app not responding on port 17373

**Symptom:**
```
Error: connect ECONNREFUSED 127.0.0.1:17373
```

**Cause:** Desktop app not running or crashed

**Solution:**

1. **Check if app is running:**
```bash
lsof -i :17373
# or
curl http://127.0.0.1:17373/health
```

2. **Start desktop app:**
```bash
cd apps/desktop
pnpm tauri dev
```

3. **Check app logs:**
```bash
# macOS logs location
~/Library/Logs/asterisk/app.log
```

---

### Issue: Vault data not seeding

**Symptom:**
- Tests run but vault is empty
- No matched fields in popup

**Cause:** Desktop app API not accepting data

**Solution:**

1. **Verify API endpoint:**
```bash
curl -X POST http://127.0.0.1:17373/v1/vault \
  -H "Content-Type: application/json" \
  -d '{"id":"test","name":"Test Item"}'
```

2. **Check response:**
- 200 OK → API working
- 404 → Endpoint doesn't exist
- 500 → Server error (check app logs)

---

## Test Data Issues

### Issue: "Cannot find module 'vault-items.json'"

**Symptom:**
```
Error: Cannot find module '../fixtures/vault-items.json'
```

**Solution:**

1. **Check file exists:**
```bash
ls apps/qa/fixtures/vault-items.json
```

2. **Use correct import syntax:**
```typescript
// ✅ Correct (with import attributes)
import vaultItems from '../fixtures/vault-items.json' with { type: 'json' };

// ❌ Wrong (old syntax)
import vaultItems from '../fixtures/vault-items.json';
```

---

## Performance Issues

### Issue: Tests run very slowly

**Possible causes and solutions:**

1. **Too many screenshots:**
```typescript
// Reduce screenshot frequency
test('visual check', async () => {
  // Only screenshot critical states
  await expect(popupPage).toHaveScreenshot('final-state.png');
});
```

2. **Excessive waits:**
```typescript
// ❌ Bad
await popupPage.waitForTimeout(5000);

// ✅ Better
await expect(element).toBeVisible({ timeout: 5000 });
```

3. **Not running in parallel:**
```bash
# Run tests in parallel
pnpm test:extension --workers=4
```

---

## Getting Help

If you encounter an issue not listed here:

1. **Check test output:** Look for specific error messages
2. **Check screenshots:** Visual artifacts often reveal the issue
3. **Run in debug mode:**
   ```bash
   # Playwright debug
   PWDEBUG=1 pnpm test:extension

   # Native test verbose
   python3 native_extension_test.py --verbose
   ```
4. **Check recent changes:** `git log apps/qa` or `git log apps/extension`
5. **Ask the team:** Open an issue with:
   - Error message
   - Steps to reproduce
   - Screenshots/logs
   - Environment (OS, Chrome version, etc.)

---

## Useful Commands

```bash
# Clean test artifacts
rm -rf apps/qa/test-results
rm -rf apps/qa/playwright-report

# Reset extension
cd apps/extension
rm -rf dist node_modules/.cache
pnpm install && pnpm build

# View test report
cd apps/qa
pnpm exec playwright show-report

# Update all screenshots
pnpm test:extension --update-snapshots

# Run specific test file
pnpm test:extension extension-popup.spec.ts

# Run tests matching pattern
pnpm test:extension -g "empty state"
```
