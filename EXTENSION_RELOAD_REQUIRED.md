# ⚠️ EXTENSION RELOAD REQUIRED

## Status

✅ Extension code is properly built and ready in `apps/extension/dist/`
✅ Diagnostic logging added to verify content script loads
✅ Manifest configuration is correct
✅ **Desktop app domain exclusion added** (fixes context invalidation bug)
❌ **Extension is NOT reloaded in Chrome** ← BLOCKER

## Evidence

1. **Content script has verification logging** (`content.ts` lines 9-11):
   ```typescript
   console.log('[Asterisk Content] Script loaded at', new Date().toISOString());
   console.log('[Asterisk Content] Extension ID:', chrome?.runtime?.id);
   console.log('[Asterisk Content] URL:', window.location.href);
   ```

2. **No logs appear in browser console** when visiting test form
   - This proves content script is NOT being injected
   - Chrome is running old version of extension

3. **JavaScript check confirms**:
   ```javascript
   chrome.runtime.id  // Returns "N/A" - content script not loaded
   ```

## Bug Fixed: Extension Context Invalidation

**Root Cause**: Content script was being injected into the desktop app page (localhost:1420) itself, causing:
1. Desktop app UI contains form fields (vault inputs)
2. Content script detects those forms and tries to send snapshots
3. Hot reload (CRXJS) invalidates the extension context
4. `chrome.runtime.sendMessage()` fails with "Extension context invalidated"
5. This breaks the entire message passing system

**Fix Applied** (content.ts lines 16-20):
```typescript
const IS_DESKTOP_APP = window.location.hostname === 'localhost' && window.location.port === '1420';
if (IS_DESKTOP_APP) {
  console.log('[Asterisk Content] Skipping desktop app page - content script disabled');
}
// ... later in initialization:
if (!IS_DESKTOP_APP) {
  setupEventListeners(); // Only run on actual web pages, not desktop app
}
```

This prevents the content script from initializing on the desktop app page, avoiding the context invalidation error.

## Why This Happens

Chrome extensions don't auto-reload when you rebuild the code. The old version stays loaded in memory until you explicitly reload it via `chrome://extensions`.

## Required Action

**You MUST manually reload the extension in Chrome:**

### Step-by-Step Instructions

1. **Open Chrome extension management page**:
   - Navigate to: `chrome://extensions/`
   - Or click the puzzle piece icon → "Manage Extensions"

2. **Enable Developer Mode** (if not already):
   - Toggle the switch in the top-right corner

3. **Find "Asterisk Form Detection" extension**:
   - Should be in your list of installed extensions

4. **Click the RELOAD button**:
   - It's a circular arrow icon (⟳)
   - Located on the extension card

5. **Verify no errors**:
   - After reload, check if any error messages appear
   - Extension should show "Service worker (Inactive)" or "active"

### After Reloading

1. **Reload the test form page** in your browser:
   ```
   http://localhost:8000/test-form.html
   ```

2. **Open browser console** (F12 or Right-click → Inspect)

3. **Look for verification logs**:
   ```
   [Asterisk Content] Script loaded at 2026-01-18T...
   [Asterisk Content] Extension ID: <extension-id>
   [Asterisk Content] URL: http://localhost:8000/test-form.html
   ```

4. **If you see those logs**: ✅ Extension is working! Continue with E2E testing
5. **If you DON'T see logs**: ❌ Extension still not loaded - try reloading again

## What Will Work After Reload

Once the extension is reloaded and content script loads:

1. **Form detection**: Content script will detect forms and send snapshots to desktop
2. **Fill commands**: Background script can send messages to content script
3. **Field filling**: Content script will receive fill commands and populate form fields
4. **Diagnostic logs**: All the logging I added will be visible in console

## Current Test Form

Located at: `apps/extension/test-form.html`

Served by: Python HTTP server on `http://localhost:8000`

Fields:
- Organization (text input, id="org")
- Position (text input, id="position")
- Name (text input, id="contact")
- Email (email input, id="email")
- Phone (tel input, id="phone")
- Subject (text input, id="subject")
- Message (textarea, id="message")

## Desktop App Status

Desktop app is running and receiving form snapshots (logs show successful snapshot reception). The background script is working - only the content script injection is blocked.

## Files Modified

- `apps/extension/src/content.ts` - Added verification logging (lines 9-11)
- `apps/extension/src/background.ts` - Already had diagnostic logging
- `apps/extension/dist/*` - Cleanly rebuilt with all changes

## Quick Verification Script

Run this to verify the extension build is ready:

```bash
cd apps/extension
./verify-extension.sh
```

This checks that all files are built correctly and prompts for the manual reload step.

## Unable to Automate

Chrome security prevents programmatic access to `chrome://` pages and extension reload functionality. This manual step is a security feature and cannot be bypassed.

## Next Steps After Reload

1. ✅ Verify content script loads (check console logs)
2. Test form fill workflow:
   - Desktop app Match tab → "Generate Fill Plan"
   - Review recommendations
   - Click "Review & Apply" → "Apply 2 fields"
3. Verify fields are filled in test form
4. Check console logs for diagnostic output showing message passing
5. Document working E2E flow
