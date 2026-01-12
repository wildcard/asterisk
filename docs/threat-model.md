# Asterisk Threat Model

## Overview

This document analyzes potential security threats to Asterisk and the mitigations in place or planned.

## Asset Classification

### Critical Assets
1. **User Personal Data** (vault contents)
   - Names, addresses, email, phone numbers
   - Financial information (credit cards, bank accounts)
   - Identity documents
   - Passwords and credentials

2. **Encryption Keys** (future)
   - Vault encryption master key
   - Per-item encryption keys

### Important Assets
3. **Form Fill History**
   - Which forms were filled
   - When fills occurred
   - Fill success/failure

4. **Application Configuration**
   - User preferences
   - Vault settings
   - Form detection rules

### Less Critical Assets
5. **Form Analysis Data**
   - Detected form structures
   - Field classifications
   - Fill plans

## Trust Boundaries

```
┌─────────────────────────────────────────────────────────┐
│ User's Computer (Trusted)                               │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │ Asterisk App (High Trust)                      │    │
│  │                                                 │    │
│  │  ┌──────────────────┐    ┌──────────────────┐ │    │
│  │  │ Form Expert      │    │ User Vault       │ │    │
│  │  │ (Medium Trust)   │    │ (Highest Trust)  │ │    │
│  │  └──────────────────┘    └──────────────────┘ │    │
│  │                                                 │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │ File System (Medium Trust)                     │    │
│  │ - Config files, logs, cached data              │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
└─────────────────────────────────────────────────────────┘
         │
         │ Network (Untrusted)
         ▼
┌─────────────────────────────────────────────────────────┐
│ Web Browser / Internet (Untrusted)                      │
│ - Form pages, malicious sites, MITM attackers          │
└─────────────────────────────────────────────────────────┘
```

## Threat Categories

### 1. Data Theft Threats

#### T1.1: Malicious App Accessing Vault
**Threat**: Other applications on user's computer read vault data

**Current Mitigation**:
- Vault stored in user's home directory with standard OS permissions
- Rust memory safety prevents buffer overflows

**Future Mitigation**:
- Encrypt vault at rest using OS keychain
- Require user authentication before vault access
- Memory protection for decrypted data

**Risk**: HIGH (v1), LOW (with encryption)

#### T1.2: Memory Scraping Attack
**Threat**: Malware dumps process memory to steal vault data

**Current Mitigation**:
- Minimal time data spends in plaintext memory
- Rust's ownership system prevents data leaks

**Future Mitigation**:
- Zero plaintext data in memory when app is idle
- Secure memory wiping after operations
- OS-level memory protection

**Risk**: MEDIUM

#### T1.3: Browser Extension Stealing Data
**Threat**: Malicious extension intercepts filled form data

**Mitigation**:
- Desktop app, not browser extension (isolated process)
- Fill operations controlled by Tauri, not web context
- No JavaScript injection into browser (v1)

**Risk**: LOW

### 2. Data Manipulation Threats

#### T2.1: Vault Corruption
**Threat**: File system corruption or malicious modification of vault

**Current Mitigation**:
- File system integrity depends on OS
- Rust's Result types ensure errors are handled

**Future Mitigation**:
- Checksums/HMAC for vault integrity
- Backup and recovery mechanisms
- Atomic write operations

**Risk**: MEDIUM

#### T2.2: Form Injection Attack
**Threat**: Malicious website tricks user into filling malicious form

**Mitigation**:
- User always approves fill operations (explicit consent)
- Form context shown to user before fill
- URL/domain verification

**Risk**: MEDIUM

### 3. Privilege Escalation Threats

#### T3.1: Tauri IPC Exploitation
**Threat**: Malicious JavaScript calls Tauri commands to access vault

**Mitigation**:
- Tauri's IPC validates all command calls
- Commands require specific parameters
- No arbitrary code execution via IPC

**Future Mitigation**:
- Rate limiting on vault operations
- Command signing/verification
- User confirmation for sensitive operations

**Risk**: LOW

#### T3.2: Form Expert → Vault Access
**Threat**: Compromised form analysis code accesses vault directly

**Mitigation**:
- Architectural separation (see data-separation.md)
- Form expert has no vault API access
- UI layer mediates all vault operations

**Risk**: LOW (by design)

### 4. Information Disclosure Threats

#### T4.1: Log File Leakage
**Threat**: Sensitive data logged to disk in plaintext

**Mitigation**:
- Structured logging with sensitivity levels
- No vault data in logs
- Logs stored in protected directory

**Future Mitigation**:
- Encrypted logs for sensitive operations
- Log rotation and secure deletion
- Audit trail for vault access

**Risk**: MEDIUM

#### T4.2: Error Messages Exposing Data
**Threat**: Error dialogs show vault contents

**Mitigation**:
- Error messages show structure, not data
- User-facing errors are sanitized
- Detailed errors only in debug mode

**Risk**: LOW

### 5. Denial of Service Threats

#### T5.1: Resource Exhaustion
**Threat**: Malicious forms cause infinite loops or memory exhaustion

**Mitigation**:
- Rust's memory safety prevents most crashes
- Form analysis has complexity limits
- Tauri process isolation

**Future Mitigation**:
- Timeouts on analysis operations
- Maximum form size limits
- Rate limiting

**Risk**: LOW

### 6. Supply Chain Threats

#### T6.1: Dependency Vulnerabilities
**Threat**: Compromised npm or crates.io packages

**Mitigation**:
- Minimal dependencies (Tauri, React, core libs)
- pnpm lockfile prevents unexpected updates
- Cargo.lock pins Rust dependencies

**Future Mitigation**:
- Automated security scanning (Dependabot)
- SBOM (Software Bill of Materials)
- Reproducible builds

**Risk**: MEDIUM

#### T6.2: Build Toolchain Compromise
**Threat**: Malicious code injected during build

**Mitigation**:
- Code signing for releases
- GitHub Actions with audit trail
- Reproducible builds

**Risk**: LOW

## Attack Scenarios

### Scenario 1: Malware on User's Machine

**Attack**:
1. User installs malware
2. Malware searches filesystem for Asterisk vault
3. Reads vault file directly

**Current Impact**: CRITICAL (plaintext vault)

**v1 Mitigation**:
- OS file permissions (user-only access)
- Detection difficult without encryption

**v2 Mitigation** (future):
- Vault encrypted with master key in OS keychain
- Malware cannot decrypt without user authentication
- Impact reduced to MEDIUM

### Scenario 2: Phishing Form Attack

**Attack**:
1. User visits malicious website
2. Site displays form mimicking legitimate service
3. User approves fill operation
4. Data submitted to attacker

**Impact**: HIGH (user data stolen)

**Mitigation**:
- Display URL/domain prominently before fill
- Warn on suspicious domains
- Optional: Whitelist of known-good domains

### Scenario 3: Form Expert Compromise

**Attack**:
1. Vulnerability in form analysis code
2. Attacker crafts malicious form that exploits bug
3. Form expert crashes or behaves unexpectedly

**Impact**: MEDIUM (DoS, not data theft)

**Mitigation**:
- Architectural separation prevents vault access
- Rust memory safety prevents exploits
- Process isolation contains damage

### Scenario 4: IPC Command Injection

**Attack**:
1. Malicious JavaScript loaded in app's webview
2. Attempts to call vault commands via IPC
3. Tries to exfiltrate vault data

**Impact**: LOW (Tauri validation)

**Mitigation**:
- Tauri validates all IPC messages
- CSP (Content Security Policy) prevents inline scripts
- App loads only local files, not remote content

## Security Requirements

### Mandatory (v1)
- [ ] Vault stored in user-protected directory
- [ ] No sensitive data in logs
- [ ] User approval required for all fills
- [ ] Error messages sanitized
- [ ] Dependencies pinned in lockfiles
- [ ] Code signing for releases

### High Priority (v2)
- [ ] Vault encryption at rest
- [ ] Master key in OS keychain (Keychain on macOS, Credential Manager on Windows, Secret Service on Linux)
- [ ] Memory wiping after operations
- [ ] Integrity checksums for vault
- [ ] Automatic security updates

### Medium Priority (v3)
- [ ] Multi-factor authentication for vault access
- [ ] Backup and recovery
- [ ] Audit trail for vault operations
- [ ] Encrypted logs
- [ ] Domain whitelisting

## Compliance Considerations

### GDPR (EU)
- **Right to Access**: Users can export vault data
- **Right to Erasure**: Users can delete vault items
- **Data Minimization**: Only store necessary data
- **Encryption**: Required for sensitive personal data (future)
- **Local Processing**: No cloud sync (v1) simplifies compliance

### CCPA (California)
- Similar to GDPR
- Users must be able to export and delete data

### Data Residency
- **v1**: All data local to user's machine
- **Future**: If cloud sync added, must respect data residency laws

## Incident Response Plan

### Data Breach Response

1. **Detection**: User reports or automated monitoring
2. **Containment**: Identify affected versions
3. **Assessment**: Determine scope (how many users, what data)
4. **Notification**: Inform affected users within 72 hours
5. **Remediation**: Release patched version
6. **Review**: Post-mortem and security improvements

### Vulnerability Disclosure

- **Contact**: security@asterisk.example (TBD)
- **Response Time**: Acknowledge within 48 hours
- **Remediation**: Patch critical vulnerabilities within 7 days
- **Disclosure**: Coordinated disclosure after patch release

## Security Testing

### Unit Tests
- Vault CRUD operations
- Error handling
- Input validation

### Integration Tests
- Tauri command security
- IPC validation
- Permission checks

### Security Tests (future)
- Fuzzing form parser
- Penetration testing
- Memory safety analysis (MIRI)
- Dependency scanning

## Security Roadmap

### Phase 1 (v1.0 - Current)
- [x] Architectural separation (Form Expert / Vault)
- [x] Rust memory safety
- [x] User approval for fills
- [ ] Code signing

### Phase 2 (v1.1)
- [ ] Vault encryption at rest
- [ ] OS keychain integration
- [ ] Memory wiping
- [ ] Integrity checksums

### Phase 3 (v2.0)
- [ ] Multi-factor authentication
- [ ] Audit logging
- [ ] Backup/recovery
- [ ] Security update mechanism

### Phase 4 (v3.0)
- [ ] Cloud sync (optional)
- [ ] Zero-knowledge architecture
- [ ] Advanced threat detection

## Review Schedule

This threat model should be reviewed:
- After each major release
- When new features are added
- After any security incident
- At least quarterly

**Last Reviewed**: 2026-01-11
**Next Review**: 2026-04-11
