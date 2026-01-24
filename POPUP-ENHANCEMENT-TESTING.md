# Popup Enhancement Testing Guide

## Setup

1. **Build the extension:**
   ```bash
   cd apps/extension
   pnpm build
   ```

2. **Load in Chrome:**
   - Navigate to `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select `apps/extension/dist`

3. **Start desktop app (optional for vault data):**
   ```bash
   cargo run --bin asterisk-app
   ```

4. **Open test form:**
   ```
   http://127.0.0.1:8765/test-llm-form.html
   ```

## Test Checklist

### ✅ Error Boundary
- [ ] Inject error by adding `throw new Error('test')` in `popup.tsx`
- [ ] Popup should show error UI with warning icon
- [ ] "Try Again" button should reload and clear error
- [ ] "Close Popup" button should close the popup
- [ ] Error logged to console

### ✅ Loading Skeleton
- [ ] Open popup on a fresh page load
- [ ] Should see animated skeleton (not spinner)
- [ ] Skeleton has placeholder boxes
- [ ] Animation is smooth (shimmer effect)
- [ ] Transitions to content when loaded

### ✅ Unit Tests
- [ ] Run `pnpm test` in apps/extension
- [ ] All 15 tests pass
- [ ] No errors or warnings
- [ ] Coverage report shows good coverage

### ✅ Desktop Integration
**With Desktop Running:**
- [ ] Open popup on form page
- [ ] Footer shows "Desktop app connected" (green dot)
- [ ] Click "Review and Customize" button
- [ ] Opens `localhost:1420` in new tab
- [ ] Popup closes automatically

**Without Desktop:**
- [ ] Stop desktop app
- [ ] Open popup on form page
- [ ] Footer shows "Desktop app not connected" (red dot)
- [ ] Click "Review and Customize" button
- [ ] Shows error toast: "Desktop app not running"
- [ ] Popup remains open

### ✅ Settings Modal
- [ ] Click "⚙ Settings" button in footer
- [ ] Modal opens with overlay
- [ ] Can edit Desktop API URL
- [ ] Can toggle "Auto-fill enabled"
- [ ] Can toggle "Auto-close after fill"
- [ ] Can toggle "Show keyboard shortcuts"
- [ ] Click "Full Settings" link opens desktop app
- [ ] Click "Save Settings" saves and closes
- [ ] Click "Cancel" closes without saving
- [ ] Click overlay closes modal
- [ ] Reload popup - settings persist

### ✅ Field Preview with Toggles
**Opening Preview:**
- [ ] Navigate to form with fields
- [ ] See "▶ Preview & Customize Fields"
- [ ] Shows "X selected" count
- [ ] Click to expand - arrow changes to ▼
- [ ] Field list appears with smooth transition

**Field Display:**
- [ ] Each field shows:
  - [ ] Checkbox (checked by default)
  - [ ] Field label
  - [ ] Required badge (if applicable)
  - [ ] Value preview
  - [ ] Confidence badge (green/yellow/red)
  - [ ] Match reason in italic
- [ ] Password fields show "••••••••"
- [ ] Long values are truncated with "..."

**Toggling Fields:**
- [ ] Click checkbox to disable field
- [ ] Field gets opacity: 0.5
- [ ] Selected count decreases
- [ ] Click again to re-enable
- [ ] Selected count increases
- [ ] Click "Deselect All" - all unchecked
- [ ] Click "Select All" - all checked

**Filling with Toggles:**
- [ ] Disable some fields
- [ ] Click "Fill All Matched Fields"
- [ ] Only enabled fields are filled
- [ ] Disabled fields remain empty

### ✅ Keyboard Shortcuts
**Escape to Close:**
- [ ] Open popup
- [ ] Press `Esc` key
- [ ] Popup closes immediately

**Enter to Fill:**
- [ ] Open popup on form
- [ ] Ensure no input is focused
- [ ] Press `Enter` key
- [ ] Fields are filled
- [ ] Works same as clicking "Fill" button

**Input Field Exception:**
- [ ] Open settings modal
- [ ] Focus on API URL input
- [ ] Press `Enter`
- [ ] Should NOT trigger fill (only submits form)

**Keyboard Hints:**
- [ ] See hints at bottom right
- [ ] Shows `Esc` Close
- [ ] Shows `Enter` Fill (if matches exist)
- [ ] Styled as keyboard keys (kbd tag)

**Disable Shortcuts:**
- [ ] Open settings
- [ ] Uncheck "Show keyboard shortcuts hint"
- [ ] Save
- [ ] Hints disappear
- [ ] Shortcuts still work (just hidden)

### ✅ Toast Notifications
**Success Toast:**
- [ ] Fill fields successfully
- [ ] Green toast appears at bottom
- [ ] Shows "Successfully filled X fields"
- [ ] Has checkmark icon
- [ ] Auto-dismisses after ~3 seconds
- [ ] Can click × to dismiss early
- [ ] Smooth slide-up animation

**Error Toast:**
- [ ] Trigger error (e.g., no fields selected)
- [ ] Red toast appears at bottom
- [ ] Shows error message
- [ ] Has × icon
- [ ] Auto-dismisses after ~3 seconds
- [ ] Can click × to dismiss early

**Multiple Toasts:**
- [ ] Trigger multiple toasts quickly
- [ ] Only one shows at a time (latest)
- [ ] Previous toast disappears

### ✅ Auto-Close After Fill
**Enabled (default):**
- [ ] Fill fields
- [ ] Success toast shows
- [ ] Popup closes after ~1.5 seconds

**Disabled:**
- [ ] Open settings
- [ ] Uncheck "Auto-close after fill"
- [ ] Save
- [ ] Fill fields
- [ ] Success toast shows
- [ ] Popup remains open

### ✅ Accessibility
**ARIA Labels:**
- [ ] Use screen reader (VoiceOver on Mac)
- [ ] Navigate with Tab key
- [ ] All buttons have clear labels
- [ ] Status updates are announced
- [ ] Form actions group is identified

**Keyboard Navigation:**
- [ ] Tab through all interactive elements
- [ ] Focus indicators are visible (blue outline)
- [ ] Can activate buttons with Space/Enter
- [ ] Can check/uncheck toggles with Space
- [ ] Modal traps focus inside

**Screen Reader:**
- [ ] Open popup with screen reader on
- [ ] Header is announced as banner
- [ ] Footer is announced as contentinfo
- [ ] Status is announced as live region
- [ ] Toast alerts are announced

### ✅ Visual Polish
- [ ] No visual glitches or jumps
- [ ] Smooth transitions
- [ ] Consistent spacing
- [ ] Professional appearance
- [ ] Readable fonts and colors
- [ ] Good contrast ratios

### ✅ Error Handling
**No Tab:**
- [ ] Open popup without active tab
- [ ] Shows error: "No active tab found"

**No Form:**
- [ ] Open popup on page without form
- [ ] Shows empty state
- [ ] "No Form Detected" message
- [ ] Helpful hint to navigate to form page

**Background Script Error:**
- [ ] Simulate background script failure
- [ ] Error toast appears
- [ ] User gets clear error message

## Performance

- [ ] Popup opens quickly (< 500ms)
- [ ] No lag when toggling fields
- [ ] Smooth animations (60fps)
- [ ] Small bundle size
- [ ] No memory leaks

## Browser Compatibility

- [ ] Chrome (primary)
- [ ] Edge (Chromium-based)
- [ ] Brave (Chromium-based)

## Notes

Record any issues found:

```
Issue 1: [Description]
Steps to reproduce: [Steps]
Expected: [Expected behavior]
Actual: [Actual behavior]

Issue 2: ...
```

## Sign-Off

Testing completed by: _______________
Date: _______________
All tests passed: [ ] Yes [ ] No
Issues found: _______________
