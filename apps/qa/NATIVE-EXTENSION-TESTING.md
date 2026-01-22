# Native macOS Extension Testing

## Overview

This approach uses macOS native automation (AppleScript, cliclick, Accessibility APIs) to test the Chrome extension popup by **actually clicking the extension icon**, bypassing Playwright's tab context limitation.

## The Problem This Solves

Playwright cannot simulate clicking Chrome extension icons, which means:
- The popup opened via `chrome-extension://${id}/popup.html` becomes the active tab
- `chrome.tabs.query({ active: true })` returns the popup, not the form page
- Form detection and fill features cannot be tested automatically

**Native automation solves this** by:
1. Launching Chrome with the extension loaded
2. Physically clicking the extension icon coordinates
3. Verifying the popup content via Accessibility APIs
4. Taking screenshots for visual verification

## Prerequisites

```bash
# Install cliclick for mouse automation
brew install cliclick

# Ensure Chrome is installed
test -f "/Applications/Google Chrome.app" && echo "✅ Chrome installed"

# Build extension
cd apps/extension && pnpm build
```

## Usage

### Option 1: Python Script (Recommended)

```bash
cd apps/qa/scripts
python3 native_extension_test.py
```

**What it does:**
1. Launches Chrome with extension in isolated user profile
2. Navigates to test form
3. Clicks extension icon at estimated coordinates
4. Takes screenshots before/after
5. Verifies popup content via Accessibility APIs
6. Cleans up automatically

### Option 2: Bash Script

```bash
cd apps/qa/scripts
./test-extension-native.sh
```

Interactive script that guides you through the testing process.

### Option 3: Manual AppleScript

```bash
# Verify popup content after manually opening it
osascript verify-popup-content.applescript
```

## How It Works

### 1. Extension Icon Location

Extension icons are typically located in the top-right corner of Chrome:
- Standard MacBook Pro 16": (~1250, 80)
- Retina displays: Coordinates may vary

**Finding exact coordinates:**
```bash
# Hover mouse over extension icon, then run:
osascript -e 'tell application "System Events" to get position of mouse'
# Returns: {1250, 80} or similar
```

### 2. Clicking the Icon

```bash
# Click at specific coordinates
cliclick c:1250,80
```

`cliclick` simulates actual mouse clicks, triggering the real extension popup with proper tab context.

### 3. Content Verification

Two approaches:

**A. Screenshot Analysis** (Visual)
```bash
screencapture -x /tmp/popup.png
# Then use image comparison tools
```

**B. Accessibility APIs** (Programmatic)
```applescript
tell application "System Events"
    tell process "Google Chrome"
        set elements to every UI element of front window
        -- Read text, button states, etc.
    end tell
end tell
```

## Advantages Over Playwright

| Feature | Playwright | Native macOS |
|---------|-----------|--------------|
| Clicks extension icon | ❌ Cannot | ✅ Yes |
| Proper tab context | ❌ No | ✅ Yes |
| Tests form detection | ❌ No | ✅ Yes |
| Tests fill functionality | ❌ No | ✅ Yes |
| Fully automated | ✅ Yes | ⚠️  Requires calibration |
| CI/CD friendly | ✅ Yes | ❌ macOS only |
| Visual verification | ✅ Screenshots | ✅ Screenshots + APIs |

## Limitations

1. **macOS Only**: AppleScript and cliclick are macOS-specific
2. **Coordinate Calibration**: Extension icon position varies by screen resolution
3. **Slower**: Real Chrome launch takes ~5 seconds vs Playwright's <1 second
4. **Less Stable**: Subject to UI changes, window focus issues
5. **No CI/CD**: Requires macOS runner with GUI access

## Integration with Existing Tests

You can use this approach for:
- Local development testing (run before commits)
- Manual QA verification
- Occasional full integration tests
- Debugging popup issues

Keep Playwright tests for:
- Fast UI regression checks
- CI/CD pipelines
- Empty state testing
- Visual snapshots

## Advanced: Image Recognition

For production-grade automation, use image recognition to find the extension icon:

```python
import cv2
import numpy as np

def find_extension_icon():
    # Take screenshot
    screenshot = cv2.imread('/tmp/screen.png')

    # Load extension icon template
    template = cv2.imread('extension-icon.png')

    # Template matching
    result = cv2.matchTemplate(screenshot, template, cv2.TM_CCOEFF_NORMED)
    min_val, max_val, min_loc, max_loc = cv2.minMaxLoc(result)

    # Return center coordinates
    h, w = template.shape[:2]
    center_x = max_loc[0] + w // 2
    center_y = max_loc[1] + h // 2

    return (center_x, center_y)
```

This eliminates hardcoded coordinates and works across different screen resolutions.

## Example Test Flow

```python
# 1. Launch Chrome with extension
launch_chrome_with_extension()

# 2. Navigate to test form
navigate_to("http://127.0.0.1:8765/test-llm-form.html")
wait(2)

# 3. Find and click extension icon
icon_pos = find_extension_icon()
click(icon_pos)
wait(1)

# 4. Verify popup shows form detection
assert verify_text_exists("Form Detected")
assert verify_text_exists("4 fields")
assert verify_text_exists("Matched Automatically")

# 5. Click fill button
click_button("Fill All Matched Fields")
wait(1)

# 6. Verify form was filled
assert get_input_value("#email") != ""
assert get_input_value("#name") != ""

# 7. Take screenshot
screenshot("/tmp/test-result.png")
```

## Troubleshooting

### Extension icon not found
- Check if extension loaded: `chrome://extensions`
- Verify icon coordinates: Hover and run mouse position script
- Try different coordinates: Icons may shift if other extensions installed

### Popup doesn't open
- Ensure Chrome is focused: AppleScript should activate it
- Check if popup is blocked: Some security settings may prevent popups
- Manual verification: Try clicking icon manually first

### Accessibility API returns no data
- Grant Terminal/Python accessibility permissions:
  - System Preferences → Security & Privacy → Privacy → Accessibility
  - Add Terminal.app or iTerm.app
- Restart Terminal after granting permissions

### Click happens but nothing visible
- Popup may be opening behind other windows
- Try adding window focus commands before clicking
- Check if click coordinates are accurate

## Future Enhancements

1. **Multi-resolution support**: Auto-detect screen resolution and adjust coordinates
2. **Image-based icon finding**: Use CV to locate icon regardless of position
3. **Headless Chrome**: Explore if Chrome can run extension in headless + automation mode
4. **Linux/Windows support**: Port to xdotool (Linux) or AutoIt (Windows)
5. **Parallel testing**: Run multiple Chrome instances with different extensions

## Resources

- [AppleScript Language Guide](https://developer.apple.com/library/archive/documentation/AppleScript/Conceptual/AppleScriptLangGuide/)
- [cliclick Documentation](https://github.com/BlueM/cliclick)
- [macOS Accessibility Programming Guide](https://developer.apple.com/library/archive/documentation/Accessibility/Conceptual/AccessibilityMacOSX/)
- [Chrome Extension Testing](https://developer.chrome.com/docs/extensions/mv3/testing/)
