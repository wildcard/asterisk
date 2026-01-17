# LLM Matching Manual Test Plan

## Current Status
✅ Desktop app running on localhost:1420
✅ HTTP bridge on 127.0.0.1:17373
✅ Test form posted with ambiguous fields

## Test Steps

### Phase 1: Setup Vault Items (5 min)

1. **Open Vault Tab**
   - Click "Vault" in the navigation
   
2. **Add Company (for LLM testing)**
   - Click "Add Item"
   - Key: `company`
   - Value: `Acme Corp`
   - Label: `Company Name`
   - Category: `identity`
   - Click "Save"

3. **Add Job Title (for LLM testing)**
   - Click "Add Item"
   - Key: `jobTitle`
   - Value: `Senior Engineer`
   - Label: `Job Title`
   - Category: `identity`
   - Click "Save"

4. **Add Phone**
   - Click "Add Item"
   - Key: `phone`
   - Value: `+1-555-0123`
   - Label: `Phone Number`
   - Category: `contact`
   - Click "Save"

5. **Add Email**
   - Click "Add Item"
   - Key: `email`
   - Value: `john@example.com`
   - Label: `Email Address`
   - Category: `contact`
   - Click "Save"

---

### Phase 2: Configure API Key (3 min)

1. **Open Settings Tab**
   - Click "Settings" in navigation

2. **Enter Claude API Key**
   - Paste your API key (starts with `sk-ant-`)
   - Model: `Claude Sonnet 4.5 (Recommended)`

3. **Test Connection** (Optional)
   - Click "Test Connection"
   - Should see: ✅ "API key is valid! Connection successful."

4. **Save Settings**
   - Click "Save Settings"
   - Should see: ✅ "Settings saved successfully!"

---

### Phase 3: Test Form Matching (10 min)

1. **Go to Match Tab**
   - Click "Match" in navigation

2. **Load Form**
   - Click "Generate Fill Plan"
   
3. **Expected Results:**
   ```
   Recommendations (1 matched):
   - ✅ Email Address → email (90% confidence, Pattern match)
   
   Unmatched Fields (3):
   - Your Organization (text)
   - Your Position (text)
   - Best way to reach you (text)
   ```

4. **Test LLM Matching**
   - Click "Analyze with AI" button
   - Should show: "Analyzing..."
   - Wait 2-5 seconds

5. **Expected LLM Results:**
   ```
   Should now show 4 recommendations:
   - ✅ Email Address → email (90%, Pattern match)
   - ✅ Your Organization → company (≤90%, AI-inferred)
   - ✅ Your Position → jobTitle (≤90%, AI-inferred)
   - ✅ Best way to reach you → phone OR email (≤90%, AI-inferred)
   
   Unmatched Fields (0-1):
   - Possibly 1 field if LLM couldn't match "Best way to reach you"
   ```

---

### Phase 4: Review Dialog Testing (5 min)

1. **Open Review Dialog**
   - Click "Review & Apply"

2. **Verify Match Details:**
   
   **For Pattern Match (Email):**
   - Field: "Email Address"
   - Value: john@example.com
   - Confidence: ~90%
   - Badge: Gray "Pattern" badge
   - Reason: Pattern-based match

   **For LLM Matches (Company, Job Title):**
   - Confidence: ≤90%
   - Badge: Purple/Blue "AI-inferred" badge
   - Reason: Should show Claude's reasoning
     - e.g., "Field label 'Your Organization' indicates company name"
     - e.g., "Field 'Your Position' expects job title data"

3. **Test Checkboxes**
   - All fields should be checked by default (Safe + Review dispositions)
   - Uncheck one field
   - Should update count: "Apply X fields"

4. **Test Diff Display**
   - Click on a field to expand diff
   - Should show: `empty → value`

---

### Phase 5: Error Handling Tests (5 min)

**Test 5a: No API Key**
1. Go to Settings → Clear API key
2. Go to Match tab
3. Click "Analyze with AI"
4. Expected: Button disabled with tooltip "Configure API key in Settings"

**Test 5b: Invalid Field**
1. Post a form with gibberish field
2. Run LLM analysis
3. Expected: Field remains unmatched, no error thrown

---

## Success Criteria

- [ ] All vault items added successfully
- [ ] API key configured and tested
- [ ] Pattern matching works (Email field matched)
- [ ] LLM matching works (Company, Job Title matched)
- [ ] LLM reasoning displayed in review dialog
- [ ] Match tier badges correct (Pattern vs AI-inferred)
- [ ] Confidence scores ≤90% for LLM matches
- [ ] "Analyze with AI" button disabled without API key
- [ ] No crashes or errors during testing

