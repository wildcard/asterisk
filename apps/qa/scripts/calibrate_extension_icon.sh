#!/bin/bash
# Extension Icon Coordinate Calibration Tool
# Helps you find the exact coordinates of your extension icon

set -e

echo "🎯 Extension Icon Coordinate Calibrator"
echo "========================================"
echo ""
echo "This tool will help you find the exact coordinates of your extension icon."
echo ""

# Launch Chrome with extension
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
EXTENSION_PATH="$PROJECT_ROOT/apps/extension/dist"
CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
USER_DATA_DIR="/tmp/chrome-calibration-$$"

mkdir -p "$USER_DATA_DIR"

echo "🚀 Launching Chrome with extension..."
"$CHROME_PATH" \
  --user-data-dir="$USER_DATA_DIR" \
  --load-extension="$EXTENSION_PATH" \
  --no-first-run \
  --no-default-browser-check \
  "http://127.0.0.1:8765/test-llm-form.html" &

CHROME_PID=$!
echo "   Chrome PID: $CHROME_PID"
echo ""
sleep 5

# Activate Chrome
osascript -e 'tell application "Google Chrome" to activate'

echo "📍 CALIBRATION INSTRUCTIONS"
echo "============================"
echo ""
echo "1. Look at the Chrome window that just opened"
echo "2. Find the Asterisk extension icon in the toolbar"
echo "   (It should be in the top-right area, near the address bar)"
echo "3. Hover your mouse EXACTLY over the CENTER of the icon"
echo "4. Press Enter here without moving the mouse"
echo ""
read -p "Press Enter when your mouse is over the extension icon... "

# Get mouse position
COORDS=$(osascript -e 'tell application "System Events" to get position of mouse')
echo ""
echo "📌 Captured coordinates: $COORDS"

# Parse coordinates
X=$(echo "$COORDS" | sed 's/[^0-9]*//;s/,.*//')
Y=$(echo "$COORDS" | sed 's/.*,\s*//')

echo "   X: $X"
echo "   Y: $Y"
echo ""

# Test the click
echo "🧪 Testing coordinates..."
echo "   This will click at ($X, $Y) in 3 seconds..."
echo "   Watch to see if it clicks the extension icon!"
sleep 3

cliclick c:$X,$Y

sleep 2

# Take screenshot
SCREENSHOT="/tmp/calibration-result-$$.png"
screencapture -x "$SCREENSHOT"
echo ""
echo "📸 Screenshot saved: $SCREENSHOT"
echo ""

# Ask if it worked
echo "❓ Did the extension popup open correctly?"
read -p "   [y/N]: " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "✅ SUCCESS! These are your calibrated coordinates:"
    echo ""
    echo "   EXTENSION_ICON_X=$X"
    echo "   EXTENSION_ICON_Y=$Y"
    echo ""
    echo "💡 Update native_extension_test.py with these values:"
    echo ""
    echo "   # In find_extension_icon() method:"
    echo "   return ($X, $Y)"
    echo ""

    # Save to config file
    CONFIG_FILE="$PROJECT_ROOT/apps/qa/scripts/.extension-coords"
    echo "EXTENSION_ICON_X=$X" > "$CONFIG_FILE"
    echo "EXTENSION_ICON_Y=$Y" >> "$CONFIG_FILE"
    echo "✅ Saved to $CONFIG_FILE"
else
    echo "❌ Calibration failed. Tips:"
    echo "   - Make sure you hovered over the CENTER of the icon"
    echo "   - The icon should be visible (not hidden in overflow menu)"
    echo "   - Try running this script again"
fi

echo ""
echo "🧹 Press Enter to close Chrome and clean up..."
read

kill $CHROME_PID 2>/dev/null || true
rm -rf "$USER_DATA_DIR"

echo "✅ Done!"
