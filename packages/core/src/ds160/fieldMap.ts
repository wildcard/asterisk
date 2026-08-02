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
 * layout (Personal Information, Address and Phone, Work/Education/Training,
 * Passport, Travel, U.S. Contact). They are NOT scraped from the live CEAC
 * DS-160 form - this project never accesses, fills, or submits the live
 * government form. See `fixtures/README.md` for the full provenance note.
 *
 * Coverage is deliberately scoped to fields that are genuinely *reusable*
 * facts worth caching in a vault (a passport number, a usual U.S. contact) -
 * not every DS-160 question fits that model. Most of the real Travel
 * section (specific arrival/departure dates, this trip's address in the
 * U.S., who's paying) is inherently per-application, not a stable fact
 * about the applicant, so it's intentionally excluded here rather than
 * forced into the vault+exact-mapping pattern. "Purpose of trip" is the one
 * Travel field included, since for a recurring-purpose traveler (e.g. a
 * business visitor whose employer sends them repeatedly) it behaves like
 * any other cached, reviewable fact - the same way `present_employment`
 * already treats occupation/employer.
 */

import type { FieldSemantic, VaultCategory } from '../types';

/** DS-160 section this field belongs to, for grouping in review UIs */
export type Ds160Section =
  | 'personal_information'
  | 'address_and_phone'
  | 'present_employment'
  | 'passport_information'
  | 'travel_information'
  | 'us_contact_information';

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
 * Exact DS-160 field ID -> vault mapping table. Covers Personal
 * Information, Address and Phone, Present Employment, Passport, Travel
 * (purpose only - see module doc comment), and U.S. Contact.
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
  ds160_passport_number: {
    fieldId: 'ds160_passport_number',
    section: 'passport_information',
    semantic: 'passportNumber',
    vaultCategory: 'identity',
    vaultKeyPattern: 'passportNumber',
  },
  ds160_passport_issuing_country: {
    fieldId: 'ds160_passport_issuing_country',
    section: 'passport_information',
    semantic: 'country',
    vaultCategory: 'identity',
    // Distinct key from ds160_home_country's 'country' - the issuing
    // authority is not necessarily the applicant's residence.
    vaultKeyPattern: 'passportIssuingCountry',
  },
  ds160_passport_expiration_date: {
    fieldId: 'ds160_passport_expiration_date',
    section: 'passport_information',
    // Reuses the generic "a date something expires" semantic rather than
    // adding a passport-specific one - same concept as a credit card
    // expiry, just a different document.
    semantic: 'expiryDate',
    vaultCategory: 'identity',
    vaultKeyPattern: 'passportExpiryDate',
  },
  ds160_travel_purpose: {
    fieldId: 'ds160_travel_purpose',
    section: 'travel_information',
    semantic: 'travelPurpose',
    vaultCategory: 'identity',
    vaultKeyPattern: 'travelPurpose',
  },
  ds160_us_contact_name: {
    fieldId: 'ds160_us_contact_name',
    section: 'us_contact_information',
    semantic: 'fullName',
    vaultCategory: 'contact',
    vaultKeyPattern: 'usContactName',
  },
  ds160_us_contact_phone: {
    fieldId: 'ds160_us_contact_phone',
    section: 'us_contact_information',
    semantic: 'phone',
    vaultCategory: 'contact',
    // Distinct key from the applicant's own 'phone' - this is the U.S.
    // point of contact's number, a different person/entity entirely.
    vaultKeyPattern: 'usContactPhone',
  },
  ds160_us_contact_email: {
    fieldId: 'ds160_us_contact_email',
    section: 'us_contact_information',
    semantic: 'email',
    vaultCategory: 'contact',
    vaultKeyPattern: 'usContactEmail',
  },
};

/** Look up the exact mapping for a DS-160 field ID, if known. */
export function mapDs160Field(fieldId: string): Ds160FieldMapping | undefined {
  return DS160_FIELD_MAP[fieldId];
}
