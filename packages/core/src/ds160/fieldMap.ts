/**
 * DS-160 exact field mapping.
 *
 * Unlike the generic label/autocomplete matchers in `matching.ts` (built for
 * arbitrary third-party web forms), the DS-160 mapping is a deterministic
 * table keyed by field ID: government form vocabulary is stable enough
 * per-section that fuzzy label matching is an unnecessary source of
 * ambiguity here. Each entry states exactly which vault category/key a
 * given DS-160 field resolves to.
 *
 * Field IDs and the section taxonomy below are a representative structural
 * contract built from the publicly documented DS-160 section/question
 * layout (Personal Information, Address and Phone, Work/Education/Training).
 * They are NOT scraped from the live CEAC DS-160 form - this project never
 * accesses, fills, or submits the live government form. See
 * `fixtures/README.md` for the full provenance note.
 */

import type { FieldSemantic, VaultCategory } from '../types';

/** DS-160 section this field belongs to, for grouping in review UIs */
export type Ds160Section =
  | 'personal_information'
  | 'address_and_phone'
  | 'present_employment';

/** One entry in the exact DS-160 -> vault field mapping table */
export interface Ds160FieldMapping {
  /** DS-160 field ID (matches FieldNode.id in the form snapshot) */
  fieldId: string;

  /** Section this field belongs to */
  section: Ds160Section;

  /** Semantic meaning, using the shared FieldSemantic vocabulary */
  semantic: FieldSemantic;

  /** Vault category to search within */
  vaultCategory: VaultCategory;

  /** Vault item key this field resolves to (must match `VaultItem.key` exactly) */
  vaultKeyPattern: string;
}

/**
 * Exact DS-160 field ID -> vault mapping table for the fields covered by
 * this first slice: Personal Information, Address and Phone, and Present
 * Employment (the section containing the gated employer/occupation facts).
 */
export const DS160_FIELD_MAP: Record<string, Ds160FieldMapping> = {
  ds160_personal_surname: {
    fieldId: 'ds160_personal_surname',
    section: 'personal_information',
    semantic: 'lastName',
    vaultCategory: 'identity',
    vaultKeyPattern: 'lastName',
  },
  ds160_personal_given_names: {
    fieldId: 'ds160_personal_given_names',
    section: 'personal_information',
    semantic: 'firstName',
    vaultCategory: 'identity',
    vaultKeyPattern: 'firstName',
  },
  ds160_personal_dob: {
    fieldId: 'ds160_personal_dob',
    section: 'personal_information',
    semantic: 'dateOfBirth',
    vaultCategory: 'identity',
    vaultKeyPattern: 'dateOfBirth',
  },
  ds160_contact_email: {
    fieldId: 'ds160_contact_email',
    section: 'address_and_phone',
    semantic: 'email',
    vaultCategory: 'contact',
    vaultKeyPattern: 'email',
  },
  ds160_contact_phone_primary: {
    fieldId: 'ds160_contact_phone_primary',
    section: 'address_and_phone',
    semantic: 'phone',
    vaultCategory: 'contact',
    vaultKeyPattern: 'phone',
  },
  ds160_home_country: {
    fieldId: 'ds160_home_country',
    section: 'address_and_phone',
    semantic: 'country',
    vaultCategory: 'address',
    vaultKeyPattern: 'country',
  },
  ds160_present_occupation: {
    fieldId: 'ds160_present_occupation',
    section: 'present_employment',
    semantic: 'jobTitle',
    vaultCategory: 'identity',
    vaultKeyPattern: 'jobTitle',
  },
  ds160_present_employer_name: {
    fieldId: 'ds160_present_employer_name',
    section: 'present_employment',
    semantic: 'company',
    vaultCategory: 'identity',
    vaultKeyPattern: 'company',
  },
};

/** Look up the exact mapping for a DS-160 field ID, if known. */
export function mapDs160Field(fieldId: string): Ds160FieldMapping | undefined {
  return DS160_FIELD_MAP[fieldId];
}
