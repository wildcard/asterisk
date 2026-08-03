/**
 * DS-160 dossier readiness: private-dossier JSON model, the complete
 * checklist catalog, and the deterministic fail-closed validator.
 *
 * See `../../../../docs/ds160-dossier-readiness.md` for the local-only,
 * gitignored workflow this is designed to support. Nothing in this module
 * accesses, fills, or submits the live DS-160 form.
 */

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
} from './types';

export {
  DS160_READINESS_CHECKLIST,
  CHECKLIST_FAMILIES,
  getChecklistItem,
} from './checklist';
export type { ChecklistItemDef, ConditionalRule, FieldSpec, ValueKind } from './checklist';

export {
  validateDossierReadiness,
  resolveApplicability,
  isValidIsoDate,
} from './validator';
export type { Applicability, ReadinessIssue, ReadinessIssueCode, ReadinessReport, FamilySummary } from './validator';

export {
  DOSSIER_AS_OF as DOSSIER_FIXTURE_AS_OF,
  buildCompleteSyntheticDossier,
  loadCompleteDossierFixture,
  buildSparseFillMappedOnlyDossier,
  cloneDossier,
} from './fixtures';

export { buildEmptyDossierSkeleton } from './skeleton';
