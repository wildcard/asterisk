/**
 * @asterisk/core - Core TypeScript types for Asterisk
 *
 * This package provides shared type definitions used across the Asterisk
 * monorepo, including the desktop app, form expert, and vault components.
 */

// Export all types
export type {
  // Provenance
  Provenance,
  // Vault
  VaultItem,
  // Form Analysis
  FormBrief,
  FieldNode,
  FieldSemantic,
  FieldType,
  SelectOption,
  // Form Snapshots (extension → desktop)
  FormFingerprint,
  FormSnapshot,
  // Fill Planning
  FillRecommendation,
  FillPlan,
  // Validation
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from './types';
