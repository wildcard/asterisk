# Data Separation: Form Expert vs User Vault

## Core Principle

Asterisk maintains a strict architectural boundary between **form analysis** (Form Expert) and **personal data storage** (User Vault). These two subsystems must never be coupled.

## Why Separation Matters

### Security
- **Attack Surface Reduction**: If form analysis is compromised, vault remains isolated
- **Privilege Separation**: Each component has minimum necessary permissions
- **Audit Simplicity**: Security review can focus on vault independently

### Privacy
- **Data Minimization**: Form analysis sees structure, not content
- **Zero Knowledge**: Vault doesn't know about form context
- **User Control**: Clear boundaries make data flow transparent

### Engineering
- **Modularity**: Components evolve independently
- **Testability**: Each component can be tested in isolation
- **Reusability**: Vault could be used for other purposes

## Detailed Separation

### Form Expert Domain

**What It Knows**:
- Form structure (HTML, accessibility tree)
- Field types (text, email, phone, address)
- Validation rules and constraints
- Required vs optional fields
- Field labels and placeholders

**What It Does**:
- Detects forms on web pages
- Analyzes field semantics
- Generates fill recommendations
- Validates fill plans against form requirements

**What It NEVER Sees**:
- User's actual personal data
- Vault contents or keys
- Filled form values after submission

**Example Input**:
```typescript
interface FormBrief {
  url: string;
  title: string;
  fields: FieldNode[];
  purpose: 'signup' | 'checkout' | 'profile' | 'survey';
}

interface FieldNode {
  id: string;
  type: 'text' | 'email' | 'phone' | 'address';
  label: string;
  required: boolean;
  validation?: string;
  semantic: 'firstName' | 'lastName' | 'email' | 'street';
}
```

**Example Output**:
```typescript
interface FillPlan {
  formId: string;
  recommendations: Array<{
    fieldId: string;
    vaultKey: string;  // Reference to vault, not actual value
    confidence: number;
  }>;
}
```

### User Vault Domain

**What It Knows**:
- User's personal data items
- Data provenance (where data came from)
- Storage metadata (created, updated dates)

**What It Does**:
- Stores personal data securely
- Provides CRUD operations
- Tracks data origin
- (Future) Encrypts data at rest

**What It NEVER Sees**:
- Which websites user visits
- Form structures or requirements
- How data will be used

**Example Storage**:
```typescript
interface VaultItem {
  key: string;           // 'email_personal', 'address_home'
  value: string;         // Actual data
  label: string;         // User-friendly name
  category: string;      // 'contact', 'identity', 'financial'
  provenance: Provenance;
  metadata: {
    created: Date;
    updated: Date;
    lastUsed?: Date;
  };
}

interface Provenance {
  source: 'user_entered' | 'imported' | 'autofilled';
  timestamp: Date;
  confidence: number;
}
```

## Communication Protocol

The two domains communicate through a **mediator** (the UI layer) that coordinates but never merges their concerns.

### Fill Flow

```
1. Form Expert detects form
   └─> Analyzes structure
   └─> Creates FillPlan with vault key references

2. UI Layer receives FillPlan
   └─> Displays recommendations to user
   └─> User approves (explicit consent)

3. UI Layer queries Vault
   └─> Fetches actual values using keys from plan
   └─> Never shares form context with vault

4. UI Layer fills form
   └─> Uses values from vault
   └─> Never sends values back to Form Expert
```

### Data Flow Diagram

```
┌─────────────────────┐
│   Web Browser       │
│   (Form Context)    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   Form Expert       │◄──── Sees: Form structure
│   • Detect          │      Never: User data
│   • Analyze         │
│   • Plan            │
└──────────┬──────────┘
           │
           │ FillPlan (key references only)
           │
           ▼
┌─────────────────────┐
│   UI Mediator       │◄──── Coordinates both domains
│   • Display plan    │      Never: Merges their data
│   • Request consent │
└──────────┬──────────┘
           │
           │ Vault query (keys only)
           │
           ▼
┌─────────────────────┐
│   User Vault        │◄──── Sees: Data storage requests
│   • Store           │      Never: Form context
│   • Retrieve        │
│   • Delete          │
└─────────────────────┘
```

## Implementation Boundaries

### File System Boundaries

```
packages/core/
├── form-types.ts    # FormBrief, FieldNode, FillPlan
└── vault-types.ts   # VaultItem, Provenance
                     # NO shared types that mix both!

crates/vault/        # Standalone, no form dependencies
└── lib.rs           # Only knows about VaultItem

apps/desktop/
├── form-expert/     # Form analysis logic
└── vault-ui/        # Vault management UI
    # These never import each other!
```

### API Boundaries

Form Expert API (Future):
```typescript
class FormExpert {
  detectForms(page: Page): FormBrief[];
  analyzeForm(brief: FormBrief): FillPlan;
  validatePlan(plan: FillPlan, form: FormBrief): ValidationResult;

  // NO methods that accept or return user data values
}
```

Vault API (Current):
```rust
trait VaultStore {
  fn set(&mut self, key: String, value: VaultItem) -> Result<()>;
  fn get(&self, key: &str) -> Result<Option<VaultItem>>;
  fn list(&self) -> Result<Vec<VaultItem>>;
  fn delete(&mut self, key: &str) -> Result<()>;

  // NO methods that accept or return form context
}
```

## Testing the Separation

### Unit Tests

```rust
// Vault tests never mention forms
#[test]
fn test_vault_crud() {
    let mut store = InMemoryStore::new();
    let item = VaultItem { /* ... */ };
    store.set("test_key", item).unwrap();
    // No form context in test
}
```

```typescript
// Form expert tests never use real user data
test('analyzeForm creates fill plan', () => {
  const form = mockFormBrief();
  const plan = formExpert.analyze(form);
  expect(plan.recommendations[0].vaultKey).toBe('email');
  // Uses key references, not actual values
});
```

### Integration Tests

```typescript
test('full fill flow respects separation', async () => {
  // 1. Form expert analyzes (no data)
  const plan = formExpert.analyze(formBrief);

  // 2. Vault retrieves (no form context)
  const values = await vault.getMultiple(plan.recommendations.map(r => r.vaultKey));

  // 3. UI mediates (keeps separate)
  expect(formExpert.hasAccessTo(values)).toBe(false);
  expect(vault.hasAccessTo(formBrief)).toBe(false);
});
```

## Red Flags

Watch for these anti-patterns that violate separation:

❌ **Form Expert calling Vault directly**
```typescript
// BAD: Form expert shouldn't know about vault
class FormExpert {
  fill(form: FormBrief, vault: VaultStore) { /* ... */ }
}
```

❌ **Vault receiving form context**
```rust
// BAD: Vault shouldn't know about forms
impl VaultStore {
    fn suggest_for_form(&self, form: &FormBrief) -> Vec<VaultItem> { /* ... */ }
}
```

❌ **Shared data structures**
```typescript
// BAD: Mixing concerns in one type
interface FormFillData {
  form: FormBrief;
  values: Map<string, VaultItem>;
}
```

✅ **Correct: UI mediates**
```typescript
// GOOD: UI coordinates without coupling
class FillCoordinator {
  async fill(form: FormBrief): Promise<void> {
    const plan = this.formExpert.analyze(form);
    const consent = await this.requestUserConsent(plan);
    if (consent) {
      const values = await this.vault.getMultiple(plan.keys);
      await this.browser.fill(form.id, values);
    }
  }
}
```

## Future: Encryption Boundary

When we add encryption, the boundary becomes even more important:

```
Form Expert (Plaintext) ──┐
                          │
                          ├──> UI Mediator
                          │
Vault (Encrypted)     ────┘

Form Expert never gets encryption keys
Vault never sees plaintext form context
```

## Review Checklist

When reviewing code, verify:

- [ ] Form analysis code never imports vault types
- [ ] Vault code never imports form types
- [ ] No shared mutable state between domains
- [ ] UI layer mediates all interactions
- [ ] Tests respect domain boundaries
- [ ] Type definitions don't mix concerns
- [ ] API surfaces maintain separation

## Benefits Realized

This separation enables:

1. **Security audits**: Review vault in isolation
2. **Compliance**: GDPR/privacy analysis is straightforward
3. **Testing**: Mock one domain without the other
4. **Refactoring**: Change storage without touching form logic
5. **Features**: Add AI to form expert without vault changes
6. **Trust**: Users can verify data handling is local and bounded
