#!/bin/bash
set -e

# Native macOS Extension Testing Script
# Uses AppleScript and native automation to test Chrome extension popup
# This bypasses Playwright's tab context limitation

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
EXTENSION_PATH="$PROJECT_ROOT/apps/extension/dist"
TEST_FORM_URL="http://127.0.0.1:8765/test-llm-form.html"

echo "🚀 Starting native extension testing..."

# Check prerequisites
if ! command -v cliclick &> /dev/null; then
    echo "⚠️  cliclick not installed. Installing via Homebrew..."
    brew install cliclick
fi

# Get Chrome path
CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
if [ ! -f "$CHROME_PATH" ]; then
    echo "❌ Chrome not found at $CHROME_PATH"
    exit 1
fi

# Check if extension is built
if [ ! -d "$EXTENSION_PATH" ]; then
    echo "❌ Extension not built at $EXTENSION_PATH"
    echo "   Run: cd apps/extension && pnpm build"
    exit 1
fi

echo "✅ Prerequisites met"
echo ""

# Launch Chrome with extension loaded in a new user data directory (for testing)
USER_DATA_DIR="/tmp/chrome-extension-test-$$"
mkdir -p "$USER_DATA_DIR"

echo "📂 Launching Chrome with extension..."
"$CHROME_PATH" \
  --user-data-dir="$USER_DATA_DIR" \
  --load-extension="$EXTENSION_PATH" \
  --no-first-run \
  --no-default-browser-check \
  "$TEST_FORM_URL" &

CHROME_PID=$!
echo "   Chrome PID: $CHROME_PID"
echo ""

# Wait for Chrome to fully load
echo "⏳ Waiting for Chrome to load (5s)..."
sleep 5

# Use AppleScript to bring Chrome to front
osascript <<EOF
tell application "Google Chrome"
    activate
end tell
EOF

echo "✅ Chrome activated"
echo ""

# Now we need to click the extension icon
# The extension icon is typically in the top-right area of the browser
# We'll need to determine its position programmatically

echo "🔍 Finding extension icon position..."
echo ""
echo "   Note: Extension icons are typically at coordinates like (1250, 80)"
echo "   You can use this AppleScript to get the current mouse position:"
echo ""
echo "   osascript -e 'tell application \"System Events\" to get position of mouse'"
echo ""
echo "   Hover over the extension icon and run that command to get coordinates."
echo ""

# For now, we'll use a placeholder coordinate
# In a real implementation, you'd want to:
# 1. Take a screenshot
# 2. Use image recognition to find the extension icon
# 3. Calculate the center point
# 4. Click it with cliclick

EXTENSION_ICON_X=1250
EXTENSION_ICON_Y=80

echo "🖱️  Clicking extension icon at ($EXTENSION_ICON_X, $EXTENSION_ICON_Y)..."
cliclick c:$EXTENSION_ICON_X,$EXTENSION_ICON_Y

echo "⏳ Waiting for popup to open (2s)..."
sleep 2

# Take a screenshot of the popup
SCREENSHOT_PATH="/tmp/extension-popup-test-$$.png"
screencapture -x "$SCREENSHOT_PATH"
echo "📸 Screenshot saved to $SCREENSHOT_PATH"
echo ""

# Use AppleScript to read popup content
echo "🔍 Reading popup content..."
POPUP_TEXT=$(osascript <<EOF
tell application "System Events"
    tell process "Google Chrome"
        set frontWindow to front window
        set windowTitle to title of frontWindow
        return windowTitle
    end tell
end tell
EOF
)

echo "   Popup title: $POPUP_TEXT"
echo ""

# Verify popup is open
if [[ "$POPUP_TEXT" == *"Asterisk"* ]]; then
    echo "✅ Popup opened successfully!"
else
    echo "⚠️  Popup may not have opened (title doesn't contain 'Asterisk')"
fi

echo ""
echo "🧹 Cleanup..."
echo "   Press Enter to close Chrome and clean up, or Ctrl+C to keep it open"
read

# Kill Chrome
kill $CHROME_PID 2>/dev/null || true
rm -rf "$USER_DATA_DIR"

echo "✅ Test complete!"
