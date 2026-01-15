/**
 * Core type definitions for Asterisk
 *
 * These types are shared between the TypeScript frontend and Rust backend
 * (via serde serialization). Maintain compatibility when making changes.
 */

// ============================================================================
// Provenance - Data origin tracking
// ============================================================================

/**
 * Tracks where a piece of data came from and when
 */
export interface Provenance {
  /** How the data was acquired */
  source: 'user_entered' | 'imported' | 'autofilled';

  /** When the data was created/acquired */
  timestamp: Date;

  /** Confidence level in the data (0.0 to 1.0) */
  confidence: number;

  /** Optional: Original source URL or file path */
  origin?: string;
}

// ============================================================================
// Vault - User data storage
// ============================================================================

/**
 * A single item stored in the user's vault
 */
export interface VaultItem {
  /** Unique identifier for this item */
  key: string;

  /** The actual data value (encrypted at rest in future versions) */
  value: string;

  /** User-friendly label for display */
  label: string;

  /** Category for organization */
  category: 'identity' | 'contact' | 'address' | 'financial' | 'custom';

  /** Where this data came from */
  provenance: Provenance;

  /** Storage metadata */
  metadata: {
    created: Date;
    updated: Date;
    lastUsed?: Date;
    usageCount?: number;
  };
}

// ============================================================================
// Form Analysis - Form structure and requirements
// ============================================================================

/**
 * High-level metadata about a detected form
 */
export interface FormBrief {
  /** Unique identifier for this form instance */
  id: string;

  /** Page URL where form was found */
  url: string;

  /** Form title or page title */
  title: string;

  /** All detected fields in the form */
  fields: FieldNode[];

  /** Inferred purpose of the form */
  purpose: 'signup' | 'login' | 'checkout' | 'profile' | 'survey' | 'contact' | 'unknown';

  /** When the form was detected */
  detectedAt: Date;
}

/**
 * Semantic field types that map to vault categories
 */
export type FieldSemantic =
  | 'firstName'
  | 'lastName'
  | 'fullName'
  | 'email'
  | 'phone'
  | 'street'
  | 'city'
  | 'state'
  | 'zipCode'
  | 'country'
  | 'creditCard'
  | 'cvv'
  | 'expiryDate'
  | 'username'
  | 'password'
  | 'dateOfBirth'
  | 'company'
  | 'jobTitle'
  | 'unknown';

/**
 * HTML input types
 */
export type FieldType =
  | 'text'
  | 'email'
  | 'password'
  | 'tel'
  | 'url'
  | 'number'
  | 'date'
  | 'select'
  | 'textarea'
  | 'checkbox'
  | 'radio';

/**
 * Option for select, radio, or checkbox fields
 */
export interface SelectOption {
  /** Option value attribute */
  value: string;
  /** Display label for the option */
  label: string;
}

/**
 * Represents a single field in a form
 *
 * SECURITY NOTE: When extracting from DOM for snapshots, NEVER include
 * actual user values. The `currentValue` field is ONLY for internal use
 * after the user has explicitly approved a fill operation.
 */
export interface FieldNode {
  /** Unique identifier for this field within the form */
  id: string;

  /** HTML element name or ID */
  name: string;

  /** Field label or placeholder text */
  label: string;

  /** HTML input type */
  type: FieldType;

  /** Semantic meaning of the field (inferred, may be 'unknown') */
  semantic: FieldSemantic;

  /** Whether the field is required */
  required: boolean;

  /** Validation pattern (regex) if any */
  validation?: string;

  /**
   * Current value - INTERNAL USE ONLY
   * @internal Never populate from DOM extraction - security risk
   */
  currentValue?: string;

  /** Autocomplete attribute value */
  autocomplete?: string;

  /** Maximum length constraint */
  maxLength?: number;

  /** Minimum length constraint */
  minLength?: number;

  /** Placeholder text */
  placeholder?: string;

  /** Input mode hint (e.g., 'numeric', 'email') */
  inputMode?: string;

  /** Options for select/radio/checkbox fields */
  options?: SelectOption[];
}

// ============================================================================
// Form Snapshots - Captured form structure (NO user values)
// ============================================================================

/**
 * Fingerprint for identifying similar forms across pages
 *
 * Used to recognize the same form on different visits without
 * storing user data.
 */
export interface FormFingerprint {
  /** Number of input fields in the form */
  fieldCount: number;

  /** Sorted list of field types (e.g., ['email', 'password', 'text']) */
  fieldTypes: string[];

  /** Number of required fields */
  requiredCount: number;

  /** SHA-256 hash of the above for quick comparison */
  hash: string;
}

/**
 * A snapshot of a form's structure captured from the DOM
 *
 * SECURITY: This intentionally excludes all user-entered values.
 * Only structural information is captured for analysis.
 */
export interface FormSnapshot {
  /** Full URL where the form was found */
  url: string;

  /** Domain extracted from URL (e.g., 'github.com') */
  domain: string;

  /** Page title */
  title: string;

  /** ISO 8601 timestamp when captured */
  capturedAt: string;

  /** Fingerprint for form identification */
  fingerprint: FormFingerprint;

  /** All detected fields (without values) */
  fields: FieldNode[];
}

// ============================================================================
// Fill Planning - Recommendations for filling forms
// ============================================================================

/**
 * How a match was determined
 */
export type MatchTier = 'autocomplete' | 'pattern' | 'llm';

/**
 * A recommendation for filling a specific field
 */
export interface FillRecommendation {
  /** Which field to fill */
  fieldId: string;

  /** Which vault item to use (key reference, not actual value) */
  vaultKey: string;

  /** Confidence in this recommendation (0.0 to 1.0) */
  confidence: number;

  /** Human-readable explanation */
  reason: string;

  /** Whether this field is required by the form */
  required: boolean;

  /** How the match was determined */
  matchTier: MatchTier;
}

/**
 * A complete plan for filling a form
 */
export interface FillPlan {
  /** Form fingerprint hash for identification */
  formFingerprint: string;

  /** Which form this plan is for */
  formId: string;

  /** Recommendations for each field */
  recommendations: FillRecommendation[];

  /** Field IDs that could not be matched to vault items */
  unmatchedFields: string[];

  /** Overall confidence in the plan (0.0 to 1.0) */
  overallConfidence: number;

  /** When this plan was generated */
  generatedAt: Date;

  /** Number of required fields that will be filled */
  requiredFieldsCovered: number;

  /** Total number of required fields */
  totalRequiredFields: number;

  /** Any warnings or issues with the plan */
  warnings?: string[];
}

// ============================================================================
// Fill Commands - Desktop → Extension communication
// ============================================================================

/**
 * A single field fill instruction
 */
export interface FieldFill {
  /** The field ID to fill (matches FieldNode.id) */
  fieldId: string;

  /** The value to fill into the field */
  value: string;
}

/**
 * Command sent from desktop to extension to fill a form
 *
 * SECURITY: Values are resolved from vault at send time.
 * The extension receives ready-to-fill values, not vault keys.
 */
export interface FillCommand {
  /** Unique command ID for deduplication */
  id: string;

  /** Domain to match (e.g., 'github.com') */
  targetDomain: string;

  /** URL pattern to match (optional, for more specific targeting) */
  targetUrl?: string;

  /** Fields to fill with their values */
  fills: FieldFill[];

  /** When the command was created */
  createdAt: string;

  /** Command expires after this time (ISO 8601) */
  expiresAt: string;
}

// ============================================================================
// Validation Results
// ============================================================================

/**
 * Result of validating a fill plan against form requirements
 */
export interface ValidationResult {
  /** Whether the plan is valid */
  valid: boolean;

  /** List of validation errors */
  errors: ValidationError[];

  /** List of validation warnings */
  warnings: ValidationWarning[];
}

export interface ValidationError {
  fieldId: string;
  message: string;
  severity: 'error';
}

export interface ValidationWarning {
  fieldId: string;
  message: string;
  severity: 'warning';
}

// ============================================================================
// Matching - Autocomplete mappings and patterns
// ============================================================================

/**
 * Vault category type alias
 */
export type VaultCategory = 'identity' | 'contact' | 'address' | 'financial' | 'custom';

/**
 * Mapping from HTML autocomplete values to vault data
 * See: https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#autofilling-form-controls:-the-autocomplete-attribute
 */
export interface AutocompleteMapping {
  /** Which vault category this maps to */
  category: VaultCategory;
  /** Optional: pattern to match in vault item key */
  keyPattern?: string;
  /** Confidence when matched via autocomplete */
  confidence: number;
}

/**
 * Standard HTML autocomplete attribute mappings
 * These provide high-confidence matches (0.95)
 */
export const AUTOCOMPLETE_MAPPINGS: Record<string, AutocompleteMapping> = {
  // Identity
  'given-name': { category: 'identity', keyPattern: 'firstName', confidence: 0.95 },
  'family-name': { category: 'identity', keyPattern: 'lastName', confidence: 0.95 },
  'name': { category: 'identity', keyPattern: 'name', confidence: 0.90 },
  'honorific-prefix': { category: 'identity', keyPattern: 'prefix', confidence: 0.95 },
  'honorific-suffix': { category: 'identity', keyPattern: 'suffix', confidence: 0.95 },
  'nickname': { category: 'identity', keyPattern: 'nickname', confidence: 0.95 },
  'bday': { category: 'identity', keyPattern: 'birthday', confidence: 0.95 },
  'sex': { category: 'identity', keyPattern: 'gender', confidence: 0.95 },

  // Contact
  'email': { category: 'contact', keyPattern: 'email', confidence: 0.95 },
  'tel': { category: 'contact', keyPattern: 'phone', confidence: 0.95 },
  'tel-national': { category: 'contact', keyPattern: 'phone', confidence: 0.95 },
  'url': { category: 'contact', keyPattern: 'website', confidence: 0.90 },

  // Address
  'street-address': { category: 'address', keyPattern: 'street', confidence: 0.95 },
  'address-line1': { category: 'address', keyPattern: 'address1', confidence: 0.95 },
  'address-line2': { category: 'address', keyPattern: 'address2', confidence: 0.95 },
  'address-level1': { category: 'address', keyPattern: 'state', confidence: 0.95 },
  'address-level2': { category: 'address', keyPattern: 'city', confidence: 0.95 },
  'postal-code': { category: 'address', keyPattern: 'zip', confidence: 0.95 },
  'country': { category: 'address', keyPattern: 'country', confidence: 0.95 },
  'country-name': { category: 'address', keyPattern: 'country', confidence: 0.95 },

  // Financial
  'cc-name': { category: 'financial', keyPattern: 'cardName', confidence: 0.95 },
  'cc-number': { category: 'financial', keyPattern: 'cardNumber', confidence: 0.95 },
  'cc-exp': { category: 'financial', keyPattern: 'cardExpiry', confidence: 0.95 },
  'cc-exp-month': { category: 'financial', keyPattern: 'expiryMonth', confidence: 0.95 },
  'cc-exp-year': { category: 'financial', keyPattern: 'expiryYear', confidence: 0.95 },
  'cc-csc': { category: 'financial', keyPattern: 'cvv', confidence: 0.95 },
  'cc-type': { category: 'financial', keyPattern: 'cardType', confidence: 0.95 },

  // Organization
  'organization': { category: 'identity', keyPattern: 'company', confidence: 0.90 },
  'organization-title': { category: 'identity', keyPattern: 'jobTitle', confidence: 0.90 },
};

/**
 * Pattern-based matching rules for Tier 2 matching
 * Used when autocomplete attribute is not present
 */
export interface PatternRule {
  /** Patterns to match in field label/name (case-insensitive) */
  labelPatterns: string[];
  /** HTML input type to match (optional) */
  inputType?: FieldType;
  /** Which vault category this maps to */
  category: VaultCategory;
  /** Pattern to find in vault item key */
  keyPattern: string;
  /** Confidence when matched via pattern */
  confidence: number;
}

/**
 * Pattern rules for Tier 2 matching
 */
export const PATTERN_RULES: PatternRule[] = [
  // Identity
  { labelPatterns: ['first name', 'firstname', 'given name'], category: 'identity', keyPattern: 'firstName', confidence: 0.85 },
  { labelPatterns: ['last name', 'lastname', 'family name', 'surname'], category: 'identity', keyPattern: 'lastName', confidence: 0.85 },
  { labelPatterns: ['full name', 'your name'], category: 'identity', keyPattern: 'name', confidence: 0.80 },

  // Contact
  { labelPatterns: ['email', 'e-mail'], inputType: 'email', category: 'contact', keyPattern: 'email', confidence: 0.90 },
  { labelPatterns: ['phone', 'mobile', 'cell', 'telephone'], inputType: 'tel', category: 'contact', keyPattern: 'phone', confidence: 0.85 },

  // Address
  { labelPatterns: ['street', 'address line'], category: 'address', keyPattern: 'street', confidence: 0.80 },
  { labelPatterns: ['city', 'town'], category: 'address', keyPattern: 'city', confidence: 0.85 },
  { labelPatterns: ['state', 'province', 'region'], category: 'address', keyPattern: 'state', confidence: 0.85 },
  { labelPatterns: ['zip', 'postal', 'postcode'], category: 'address', keyPattern: 'zip', confidence: 0.85 },
  { labelPatterns: ['country'], category: 'address', keyPattern: 'country', confidence: 0.85 },

  // Organization
  { labelPatterns: ['company', 'organization', 'employer'], category: 'identity', keyPattern: 'company', confidence: 0.80 },
  { labelPatterns: ['job title', 'position', 'role'], category: 'identity', keyPattern: 'jobTitle', confidence: 0.80 },
];
