/**
 * Typed loaders for the DS-160 JSON fixtures.
 *
 * The JSON files store dates as ISO 8601 strings (JSON has no Date type);
 * these loaders hydrate them into the `Date` instances the shared types
 * declare, the same conversion a real persistence layer would perform.
 */

import type { FormSnapshot, VaultItem } from '../types';
import formStructureFixture from './fixtures/ds160-form-structure.json';
import vaultExampleFixture from './fixtures/ds160-vault-example.json';

/** JSON-serializable shape of a VaultItem (Date fields as ISO strings) */
type RawVaultItem = Omit<VaultItem, 'provenance' | 'metadata'> & {
  provenance: Omit<VaultItem['provenance'], 'timestamp'> & { timestamp: string };
  metadata: Omit<VaultItem['metadata'], 'created' | 'updated' | 'lastUsed'> & {
    created: string;
    updated: string;
    lastUsed?: string;
  };
};

/**
 * Load the representative DS-160 form structure fixture.
 *
 * This is a structural contract only - no user values. See
 * `fixtures/README.md` for its provenance and scope.
 */
export function loadDs160FormStructureFixture(): FormSnapshot {
  return formStructureFixture as unknown as FormSnapshot;
}

/**
 * Load the synthetic example vault fixture used to exercise the DS-160
 * exact field mapping and the confirmation-gate mechanism in tests.
 *
 * Contains a fictional applicant ("Alex Example") - no real personal data.
 * `dateOfBirth` is intentionally absent to exercise the unmatched-required-
 * field path. `jobTitle` and `company` are gated via `confirmationGate` to
 * exercise the current-employer/occupation confirmation gate.
 */
export function loadDs160VaultExampleFixture(): VaultItem[] {
  return (vaultExampleFixture as RawVaultItem[]).map((item) => {
    const { lastUsed, ...restMetadata } = item.metadata;
    return {
      ...item,
      provenance: {
        ...item.provenance,
        timestamp: new Date(item.provenance.timestamp),
      },
      metadata: {
        ...restMetadata,
        created: new Date(item.metadata.created),
        updated: new Date(item.metadata.updated),
        ...(lastUsed ? { lastUsed: new Date(lastUsed) } : {}),
      },
    };
  });
}
