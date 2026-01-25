# Asterisk Architecture

> **Last Updated:** January 24, 2026
> **Version:** 0.1.0 (Beta)

## Table of Contents

- [Overview](#overview)
- [System Components](#system-components)
- [Security Architecture](#security-architecture)
- [Data Flow](#data-flow)
- [Matching Engine](#matching-engine)
- [Extension Architecture](#extension-architecture)
- [Desktop App Architecture](#desktop-app-architecture)
- [Technology Stack](#technology-stack)

---

## Overview

Asterisk is a form-filling assistant that combines pattern matching with LLM-powered field identification. The system consists of three main components:

1. **Chrome Extension** (Manifest V3) - Detects forms, communicates with desktop app
2. **Desktop App** (Tauri + Rust) - Manages vault, generates fill plans, LLM matching
3. **Shared Core** (@asterisk/core) - Type definitions and matching logic

**Key Design Principles:**
- **Security-first**: Content Security Policy, sender verification, ephemeral cache
- **Privacy-preserving**: Sensitive data masked in UI, vault data encrypted at rest
- **Offline-capable**: 5-minute vault cache enables form filling during brief disconnections
- **Extensible**: Three-tier matching engine (autocomplete → pattern → LLM)

---

## System Components

### 1. Chrome Extension (Manifest V3)

**Purpose:** Detect forms on web pages, send snapshots to desktop, inject fill commands.

**Components:**
- **Background Service Worker** (`background.ts`) - Message routing, vault caching, polling
- **Content Script** (`content.ts`) - Form detection, field extraction, DOM injection
- **Popup UI** (`popup.tsx`) - Form preview, fill button, connection status

**Key Features:**
- Service worker-based architecture (no persistent background page)
- Chrome Alarms API for reliable 1-second polling
- Message sender verification (prevents cross-extension attacks)
- 5-minute vault cache TTL (security vs UX balance)

### 2. Desktop Application (Tauri)

**Purpose:** Manage vault, generate fill plans, LLM matching, serve HTTP bridge.

**Components:**
- **HTTP Bridge** (`src-tauri/src/http.rs`) - REST API for extension communication
- **Vault Manager** (`src-tauri/src/vault.rs`) - Encrypted storage and retrieval
- **Matching Engine** (`packages/core/src/matching/`) - Field matching logic
- **LLM Integration** (`src-tauri/src/llm.rs`) - Claude/OpenAI API calls

**Key Features:**
- Encrypted vault storage (AES-256-GCM)
- Three-tier matching engine (autocomplete → pattern → LLM)
- HTTP server on localhost:1420
- Audit logging for compliance

### 3. Shared Core (@asterisk/core)

**Purpose:** Type definitions and matching logic shared between extension and desktop.

**Exports:**
- TypeScript types (`FieldNode`, `FillPlan`, `VaultItem`, etc.)
- Matching utilities (`autocompleteMatch`, `patternMatch`, `llmMatch`)
- Validation schemas (Zod)

---

## Security Architecture

### Content Security Policy (CSP)

**Configuration:** `apps/extension/src/config/security.ts`

The extension uses a strict Content Security Policy to prevent XSS and code injection attacks:

```typescript
CSP_POLICY = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],  // No inline scripts
  styleSrc: ["'self'", "'unsafe-inline'"],  // React CSS-in-JS
  connectSrc: ["'self'", "http://localhost:*", "http://127.0.0.1:*"]
}
```

**Security Guarantees:**
- ✅ No inline script execution (XSS prevention)
- ✅ Only localhost connections (prevents data exfiltration)
- ✅ Synchronized across `popup.html` and manifest

**Verification:** 14 tests in `apps/extension/src/__tests__/security-config.test.ts`

### Message Sender Verification

**Threat Model:** Malicious extensions could attempt to inject fill commands or extract vault data.

**Mitigation:** `apps/extension/src/background.ts:380-384`

```typescript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id && sender.id !== chrome.runtime.id) {
    console.warn('[Asterisk] Rejecting message from unknown sender:', sender.id);
    return false;
  }
});
```

**Security Guarantees:**
- ✅ Only messages from own extension processed
- ✅ Cross-extension attacks prevented
- ✅ Spoofed sender IDs rejected

**Verification:** 22 tests in `apps/extension/src/__tests__/background.test.ts`

### Sensitive Data Masking

**Threat Model:** User credentials visible in popup could be screenshotted or observed.

**Mitigation:** All 11 sensitive field types masked with bullets (••••••••):

```typescript
const sensitiveSemantics = new Set([
  'password', 'creditCard', 'cvv', 'ssn',
  'dateOfBirth', 'securityAnswer', 'pin',
  'accountNumber', 'routingNumber', 'bankAccount', 'taxId',
]);
```

**Security Guarantees:**
- ✅ 11 sensitive field types always masked
- ✅ O(1) lookup performance using Set
- ✅ Password fields masked regardless of semantic

**Verification:** 25 tests in `apps/extension/src/__tests__/FieldPreviewList.test.tsx`

### Vault Cache TTL

**Threat Model:** Service worker memory could be dumped by malicious process.

**Design Decision - Why 5 minutes?**
- Short enough: Limits sensitive data exposure window
- Long enough: Covers typical form-filling session (1-3 minutes)
- Aligned with service worker lifecycle

**Security Guarantees:**
- ✅ Cache expires after 5 minutes
- ✅ Cache cleared on extension suspend
- ✅ No disk persistence (memory-only)
- ✅ Secure by default (empty cache on restart)

**Verification:** 15 tests in `apps/extension/src/__tests__/vault-cache.test.ts`

**Reference:** See `SECURITY.md` for comprehensive security documentation (182 lines)

---

## Data Flow

### Form Detection and Snapshot

```
Web Page → Content Script → Background Worker → Desktop App
         (extract fields)    (check cache)     (generate plan)
```

**Flow:**
1. Content script detects form on page load (~50ms)
2. Extracts field information (name, label, type, autocomplete)
3. Sends ASTERISK_FORM_SNAPSHOT to background worker
4. Background checks vault cache (valid < 5 min)
5. If cache expired, requests fill plan from desktop app
6. Desktop generates fill plan using 3-tier matching
7. Background caches vault items and displays in popup

### Fill Plan Generation

**Three-Tier Matching:**

1. **Tier 1: Autocomplete** (confidence: 0.95)
   - Exact `autocomplete` attribute match
   - Example: `autocomplete="email"` → `email` vault key

2. **Tier 2: Pattern** (confidence: 0.75)
   - Regex patterns on label/name/id
   - Example: `/email/i` matches "E-mail Address"

3. **Tier 3: LLM** (confidence: 0.6-0.9)
   - Claude/OpenAI analyzes field context
   - Example: "Your organization" → `companyName` vault key

### Form Filling

```
Popup UI → Background → Desktop App → Background → Content Script → DOM
        (Click Fill)   (POST command) (Create ID)  (Poll)      (Inject)
```

**Timing:**
- Form snapshot → Fill plan: ~200ms (pattern only), ~3s (with LLM)
- "Apply" click → Fields filled: <2s (includes 1s polling latency)
- Total UX: 2-5 seconds from detection to filled form

---

## Matching Engine

### Pattern Library

**Email Detection:**
```typescript
const EMAIL_PATTERNS = [
  /email/i, /e-mail/i, /electronic.?mail/i, /^mail$/i
];
```

**Phone Detection:**
```typescript
const PHONE_PATTERNS = [
  /phone/i, /mobile/i, /cell/i, /telephone/i, /contact.?number/i
];
```

**Address Detection:**
```typescript
const ADDRESS_PATTERNS = {
  street: /street|address.?line.?1|addr/i,
  city: /city|town/i,
  state: /state|province|region/i,
  zip: /zip|postal/i,
};
```

### LLM Prompt Strategy

**System Prompt:**
```
You are a form field classifier. Given a field's label, name, placeholder,
and surrounding context, identify which vault item should fill it.

Return JSON: { vaultKey: "email", confidence: 0.85, reasoning: "..." }
```

---

## Extension Architecture

### Service Worker Lifecycle

1. **Idle** → Message received → **Active**
2. **Active** → Chrome Alarm (1s) → **Polling**
3. **Polling** → Check pending commands → **Active**
4. **Active** → 30s idle → **Suspended** (cache cleared)
5. **Suspended** → Message → **Active**

**Key Design Decisions:**
- Chrome Alarms API for reliable polling (survives suspend)
- `useRef` for cleanup in React (prevent memory leaks)
- `useCallback` for event handlers (prevent re-renders)

---

## Desktop App Architecture

### HTTP Bridge API

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/forms/snapshot` | Send form snapshot, receive fill plan |
| POST | `/api/fill-commands` | Create fill command for polling |
| GET | `/api/fill-commands/pending` | Poll for pending commands |
| DELETE | `/api/fill-commands/{id}` | Mark command executed |
| GET | `/api/vault/items` | Get all vault items |

**CORS:** Only allows extension origin with credentials.

### Vault Storage

**Encryption:** AES-256-GCM with OS keychain for key storage

**File Location:**
- macOS: `~/Library/Application Support/com.asterisk.app/vault.bin`
- Windows: `%APPDATA%/com.asterisk.app/vault.bin`
- Linux: `~/.local/share/com.asterisk.app/vault.bin`

---

## Technology Stack

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 18.3.1 | UI framework |
| TypeScript | 5.7.3 | Type safety |
| Vite | 6.0.12 | Build tool |
| Vitest | 2.1.9 | Unit testing |
| Playwright | 1.50.4 | E2E testing |

### Backend

| Technology | Version | Purpose |
|------------|---------|---------|
| Tauri | 2.2.1 | Desktop framework |
| Rust | 1.84.0 | Systems language |
| Axum | 0.8.1 | HTTP server |
| tokio | 1.43.0 | Async runtime |

---

## Testing Strategy

### Unit Tests (91 total)

| Suite | Tests | Coverage |
|-------|-------|----------|
| popup.test.tsx | 15 | Popup UI logic |
| FieldPreviewList.test.tsx | 25 | Sensitive masking |
| background.test.ts | 22 | Sender verification |
| vault-cache.test.ts | 15 | Cache TTL |
| security-config.test.ts | 14 | CSP sync |

**Run:** `cd apps/extension && pnpm test`

### E2E Tests (7 total)

- Content script loads
- Form detection
- Field extraction
- Programmatic fill
- Error handling
- Multiple forms
- Advanced features

**Run:** `cd apps/qa && pnpm test:e2e`

---

## Performance Characteristics

### Benchmarks (Typical Form, 8 fields)

| Operation | Time |
|-----------|------|
| Form detection | ~50ms |
| Autocomplete matching | <1ms |
| Pattern matching | <5ms |
| LLM matching (1 field) | ~2s |
| Fill plan (no LLM) | ~200ms |
| Fill plan (with LLM) | ~3s |
| Fill execution | <100ms |

### Scalability

- **Extension:** Unlimited tabs (shared service worker)
- **Desktop:** ~100 concurrent fills (HTTP pool limit)
- **Vault:** Tested with 1000 items, <10ms search
- **Cache:** 5-min TTL, auto-clears on suspend

---

## Future Improvements

### Short-term (< 1 month)

1. **Parallel LLM Requests** - 2.5s for 3 fields vs 6s sequential
2. **Field Fingerprint Caching** - Avoid re-analyzing identical fields
3. **Progressive UI Updates** - Show matches as they complete

### Medium-term (1-3 months)

1. **Form Template Recognition** - Cache entire form patterns
2. **Local Field Classifier** - ONNX model for obvious cases
3. **Multi-Vault Support** - Work vs Personal profiles

### Long-term (3-6 months)

1. **Fine-tuned LLM** - 10x faster, 50% cheaper
2. **Edge LLM** - Run Llama 3 8B locally (Ollama)
3. **Learning from Corrections** - Retrain from user feedback
