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
  VaultCategory,
  ConfirmationGate,
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
  MatchTier,
  FillRecommendation,
  FillPlan,
  // Fill Commands (desktop → extension)
  FieldFill,
  FillCommand,
  // Matching
  AutocompleteMapping,
  PatternRule,
  // Validation
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from './types';

// Export matching constants
export { AUTOCOMPLETE_MAPPINGS, PATTERN_RULES } from './types';

// Export matching functions
export {
  matchByAutocomplete,
  matchByPattern,
  generateFillPlan,
  getMatchTierDescription,
  getConfidenceLevel,
} from './matching';

// Export performance monitoring
export type {
  PerformanceMetric,
  PerformanceStats,
  LLMMetrics,
  MatchingMetrics,
} from './performance';

export { PerformanceMonitor, performanceMonitor } from './performance';

// Export DS-160 acceptance workflow (exact field mapping + confirmation gate)
export {
  DS160_FIELD_MAP,
  mapDs160Field,
  generateDs160FillPlan,
  isGated,
  loadDs160FormStructureFixture,
  loadDs160VaultExampleFixture,
} from './ds160';
export type { Ds160FieldMapping, Ds160Section } from './ds160';
