/**
 * Builds an empty dossier skeleton - every checklist item present with
 * status `unknown` (repeatable sections: coverage `unknown`, no entries).
 *
 * This is the actual starting point for a human filling in their own real
 * dossier locally (see `../../../../docs/ds160-dossier-readiness.md`), not
 * a test fixture (contrast `fixtures.ts`, which is PII-free synthetic data
 * for tests). Generating it from `DS160_READINESS_CHECKLIST` rather than
 * hand-authoring a template means it can never omit an item the catalog
 * has grown to include.
 *
 * `validateDossierReadiness` always rejects a freshly-built skeleton (every
 * item is `unknown`) - that's the fail-closed starting state a human works
 * from, converting items to `confirmed` one at a time as they gather and
 * review evidence.
 */

import { DS160_READINESS_CHECKLIST } from './checklist';
import type { Dossier } from './types';

export function buildEmptyDossierSkeleton(asOf: string, applicantRef?: string): Dossier {
  const dossier: Dossier = { schemaVersion: 1, asOf, applicantRef, answers: {}, repeatables: {} };

  for (const item of DS160_READINESS_CHECKLIST) {
    if (item.repeatable) {
      dossier.repeatables[item.id] = {
        coverage: { status: 'unknown', review: { reviewed: false } },
        entries: [],
      };
    } else {
      dossier.answers[item.id] = { status: 'unknown', review: { reviewed: false } };
    }
  }

  return dossier;
}
