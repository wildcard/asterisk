# UX Improvement Plan: In-Page Form Filling

**Status:** PROPOSAL
**Inspiration:** 1Password, Bitwarden, Dashlane
**Current State:** Desktop app review dialog (suboptimal UX)
**Goal:** Seamless in-page form filling experience

---

## Current UX Flow (Desktop App)

**Problems:**
1. User must switch between browser and desktop app
2. Review dialog is disconnected from the form context
3. No visual feedback on which fields will be filled
4. Can't see field values before applying
5. Manual field mapping not available
6. Desktop app doesn't show the actual form

**Current Steps:**
```
Browser Form → Desktop App (Match tab) → Generate Fill Plan →
Review Dialog → Apply → Switch back to Browser
```

---

## Proposed UX: In-Page Injection (1Password Style)

### 1. Field-Level Indicators

**Inject visual indicators next to fillable fields:**

```
┌──────────────────────────────────────┐
│ [●] Your Email                    ▼ │ ← Asterisk icon + dropdown
│ [john.doe@example.com           ]   │
└──────────────────────────────────────┘
     ↑
     Asterisk icon indicates "ready to fill"
```

**Indicator States:**
- 🟢 Green circle: High confidence match (>80%)
- 🟡 Yellow circle: Medium confidence (60-80%)
- 🔵 Blue circle: Manual mapping available
- ⚪ Gray circle: No match found

**Click behavior:**
- Click icon → Show dropdown with available vault items
- Select item → Fill that field immediately
- Hover icon → Show match confidence + reasoning

### 2. Inline Dropdown Menu

```
┌──────────────────────────────────────────────────────┐
│ Email (85% confidence - LLM Match)                   │
├──────────────────────────────────────────────────────┤
│ ✓ john.doe@example.com          [Personal Email]    │ ← Selected
│   work@company.com               [Work Email]        │
│   ──────────────────────────────────────────────     │
│   + Add new vault item                               │
│   ⚙ Edit vault items                                 │
└──────────────────────────────────────────────────────┘
```

**Features:**
- Show all matching vault items
- Display labels/categories
- Allow choosing different value
- Quick add new vault item
- Link to vault management

### 3. Extension Popup (Quick Actions)

**Trigger:** Click Asterisk extension icon in Chrome toolbar

```
┌─────────────────────────────────────────────┐
│ Asterisk - Form on example.com              │
├─────────────────────────────────────────────┤
│                                             │
│ 📋 Form Detected: Contact Form (7 fields)  │
│                                             │
│ ✓ 4 fields matched automatically           │
│ ⚠ 3 fields need attention                  │
│                                             │
│ [Fill All Matched Fields]                  │ ← Primary action
│ [Review and Customize]                     │ ← Opens side panel
│                                             │
│ ─────────────────────────────────────      │
│                                             │
│ Recent Fills:                               │
│ • github.com - Login form (2m ago)         │
│ • forms.google.com - Survey (1h ago)       │
│                                             │
│ [⚙ Settings] [📦 Vault]                    │
│                                             │
└─────────────────────────────────────────────┘
```

### 4. Side Panel (Detailed Review)

**Trigger:** Click "Review and Customize" in popup

```
┌─────────────────────────────────────────────────────┐
│ Form Fill Review - example.com                      │
├─────────────────────────────────────────────────────┤
│                                                     │
│ ✅ Auto-Matched (4)                                 │
│                                                     │
│ • Email          → john.doe@example.com   [85%]    │
│ • Phone          → +1-555-0123             [85%]    │
│ • Company        → Acme Corp              [80%]    │
│ • Role           → Senior Engineer        [80%]    │
│                                                     │
│ ⚠️ Needs Attention (3)                              │
│                                                     │
│ • Your info *    → [Choose from vault ▼]          │ ← Dropdown
│ • Personal ID    → [Skip]                         │
│ • Additional info→ [Skip]                         │
│                                                     │
│ ─────────────────────────────────────────────      │
│                                                     │
│ [Fill 4 Fields] [Fill All 7] [Cancel]              │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Extension Popup (Quick Win)

**Files to Create:**
- `apps/extension/src/popup.html`
- `apps/extension/src/popup.tsx`
- `apps/extension/src/popup.css`

**Features:**
- Show detected form summary
- Quick "Fill All" button
- Link to side panel for review

**Effort:** ~2 days

### Phase 2: In-Page Field Indicators

**Files to Modify:**
- `apps/extension/src/content.ts` - Inject icons
- `apps/extension/src/field-indicator.tsx` - React component for icon

**Features:**
- Inject Asterisk icon next to fillable fields
- Color-coded by confidence
- Show tooltip on hover

**Effort:** ~3 days

### Phase 3: Inline Dropdown Menu

**Files to Create:**
- `apps/extension/src/field-dropdown.tsx` - Dropdown component

**Features:**
- Show vault items matching field
- Allow selecting different value
- Quick add/edit vault

**Effort:** ~4 days

### Phase 4: Side Panel (Chrome 114+)

**Files to Create:**
- `apps/extension/src/sidepanel.html`
- `apps/extension/src/sidepanel.tsx`

**Features:**
- Detailed form review
- Manual field mapping
- Batch operations

**Effort:** ~5 days

---

## Visual Design (1Password-Inspired)

### Color Palette

```
Primary:   #4A90E2  (Asterisk blue)
Success:   #7ED321  (Green - high confidence)
Warning:   #F5A623  (Yellow - medium confidence)
Neutral:   #9B9B9B  (Gray - no match)
```

### Icon Design

```
High Confidence:    ● (filled circle, green)
Medium Confidence:  ◐ (half-filled, yellow)
Low Confidence:     ○ (empty circle, gray)
Manual Map:         ⊕ (plus in circle, blue)
```

### Dropdown Style

- Rounded corners (8px border-radius)
- Drop shadow for elevation
- Max height 300px with scroll
- Smooth transitions (200ms)

---

## Technical Architecture

### Content Script Injection

```typescript
// apps/extension/src/content.ts

class FormFillUI {
  private indicators: Map<string, FieldIndicator> = new Map();

  // Inject indicators when form is detected
  injectIndicators(fillPlan: FillPlan) {
    for (const rec of fillPlan.recommendations) {
      const field = document.getElementById(rec.fieldId);
      if (!field) continue;

      const indicator = new FieldIndicator({
        field,
        recommendation: rec,
        vaultItems: this.vaultItems,
        onFill: (fieldId, value) => this.fillField(fieldId, value)
      });

      this.indicators.set(rec.fieldId, indicator);
    }
  }

  // Remove indicators on navigation
  cleanup() {
    for (const indicator of this.indicators.values()) {
      indicator.remove();
    }
    this.indicators.clear();
  }
}
```

### Component Communication

```
Content Script ←→ Background Service Worker ←→ Desktop App
       ↓
  Field Indicators
  Dropdown Menus
  Side Panel
```

**Message Types:**
- `GET_FILL_PLAN` - Request current fill plan
- `FILL_FIELD` - Fill single field
- `UPDATE_MAPPING` - Manual field mapping
- `GET_VAULT_ITEMS` - Request vault data for dropdown

---

## Comparison: Current vs Proposed

| Aspect | Current (Desktop App) | Proposed (In-Page) |
|--------|----------------------|-------------------|
| **Context switching** | High (2 windows) | Low (same page) |
| **Visual feedback** | None | Field-level indicators |
| **Preview values** | No | Yes, in dropdown |
| **Manual mapping** | Not available | Dropdown selection |
| **Confidence display** | In review dialog | Next to each field |
| **Speed** | Slow (multiple clicks) | Fast (1 click per field) |
| **User control** | Batch only | Per-field + batch |

---

## User Flows

### Flow 1: Auto-Fill High Confidence Fields

```
1. User navigates to form
2. Asterisk detects form → shows popup notification
3. User clicks "Fill All Matched" in popup
4. Green indicators appear next to fields
5. Fields fill automatically
6. Yellow indicators remain for low-confidence fields
7. User manually selects from dropdown for those fields
```

### Flow 2: Review Before Filling

```
1. User navigates to form
2. Indicators appear next to fields (not filled yet)
3. User clicks Asterisk icon → popup opens
4. User clicks "Review and Customize"
5. Side panel opens with detailed view
6. User adjusts mappings for unmatched fields
7. User clicks "Fill All 7 Fields"
8. Form fills with customized mappings
```

### Flow 3: Manual Field-by-Field

```
1. User sees form with indicators
2. User clicks green indicator on "Email" field
3. Dropdown shows: john@example.com (selected)
4. Field fills immediately
5. User clicks yellow indicator on "Your info"
6. Dropdown shows: [Choose: firstName, lastName, ...]
7. User selects "firstName"
8. Field fills with "John"
```

---

## Manual Field Mapping UI (Detailed)

### Dropdown for Unmatched Fields

```
┌──────────────────────────────────────────────────────┐
│ Your info * (Required)                               │
├──────────────────────────────────────────────────────┤
│ 🔍 Search vault...                                   │
├──────────────────────────────────────────────────────┤
│ Suggested:                                           │
│   firstName          "John"                          │
│   lastName           "Doe"                           │
│   email              "john.doe@example.com"          │
│                                                      │
│ All Items (10):                                      │
│   company            "Acme Corp"                     │
│   jobTitle           "Senior Engineer"               │
│   phone              "+1-555-0123"                   │
│   ... (show more)                                    │
│                                                      │
│ ─────────────────────────────────────────────────    │
│ [Skip this field]  [+ Add new item]                 │
└──────────────────────────────────────────────────────┘
```

**Features:**
- Search/filter vault items
- Show value preview
- Categorized (suggested vs all)
- Skip option for optional fields
- Quick add if no match

---

## Desktop App Changes

**Keep desktop app for:**
- Vault management
- Settings/preferences
- Audit log review
- Batch form management
- LLM prompt tuning

**Remove from desktop app:**
- Form fill preview/apply (move to extension)
- Match tab review dialog (move to side panel)

**New desktop app role:**
- Configuration hub
- Data management
- Analytics/insights

---

## Accessibility

- **Keyboard navigation:** Tab through indicators, Enter to open dropdown
- **Screen readers:** Announce confidence levels and matched values
- **High contrast mode:** Ensure indicators visible in all themes
- **Focus management:** Return focus to field after filling

---

## Security Considerations

1. **Content Script Isolation:**
   - Don't expose vault data directly to page JavaScript
   - Use message passing for all vault access

2. **Visual Spoofing Prevention:**
   - Ensure indicators can't be faked by malicious page scripts
   - Use Shadow DOM for indicator components

3. **User Confirmation:**
   - Always require user action to fill (no auto-fill on load)
   - Show confirmation for bulk fills

4. **Sensitive Fields:**
   - Add extra confirmation for password/SSN fields
   - Option to disable indicators on sensitive sites

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Time to fill form | ~30s | ~5s |
| Context switches | 4+ | 0-1 |
| User satisfaction | 3/5 | 4.5/5 |
| Manual mapping rate | 0% | 80%+ |
| Fill success rate | 57% | 90%+ |

---

## Next Steps

1. **Phase 1 (Week 1):** Extension popup with quick actions
2. **Phase 2 (Week 2):** Field indicators injection
3. **Phase 3 (Week 3):** Inline dropdown menus
4. **Phase 4 (Week 4):** Side panel for detailed review
5. **Polish (Week 5):** Animations, accessibility, testing

**Total estimated effort:** 5 weeks (1 developer)
