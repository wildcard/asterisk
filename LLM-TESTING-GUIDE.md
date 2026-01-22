# LLM Matching E2E Testing Guide

This guide walks through testing the complete AI-powered form matching feature in Asterisk.

## Prerequisites

- ✅ Desktop app running (`pnpm tauri dev`)
- ✅ Chrome extension installed
- ✅ Valid Claude API key (get from [console.anthropic.com](https://console.anthropic.com/settings/keys))

---

## Quick Start: 3-Step Test

### 1. Test Your API Key (Optional but Recommended)

```bash
cd /Users/kobik-private/workspace/asterisk
./test-api-key.sh
```

This validates your API key works before configuring the app.

### 2. Configure Settings

1. Open desktop app: http://localhost:1420/
2. Click **Settings** tab
3. Enter your Claude API key (starts with `sk-ant-`)
4. Click **Test Connection** → Should show "✓ API key is valid!"
5. Enable **"Use LLM for ambiguous fields"** toggle
6. Click **Save Settings**

### 3. Test with Ambiguous Form

```bash
# Open the test form in Chrome
open /Users/kobik-private/workspace/asterisk/test-llm-form.html
```

Then in desktop app:
1. Go to **Match** tab
2. Click **"Generate Fill Plan"**
3. Click **"Analyze with AI"** for unmatched fields
4. Review recommendations
5. Click **"Review & Apply"**
6. Select fields and click **"Apply"**

---

## Detailed Testing Steps

### Phase 1: Settings Configuration

| Step | Action | Expected Result |
|------|--------|----------------|
| 1.1 | Open Settings tab | UI loads with API key input |
| 1.2 | Enter invalid key (e.g., "test") | Red validation error appears |
| 1.3 | Enter valid key format | Validation clears |
| 1.4 | Click "Test Connection" | Shows "✓ API key is valid!" |
| 1.5 | Click "Save Settings" | Shows "Settings saved successfully!" |
| 1.6 | Refresh page | Key appears as "••••••••••••••••" |

**Diagnostic logs:**
- Check browser console for settings save/load messages
- API test connection makes real Claude API call

---

### Phase 2: Test Form Analysis

The `test-llm-form.html` file contains 7 intentionally ambiguous fields:

| Field | Label | Expected LLM Behavior |
|-------|-------|----------------------|
| field1 | "Your info" | Should analyze as firstName, lastName, or email |
| field2 | "Contact details" | Should analyze as phone or email |
| field3 | "Personal identifier" | May suggest email or userId |
| field4 | "Company" | Should match to company vault item |
| field5 | "Role" | Should match to jobTitle |
| field6 | "Additional information" | Likely no match (too vague) |
| field7 | "Callback number" | Should match to phone |

**Steps:**

1. **Open test form in Chrome**
   ```bash
   open test-llm-form.html
   ```

2. **Generate Fill Plan**
   - Desktop app → Match tab → "Generate Fill Plan"
   - Watch terminal for `[Asterisk HTTP] Received form snapshot: localhost (7 fields)`

3. **Verify Tier 1/2 Matching**
   - Since fields have NO autocomplete attributes, most/all should be unmatched
   - Unmatched Fields section should show 6-7 fields

4. **Run LLM Analysis**
   - Click "Analyze with AI" button
   - Watch terminal for `[LLM]` logs:
     ```
     [LLM] Analyzing field: label='Your info', name='field1', type='text'
     [LLM] Available vault keys: ["firstName", "lastName", "email", ...]
     [LLM] Sending request to Claude API...
     [LLM] API response status: 200
     [LLM] Claude response: {"vaultKey": "firstName", ...}
     [LLM] Match result: vault_key=Some("firstName"), confidence=0.75
     ```

5. **Check Browser Console**
   - Open DevTools (F12) → Console tab
   - Look for `[LLM Analysis]` logs:
     ```
     [LLM Analysis] Starting analysis...
     [LLM Analysis] Unmatched fields: ["field1", "field2", ...]
     [LLM Analysis] ✓ Match found: Your info → firstName (75%)
     ```

---

### Phase 3: Review and Apply

After LLM analysis completes:

1. **Verify Recommendations**
   - Check confidence badges (green >90%, yellow 70-90%, red <70%)
   - Verify match tier shows "llm" for AI-matched fields
   - Read reasoning tooltips

2. **Open Review Dialog**
   - Click "Review & Apply" button
   - Dialog shows all recommendations with checkboxes
   - Hover over fields to see old/new values

3. **Apply Fills**
   - Select fields to fill (default: all)
   - Click "Apply" button
   - Watch terminal for:
     ```
     [Asterisk HTTP] Received fill command: localhost -> N fields
     [Asterisk HTTP] Fill command completed: fill-...
     ```

4. **Verify in Browser**
   - Switch to Chrome tab with test form
   - Fields should auto-fill with vault data
   - Check that filled values are correct

---

## Diagnostic Logs Explained

### Backend Logs (Terminal)

```
[LLM] Analyzing field: label='Your info', name='field1', type='text'
```
→ Started analyzing a field

```
[LLM] Prompt length: 487 chars
```
→ Built prompt for Claude

```
[LLM] Sending request to Claude API...
[LLM] API response status: 200
```
→ API call successful

```
[LLM] Claude response: {"vaultKey": "firstName", "confidence": 0.75, "reasoning": "..."}
```
→ Claude's analysis result

```
[LLM] Match result: vault_key=Some("firstName"), confidence=0.75
```
→ Final parsed result

### Frontend Logs (Browser Console)

```
[LLM Analysis] Starting analysis...
[LLM Analysis] Unmatched fields: ["field1", "field2", ...]
```
→ Started LLM analysis workflow

```
[LLM Analysis] API key available: true
```
→ Confirmed API key is configured

```
[LLM Analysis] Found 7 unmatched field nodes
[LLM Analysis] Vault items: ["firstName", "lastName", ...]
```
→ Prepared data for analysis

```
[LLM Analysis] Analyzing field: Your info (field1)
[LLM Analysis] ✓ Match found: Your info → firstName (75%)
```
→ Successfully matched a field

```
[LLM Analysis] Total LLM recommendations: 5
```
→ Summary of results

---

## Troubleshooting

### Issue: "Please configure your Claude API key"

**Cause:** API key not set or invalid

**Solution:**
1. Check Settings tab → API key field
2. Run `./test-api-key.sh YOUR_KEY` to verify
3. Ensure key starts with `sk-ant-`

---

### Issue: "API returned 401"

**Cause:** Invalid API key

**Check logs:**
```
[LLM] API error response: {"error": {"message": "invalid x-api-key"}}
```

**Solution:**
- Get new API key from console.anthropic.com
- Click "Clear API Key" in Settings
- Re-enter and test

---

### Issue: "API returned 429"

**Cause:** Rate limit exceeded

**Solution:**
- Wait 1-2 minutes
- Reduce number of fields to analyze
- Check your API usage at console.anthropic.com

---

### Issue: No fields matched by LLM

**Cause:** Fields too ambiguous or no vault data

**Check:**
1. Browser console for errors
2. Terminal for `[LLM] Match result: vault_key=None`
3. Vault tab → ensure you have data (firstName, email, etc.)

**Solution:**
- Add more vault items in Vault tab
- Use more descriptive field labels
- Check Claude's reasoning in logs

---

### Issue: Fields don't fill in browser

**Cause:** Fill command not reaching extension

**Check:**
1. Terminal shows `[Asterisk HTTP] Fill command completed`
2. Extension is installed and active
3. URL matches (localhost for test form)

**Solution:**
- Reload extension: chrome://extensions → Reload
- Check extension background logs
- Verify form is on same domain as snapshot

---

## Expected Confidence Scores

| Scenario | Confidence Range | Example |
|----------|-----------------|---------|
| Exact semantic match | 0.80 - 0.95 | "Email address" → email |
| Strong context | 0.70 - 0.85 | "Your info" → firstName |
| Moderate ambiguity | 0.60 - 0.75 | "Contact" → phone or email |
| Weak match | 0.40 - 0.60 | "Additional info" → ??? |
| No match | 0.0 - 0.40 | Returns null |

---

## Test Form Fields Reference

The `test-llm-form.html` includes:

```html
field1: "Your info" (required)       → Ambiguous identity field
field2: "Contact details"            → Could be phone or email
field3: "Personal identifier"        → Ambiguous ID field
field4: "Company" (required)         → Should match company
field5: "Role"                       → Should match jobTitle
field6: "Additional information"     → Too vague (likely no match)
field7: "Callback number"            → Should match phone
```

**Key characteristics:**
- ❌ No `autocomplete` attributes (forces LLM analysis)
- ❌ No standard `name` patterns (forces LLM analysis)
- ✓ Varied ambiguity levels (tests LLM reasoning)
- ✓ 2 required fields (tests priority matching)

---

## Success Criteria

✅ API key configuration works
✅ Test Connection validates key
✅ Form snapshot captured (7 fields)
✅ Generate Fill Plan runs without errors
✅ Most fields initially unmatched (no autocomplete)
✅ LLM analysis runs for unmatched fields
✅ Claude API calls succeed (status 200)
✅ LLM recommendations appear with confidence scores
✅ Reasoning is displayed
✅ Review dialog shows matches
✅ Apply sends fill command
✅ Browser fields auto-fill

---

## Performance Benchmarks

| Metric | Expected Value |
|--------|---------------|
| API key test | < 2 seconds |
| Single field LLM analysis | < 1.5 seconds |
| 7 fields sequential analysis | < 10 seconds |
| Fill command send | < 100ms |
| Browser auto-fill | < 500ms |

---

## Security Verification

✅ API key stored in Tauri state (memory), not localStorage
✅ Only field metadata sent to Claude (no vault values)
✅ API key masked in UI as `••••••••••••••••`
✅ Test Connection uses minimal tokens (< 10)

---

## Next Steps After Successful Test

1. **Test with real forms**
   - Try on actual websites with ambiguous fields
   - Compare LLM vs rule-based matching

2. **Optimize prompts**
   - Adjust confidence thresholds in `llm.rs:135-136`
   - Add more context to prompt if needed

3. **Add learning**
   - Store user corrections
   - Improve future matches

4. **Batch analysis**
   - Currently sequential (1 field at a time)
   - Could parallelize for speed

---

## Files Modified

| File | Changes |
|------|---------|
| `test-llm-form.html` | New test form with ambiguous fields |
| `test-api-key.sh` | CLI tool to validate API keys |
| `src-tauri/src/llm.rs` | Added diagnostic logging |
| `src/MatchingPanel.tsx` | Added diagnostic logging |
| `LLM-TESTING-GUIDE.md` | This guide |

---

## Questions?

- Check terminal logs for `[LLM]` messages
- Check browser console for `[LLM Analysis]` messages
- Review Claude API response in logs
- Test API key independently with `./test-api-key.sh`
