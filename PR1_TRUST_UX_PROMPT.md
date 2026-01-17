# PR1: Trust & UX Implementation Prompt for Claude Code

## HIGH-LEVEL GOAL

Replace the current "Apply Fill Plan" (one-click) in `apps/desktop/src/MatchingPanel.tsx` with a safe two-step flow:

1. **Build Fill Plan** (already exists as "Generate Fill Plan")
2. **Review & Apply** (new - diff view + per-field toggles + confidence gating + undo)

Also add a local Fill Audit Log (append-only) and an Audit screen to view recent sessions.

## CONSTRAINTS

- `apps/desktop` is the Tauri app with React frontend
- Do NOT send any user PII off-device
- Audit log may store redacted values only
- Keep changes scoped to Trust & UX - no new form detection logic

## STEP 0 — LOCATE CURRENT FLOW (DONE)

The "Apply Fill Plan" button is in `apps/desktop/src/MatchingPanel.tsx`:
- Lines 297-353: `applyFillPlan` function
- Lines 400-409: Button rendering
- Uses `FillPlan` type from `@asterisk/core`

## PART A — ADD REVIEW & APPLY (DIFF) UI

### Create these new frontend files:

1. `apps/desktop/src/components/fillplan/FillPlanReviewDialog.tsx`
2. `apps/desktop/src/components/fillplan/FillPlanDiffTable.tsx`
3. `apps/desktop/src/components/fillplan/confidence.ts`
4. `apps/desktop/src/types/audit.ts`

### UI SPEC

Replace the single "Apply Fill Plan" button with:
- Primary: **"Review & Apply"** → opens FillPlanReviewDialog
- Keep "Generate Fill Plan" button

### FillPlanReviewDialog:
- Title: "Review changes"
- Subtitle: domain + match stats ("7 matches • 1 requires review • 0 blocked")
- Contains FillPlanDiffTable

### FillPlanDiffTable row columns:
- [checkbox] Apply?
- Field label (with fieldId tooltip)
- Confidence (% + badge)
- Old value (from live DOM, captured BEFORE apply)
- New value (candidate value)
- Source (vault key)
- Reason (optional: "label match + type match")

### Row defaults by confidence:
- `>= 0.98` (SAFE_AUTO_THRESHOLD): checked, normal
- `0.90 - 0.98`: checked, highlighted "Needs review"
- `< 0.90` (REVIEW_THRESHOLD): unchecked, marked "Blocked"

### Sensitive field handling:
- Labels containing: ssn, social, passport, id number, dob, birth
- Show values redacted with "reveal" toggle per row

### Dialog actions:
- **"Apply selected"** (primary)
- **"Cancel"**
- Checkbox: "Only apply safe (>= 98%)"

### After apply:
- Toast: "Applied N fields" + **"Undo"** button
- Undo reverts to captured old values
- Store `lastAppliedOperation` with oldValues/newValues

### confidence.ts exports:
```typescript
export const SAFE_AUTO_THRESHOLD = 0.98;
export const REVIEW_THRESHOLD = 0.90;
export type Disposition = 'safe' | 'review' | 'blocked';
export const getDisposition = (confidence: number): Disposition => {
  if (confidence >= SAFE_AUTO_THRESHOLD) return 'safe';
  if (confidence >= REVIEW_THRESHOLD) return 'review';
  return 'blocked';
};
```

## PART B — ADD FILL AUDIT LOG (LOCAL, APPEND-ONLY)

### Create Rust backend files:
1. `apps/desktop/src-tauri/src/audit/mod.rs`
2. `apps/desktop/src-tauri/src/audit/store.rs`
3. `apps/desktop/src-tauri/src/audit/types.rs`
4. Update `apps/desktop/src-tauri/src/main.rs` to register commands

### Storage:
- Append-only JSONL file: `<app_data_dir>/asterisk/audit/fill_audit.jsonl`
- Each line = one AuditEntry JSON object

### AuditEntry type:
```typescript
interface AuditEntry {
  id: string; // uuid
  createdAt: string; // ISO
  url: string;
  domain: string;
  fingerprint: string;
  summary: {
    plannedCount: number;
    appliedCount: number;
    blockedCount: number;
    reviewedCount: number;
  };
  items: AuditItem[];
}

interface AuditItem {
  fieldId: string;
  label: string;
  kind: string;
  confidence: number;
  disposition: 'safe' | 'review' | 'blocked';
  applied: boolean;
  source: string;
  oldValueRedacted: string;
  newValueRedacted: string;
  redaction: 'none' | 'partial' | 'masked';
  userConfirmed: boolean;
  notes?: string;
}
```

### Redaction rules:
- Default: keep first 2 + last 2 chars, mask middle with "•", cap at 64 chars
- Sensitive labels: fully masked "••••••"
- Never store raw PII values

### Tauri commands:
- `audit_append(entry: AuditEntry) -> ()`
- `audit_list(limit: u32, cursor: Option<u64>) -> { items: AuditEntry[], nextCursor?: u64 }`
- `audit_clear() -> ()`
- `audit_path() -> String`

### Frontend integration:
- Add wrappers in existing tauri invoke module
- After "Apply selected" → construct AuditEntry → call audit_append
- On Undo → append entry with notes="undo"

## PART C — ADD AUDIT SCREEN (FRONTEND)

### Create:
1. `apps/desktop/src/pages/Audit.tsx`
2. `apps/desktop/src/components/audit/AuditList.tsx`
3. `apps/desktop/src/components/audit/AuditEntryDetail.tsx`

### Wire into navigation:
- Add "Audit" tab to existing App.tsx tab structure

### Behavior:
- Load latest 50 entries on mount
- Reverse chronological order
- Each entry shows: createdAt, domain, appliedCount/plannedCount
- Click to expand → AuditEntryDetail with per-field items
- "Clear audit log" button with confirmation modal

## PART D — ACCEPTANCE CHECKLIST

After implementation, verify:
1. [ ] "Review & Apply" button shows instead of direct "Apply Fill Plan"
2. [ ] Review dialog lists fields with confidence disposition (safe/review/blocked)
3. [ ] Can toggle individual fields and apply only selected
4. [ ] Undo reverts applied fields to old values
5. [ ] Audit log stores entries after each apply
6. [ ] Audit screen shows recent sessions with expandable details
7. [ ] Sensitive values are properly redacted in audit log

## SUGGESTED IMPLEMENTATION ORDER

1. Create `confidence.ts` with thresholds and helper
2. Create `apps/desktop/src/types/audit.ts` with TS types
3. Create `FillPlanDiffTable.tsx` component
4. Create `FillPlanReviewDialog.tsx` component
5. Update `MatchingPanel.tsx` to use new Review dialog
6. Create Rust audit module and Tauri commands
7. Create Audit page and components
8. Wire Audit tab into App.tsx
9. Test end-to-end flow
