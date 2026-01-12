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
 * Represents a single field in a form
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

  /** Semantic meaning of the field */
  semantic: FieldSemantic;

  /** Whether the field is required */
  required: boolean;

  /** Validation pattern (regex) if any */
  validation?: string;

  /** Current value (if any) */
  currentValue?: string;

  /** Autocomplete attribute value */
  autocomplete?: string;

  /** Maximum length constraint */
  maxLength?: number;

  /** Minimum length constraint */
  minLength?: number;

  /** Placeholder text */
  placeholder?: string;
}

// ============================================================================
// Fill Planning - Recommendations for filling forms
// ============================================================================

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
}

/**
 * A complete plan for filling a form
 */
export interface FillPlan {
  /** Which form this plan is for */
  formId: string;

  /** Recommendations for each field */
  recommendations: FillRecommendation[];

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
