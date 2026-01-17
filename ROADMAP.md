# Asterisk Roadmap

Development roadmap and feature tracking for the Asterisk form-filling assistant.

## Current Status

### ✅ Completed (v0.1.0)

- **Core Infrastructure**
  - Tauri desktop app with React UI
  - Chrome extension (Manifest V3) with content + background scripts
  - HTTP bridge for extension ↔ desktop communication
  - In-memory vault storage
  - Form snapshot detection and extraction

- **Matching Engine**
  - Tier 1: Autocomplete attribute matching (95% confidence)
  - Tier 2: Pattern matching (70-90% confidence)
  - Tier 3: LLM-powered matching via Claude API (≤90% confidence)

- **Form Injection**
  - FillCommand system (desktop → extension)
  - Chrome Alarms API for persistent polling
  - Field filling with React/Vue event compatibility
  - Audit logging for fill operations

- **UI Features**
  - Vault management (CRUD operations)
  - Settings tab with API key configuration
  - Match tab with fill plan generation
  - Review & Apply dialog with confidence badges
  - Audit log viewer

- **Quality Assurance**
  - E2E test suite with Playwright (6/6 tests passing)
  - Unit tests for matching logic (10 TypeScript, 4 Rust)
  - Test fixtures and automation scripts

---

## In Progress

### 🚧 Testing & Documentation (Sprint 1)

**GitHub Issues:** #15, #16, #17

- [ ] Real-world E2E testing with various forms
- [ ] Performance benchmarking and optimization
- [ ] Documentation with screenshots and diagrams
- [ ] Demo video/GIF creation
- [ ] Architecture documentation updates

**Target:** End of Sprint 1 (1-2 weeks)

---

## Planned Features

### Phase 1: Core Improvements (Months 1-2)

#### Performance Optimization (#17)
- [ ] Parallel LLM API requests
- [ ] Field fingerprint caching
- [ ] Batch LLM analysis
- [ ] Local field classifier (avoid LLM for obvious cases)

**Success Criteria:** < 5s LLM analysis for typical forms

#### Learning from Corrections (#18)
- [ ] Capture user corrections in Review dialog
- [ ] Store correction history
- [ ] Convert corrections to pattern rules
- [ ] Show "Learned from X corrections" badge

**Success Criteria:** Measurable accuracy improvement

---

### Phase 2: User Experience (Months 2-3)

#### Multiple Vault Profiles (#19)
- [ ] Profile management UI
- [ ] Profile switching (work/personal)
- [ ] Domain-based auto-switching
- [ ] Profile-scoped vault storage

**Success Criteria:** Users can maintain separate profiles

#### Form Template Recognition (#20)
- [ ] Form fingerprinting
- [ ] Template caching
- [ ] Template management UI
- [ ] Auto-suggest templates after repeated use

**Success Criteria:** > 50% template hit rate for power users

---

### Phase 3: Security & Privacy (Months 3-4)

#### Encrypted Vault Storage (#11)
- [ ] OS keychain integration
- [ ] AES-256 encryption at rest
- [ ] Master password support
- [ ] Secure key derivation (Argon2)

**Success Criteria:** All vault data encrypted

#### Data Import/Export (#12)
- [ ] Export vault to JSON
- [ ] Import from JSON with validation
- [ ] Export/import profiles
- [ ] Migration tool for v1 → v2 format

**Success Criteria:** Users can backup and restore data

---

### Phase 4: Intelligence (Months 4-6)

#### Auto-Learn from Fills (#10)
- [ ] Detect new fields during fill
- [ ] Suggest creating vault items
- [ ] Auto-capture field values (with permission)
- [ ] Incremental vault building

**Success Criteria:** Vault grows automatically

#### Advanced Matching
- [ ] Multi-field context (e.g., "First Name" + "Last Name" → full name)
- [ ] Conditional matching (country-specific formats)
- [ ] Confidence boosting from user feedback
- [ ] Form section understanding

**Success Criteria:** > 95% match accuracy

---

## Future Vision (6+ months)

### Enterprise Features
- [ ] Team vault sharing
- [ ] Role-based access control
- [ ] Audit trails for compliance
- [ ] Policy enforcement (e.g., never auto-fill SSN)

### Browser Support
- [ ] Firefox extension
- [ ] Safari extension
- [ ] Edge extension (Chromium-based)

### Advanced AI
- [ ] Fine-tuned model for form classification
- [ ] Edge LLM for instant matching (no API)
- [ ] Multi-modal form understanding (images, PDFs)

### Integrations
- [ ] Password manager integration (1Password, Bitwarden)
- [ ] CRM integration (Salesforce, HubSpot)
- [ ] Calendar integration (auto-fill event details)

---

## Non-Goals

Things we explicitly won't do:

- ❌ Password autofill (use dedicated password managers)
- ❌ Payment autofill (PCI compliance complexity)
- ❌ Cloud sync (privacy-first, local-only)
- ❌ Browser history tracking
- ❌ Advertising or analytics

---

## Versioning

- **v0.1.0** (Current) - MVP with LLM matching
- **v0.2.0** (Planned) - Performance + Learning
- **v0.3.0** (Planned) - Profiles + Templates
- **v0.4.0** (Planned) - Security + Encryption
- **v1.0.0** (Target) - Production-ready

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development guidelines.

Feature requests and bug reports: https://github.com/wildcard/asterisk/issues

---

## Changelog

### v0.1.0 (2026-01-17)

**Features:**
- 3-tier hybrid matching (autocomplete, pattern, LLM)
- Claude API integration for semantic field analysis
- Form injection via Chrome extension
- Vault management UI
- Audit logging
- E2E test suite

**Performance:**
- < 3s LLM analysis for small forms (< 5 fields)
- < 2s form fill latency (extension polling)

**Known Issues:**
- Extension poll cycle = 1 min (Chrome Alarms API limitation)
- No caching yet (LLM called every time)
- No encryption (vault stored in plain text)

---

Last Updated: 2026-01-17
