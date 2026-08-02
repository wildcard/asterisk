import { describe, it, expect } from 'vitest';
import type { VaultItem } from '../../types';
import { DS160_FIELD_MAP, mapDs160Field } from '../fieldMap';
import type { Ds160Section } from '../fieldMap';
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

  it('covers every declared Ds160Section at least once', () => {
    const sections: Ds160Section[] = [
      'personal_information',
      'address_and_phone',
      'present_employment',
      'passport_information',
      'travel_information',
      'us_contact_information',
    ];
    const coveredSections = new Set(Object.values(DS160_FIELD_MAP).map((m) => m.section));
    for (const section of sections) {
      expect(coveredSections.has(section), `no DS160_FIELD_MAP entry for section ${section}`).toBe(true);
    }
  });

  it('maps the passport fields to identity, with distinct keys from the home-address country', () => {
    expect(DS160_FIELD_MAP.ds160_passport_number).toMatchObject({
      section: 'passport_information',
      semantic: 'passportNumber',
      vaultCategory: 'identity',
      vaultKeyPattern: 'passportNumber',
    });
    expect(DS160_FIELD_MAP.ds160_passport_issuing_country).toMatchObject({
      section: 'passport_information',
      semantic: 'country',
      vaultCategory: 'identity',
      vaultKeyPattern: 'passportIssuingCountry',
    });
    expect(DS160_FIELD_MAP.ds160_passport_expiration_date).toMatchObject({
      section: 'passport_information',
      semantic: 'expiryDate',
      vaultCategory: 'identity',
      vaultKeyPattern: 'passportExpiryDate',
    });
    // Distinct vault keys - a passport's issuing country is not
    // necessarily the applicant's home address country.
    expect(DS160_FIELD_MAP.ds160_passport_issuing_country?.vaultKeyPattern).not.toBe(
      DS160_FIELD_MAP.ds160_home_country?.vaultKeyPattern
    );
  });

  it('maps the travel-purpose field to identity', () => {
    expect(DS160_FIELD_MAP.ds160_travel_purpose).toMatchObject({
      section: 'travel_information',
      semantic: 'travelPurpose',
      vaultCategory: 'identity',
      vaultKeyPattern: 'travelPurpose',
    });
  });

  it('maps the U.S. Contact fields to contact, with keys distinct from the applicant\'s own contact info', () => {
    expect(DS160_FIELD_MAP.ds160_us_contact_name).toMatchObject({
      section: 'us_contact_information',
      semantic: 'fullName',
      vaultCategory: 'contact',
      vaultKeyPattern: 'usContactName',
    });
    expect(DS160_FIELD_MAP.ds160_us_contact_phone).toMatchObject({
      section: 'us_contact_information',
      semantic: 'phone',
      vaultCategory: 'contact',
      vaultKeyPattern: 'usContactPhone',
    });
    expect(DS160_FIELD_MAP.ds160_us_contact_email).toMatchObject({
      section: 'us_contact_information',
      semantic: 'email',
      vaultCategory: 'contact',
      vaultKeyPattern: 'usContactEmail',
    });
    // Distinct vault keys - the U.S. contact is a different person/entity
    // from the applicant, so must never resolve to the applicant's own
    // phone/email vault items.
    expect(DS160_FIELD_MAP.ds160_us_contact_phone?.vaultKeyPattern).not.toBe(
      DS160_FIELD_MAP.ds160_contact_phone_primary?.vaultKeyPattern
    );
    expect(DS160_FIELD_MAP.ds160_us_contact_email?.vaultKeyPattern).not.toBe(
      DS160_FIELD_MAP.ds160_contact_email?.vaultKeyPattern
    );
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

  // Every field the example fixture deliberately gates - see
  // fixtures/ds160-vault-example.json. Kept as a single list so adding a
  // new gated example field only requires updating it here.
  const GATED_FIELD_IDS = [
    'ds160_present_employer_name',
    'ds160_present_occupation',
    'ds160_passport_expiration_date',
  ];

  it('gates the passport-expiration-date field: time-sensitive data, stale scanned evidence', () => {
    const expiry = plan.recommendations.find((r) => r.fieldId === 'ds160_passport_expiration_date');
    expect(expiry).toBeDefined();
    expect(expiry?.vaultKey).toBe('passportExpiryDate');
    expect(expiry?.requiresConfirmation).toBe(true);
    expect(expiry?.confirmationReason).toMatch(/renewed|reissued|replaced/i);
  });

  it('matches the passport number, passport issuing country, travel purpose, and U.S. contact fields without gating', () => {
    const ungatedExpectations: Array<[string, string]> = [
      ['ds160_passport_number', 'passportNumber'],
      ['ds160_passport_issuing_country', 'passportIssuingCountry'],
      ['ds160_travel_purpose', 'travelPurpose'],
      ['ds160_us_contact_name', 'usContactName'],
      ['ds160_us_contact_phone', 'usContactPhone'],
    ];
    for (const [fieldId, vaultKey] of ungatedExpectations) {
      const rec = plan.recommendations.find((r) => r.fieldId === fieldId);
      expect(rec, `expected a recommendation for ${fieldId}`).toBeDefined();
      expect(rec?.vaultKey).toBe(vaultKey);
      expect(rec?.requiresConfirmation).toBeFalsy();
    }
  });

  it('leaves the optional U.S. contact email unmatched (no vault item, not required)', () => {
    expect(plan.unmatchedFields).toContain('ds160_us_contact_email');
    expect(plan.recommendations.some((r) => r.fieldId === 'ds160_us_contact_email')).toBe(false);
    const field = snapshot.fields.find((f) => f.id === 'ds160_us_contact_email');
    expect(field?.required).toBe(false);
  });

  it('never marks a non-gated field as requiring confirmation', () => {
    const nonGatedFields = plan.recommendations.filter((r) => !GATED_FIELD_IDS.includes(r.fieldId));
    expect(nonGatedFields.length).toBeGreaterThan(0);
    for (const rec of nonGatedFields) {
      expect(rec.requiresConfirmation).toBeFalsy();
    }
  });

  it('gates exactly the fields the example fixture marks pending_confirmation, no more and no fewer', () => {
    const actuallyGated = plan.recommendations.filter((r) => r.requiresConfirmation).map((r) => r.fieldId).sort();
    expect(actuallyGated).toEqual([...GATED_FIELD_IDS].sort());
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

describe('generateDs160FillPlan (exact matching, no substring/label fallback)', () => {
  // Minimal snapshot with just the employer field, to isolate this from the
  // other fixture fields.
  const employerOnlySnapshot = (() => {
    const snapshot = loadDs160FormStructureFixture();
    const employerField = snapshot.fields.find((f) => f.id === 'ds160_present_employer_name');
    if (!employerField) throw new Error('fixture missing ds160_present_employer_name');
    return { ...snapshot, fields: [employerField] };
  })();

  const makeVaultItem = (overrides: Partial<VaultItem>): VaultItem => ({
    key: 'unused',
    value: 'unused',
    label: 'Unused',
    category: 'identity',
    provenance: { source: 'user_entered', timestamp: new Date(), confidence: 1 },
    metadata: { created: new Date(), updated: new Date() },
    ...overrides,
  });

  it('does NOT match a vault item whose key merely contains the target key as a substring', () => {
    const decoy = makeVaultItem({ key: 'companyOld', value: 'Stale Corp', label: 'Previous Employer' });
    const plan = generateDs160FillPlan(employerOnlySnapshot, [decoy]);

    expect(plan.recommendations).toHaveLength(0);
    expect(plan.unmatchedFields).toContain('ds160_present_employer_name');
  });

  it('does NOT match a vault item whose label (not key) contains the target key pattern', () => {
    const decoy = makeVaultItem({ key: 'previousEmployer', value: 'Stale Corp', label: 'Company (Previous)' });
    const plan = generateDs160FillPlan(employerOnlySnapshot, [decoy]);

    expect(plan.recommendations).toHaveLength(0);
    expect(plan.unmatchedFields).toContain('ds160_present_employer_name');
  });

  it('does NOT match across categories even with an exact key match', () => {
    // vaultKeyPattern 'company' expects category 'identity'; put it under 'custom' instead.
    const wrongCategory = makeVaultItem({ key: 'company', value: 'Right Key Wrong Category', category: 'custom' });
    const plan = generateDs160FillPlan(employerOnlySnapshot, [wrongCategory]);

    expect(plan.recommendations).toHaveLength(0);
    expect(plan.unmatchedFields).toContain('ds160_present_employer_name');
  });

  it('DOES match once an exact category + key item is present, even alongside similar decoys', () => {
    const decoyBySubstring = makeVaultItem({ key: 'companyOld', value: 'Stale Corp', label: 'Previous Employer' });
    const decoyByLabel = makeVaultItem({ key: 'previousEmployer', value: 'Stale Corp 2', label: 'Company (Previous)' });
    const exact = makeVaultItem({ key: 'company', value: 'Current Co', label: 'Present Employer' });

    const plan = generateDs160FillPlan(employerOnlySnapshot, [decoyBySubstring, decoyByLabel, exact]);

    expect(plan.recommendations).toHaveLength(1);
    expect(plan.recommendations[0]?.vaultKey).toBe('company');
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
