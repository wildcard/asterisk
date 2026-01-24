#!/bin/bash
# Start a simple HTTP server for calibration test forms
# This serves the fixtures directory on port 8765 for native automation testing

set -e

PORT=8765
FIXTURES_DIR="$(dirname "$0")/../fixtures"

echo "🚀 Starting test form server..."
echo "   Port: $PORT"
echo "   Directory: $FIXTURES_DIR"
echo ""

# Check if port is already in use
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo "⚠️  Port $PORT is already in use"
  echo "   Kill existing server with: kill \$(lsof -t -i:$PORT)"
  exit 1
fi

# Create symlink if it doesn't exist (calibration scripts expect test-llm-form.html)
if [ ! -f "$FIXTURES_DIR/test-llm-form.html" ]; then
  echo "🔗 Creating symlink: test-form.html → test-llm-form.html"
  ln -s test-form.html "$FIXTURES_DIR/test-llm-form.html"
fi

echo "✅ Server starting at http://127.0.0.1:$PORT"
echo "   Test form: http://127.0.0.1:$PORT/test-llm-form.html"
echo ""
echo "Press Ctrl+C to stop"
echo ""

cd "$FIXTURES_DIR"
python3 -m http.server $PORT
