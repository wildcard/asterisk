# Quick Start: Native Extension Testing

Complete automation for Chrome extension testing using macOS native tools.

## 🚀 Quick Start (3 Steps)

### 1. Install Prerequisites

```bash
# Install cliclick
brew install cliclick

# Build extension
cd apps/extension && pnpm build
```

### 2. Calibrate Extension Icon Position

```bash
cd apps/qa/scripts
./calibrate_extension_icon.sh
```

**What this does:**
- Launches Chrome with your extension
- Waits for you to hover over the extension icon
- Captures the exact coordinates
- Tests the click to verify
- Saves coordinates to `.extension-coords`

### 3. Run Automated Tests

```bash
python3 native_extension_test.py
```

**What this does:**
- Launches Chrome with extension
- Opens test form
- Clicks extension icon (using calibrated coordinates)
- Takes screenshots
- Verifies popup content
- Reports results

## 📊 What Can Be Tested

With this approach, you can test:

✅ **Extension icon click** - Actually clicks the icon
✅ **Proper tab context** - Popup sees the form page as active tab
✅ **Form detection** - Verifies "Form Detected" message
✅ **Match statistics** - Counts matched/unmatched fields
✅ **Fill functionality** - Clicks fill and verifies form populated
✅ **Connection status** - Checks desktop app connection
✅ **Visual verification** - Screenshots for manual review

## 🔄 Workflow Comparison

### Playwright Tests (Existing)
```bash
pnpm test:extension
# ✅ Fast (3.3s)
# ✅ CI/CD ready
# ❌ No tab context
# ❌ Can't test form detection
# ✅ 7 tests passing
```

### Native Tests (New)
```bash
python3 native_extension_test.py
# ⏱️ Slower (~10s)
# ❌ macOS only
# ✅ Full tab context
# ✅ Tests everything
# ✅ Real user simulation
```

## 📁 Files Created

| File | Purpose |
|------|---------|
| `scripts/native_extension_test.py` | Main test automation script |
| `scripts/calibrate_extension_icon.sh` | Interactive calibration tool |
| `scripts/test-extension-native.sh` | Manual testing helper (bash) |
| `scripts/verify-popup-content.applescript` | Accessibility API reader |
| `scripts/.extension-coords` | Saved coordinates (gitignored) |
| `NATIVE-EXTENSION-TESTING.md` | Complete documentation |

## 🎯 Recommended Usage

**For local development:**
1. Run calibration once: `./calibrate_extension_icon.sh`
2. Run before commits: `python3 native_extension_test.py`
3. Quick Playwright tests: `pnpm test:extension`

**For CI/CD:**
- Use Playwright tests only (faster, no GUI needed)
- Run native tests manually before major releases

**For debugging:**
- Use native tests to verify actual user experience
- Screenshots help identify visual issues
- Accessibility verification catches missing elements

## 🔧 Troubleshooting

### "cliclick not found"
```bash
brew install cliclick
```

### "Extension not built"
```bash
cd apps/extension && pnpm build
```

### "Click missed the icon"
```bash
# Re-run calibration
cd apps/qa/scripts
./calibrate_extension_icon.sh

# Make sure you hover EXACTLY over the icon's center
```

### "Popup didn't open"
- Check if extension loaded: Visit `chrome://extensions`
- Verify icon is visible (not in overflow menu)
- Try clicking manually first to verify extension works

### "Permission denied for Accessibility"
```bash
# Grant Terminal accessibility permissions:
# System Preferences → Security & Privacy → Privacy → Accessibility
# Add Terminal.app (or iTerm.app)
# Restart Terminal
```

## 📈 Success Metrics

**Calibration successful if:**
- Extension popup opens after automated click
- "Asterisk Form Filler" title visible in screenshot
- Accessibility verification returns true

**Test successful if:**
- Form detection status shows "Form Detected"
- Matched field count is > 0
- Fill button is visible and enabled
- Screenshot shows expected popup layout

## 🚧 Limitations

1. **macOS only** - AppleScript/cliclick are macOS-specific
2. **Requires calibration** - Must run calibration once per machine
3. **GUI required** - Can't run headless/in CI
4. **Slower** - Takes ~10s vs Playwright's 3s
5. **Resolution dependent** - Coordinates change if resolution changes

## 🔮 Future Enhancements

1. **Image recognition** - Auto-find icon using OpenCV
2. **Multi-resolution** - Auto-adjust for different screens
3. **Parallel testing** - Run multiple instances
4. **Cross-platform** - Port to Linux (xdotool) and Windows (AutoIt)
5. **Integration** - Combine with Playwright for hybrid approach

## 📚 Full Documentation

For detailed information, see:
- [NATIVE-EXTENSION-TESTING.md](./NATIVE-EXTENSION-TESTING.md) - Complete guide
- [EXTENSION-TESTING-GUIDE.md](./EXTENSION-TESTING-GUIDE.md) - Playwright tests

## ✅ Quick Verification

Run this to verify everything is working:

```bash
# 1. Install
brew list cliclick || brew install cliclick

# 2. Build
cd ../../extension && pnpm build && cd -

# 3. Calibrate
./calibrate_extension_icon.sh

# 4. Test
python3 native_extension_test.py

# Expected output:
# ✅ All prerequisites met
# ✅ Chrome launched and activated
# ✅ Popup should be open
# ✅ TEST PASSED
```

---

**🎉 You now have fully automated extension testing that actually works!**
