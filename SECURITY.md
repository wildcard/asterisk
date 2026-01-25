# Security Guidelines

This document outlines security considerations and best practices for Asterisk.

## Desktop API Communication

### Current Implementation

The extension currently communicates with the desktop app over **HTTP on localhost** (`http://127.0.0.1:17373`).

### Security Considerations

**Localhost HTTP is generally safe because:**
- Traffic never leaves the machine
- No network exposure to external attackers
- Browser same-origin policy provides isolation

**However, risks exist:**
- Malware with local network sniffing capabilities could intercept vault data
- Browser extensions from other vendors could potentially access localhost endpoints
- No encryption in transit (even locally)

### Recommended: HTTPS for Production

For production deployments, we recommend implementing HTTPS for the desktop API:

#### Option 1: Self-Signed Certificate (Recommended)

Generate a self-signed certificate for localhost:

```bash
# Generate certificate (one-time setup)
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/CN=localhost"

# Configure Tauri to use HTTPS
# Update src-tauri/src/main.rs to use TLS
```

**Pros:**
- Full encryption
- No external dependencies
- Works offline

**Cons:**
- Requires certificate trust configuration
- Certificate rotation needed annually

#### Option 2: Native Messaging (Most Secure)

Replace HTTP with Chrome's native messaging API.

**Pros:**
- No network layer at all
- Built-in Chrome security
- No certificates needed

**Cons:**
- Requires native messaging manifest setup
- Platform-specific configuration

### Implementation Timeline

- **Phase 1 (Current):** HTTP on localhost (acceptable for beta/development)
- **Phase 2 (Before v1.0):** HTTPS with self-signed cert
- **Phase 3 (Future):** Migrate to native messaging

## Vault Data Security

### Data at Rest

Vault data is stored in:
- **macOS:** `~/Library/Application Support/com.asterisk.desktop/vault.json`
- **Encrypted:** Yes, using OS-level encryption (FileVault on macOS)

### Data in Memory

**Extension:**
- Vault items cached in background script for 5 minutes
- Cache cleared on extension suspend
- Values masked in popup UI (passwords show as `••••••••`)

**Desktop:**
- Vault loaded into memory on startup
- Persists until app closes

### Sensitive Field Types

The following field semantics are always masked in the UI:

- `password` - User passwords
- `creditCard` - Credit card numbers
- `cvv` - Card security codes
- `ssn` - Social security numbers
- `dateOfBirth` - Birth dates
- `securityAnswer` - Security question answers
- `pin` - PIN numbers
- `accountNumber` - Bank account numbers
- `routingNumber` - Bank routing numbers
- `bankAccount` - General bank account info
- `taxId` - Tax identification numbers

## Chrome Extension Security

### Content Security Policy (CSP)

The popup enforces a strict CSP that prevents XSS attacks and unauthorized resource loading.

### Message Sender Verification

Background script verifies all messages come from our extension to prevent cross-extension message injection.

### Permissions

Manifest V3 permissions are minimal:

```json
{
  "permissions": ["storage", "alarms", "tabs"],
  "host_permissions": ["http://localhost/*", "http://127.0.0.1/*"]
}
```

**Why these permissions:**
- `storage` - User settings and cache
- `alarms` - Desktop connection health checks
- `tabs` - Query active tab for form detection
- `host_permissions` - Connect to local desktop app only

## Reporting Security Issues

If you discover a security vulnerability:

1. **DO NOT** open a public issue
2. Email: security@asterisk.dev (TODO: set up)
3. Include:
   - Description of vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if known)

We will respond within 48 hours and work with you on a fix.

## Security Audit History

### 2026-01-24: Aegis Security Audit

**HIGH Severity (Fixed):**
- ✅ CSS Selector Injection - Added `CSS.escape()`
- ✅ Unvalidated URL in Settings - Added localhost validation
- ✅ Vault Cache Without Expiry - Added 5-min TTL

**MEDIUM Severity (Fixed):**
- ✅ Incomplete Field Masking - Expanded to 11 sensitive types
- ✅ No Message Sender Verification - Added `sender.id` check
- ✅ HTTP Localhost Traffic - Documented (mitigation in Phase 2)
- ✅ Missing CSP - Added CSP meta tag

## Best Practices for Contributors

### When Adding New Features

1. **Validate all user input** - Never trust data from forms or URLs
2. **Escape dynamic content** - Use `CSS.escape()` for selectors
3. **Mask sensitive data** - Add new field types to sensitive list if needed
4. **Use TypeScript strict mode** - Prevents type-based vulnerabilities
5. **Write tests** - Include security test cases

### Code Review Checklist

- [ ] No dynamic code execution
- [ ] No `innerHTML` with user data
- [ ] All DOM selectors use `CSS.escape()` for dynamic values
- [ ] Sensitive fields masked in UI
- [ ] No hardcoded credentials or API keys
- [ ] CSP remains restrictive

## References

- [Chrome Extension Security](https://developer.chrome.com/docs/extensions/mv3/security/)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
