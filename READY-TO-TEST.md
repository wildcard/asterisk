# ✅ Ready to Test LLM Matching

All infrastructure is set up and ready for end-to-end testing!

## What's Been Prepared

| Component | Status | Details |
|-----------|--------|---------|
| Desktop App | ✅ Running | http://localhost:1420/ |
| Test Vault Data | ✅ Populated | 10 items (name, email, phone, company, address) |
| Test Form | ✅ Created | `/Users/kobik-private/workspace/asterisk/test-llm-form.html` |
| Diagnostic Logging | ✅ Added | Backend (`[LLM]`) + Frontend (`[LLM Analysis]`) |
| API Key Test Script | ✅ Ready | `./test-api-key.sh` |

---

## 🚀 Quick Test (5 Minutes)

### Step 1: Validate Your API Key (1 min)

```bash
cd /Users/kobik-private/workspace/asterisk
./test-api-key.sh
```

Enter your Claude API key when prompted. You should see:
```
✓ Success! API key is valid.
Model: claude-sonnet-4-20250514
```

### Step 2: Configure Desktop App (2 min)

1. **Open:** http://localhost:1420/
2. **Navigate to:** Settings tab
3. **Enter:** Your Claude API key (starts with `sk-ant-`)
4. **Click:** "Test Connection" → Should show ✓ success
5. **Enable:** "Use LLM for ambiguous fields" toggle
6. **Click:** "Save Settings"

### Step 3: Test LLM Matching (2 min)

```bash
# Open test form in Chrome
open /Users/kobik-private/workspace/asterisk/test-llm-form.html
```

Then in desktop app:

1. **Go to:** Match tab
2. **Click:** "Generate Fill Plan"
   - Should show 7 fields detected
   - Most/all fields will be "Unmatched" (no autocomplete)
3. **Click:** "Analyze with AI" button
   - Watch terminal for `[LLM]` logs
   - Should complete in 5-10 seconds
4. **Review:** Recommendations appear with confidence scores
5. **Click:** "Review & Apply"
6. **Click:** "Apply" → Fields auto-fill in browser!

---

## What to Observe

### Terminal Logs (Backend)

```
[LLM] Analyzing field: label='Your info', name='field1', type='text'
[LLM] Available vault keys: ["firstName", "lastName", "email", "phone", ...]
[LLM] Sending request to Claude API...
[LLM] API response status: 200
[LLM] Claude response: {"vaultKey": "firstName", "confidence": 0.75, "reasoning": "..."}
[LLM] Match result: vault_key=Some("firstName"), confidence=0.75
```

### Browser Console (F12 → Console)

```
[LLM Analysis] Starting analysis...
[LLM Analysis] Unmatched fields: ["field1", "field2", ...]
[LLM Analysis] API key available: true
[LLM Analysis] Analyzing field: Your info (field1)
[LLM Analysis] ✓ Match found: Your info → firstName (75%)
[LLM Analysis] Total LLM recommendations: 5
```

### Desktop App UI

- **Unmatched Fields** section shows 7 fields initially
- **After AI analysis:** Most fields move to Recommendations section
- **Confidence badges:** Color-coded (green >90%, yellow 70-90%, red <70%)
- **Match tier:** Shows "llm" for AI-matched fields
- **Reasoning:** Hover to see Claude's explanation

---

## Expected Results

### Test Form Field Matching

| Field Label | Expected Match | Confidence Range |
|-------------|---------------|-----------------|
| "Your info" | firstName or lastName | 70-85% |
| "Contact details" | email or phone | 70-85% |
| "Personal identifier" | email | 60-75% |
| "Company" | company | 80-90% |
| "Role" | jobTitle | 80-90% |
| "Additional information" | (no match) | <40% |
| "Callback number" | phone | 75-85% |

### Success Criteria

✅ All 7 fields detected in form snapshot
✅ Generate Fill Plan completes without errors
✅ Most fields initially unmatched (no autocomplete attributes)
✅ "Analyze with AI" button is enabled
✅ LLM analysis runs without errors
✅ Claude API returns 200 status
✅ 5-6 recommendations appear (1-2 fields may not match)
✅ Confidence scores are reasonable (60-90%)
✅ Match tier shows "llm"
✅ Apply sends fill command
✅ Browser fields auto-fill with vault data

---

## Current Vault Data

```
firstName: John
lastName: Doe
email: john.doe@example.com
phone: +1-555-0123
company: Acme Corp
jobTitle: Senior Engineer
street: 123 Main St
city: San Francisco
state: CA
zipCode: 94102
```

You can view/edit these in the desktop app → Vault tab.

---

## Troubleshooting

### "Please configure your Claude API key"

**Fix:** Settings tab → Enter API key → Save

### "API returned 401"

**Fix:** Invalid API key. Get new one from [console.anthropic.com](https://console.anthropic.com/settings/keys)

### "API returned 429"

**Fix:** Rate limit exceeded. Wait 1-2 minutes.

### No LLM recommendations

**Check:**
- Browser console for errors
- Terminal for `[LLM]` error messages
- Vault has data (Vault tab should show 10 items)

### Fields don't auto-fill

**Check:**
- Terminal shows `[Asterisk HTTP] Fill command completed`
- Form is on same URL as snapshot (localhost)
- Extension is installed and active

---

## Performance Benchmarks

| Operation | Expected Time |
|-----------|---------------|
| API key test | < 2 seconds |
| Generate Fill Plan | < 500ms |
| Single field LLM analysis | < 1.5 seconds |
| 7 fields sequential analysis | < 10 seconds |
| Apply fill command | < 100ms |
| Browser auto-fill | < 500ms |

---

## Next Steps After Successful Test

1. **Try with real websites** - Test on forms with ambiguous labels
2. **Compare matching tiers** - See which fields use autocomplete vs LLM
3. **Review confidence scores** - Adjust thresholds if needed
4. **Check API costs** - Monitor token usage at console.anthropic.com
5. **Test error handling** - Try with invalid API key, rate limits, etc.

---

## Files Created/Modified

```
test-llm-form.html                  # Test form with ambiguous fields
test-api-key.sh                     # API key validation script
setup-test-vault.sh                 # Vault data population script
LLM-TESTING-GUIDE.md                # Comprehensive testing documentation
READY-TO-TEST.md                    # This quick-start guide

src-tauri/src/llm.rs                # Added diagnostic logging
src/MatchingPanel.tsx               # Added diagnostic logging
```

---

## Questions?

- **Full documentation:** See `LLM-TESTING-GUIDE.md`
- **API key issues:** Run `./test-api-key.sh` to diagnose
- **Logs:** Check terminal for `[LLM]` and browser console for `[LLM Analysis]`
- **Backend errors:** Look for error responses in terminal output

---

## Milestone Status

✅ **Types** - FillRecommendation, FillPlan, FieldSemantic
✅ **Rules matching** - Autocomplete + pattern-based
✅ **LLM integration** - Claude API calls via Rust backend
✅ **Settings UI** - API key management + test connection
✅ **Matching UI** - Review dialog + confidence badges
✅ **Diagnostic logging** - Backend + frontend tracing
✅ **Test infrastructure** - Form + vault + scripts

**🎉 All components complete and ready to test!**
