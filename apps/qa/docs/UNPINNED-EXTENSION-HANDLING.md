# Handling Unpinned Extensions

This document explains the solutions implemented for handling unpinned browser extensions in native automation tests.

---

## The Problem

When a Chrome extension isn't pinned to the toolbar:
- It appears inside the **extensions menu** (puzzle piece icon 🧩)
- Calibrated coordinates point to the puzzle piece, not the extension
- Clicking opens a dropdown menu instead of the extension popup
- Tests fail because the expected popup doesn't appear

---

## Solutions Implemented

### Solution A: Automated Pinning Script

**File:** `apps/qa/scripts/pin-extension.sh`

A helper script that guides users through pinning the extension.

**Usage:**
```bash
cd apps/qa/scripts
./pin-extension.sh
```

**What it does:**
1. Launches Chrome with the extension loaded
2. Opens to `chrome://extensions` page
3. Provides clear instructions for pinning
4. Waits for user to complete pinning

**Benefits:**
- One-time setup
- Consistent coordinates after pinning
- More reliable test execution

---

### Solution B: Fallback Menu Navigation

**File:** `apps/qa/scripts/native_extension_test.py`

Enhanced the native test to automatically handle unpinned extensions.

**Logic Flow:**

```
1. Click coordinates (calibrated or estimated)
   ↓
2. Wait for popup
   ↓
3. Check if "Asterisk" in window title/UI
   ↓
   Yes → Continue with test ✅
   ↓
   No → Extensions menu opened
   ↓
4. Navigate extensions menu to find Asterisk
   ↓
5. Click Asterisk in menu
   ↓
6. Continue with test
```

**Implementation:**

```python
def click_extension_icon(self, x, y):
    """Click icon with fallback for unpinned extensions"""
    subprocess.run(["cliclick", f"c:{x},{y}"])
    time.sleep(2)

    # Check if we opened extensions menu
    if self.is_extensions_menu_open():
        print("   ℹ️  Extensions menu opened (extension not pinned)")
        print("   🔄 Trying fallback: navigate extensions menu...")
        self.navigate_extensions_menu()
    else:
        print("✅ Popup should be open\n")
```

**Detection Method:**

```python
def is_extensions_menu_open(self):
    """Check if Asterisk popup opened vs extensions menu"""
    # If window doesn't contain "Asterisk", we clicked wrong thing
    script = """
    tell application "System Events"
        tell process "Google Chrome"
            set windowTitle to title of front window
            if windowTitle contains "Asterisk" then
                return false  -- Popup opened correctly
            end if
            return true  -- Something else opened
        end tell
    end tell
    """
    # ...
```

**Menu Navigation:**

```python
def navigate_extensions_menu(self):
    """Find and click Asterisk in extensions menu"""
    # Strategy 1: Type 'a' to filter
    subprocess.run(["cliclick", "kp:a"])

    # Strategy 2: Find UI element with "Asterisk"
    script = """
    tell application "System Events"
        tell process "Google Chrome"
            repeat with elem in every UI element of front window
                if description of elem contains "Asterisk" then
                    click elem
                    return true
                end if
            end repeat
        end tell
    end tell
    """
    # ...
```

---

## Usage Recommendations

### For Manual Testing

1. **Best:** Pin the extension first
   ```bash
   ./pin-extension.sh
   ```

2. **Then:** Calibrate coordinates
   ```bash
   ./calibrate_extension_icon.sh
   ```

3. **Finally:** Run tests
   ```bash
   python3 native_extension_test.py
   ```

### For Automated Testing

The fallback is automatic - no action needed. Tests will:
1. Try direct click first
2. Fall back to menu navigation if needed
3. Suggest pinning in output if fallback triggers

---

## Trade-offs

| Approach | Pros | Cons |
|----------|------|------|
| **Pinning** | • Reliable coordinates<br>• Faster test execution<br>• Simpler logic | • One-time manual setup<br>• User must pin |
| **Fallback** | • Works without pinning<br>• Fully automated<br>• No user setup | • Slower (menu navigation)<br>• Less reliable<br>• More complex code |

**Recommendation:** Use both - pin for best results, fallback as safety net.

---

## Detection Accuracy

The `is_extensions_menu_open()` method checks:

1. ✅ Window title contains "Asterisk" → Popup opened correctly
2. ❌ Window title doesn't contain "Asterisk" → Something else opened

**Limitations:**

- Assumes Asterisk popup always has "Asterisk" in title
- May false-positive if user has "Asterisk" in page title
- Timing-sensitive (waits 1 second before checking)

**Future Improvements:**

- OCR-based screenshot analysis
- More robust UI element detection
- Check for specific popup UI elements (buttons, forms)

---

## Debugging

If tests fail with "Could not find Asterisk in menu":

1. **Check extension is loaded:**
   ```bash
   ls apps/extension/dist/manifest.json
   ```

2. **Verify coordinates:**
   ```bash
   cat apps/qa/scripts/.extension-coords
   ```

3. **Take manual screenshot:**
   ```bash
   screencapture -x /tmp/debug.png
   open /tmp/debug.png
   ```

4. **Check Chrome process:**
   ```bash
   ps aux | grep Chrome
   ```

---

## Testing the Solutions

### Test Pinning Script

```bash
cd apps/qa/scripts
./pin-extension.sh

# Should open Chrome with guidance
# After pinning, close Chrome
```

### Test Fallback Logic

```bash
# 1. Ensure extension is NOT pinned
# 2. Run test
python3 native_extension_test.py

# Should see:
#   ℹ️  Extensions menu opened (extension not pinned)
#   🔄 Trying fallback: navigate extensions menu...
```

### Test Full Flow (Pinned)

```bash
# 1. Pin extension
./pin-extension.sh

# 2. Calibrate
./calibrate_extension_icon.sh

# 3. Test should pass without fallback
python3 native_extension_test.py

# Should see:
#   ✅ Popup should be open
```

---

## Files Modified

| File | Change |
|------|--------|
| `scripts/pin-extension.sh` | NEW - Automated pinning helper |
| `scripts/native_extension_test.py` | MODIFIED - Added fallback logic |
| `docs/CALIBRATION-GUIDE.md` | UPDATED - Added pinning instructions |
| `README.md` | UPDATED - Mentioned pin-extension.sh |

---

## Related Documentation

- [CALIBRATION-GUIDE.md](./CALIBRATION-GUIDE.md) - Full calibration walkthrough
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - Common issues and fixes
- [NATIVE-EXTENSION-TESTING.md](../NATIVE-EXTENSION-TESTING.md) - Native testing overview
