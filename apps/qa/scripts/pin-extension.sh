#!/bin/bash
# Automated Extension Pinning Script
# Pins the Asterisk extension to Chrome's toolbar

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR/../../.."
EXTENSION_PATH="$PROJECT_ROOT/apps/extension/dist"

echo "📌 Asterisk Extension Pinning Tool"
echo "===================================="
echo ""

# Check if extension is built
if [ ! -d "$EXTENSION_PATH" ]; then
  echo "❌ Extension not built at $EXTENSION_PATH"
  echo "   Run: cd apps/extension && pnpm build"
  exit 1
fi

echo "✅ Extension found at $EXTENSION_PATH"
echo ""

# Launch Chrome with extension
echo "🚀 Launching Chrome with extension..."
TEMP_DIR=$(mktemp -d -t chrome-pin-XXXXXX)

/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --user-data-dir="$TEMP_DIR" \
  --load-extension="$EXTENSION_PATH" \
  --no-first-run \
  --no-default-browser-check \
  "chrome://extensions" > /dev/null 2>&1 &

CHROME_PID=$!
echo "   Chrome PID: $CHROME_PID"

sleep 5

echo ""
echo "📍 PINNING INSTRUCTIONS"
echo "========================"
echo ""
echo "Chrome has opened to the Extensions page."
echo ""
echo "To pin the extension:"
echo "  1. Look for the puzzle piece icon (🧩) in the top-right toolbar"
echo "  2. Click the puzzle piece icon"
echo "  3. Find 'Asterisk Password Manager' in the dropdown"
echo "  4. Click the PIN icon (📌) next to it"
echo "  5. The Asterisk icon should now appear in the toolbar"
echo ""
echo "Alternative automated method:"
echo "  1. Click the 'Details' button on the Asterisk extension card"
echo "  2. Scroll down to 'Pin to toolbar' toggle"
echo "  3. Enable the toggle"
echo ""
echo "After pinning, you can close Chrome and re-run calibration:"
echo "  ./calibrate_extension_icon.sh"
echo ""
echo "Press Ctrl+C when done..."
echo ""

# Wait for user to finish
wait $CHROME_PID 2>/dev/null || true

echo ""
echo "✅ Chrome closed"
echo "   If you pinned the extension, it should stay pinned in your regular Chrome profile"
echo "   (assuming you're using the same profile)"
