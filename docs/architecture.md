# Asterisk Architecture

## System Overview

Asterisk is a desktop application for intelligent form filling, built with a clear separation between form analysis and personal data management.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Desktop Application                     │
│                    (Tauri + React + TS)                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────────┐      ┌──────────────────────┐    │
│  │                      │      │                      │    │
│  │    Form Expert       │      │    User Vault        │    │
│  │                      │      │                      │    │
│  │  • Form Detection    │      │  • Data Storage      │    │
│  │  • Field Analysis    │      │  • CRUD Operations   │    │
│  │  • Fill Planning     │      │  • Provenance Track  │    │
│  │  • Validation        │      │  • Encryption (TBD)  │    │
│  │                      │      │                      │    │
│  └──────────────────────┘      └──────────────────────┘    │
│           │                              │                   │
│           │                              │                   │
│           ▼                              ▼                   │
│  ┌──────────────────────────────────────────────────┐      │
│  │              Tauri IPC Layer                      │      │
│  └──────────────────────────────────────────────────┘      │
│                           │                                  │
└───────────────────────────┼──────────────────────────────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │  Rust Backend   │
                   │                 │
                   │  • Vault Crate  │
                   │  • Commands     │
                   └─────────────────┘
```

## Core Components

### 1. Frontend (React + TypeScript)

**Location**: `apps/desktop/src/`

**Responsibilities**:
- User interface for vault management
- Form detection overlay (future)
- Fill plan visualization (future)
- Settings and preferences

**Key Files**:
- `App.tsx` - Main application component
- `components/` - Reusable UI components
- `hooks/` - React hooks for Tauri IPC

### 2. Shared Types (TypeScript)

**Location**: `packages/core/`

**Purpose**: Type definitions shared between frontend and backend (via Rust's serde serialization)

**Key Types**:
- `FormBrief` - Form metadata and requirements
- `FieldNode` - Individual form field representation
- `FillPlan` - Planned fill actions
- `VaultItem` - User data with metadata
- `Provenance` - Data origin tracking

### 3. Vault Crate (Rust)

**Location**: `crates/vault/`

**Purpose**: Secure storage for user personal data

**Design**:
- `VaultStore` trait for swappable backends
- `InMemoryStore` implementation (current)
- Future: `EncryptedStore` with OS keychain integration

**API**:
```rust
pub trait VaultStore {
    fn set(&mut self, key: String, value: VaultItem) -> Result<()>;
    fn get(&self, key: &str) -> Result<Option<VaultItem>>;
    fn list(&self) -> Result<Vec<VaultItem>>;
    fn delete(&mut self, key: &str) -> Result<()>;
}
```

### 4. Tauri Commands

**Location**: `apps/desktop/src-tauri/src/lib.rs`

**Purpose**: Bridge between frontend and Rust backend

**Commands**:
- `vault_set` - Store a vault item
- `vault_get` - Retrieve a vault item
- `vault_list` - List all vault items
- `vault_delete` - Delete a vault item

## Data Flow

### Vault Operations

```
User Input (UI)
    │
    ▼
React Component
    │
    ▼
invoke('vault_set', { key, value })
    │
    ▼
Tauri IPC
    │
    ▼
Rust Command Handler
    │
    ▼
Vault Crate API
    │
    ▼
Storage Backend (InMemoryStore)
    │
    ▼
Result returned through IPC
    │
    ▼
UI Update
```

## Technology Choices

### Why Tauri?

- **Small Bundle**: ~10MB vs Electron's ~100MB
- **Memory Efficient**: Uses OS webview instead of bundling Chromium
- **Secure**: Rust backend with memory safety
- **Cross-Platform**: Windows, macOS, Linux from single codebase

### Why Rust for Backend?

- **Memory Safety**: No null pointers, buffer overflows
- **Performance**: Native speed for crypto operations
- **Security**: Type system prevents many vulnerability classes
- **Future-Proof**: Easy to integrate with system keychains

### Why Monorepo?

- **Code Sharing**: Types shared between TS and Rust
- **Atomic Changes**: Update types and consumers together
- **Build Optimization**: Turborepo caching
- **Developer Experience**: Single `pnpm dev` command

## Security Considerations

See [threat-model.md](./threat-model.md) for detailed security analysis.

**Key Principles**:
1. **Separation of Concerns**: Form analysis never accesses vault
2. **Minimal Trust**: Vault operations require explicit user action
3. **Encryption at Rest**: Future enhancement with OS keychain
4. **No Cloud Sync**: Local-only storage (v1)

## Future Enhancements

### Phase 2: Form Detection
- Browser extension or accessibility API
- Form field identification
- Context extraction

### Phase 3: AI Analysis
- LLM-based form understanding
- Smart field mapping
- Validation prediction

### Phase 4: Advanced Vault
- Encrypted storage with OS keychain
- Import/export functionality
- Data templates and profiles

## Build System

### Turborepo Pipeline

```json
{
  "dev": { "cache": false, "persistent": true },
  "build": { "dependsOn": ["^build"], "outputs": [...] },
  "typecheck": { "dependsOn": ["^build"] },
  "test": { "dependsOn": ["build"] }
}
```

### Package Dependencies

```
@asterisk/core (TS types)
    ↓
apps/desktop (depends on core for types)
    ↓
crates/vault (standalone Rust crate)
```

## Development Workflow

```bash
# Start everything in dev mode
pnpm dev

# Build production bundles
pnpm build

# Type check all TypeScript
pnpm typecheck

# Run tests
pnpm test
```

## Testing Strategy

- **Unit Tests**: Rust vault crate logic
- **Integration Tests**: Tauri command handlers
- **E2E Tests**: UI workflows (future)
- **Type Tests**: TypeScript type checking

## Performance Goals

- **App Startup**: < 1 second
- **Vault Operations**: < 10ms (in-memory)
- **Memory Usage**: < 50MB idle
- **Bundle Size**: < 15MB

## Deployment

- **Auto-Update**: Tauri's built-in updater
- **Code Signing**: Platform-specific signing
- **Distribution**: GitHub Releases + installers
