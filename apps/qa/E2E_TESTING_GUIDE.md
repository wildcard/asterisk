# E2E Testing Guide - Real-World Form Filling

This guide walks through manual E2E testing of the complete LLM matching + form injection workflow.

## Prerequisites

- Desktop app running (`pnpm tauri dev`)
- Chrome extension installed
- Valid Claude API key

## Setup (5 minutes)

### 1. Start Desktop App

```bash
cd apps/desktop
pnpm tauri dev
```

**Expected:**
- App opens on `localhost:1420`
- HTTP bridge running on `127.0.0.1:17373`
- Console shows: `[Asterisk HTTP] Server listening on http://127.0.0.1:17373`

### 2. Install Chrome Extension

```bash
cd apps/extension
pnpm dev
```

Then:
1. Open Chrome
2. Go to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select `apps/extension/dist/`

**Expected:**
- Extension icon appears in toolbar
- Console shows: `[Asterisk] Extension installed/updated`

---

## Test 1: Vault Setup (3 minutes)

### Create Test Vault Items

1. Open desktop app
2. Click **Vault** tab
3. Add the following items:

| Key | Label | Value | Category |
|-----|-------|-------|----------|
| `company` | Company Name | Acme Corp | identity |
| `jobTitle` | Job Title | Senior Engineer | identity |
| `email` | Email Address | john@example.com | contact |
| `phone` | Phone Number | +1-555-0123 | contact |

**Expected:**
- ✅ Each item saves successfully
- ✅ Items appear in vault list
- ✅ Count shows "Vault Items (4)"

---

## Test 2: API Configuration (2 minutes)

1. Click **Settings** tab
2. Enter your Claude API key (starts with `sk-ant-`)
3. Verify model is "Claude Sonnet 4.5 (Recommended)"
4. Click **Test Connection** (optional)
5. Click **Save Settings**

**Expected:**
- ✅ Success message: "Settings saved successfully!"
- ✅ API key shown as `••••••••••••••••` when page reloads

---

## Test 3: Pattern Matching (5 minutes)

### Open Test Form

```bash
# Serve test form locally
cd apps/qa/fixtures
python3 -m http.server 8000
```

Then open in Chrome: http://localhost:8000/test-form.html

### Test Pattern Matching

1. In desktop app, click **Match** tab
2. Wait for form snapshot to appear
3. Click **Generate Fill Plan**

**Expected Results:**

```
Recommendations (1):
✓ Email Address → email (90%, Pattern match)

Unmatched Fields (3):
- Your Organization (org)
- Your Position (position)
- Best way to reach you (contact)
```

**Verify:**
- ✅ Email field matched via pattern (type="email")
- ✅ Confidence badge shows ~90%
- ✅ Match tier shows "pattern"
- ✅ 3 fields remain unmatched

---

## Test 4: LLM Matching (10 minutes)

### Run LLM Analysis

1. In Match tab, click **Analyze with AI** button
2. Wait for "Analyzing..." spinner (2-5 seconds)

**Expected Results:**

```
Recommendations (4):
✓ Email Address → email (90%, Pattern)
✓ Your Organization → company (≤90%, AI-inferred)
✓ Your Position → jobTitle (≤90%, AI-inferred)
✓ Best way to reach you → phone OR email (≤90%, AI-inferred)

Unmatched Fields (0-1):
- Possibly 1 field if LLM couldn't decide between phone/email
```

**Verify:**
- ✅ LLM found additional matches
- ✅ Confidence scores ≤90% for LLM matches
- ✅ Match tier badges show "AI-inferred" or similar
- ✅ No error messages

### Check LLM Reasoning

1. Hover over or click on LLM matches
2. Look for reasoning text

**Expected:**
- Each LLM match shows reasoning
- Example: "Field label 'Your Organization' indicates company name"

---

## Test 5: Review & Apply (5 minutes)

### Open Review Dialog

1. Click **Review & Apply** button
2. Review the dialog

**Expected Dialog Contents:**

For each recommendation:
- Field name (e.g., "Your Organization")
- Vault item label (e.g., "Company Name")
- Value (e.g., "Acme Corp")
- Confidence badge (90%, Pattern or AI-inferred)
- Checkbox (checked by default for Safe dispositions)

**Verify:**
- ✅ All fields shown with correct values
- ✅ Confidence badges match expectations
- ✅ Pattern matches show gray "Pattern" badge
- ✅ LLM matches show purple/blue "AI-inferred" badge

### Test Checkboxes

1. Uncheck one field
2. Verify button updates: "Apply X fields" (where X = total - 1)
3. Re-check the field
4. Verify button shows all fields again

**Verify:**
- ✅ Unchecking works
- ✅ Button text updates dynamically
- ✅ Can toggle checkboxes

---

## Test 6: Form Injection (10 minutes)

### Apply Fill Command

1. In Review dialog, ensure desired fields are checked
2. Click **Apply** button (or "Apply X fields")

**Expected in Desktop:**
- ✅ Success message: "Fill command sent! 4 field(s) ready to fill on localhost"
- ✅ Dialog closes
- ✅ Console shows: `[Asterisk HTTP] Received fill command: localhost -> 4 fields`

### Wait for Extension

**Background polling:**
- Extension polls every 1 minute via Chrome Alarms API
- Also polls immediately when form snapshot is sent

**To speed up testing:**
1. Refresh the form page (re-triggers form snapshot)
2. Or wait up to 1 minute for next poll cycle

### Verify Form Filled

Switch to Chrome tab with form and check:

**Expected:**
- ✅ "Your Organization" = "Acme Corp"
- ✅ "Your Position" = "Senior Engineer"
- ✅ "Email Address" = "john@example.com"
- ✅ "Best way to reach you" = "+1-555-0123" (or email, depending on LLM choice)

**Additional Checks:**
- ✅ Fields are actually filled (not just placeholder text)
- ✅ Form is still editable (not disabled)
- ✅ No JavaScript errors in console

### Console Verification

Open Chrome DevTools Console:

```
[Asterisk] Fill command executed: 4 of 4 fields filled
```

---

## Test 7: Audit Log (3 minutes)

1. In desktop app, click **Audit** tab
2. Find the recent fill operation

**Expected:**
- ✅ Entry shows timestamp
- ✅ Entry shows domain (localhost or example.com)
- ✅ Entry shows field count (e.g., "4 fields filled")
- ✅ Entry shows which vault items were used
- ✅ Can expand to see details

---

## Test 8: Error Handling (5 minutes)

### Test 8a: No API Key

1. Go to **Settings** tab
2. Clear the API key
3. Click **Save Settings**
4. Go to **Match** tab
5. Try to click **Analyze with AI**

**Expected:**
- ✅ Button is disabled
- ✅ Tooltip shows: "Configure API key in Settings"
- ✅ Or error message: "Please configure your Claude API key in Settings"

### Test 8b: Invalid Form

1. Open a page with no forms (e.g., google.com)
2. Check **Match** tab in desktop

**Expected:**
- ✅ No form snapshot shown
- ✅ Message: "No form detected" or similar
- ✅ No errors in console

---

## Success Criteria Checklist

- [ ] Desktop app starts successfully
- [ ] Extension installed and running
- [ ] Vault items created via UI
- [ ] API key configured and saved
- [ ] Form detected by extension and sent to desktop
- [ ] Pattern matching identifies email field
- [ ] "Analyze with AI" button works
- [ ] LLM identifies company, jobTitle fields
- [ ] LLM reasoning displayed in UI
- [ ] Review dialog shows all matches with badges
- [ ] Confidence scores accurate (Pattern ~90%, LLM ≤90%)
- [ ] "Apply" button sends fill command
- [ ] Extension polls and receives command
- [ ] Form fields actually get filled with correct values
- [ ] Audit log records the operation
- [ ] Error handling works (no API key, no form)

---

## Troubleshooting

### Form doesn't get filled

1. Check desktop console for "Received fill command"
2. Check extension console for "Fill command executed"
3. Refresh form page to trigger immediate poll
4. Verify domain matches (localhost vs 127.0.0.1)

### LLM matching fails

1. Check API key is valid
2. Check internet connection
3. Look for error in desktop console
4. Verify Tauri backend is running (port 17373)

### Extension not detecting form

1. Verify extension is loaded (`chrome://extensions/`)
2. Refresh the form page
3. Check extension console for errors
4. Verify form has <input> or <select> elements

---

## Performance Benchmarks

Track these metrics during testing:

| Metric | Target | Actual |
|--------|--------|--------|
| Form detection → snapshot sent | < 1s | ___ |
| Generate fill plan (pattern) | < 500ms | ___ |
| LLM analysis (3 fields) | < 5s | ___ |
| Total time (form load → matches shown) | < 10s | ___ |
| Apply → fields filled | < 2s | ___ |

---

## Next Steps

After successful E2E testing:

1. Document any bugs found
2. Capture screenshots for documentation
3. Record screen video for demo
4. Update GitHub Issue #15 with results
5. Proceed to performance analysis (Issue #17)
