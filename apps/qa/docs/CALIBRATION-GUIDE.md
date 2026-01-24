# Extension Icon Calibration Guide

This guide covers the calibration process for native macOS automation tests that require clicking the extension icon.

---

## Overview

Native automation scripts need to know the exact pixel coordinates of the extension icon in Chrome's toolbar. This is required because:

- Extension icons don't have accessible HTML elements
- macOS accessibility APIs can't find extension icons
- Coordinates vary by screen resolution and Chrome settings

---

## Prerequisites

1. **Test server running** on port 8765
2. **Chrome installed** with Asterisk extension
3. **Extension pinned** to toolbar (recommended for consistent location)

**Note:** If the extension isn't pinned, the test will automatically try to navigate the extensions menu as a fallback, but pinning provides more reliable results.

---

## Quick Start

```bash
# Terminal 1: Start test server
cd apps/qa
pnpm serve

# Terminal 2: Run calibration (in new terminal)
cd apps/qa/scripts
./calibrate_extension_icon.sh
```

Follow the on-screen instructions to click the extension icon when prompted.

---

## Step-by-Step Process

### 1. Start Test Server

The calibration scripts need a test form to load in Chrome:

```bash
cd apps/qa
pnpm serve
```

Expected output:
```
🚀 Starting test form server...
   Port: 8765
   Directory: ./../fixtures

✅ Server starting at http://127.0.0.1:8765
   Test form: http://127.0.0.1:8765/test-llm-form.html

Press Ctrl+C to stop
```

**Keep this terminal open** - the server must keep running during calibration.

### 2. Run Calibration Script

In a **new terminal**:

```bash
cd apps/qa/scripts
./calibrate_extension_icon.sh
```

### 3. Follow Interactive Prompts

The script will:

1. ✅ Open Chrome with the test form
2. ⏱️  Wait 5 seconds for page load
3. 📍 Prompt you to click the extension icon
4. 📊 Save coordinates to `.extension-coords`

**Important:** When prompted, click the **Asterisk extension icon** in Chrome's toolbar (top-right area).

### 4. Verify Calibration

After clicking, you'll see:

```
Extension icon clicked at coordinates:
X: 1234
Y: 56
```

The script automatically saves these to `apps/qa/scripts/.extension-coords`.

### 5. Test the Calibration

Run a native test to verify:

```bash
python3 native_extension_test.py
```

Expected behavior:
- Chrome opens
- Extension popup appears
- Form fields are detected
- Test passes with "TEST PASSED" output

---

## Calibration Scripts

| Script | Mode | Best For |
|--------|------|----------|
| `calibrate_extension_icon.sh` | Interactive | First-time setup |
| `calibrate_extension_icon_auto.sh` | Automated | CI/CD or re-calibration |
| `calibrate_simple.sh` | Minimal | Quick coordinate capture |
| `calibrate_manual_quick.sh` | Fast | Known coordinates |

### Recommended: Interactive Script

For most users:

```bash
./calibrate_extension_icon.sh
```

This provides clear prompts and visual feedback.

---

## Coordinate Storage

Coordinates are saved to `.extension-coords`:

```
1234,56
```

Format: `X,Y` (comma-separated, no spaces)

### File Location

```
apps/qa/scripts/.extension-coords
```

**Note:** This file is git-ignored because coordinates are machine-specific.

---

## Troubleshooting

### Issue: Chrome opens but page is blank

**Cause:** Test server not running

**Solution:**
```bash
# Terminal 1: Start server
cd apps/qa && pnpm serve

# Terminal 2: Retry calibration
cd apps/qa/scripts && ./calibrate_extension_icon.sh
```

---

### Issue: "File not found" error for test form

**Cause:** Server not serving correct files

**Solution:**

Check server logs - should see symlink creation:
```
🔗 Creating symlink: test-form.html → test-llm-form.html
```

If missing, run server script manually:
```bash
cd apps/qa/scripts
./start-test-server.sh
```

---

### Issue: Extension icon not visible

**Cause:** Extension not pinned or not installed

**Solution Option 1 (Automated):**
```bash
cd apps/qa/scripts
./pin-extension.sh
```

This opens Chrome to help you pin the extension with visual guidance.

**Solution Option 2 (Manual):**

1. Open Chrome extensions page: `chrome://extensions`
2. Find "Asterisk Password Manager"
3. Click the pin icon 📌 to pin to toolbar
4. Retry calibration

**Solution Option 3 (Fallback):**

The native test now automatically handles unpinned extensions by navigating the extensions menu. However, pinning is still recommended for consistent calibration.

---

### Issue: Coordinates don't work after calibration

**Cause:** Screen resolution or Chrome window size changed

**Solution:**

Re-run calibration:
```bash
./calibrate_extension_icon.sh
```

Coordinates are resolution-specific.

---

### Issue: Click captures wrong element

**Cause:** Clicked too fast or missed the icon

**Solution:**

1. Wait for full page load (5 seconds)
2. Carefully click the **center** of the extension icon
3. Icon should be in top-right toolbar area
4. Retry if you clicked wrong element

---

## Advanced Usage

### Manual Coordinate Entry

If you know the coordinates:

```bash
echo "1234,56" > .extension-coords
```

### Multiple Resolutions

Create resolution-specific coordinate files:

```bash
# 1080p display
./calibrate_extension_icon.sh
mv .extension-coords .extension-coords-1080p

# 4K display
./calibrate_extension_icon.sh
mv .extension-coords .extension-coords-4k
```

Load based on resolution:
```bash
if [[ $(system_profiler SPDisplaysDataType | grep Resolution) =~ "3840" ]]; then
  cp .extension-coords-4k .extension-coords
else
  cp .extension-coords-1080p .extension-coords
fi
```

### Automated Re-calibration

```bash
# Use auto script for non-interactive environments
./calibrate_extension_icon_auto.sh
```

This uses screen capture + image recognition (experimental).

---

## CI/CD Integration

**Calibration is not supported in CI** because:

- Requires interactive clicking
- Screen coordinates vary by runner
- Extension icon location not deterministic

### Workaround

Skip coordinate-dependent tests in CI:

```typescript
test('form fill via extension', async ({ page }) => {
  if (process.env.CI) {
    test.skip('Requires calibrated coordinates');
  }
  // Test logic...
});
```

---

## How It Works

### 1. AppleScript Click Capture

The script uses `osascript` to:

```applescript
tell application "System Events"
  set {x, y} to position of (click at mouse location)
end tell
```

### 2. Coordinate Storage

Saves to `.extension-coords`:
```bash
echo "$X,$Y" > .extension-coords
```

### 3. Test Script Reads Coordinates

```python
def read_coords(self):
    with open('.extension-coords') as f:
        x, y = f.read().strip().split(',')
        return int(x), int(y)
```

### 4. Click Extension Icon

```python
def click_extension_icon(self):
    x, y = self.read_coords()
    subprocess.run(['osascript', '-e', f'''
        tell application "System Events"
            click at {{{x}, {y}}}
        end tell
    '''])
```

---

## Best Practices

1. **Calibrate once per machine** - coordinates are stable unless resolution changes
2. **Pin the extension** - unpinned icons move around
3. **Keep Chrome maximized** - consistent window size
4. **Test after calibration** - verify coordinates work before committing to tests
5. **Recalibrate after Chrome updates** - toolbar layout may change

---

## FAQ

### Q: Do I need to recalibrate often?

**A:** No. Once per machine unless:
- Screen resolution changes
- Chrome window size changes significantly
- Extension position changes (unpinned/repinned)

### Q: Can I share coordinates with teammates?

**A:** No. Coordinates are machine-specific (resolution, DPI, Chrome settings).

### Q: Why not use Playwright for this?

**A:** Playwright can't access Chrome extension icons - they're outside the DOM. Native automation is required.

### Q: Does this work on Windows/Linux?

**A:** Not currently. This uses macOS-specific AppleScript. Windows would need AutoHotkey or similar, Linux would need xdotool.

---

## Next Steps

After successful calibration:

1. **Run native tests:** `python3 native_extension_test.py`
2. **Add more test cases:** See [ADDING-TESTS.md](./ADDING-TESTS.md)
3. **Integrate with workflows:** See [TESTING-STRATEGY.md](./TESTING-STRATEGY.md)

---

## Related Documentation

- [Native Extension Testing Guide](../NATIVE-EXTENSION-TESTING.md)
- [Troubleshooting Guide](./TROUBLESHOOTING.md)
- [Testing Strategy](./TESTING-STRATEGY.md)
