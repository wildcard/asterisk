import { describe, it, expect } from 'vitest';
import type { VaultItem } from '../../types';
import { DS160_FIELD_MAP, mapDs160Field } from '../fieldMap';
import { generateDs160FillPlan, isGated } from '../plan';
import { loadDs160FormStructureFixture, loadDs160VaultExampleFixture } from '../fixtures';

describe('DS160_FIELD_MAP', () => {
  it('has an exact mapping entry for every field in the form structure fixture', () => {
    const snapshot = loadDs160FormStructureFixture();
    for (const field of snapshot.fields) {
      const mapping = mapDs160Field(field.id);
      expect(mapping, `missing DS160_FIELD_MAP entry for ${field.id}`).toBeDefined();
      expect(mapping?.semantic).toBe(field.semantic);
    }
  });

  it('returns undefined for an unknown field id', () => {
    expect(mapDs160Field('not_a_real_field')).toBeUndefined();
  });

  it('maps the employer and occupation fields to the identity category', () => {
    expect(DS160_FIELD_MAP.ds160_present_employer_name?.vaultCategory).toBe('identity');
    expect(DS160_FIELD_MAP.ds160_present_employer_name?.vaultKeyPattern).toBe('company');
    expect(DS160_FIELD_MAP.ds160_present_occupation?.vaultKeyPattern).toBe('jobTitle');
  });
});

describe('isGated', () => {
  const baseItem: VaultItem = {
    key: 'x',
    value: 'y',
    label: 'X',
    category: 'identity',
    provenance: { source: 'user_entered', timestamp: new Date(), confidence: 1 },
    metadata: { created: new Date(), updated: new Date() },
  };

  it('is false when confirmationGate is absent', () => {
    expect(isGated(baseItem)).toBe(false);
  });

  it('is true when confirmationGate.status is pending_confirmation', () => {
    expect(
      isGated({
        ...baseItem,
        confirmationGate: {
          reason: 'stale evidence',
          evidenceDate: '2026-06-01',
          status: 'pending_confirmation',
        },
      })
    ).toBe(true);
  });
});

describe('generateDs160FillPlan (fixture-driven)', () => {
  const snapshot = loadDs160FormStructureFixture();
  const vaultItems = loadDs160VaultExampleFixture();
  const plan = generateDs160FillPlan(snapshot, vaultItems);

  it('matches confirmed fields with the exact mapping (pattern tier, no confirmation required)', () => {
    const firstName = plan.recommendations.find((r) => r.fieldId === 'ds160_personal_given_names');
    expect(firstName).toBeDefined();
    expect(firstName?.vaultKey).toBe('firstName');
    expect(firstName?.matchTier).toBe('pattern');
    expect(firstName?.requiresConfirmation).toBeUndefined();

    const email = plan.recommendations.find((r) => r.fieldId === 'ds160_contact_email');
    expect(email?.vaultKey).toBe('email');
    expect(email?.requiresConfirmation).toBeUndefined();
  });

  it('leaves date of birth unmatched because no vault item exists for it', () => {
    expect(plan.unmatchedFields).toContain('ds160_personal_dob');
    expect(plan.recommendations.some((r) => r.fieldId === 'ds160_personal_dob')).toBe(false);
  });

  it('gates the present-employer field: recommendation exists but requiresConfirmation is true', () => {
    const employer = plan.recommendations.find((r) => r.fieldId === 'ds160_present_employer_name');
    expect(employer).toBeDefined();
    expect(employer?.vaultKey).toBe('company');
    expect(employer?.requiresConfirmation).toBe(true);
    expect(employer?.confirmationReason).toMatch(/not been reconfirmed/i);
  });

  it('gates the present-occupation field the same way', () => {
    const occupation = plan.recommendations.find((r) => r.fieldId === 'ds160_present_occupation');
    expect(occupation).toBeDefined();
    expect(occupation?.requiresConfirmation).toBe(true);
    expect(occupation?.confirmationReason).toBeTruthy();
  });

  it('never marks a non-gated field as requiring confirmation', () => {
    const nonGatedFields = plan.recommendations.filter(
      (r) => r.fieldId !== 'ds160_present_employer_name' && r.fieldId !== 'ds160_present_occupation'
    );
    expect(nonGatedFields.length).toBeGreaterThan(0);
    for (const rec of nonGatedFields) {
      expect(rec.requiresConfirmation).toBeFalsy();
    }
  });

  it('surfaces a plan-level warning when fields require confirmation', () => {
    expect(plan.warnings).toBeDefined();
    expect(plan.warnings?.some((w) => /require explicit confirmation/i.test(w))).toBe(true);
  });

  it('surfaces a plan-level warning for the unmatched required date-of-birth field', () => {
    expect(plan.warnings?.some((w) => /could not be matched/i.test(w))).toBe(true);
  });

  it('does not count a missing vault item as required-field coverage', () => {
    expect(plan.totalRequiredFields).toBe(snapshot.fields.filter((f) => f.required).length);
    expect(plan.requiredFieldsCovered).toBeLessThan(plan.totalRequiredFields);
  });
});

describe('generateDs160FillPlan (empty vault)', () => {
  it('produces no recommendations and warns when the vault is empty', () => {
    const snapshot = loadDs160FormStructureFixture();
    const plan = generateDs160FillPlan(snapshot, []);
    expect(plan.recommendations).toHaveLength(0);
    expect(plan.unmatchedFields).toHaveLength(snapshot.fields.length);
    expect(plan.warnings).toContain('No vault items available for matching');
  });
});

describe('generateDs160FillPlan (unknown field ids)', () => {
  it('reports fields with no DS160_FIELD_MAP entry as unmatched rather than throwing', () => {
    const snapshot = loadDs160FormStructureFixture();
    const withExtraField = {
      ...snapshot,
      fields: [
        ...snapshot.fields,
        {
          id: 'ds160_totally_unknown_field',
          name: 'unknown',
          label: 'Some future DS-160 field not yet mapped',
          type: 'text' as const,
          semantic: 'unknown' as const,
          required: false,
        },
      ],
    };

    const plan = generateDs160FillPlan(withExtraField, loadDs160VaultExampleFixture());
    expect(plan.unmatchedFields).toContain('ds160_totally_unknown_field');
  });
});
