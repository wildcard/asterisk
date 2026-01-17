# Asterisk

[![CI](https://github.com/wildcard/asterisk/actions/workflows/ci.yml/badge.svg)](https://github.com/wildcard/asterisk/actions/workflows/ci.yml)
[![License: MPL 2.0](https://img.shields.io/badge/License-MPL_2.0-brightgreen.svg)](https://opensource.org/licenses/MPL-2.0)

**Grammarly for forms** - An intelligent form-filling assistant that helps you complete web forms accurately and efficiently.

## Overview

Asterisk is a desktop application that acts as a smart assistant for filling out web forms. It combines form intelligence with secure personal data management to provide a seamless form-filling experience.

## Architecture

Asterisk is built as a monorepo using pnpm workspaces and Turborepo, with a clear separation between two core components:

### Form Expert vs User Vault

This project maintains a strict architectural separation between two distinct domains:

#### 1. Form Expert (Analysis & Intelligence)
- **Purpose**: Understands form structure, requirements, and context
- **Responsibilities**:
  - Analyzes form fields and their semantics
  - Identifies required vs optional fields
  - Understands field types, validation rules, and constraints
  - Generates fill plans based on form requirements
  - Provides contextual suggestions
- **Data Flow**: Form structure → Analysis → Fill recommendations
- **No Access To**: User's personal data or vault contents

#### 2. User Vault (Personal Data Storage)
- **Purpose**: Securely stores and manages user's personal information
- **Responsibilities**:
  - Stores user data items (name, address, email, etc.)
  - Tracks data provenance (where data came from)
  - Provides CRUD operations for personal data
  - Eventually: Encrypts data at rest
- **Data Flow**: User input → Secure storage → Controlled retrieval
- **No Access To**: Form context or analysis logic

**Why This Separation Matters**:
- **Security**: Personal data is isolated from form analysis logic
- **Privacy**: Form structure analysis doesn't need access to sensitive data
- **Modularity**: Each component can evolve independently
- **Testing**: Easier to test and verify security properties
- **Trust**: Clear boundaries make security audits straightforward

## Project Structure

```
asterisk/
├── apps/
│   └── desktop/          # Tauri + React + TypeScript desktop app
├── packages/
│   └── core/             # Shared TypeScript types
├── crates/
│   └── vault/            # Rust vault library (secure storage)
└── docs/                 # Architecture and design documentation
```

## Getting Started

### Prerequisites

- Node.js 18+ and pnpm 9+
- Rust 1.70+ and Cargo
- Platform-specific Tauri dependencies (see [Tauri Prerequisites](https://v2.tauri.app/start/prerequisites/))

### Installation

```bash
# Install dependencies
pnpm install

# Run desktop app in development mode
pnpm dev

# Build all packages
pnpm build
```

### Available Commands

- `pnpm dev` - Start development server
- `pnpm build` - Build all packages
- `pnpm typecheck` - Run TypeScript type checking
- `pnpm lint` - Run linters
- `pnpm test` - Run tests
- `pnpm format` - Format code with Prettier

## Technology Stack

- **Frontend**: React + TypeScript + Vite
- **Desktop**: Tauri (Rust + WebView)
- **Monorepo**: pnpm workspaces + Turborepo
- **Storage**: Rust (in-memory, swappable to encrypted)

## Documentation

- [Architecture Overview](./docs/architecture.md)
- [Data Separation Design](./docs/data-separation.md)
- [Threat Model](./docs/threat-model.md)

## Features

### Trust & UX (PR1)
- **Review & Apply Dialog**: Review all form fills before applying with confidence-based disposition
  - Safe (≥98% confidence): Auto-approved matches
  - Review (90-98%): User confirmation recommended
  - Blocked (<90%): Requires explicit user selection
- **Undo Functionality**: Toast notification with undo button to revert fills
- **Audit Log**: Append-only JSONL audit trail with:
  - Per-field match confidence and disposition
  - Redacted old/new values (PII protection)
  - User confirmation tracking
  - Expandable audit entries with full field details
- **Fill Plan Analysis**: Multi-tier matching strategy
  - Tier 1: Autocomplete attribute matching (95% confidence)
  - Tier 2: Pattern-based matching (label, name, id)
  - Tier 3: LLM-powered matching for ambiguous fields

### Chrome Extension Bridge
- HTTP server (port 17373) for desktop ↔ extension communication
- Form snapshot capture and analysis
- Fill command execution via extension
- Real-time form detection

### Vault Management
- CRUD operations for personal data items
- Provenance tracking (source, timestamp, confidence)
- Category-based organization (identity, contact, address, financial, custom)
- Usage statistics and metadata

## Current Status

**Phase 2: Trust & UX** (Completed)
- ✅ Monorepo scaffold
- ✅ TypeScript type definitions
- ✅ Rust vault crate (in-memory storage)
- ✅ Tauri desktop app with vault UI
- ✅ Chrome extension with form detection
- ✅ Form-to-vault matching with tiered strategy
- ✅ Fill plan review dialog with confidence gating
- ✅ Audit logging with PII redaction
- ✅ Undo functionality

**Next Phase: Enhancement**
- 🚧 LLM-powered matching for unmatched fields
- 🚧 Vault item creation from form fills
- 🚧 Encrypted vault storage
- 🚧 Data export/import

## License

This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.

## Contributing

Contributions are welcome! Please read our contributing guidelines and code of conduct before submitting pull requests.
