/**
 * DS-160 acceptance workflow: exact field mapping, fill plan generation,
 * and the confirmation-gate mechanism for stale/unconfirmed candidate data.
 *
 * See `fixtures/README.md` for fixture provenance and the no-PII policy.
 */

export { DS160_FIELD_MAP, mapDs160Field } from './fieldMap';
export type { Ds160FieldMapping, Ds160Section } from './fieldMap';

export { generateDs160FillPlan, isGated } from './plan';

export { loadDs160FormStructureFixture, loadDs160VaultExampleFixture } from './fixtures';

// Export the dossier readiness model, checklist, and deterministic validator
// (see `dossier/index.ts` module doc comment; no live-form interaction).
export {
  DS160_READINESS_CHECKLIST,
  CHECKLIST_FAMILIES,
  getChecklistItem,
  validateDossierReadiness,
  resolveApplicability,
  isValidIsoDate,
  DOSSIER_FIXTURE_AS_OF,
  buildCompleteSyntheticDossier,
  loadCompleteDossierFixture,
  buildSparseFillMappedOnlyDossier,
  cloneDossier,
  buildEmptyDossierSkeleton,
  buildDossierReviewPacket,
  renderDossierReviewPacketMarkdown,
} from './dossier';
export type {
  AnswerStatus,
  AnswerProvenance,
  ReviewState,
  DossierAnswer,
  RepeatableCoverage,
  RepeatableEntry,
  RepeatableSection,
  Dossier,
  ChecklistFamily,
  ChecklistItemDef,
  ConditionalRule,
  FieldSpec,
  ValueKind,
  Applicability,
  ReadinessIssue,
  ReadinessIssueCode,
  ReadinessReport,
  FamilySummary,
  DossierReviewItem,
  DossierReviewFamily,
  DossierReviewPacket,
} from './dossier';
