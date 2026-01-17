# Codebase Report: Chrome Extension to Desktop Communication Analysis
Generated: 2026-01-15

## Summary

The Asterisk Chrome extension currently implements ONE-WAY communication: extension → desktop. Form snapshots are sent via HTTP POST to a local server running on the desktop app. There is NO existing mechanism for the desktop to send commands BACK to the extension for form filling.

## Current Communication Architecture

### 1. Extension → Desktop (WORKING)

**Flow:**
```
Web Page
  ↓ (DOM extraction)
Content Script (content.ts)
  ↓ (chrome.runtime.sendMessage)
Background Service Worker (background.ts)
  ↓ (HTTP POST to http://127.0.0.1:17373/v1/form-snapshots)
Desktop HTTP Server (lib.rs)
  ↓ (stores in FormSnapshotState)
Tauri App
```

**Protocol:** HTTP REST API
**Port:** 17373 (localhost only)
**Endpoint:** `POST /v1/form-snapshots`

**Security:** CORS-enabled for localhost only. No authentication (local-only trust model).

### 2. Desktop → Extension (MISSING - NEEDS IMPLEMENTATION)

Currently NO mechanism exists for:
- Desktop sending fill commands to extension
- Extension receiving fill values
- Content script injecting values into DOM

## Key Files Analyzed

### Extension Files

#### `/Users/kobik-private/workspace/asterisk/apps/extension/src/content.ts` (VERIFIED)
**Purpose:** Detects forms on web pages and extracts structure WITHOUT user values.

**Key Functions:**
- `scanPageForForms()` - Finds all forms on page
- `extractFormSnapshot()` - Extracts field metadata
- `sendSnapshotsToBackground()` - Sends to background worker

**Security Note:** Deliberately NEVER captures `currentValue` from fields (privacy by design).

**DOM Access:** Has direct access to page DOM for field injection.

#### `/Users/kobik-private/workspace/asterisk/apps/extension/src/background.ts` (VERIFIED)
**Purpose:** Service worker that bridges content script to desktop via HTTP.

**Current Message Handlers:**
- Listens for `ASTERISK_FORM_SNAPSHOT` messages from content script
- Forwards to desktop via `POST http://127.0.0.1:17373/v1/form-snapshots`

**Health Check:** Pings `/health` endpoint to detect desktop availability.

### Desktop Files

#### `/Users/kobik-private/workspace/asterisk/apps/desktop/src-tauri/src/lib.rs` (VERIFIED)
**Purpose:** Tauri backend with HTTP server for extension bridge.

**Existing HTTP Endpoints:**
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Health check |
| POST | `/v1/form-snapshots` | Receive form snapshots |
| GET | `/v1/form-snapshots` | Retrieve latest snapshot (browser fallback) |
| GET | `/v1/vault` | List all vault items |
| POST | `/v1/vault` | Add vault item |
| DELETE | `/v1/vault?key=xxx` | Delete vault item |

**Thread Model:** HTTP server runs in separate thread, shares state via `Arc<Mutex<>>`.

**CORS:** Wildcard `*` origin allowed (local-only, no network exposure).

### Type Definitions

#### `/Users/kobik-private/workspace/asterisk/packages/core/src/types.ts` (VERIFIED)
Contains shared TypeScript types including:
- `FormSnapshot` - Form structure data
- `FieldNode` - Individual field metadata
- `FillPlan` - Desktop-generated recommendations (EXISTS but not used yet)
- `FillRecommendation` - Field-level fill instructions

**Important:** `FieldNode.currentValue` is marked `@internal` - ONLY for fill operations, never for extraction.

## Recommended Implementation for Form Injection

### Approach: HTTP Endpoint + Extension Polling

Since Chrome extensions in Manifest V3 cannot receive push messages from external servers, use a polling approach:

**Architecture:**
```
Desktop App
  ↓ (generates FillPlan when user approves)
  ↓ (stores in shared state: Arc<Mutex<Option<FillCommand>>>)
HTTP Endpoint: GET /v1/fill-commands
  ↓ (extension polls every N seconds or on demand)
Background Service Worker
  ↓ (chrome.tabs.sendMessage to content script)
Content Script
  ↓ (fills DOM fields with values)
Web Page
```

### Required Changes

#### 1. Desktop: Add Fill Command Endpoint (lib.rs)

**New State:**
```rust
pub struct FillCommandState {
    pub pending: Arc<Mutex<Option<FillCommand>>>,
}

#[derive(Serialize, Deserialize)]
pub struct FillCommand {
    pub form_fingerprint: String,
    pub fills: Vec<FieldFill>,
}

#[derive(Serialize, Deserialize)]
pub struct FieldFill {
    pub field_id: String,
    pub value: String,
}
```

**New Endpoint:**
```rust
// Route: GET /v1/fill-commands
// Returns pending fill command and clears it (one-time use)
```

#### 2. Extension Background: Poll for Fill Commands (background.ts)

**Add:**
```typescript
// Poll every 2 seconds when extension is active
setInterval(async () => {
  const response = await fetch('http://127.0.0.1:17373/v1/fill-commands');
  if (response.ok) {
    const command = await response.json();
    if (command) {
      // Send to active tab's content script
      chrome.tabs.query({active: true}, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'ASTERISK_FILL_FORM',
          payload: command
        });
      });
    }
  }
}, 2000);
```

#### 3. Extension Content: Handle Fill Messages (content.ts)

**Add Message Listener:**
```typescript
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'ASTERISK_FILL_FORM') {
    const command = message.payload as FillCommand;
    fillFormFields(command);
  }
});

function fillFormFields(command: FillCommand) {
  for (const fill of command.fills) {
    const element = document.getElementById(fill.field_id) as HTMLInputElement;
    if (element) {
      element.value = fill.value;
      // Trigger input event for React/Vue reactivity
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
}
```

### Security Considerations

1. **Same-Origin Policy:** Already enforced (localhost only, CORS restricted).
2. **One-Time Commands:** Fill commands should be consumed once to prevent replay.
3. **User Confirmation:** Desktop must require explicit user approval before storing fill command.
4. **No Persistent Storage:** Fill commands should never be written to disk - memory only.

## Specific Files Requiring Modification

| File | Action | Difficulty |
|------|--------|------------|
| `/Users/kobik-private/workspace/asterisk/apps/desktop/src-tauri/src/lib.rs` | Add `FillCommandState` + GET endpoint | Medium |
| `/Users/kobik-private/workspace/asterisk/apps/extension/src/background.ts` | Add polling + message forwarding | Easy |
| `/Users/kobik-private/workspace/asterisk/apps/extension/src/content.ts` | Add fill message handler | Easy |
| `/Users/kobik-private/workspace/asterisk/packages/core/src/types.ts` | Add `FillCommand` type | Easy |

## Alternative Approaches Considered

### 1. WebSockets (REJECTED)
**Pros:** Real-time push from desktop to extension.
**Cons:** 
- More complex state management
- Chrome extension service workers can sleep, breaking connection
- Manifest V3 restrictions on persistent connections

### 2. Native Messaging (REJECTED)
**Pros:** Official Chrome API for extension-native communication.
**Cons:**
- Requires JSON manifest registration
- More complex setup for end users
- Still requires polling or event-based triggers

### 3. HTTP Polling (RECOMMENDED)
**Pros:**
- Simple, already using HTTP
- No persistent connections
- Resilient to service worker sleep
**Cons:**
- Slight latency (2-3 second delay)
- More HTTP requests (mitigated by localhost)

## Open Questions

1. **Polling Frequency:** 2 seconds or event-based (when form detected)?
2. **Multi-Tab Handling:** How to route fill command to correct tab?
3. **Form Fingerprint Matching:** How to ensure fill command matches current form?
4. **Error Handling:** What if field IDs changed since snapshot?

