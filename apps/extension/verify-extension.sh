#!/bin/bash
# Extension Verification Script
# This script helps verify the Asterisk extension is properly loaded in Chrome

echo "=== Asterisk Extension Verification ==="
echo ""

# 1. Check if dist files exist
echo "1. Checking dist files..."
if [ -f "dist/content.js" ] && [ -f "dist/background.js" ] && [ -f "dist/manifest.json" ]; then
    echo "   ✓ All required files exist in dist/"
else
    echo "   ✗ Missing files in dist/"
    exit 1
fi

# 2. Check manifest is valid JSON
echo ""
echo "2. Checking manifest.json..."
if jq empty dist/manifest.json 2>/dev/null; then
    echo "   ✓ Manifest is valid JSON"
else
    echo "   ✗ Manifest has JSON errors"
    exit 1
fi

# 3. Check content script has logging
echo ""
echo "3. Checking content script logging..."
if grep -q "Asterisk Content" dist/content.js; then
    echo "   ✓ Content script has verification logging"
else
    echo "   ✗ Content script missing logging"
fi

# 4. Check background script
echo ""
echo "4. Checking background script..."
if grep -q "ASTERISK_FORM_SNAPSHOT" dist/background.js; then
    echo "   ✓ Background script looks correct"
else
    echo "   ✗ Background script may have issues"
fi

echo ""
echo "=== Extension Ready ==="
echo ""
echo "📋 NEXT STEPS:"
echo ""
echo "1. Open Chrome and navigate to: chrome://extensions/"
echo "2. Enable 'Developer mode' (toggle in top-right)"
echo "3. Find 'Asterisk Form Detection' extension"
echo "4. Click the RELOAD button (circular arrow icon)"
echo "5. Verify extension reloaded:"
echo "   - Check for any error messages"
echo "   - Extension should show 'Service worker (Inactive)' or 'active'"
echo ""
echo "6. After reloading, open test form: http://localhost:8000/test-form.html"
echo "7. Open browser console (F12)"
echo "8. Look for this message:"
echo "   [Asterisk Content] Script loaded at 2026-..."
echo ""
echo "If you see the '[Asterisk Content] Script loaded' message, the extension is working!"
echo "If you DON'T see it, the extension hasn't loaded the content script."
