#!/bin/bash
# Setup script to post test form to HTTP bridge before running E2E tests

set -e

BRIDGE_URL="http://127.0.0.1:17373"
FORM_FIXTURE="$(dirname "$0")/../fixtures/test-form.json"

echo "🔧 Setting up test environment..."

# Check if HTTP bridge is running
if ! curl -s -f "$BRIDGE_URL/health" > /dev/null 2>&1; then
  echo "❌ Error: HTTP bridge not running on $BRIDGE_URL"
  echo "   Start the desktop app first: cd apps/desktop && pnpm tauri dev"
  exit 1
fi

echo "✅ HTTP bridge is running"

# Post test form snapshot
echo "📝 Posting test form to HTTP bridge..."
if curl -s -X POST "$BRIDGE_URL/v1/snapshot" \
  -H "Content-Type: application/json" \
  -d @"$FORM_FIXTURE" > /dev/null; then
  echo "✅ Test form posted successfully"
else
  echo "⚠️  Warning: Failed to post test form (bridge might not support /v1/snapshot endpoint)"
  echo "   Tests will run but may skip form-dependent scenarios"
fi

echo "✨ Test environment ready!"
