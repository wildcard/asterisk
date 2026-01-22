# Extension Popup Testing Guide

## Overview

Automated tests for the Chrome extension popup have been successfully implemented using Playwright. The tests verify popup rendering, UI elements, and connection status.

## What's Automated ✅

The following aspects are fully automated and run without manual intervention:

### UI Rendering Tests
- ✅ Popup header displays correctly
- ✅ Desktop connection status shows in footer
- ✅ Settings button is visible
- ✅ Empty state displays when no form detected
- ✅ Empty state shows correct icon and messaging
- ✅ Action buttons are hidden in empty state

### Visual Regression Tests
- ✅ Empty state layout captured for comparison

## Running the Tests

```bash
# Ensure prerequisites are running:
# 1. Desktop app: cd apps/desktop && pnpm tauri dev
# 2. Test form server: ./scripts/setup-test-form.sh

# Build extension first
cd apps/extension && pnpm build

# Run extension tests
cd apps/qa && pnpm test:extension
```

## Known Limitations ⚠️

### Tab Context Issue

Playwright cannot properly simulate clicking the Chrome extension icon. When tests open the popup directly via `chrome-extension://${extensionId}/popup/popup.html`, the popup becomes the active tab, so `chrome.tabs.query({ active: true })` returns the popup itself instead of the form page.

This means we **cannot** automatically test:
- ❌ Form detection status
- ❌ Matched field counts
- ❌ Fill button enablement when matches exist
- ❌ Fill functionality

### Why This Happens

The popup's code (`apps/extension/src/popup/popup.tsx`) calls:
```typescript
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
```

In a real scenario, clicking the extension icon opens the popup with the correct tab context. In Playwright tests, opening the popup URL directly makes the popup itself the "active" tab.

## Manual Testing Required

For full integration testing of form detection and filling:

1. **Build extension**
   ```bash
   cd apps/extension && pnpm build
   ```

2. **Load extension in Chrome**
   - Navigate to `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select `apps/extension/dist`

3. **Start desktop app**
   ```bash
   cd apps/desktop && pnpm tauri dev
   ```

4. **Open test form**
   - Navigate to `http://127.0.0.1:8765/test-llm-form.html`

5. **Click extension icon**
   - Verify form detection shows "Form Detected" with field count
   - Verify matched fields count is displayed
   - Verify "Fill All Matched Fields" button is enabled
   - Click fill and verify form fields populate
   - Verify connection status shows "Desktop app connected"

## Future Improvements

Potential approaches to improve automated coverage:

1. **Chrome DevTools Protocol (CDP)**
   - Use CDP to programmatically click the extension icon
   - Requires more complex setup but provides proper tab context

2. **Background Script Testing**
   - Test the background script's message handling directly
   - Bypasses popup UI but verifies core functionality

3. **Mock chrome.tabs API**
   - Inject mocks into the popup context before it loads
   - Would allow testing with simulated tab data

4. **Puppeteer with Extension API**
   - Puppeteer has better extension testing support than Playwright
   - Consider migration if deeper extension testing is required

## Test Files

| File | Purpose |
|------|---------|
| `e2e-tests/extension-popup.spec.ts` | Main test suite |
| `fixtures/extension-context.ts` | Helper utilities for extension context |
| `fixtures/vault-items.json` | Test data for vault seeding |
| `playwright.config.ts` | Playwright configuration with extension project |

## Success Metrics

Current automated test coverage:
- **7 tests passing** - UI rendering and empty states
- **4 tests skipped** - Form detection and fill functionality (manual only)
- **0 tests failing** - All automated tests are stable

This provides a solid foundation for regression testing while acknowledging the limitations of browser extension testing with current tools.
