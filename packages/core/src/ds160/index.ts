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
