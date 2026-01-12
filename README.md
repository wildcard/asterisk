# Asterisk

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

## Current Status

**Phase 1: Foundation** (Current)
- ✅ Monorepo scaffold
- ✅ TypeScript type definitions
- ✅ Rust vault crate (in-memory)
- ✅ Tauri desktop app with vault UI
- 🚧 Form detection (not yet implemented)
- 🚧 AI-powered analysis (not yet implemented)

## License

This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.

## Contributing

Contributions are welcome! Please read our contributing guidelines and code of conduct before submitting pull requests.
