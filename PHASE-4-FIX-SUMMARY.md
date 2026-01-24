# Phase 4 Calibration Fix - Summary

## Problem Identified

The plan noted: "Phase 4 calibration failed because the test form server (`http://127.0.0.1:8765`) wasn't started."

### Root Cause Analysis

| Expected | Actual |
|----------|--------|
| HTTP server on port 8765 | No server script existed |
| File: `test-llm-form.html` | File: `test-form.html` (different name) |
| `pnpm setup` starts server | `pnpm setup` posts to desktop app bridge (port 17373) |

**The issue:** Calibration scripts expected a simple HTTP server serving test forms, but no such server existed.

---

## Solution Implemented

### 1. Created Test Server Script

**File:** `apps/qa/scripts/start-test-server.sh`

Features:
- Starts Python HTTP server on port 8765
- Serves fixtures directory
- Auto-creates symlink: `test-form.html` → `test-llm-form.html`
- Port conflict detection
- Clear startup messages

Usage:
```bash
cd apps/qa
pnpm serve
```

### 2. Updated Package Scripts

**File:** `apps/qa/package.json`

Added new command:
```json
"serve": "./scripts/start-test-server.sh"
```

### 3. Documentation Updates

#### README.md
- Added "Test Server Commands" section
- Clarified difference between `setup` (desktop bridge) and `serve` (calibration)
- Updated native test instructions to mention server requirement

#### TROUBLESHOOTING.md
- Fixed incorrect `pnpm setup` → `pnpm serve` for port 8765
- Added note explaining the difference

#### CALIBRATION-GUIDE.md (NEW)
Comprehensive 300+ line guide covering:
- Prerequisites and quick start
- Step-by-step calibration process
- Troubleshooting common issues
- Advanced usage (multiple resolutions, automation)
- How it works (technical deep-dive)
- FAQs

---

## How to Complete Phase 4

Now that the infrastructure is fixed, you can successfully run calibration:

### Terminal 1: Start Test Server

```bash
cd apps/qa
pnpm serve
```

Expected output:
```
🚀 Starting test form server...
   Port: 8765
   Directory: ./../fixtures

🔗 Creating symlink: test-form.html → test-llm-form.html
✅ Server starting at http://127.0.0.1:8765
   Test form: http://127.0.0.1:8765/test-llm-form.html

Press Ctrl+C to stop
```

**Keep this terminal open!**

### Terminal 2: Run Calibration

```bash
cd apps/qa/scripts
./calibrate_extension_icon.sh
```

Follow the prompts:
1. Chrome will open with test form
2. Wait 5 seconds
3. Click the **Asterisk extension icon** when prompted
4. Coordinates saved to `.extension-coords`

### Verify Calibration Works

```bash
cd apps/qa/scripts
python3 native_extension_test.py
```

Expected: "TEST PASSED" ✅

---

## Files Changed

### New Files
- `apps/qa/scripts/start-test-server.sh` - HTTP server for calibration
- `apps/qa/docs/CALIBRATION-GUIDE.md` - Comprehensive calibration documentation
- `apps/qa/fixtures/test-llm-form.html` - Symlink (created at runtime)

### Modified Files
- `apps/qa/package.json` - Added `serve` command
- `apps/qa/README.md` - Added server commands section, calibration guide link
- `apps/qa/docs/TROUBLESHOOTING.md` - Fixed server instructions

---

## Verification Steps

### 1. Test Server Works
```bash
cd apps/qa
pnpm serve &
sleep 2
curl http://127.0.0.1:8765/test-llm-form.html
# Should return HTML content
```

### 2. Symlink Created
The server script automatically creates the symlink when started.

### 3. Documentation Accurate
- README clearly distinguishes `setup` vs `serve`
- Calibration guide provides step-by-step instructions
- Troubleshooting mentions correct commands

---

## Why This Fix Was Necessary

The original implementation had a **naming mismatch**:

| Component | Expected |
|-----------|----------|
| Calibration scripts | `http://127.0.0.1:8765/test-llm-form.html` |
| Setup script | Posts to desktop bridge (port 17373) |
| Fixture file | `test-form.html` |

**Result:** Calibration couldn't find the server or file.

**Solution:** Bridge the gap with:
1. Dedicated server script for port 8765
2. Runtime symlink for file name compatibility
3. Clear documentation separating concerns

---

## Impact on CI/CD

**No impact** - Calibration is interactive and runs locally only.

The CI workflow (`.github/workflows/extension-tests.yml`) already:
- Skips coordinate-dependent tests via `process.env.CI`
- Runs only Playwright tests
- Does not require calibration

---

## Next Steps

1. **Run calibration** (see "How to Complete Phase 4" above)
2. **Test native automation**: `python3 native_extension_test.py`
3. **Commit changes** (optional):
   ```bash
   git add apps/qa/scripts/start-test-server.sh
   git add apps/qa/docs/CALIBRATION-GUIDE.md
   git add apps/qa/package.json
   git add apps/qa/README.md
   git add apps/qa/docs/TROUBLESHOOTING.md
   git commit -m "Fix Phase 4 calibration with test server infrastructure"
   ```

---

## Lessons Learned

1. **Server vs Setup Confusion**: `pnpm setup` was overloaded - needed separate commands
2. **File Naming Consistency**: Fixed with runtime symlink
3. **Documentation Gaps**: Troubleshooting had incorrect instructions
4. **Missing Infrastructure**: No script existed to serve port 8765

**Resolution:** Clear separation of concerns with dedicated scripts and comprehensive docs.

---

## Related Documentation

- [CALIBRATION-GUIDE.md](apps/qa/docs/CALIBRATION-GUIDE.md) - Full calibration documentation
- [TROUBLESHOOTING.md](apps/qa/docs/TROUBLESHOOTING.md) - Common issues and solutions
- [README.md](apps/qa/README.md) - Quick start and command reference
