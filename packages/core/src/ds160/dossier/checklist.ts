/**
 * The DS-160 dossier readiness checklist: a complete inventory of every
 * answer family a full, submitted DS-160 application requires, expressed
 * as stable, data-driven item definitions the validator (`validator.ts`)
 * checks against a `Dossier` (`types.ts`).
 *
 * IMPORTANT - checklist IDs are NOT CEAC form selectors. Every `id` below
 * (e.g. `identity.date_of_birth`, `security_background.criminal.arrested_or_convicted`)
 * is a stable *semantic* identifier invented for this project's own
 * checklist/report/review-queue model. It is deliberately unrelated to any
 * DOM element id, field name, or question number on the live CEAC DS-160
 * form - this project never accesses, scrapes, or fills that form (see
 * `../fieldMap.ts`'s module doc comment for the same provenance stance on
 * the separate exact-mapping table used for fill planning). Renaming or
 * renumbering the live form would not require renaming anything here, and
 * nothing here can be used to derive a live-form selector.
 *
 * Repeatable sections (family members, employment history, countries
 * visited, ...) are marked `repeatable: true` and validated against
 * `dossier.repeatables[id]` (a `RepeatableSection`) rather than
 * `dossier.answers[id]`. See `types.ts`'s "Repeatable sections" doc
 * comments for why the coverage declaration exists.
 *
 * Conditional items (`conditional`) only apply when another item's
 * confirmed answer satisfies a simple predicate (`ConditionalRule`). If the
 * gating item is not itself confirmed, applicability is *unresolved* - the
 * validator treats that as a blocking issue rather than guessing either
 * way. See `validator.ts`'s `resolveApplicability`.
 *
 * Scope note, consistent with `../fieldMap.ts`'s existing stance: several
 * items bundle closely-related DS-160 sub-questions into one structured
 * `object`-valued item (e.g. `previous_us_travel.visa_details` covers visa
 * type/number/issue date/same-type/same-location/principal-residence/
 * ten-print in one answer) rather than exploding every CEAC sub-question
 * into its own checklist id. This keeps the catalog a representative,
 * maintainable contract at the *family* granularity the acceptance
 * criteria describe, rather than a guessed 1:1 replica of the live form's
 * exact question count. Distinct Yes/No questions with their own
 * conditional "explain" follow-up (visa lost/stolen, visa cancelled/
 * revoked, subject of a removal hearing, ...) each get their own id via
 * `boolWithExplanation` instead, since those are independently
 * true/false/inapplicable facts, not sub-fields of one answer.
 */

export type ChecklistFamily =
  | 'identity'
  | 'residency'
  | 'contact'
  | 'passport'
  | 'travel'
  | 'previous_us_travel'
  | 'us_contact'
  | 'family'
  | 'present_employment'
  | 'previous_employment'
  | 'education'
  | 'languages'
  | 'country_travel'
  | 'organizations'
  | 'specialized_skills'
  | 'military_service'
  | 'paramilitary'
  | 'security_background'
  | 'application_admin';

/** How a single value (or a repeatable entry's named sub-field) must be formatted. */
export type ValueKind = 'string' | 'boolean' | 'date' | 'enum' | 'object';

/** A named sub-field inside an `object`-valued item or a repeatable entry. */
export interface FieldSpec {
  key: string;
  valueKind: ValueKind;
  enumValues?: string[];
  /** When true, this sub-field may be absent/empty even on a confirmed answer. */
  optional?: boolean;
}

/**
 * A predicate over another checklist item's confirmed value. Exactly one of
 * `equals` / `in` / `notEquals` should be set; see `evaluateCondition` in
 * `validator.ts`.
 */
export interface ConditionalRule {
  /** The checklist id of the gating (non-repeatable) answer. */
  dependsOn: string;
  equals?: unknown;
  in?: unknown[];
  notEquals?: unknown;
}

export interface ChecklistItemDef {
  id: string;
  family: ChecklistFamily;
  label: string;
  valueKind: ValueKind;
  enumValues?: string[];
  /** Sub-fields when `valueKind === 'object'` (for both scalar and repeatable-entry objects). */
  fields?: FieldSpec[];
  /**
   * True when the DS-160 form itself makes this field optional (not
   * data-dependent on another answer) - e.g. a U.S. contact's email. An
   * optional item may be legitimately answered `not_applicable`, but that
   * still requires an explicit, reviewed answer; a missing entry is still
   * a `missing` validation error. Mutually exclusive in practice with
   * `conditional` (conditional items derive applicability from a gate
   * instead of being unconditionally optional).
   */
  optional?: boolean;
  /** Present when this item only applies conditional on another item's value. */
  conditional?: ConditionalRule;
  /** True when this id addresses `dossier.repeatables[id]` instead of `dossier.answers[id]`. */
  repeatable?: boolean;
}

const items: ChecklistItemDef[] = [];

function scalar(
  id: string,
  family: ChecklistFamily,
  label: string,
  valueKind: ValueKind,
  opts: Partial<Pick<ChecklistItemDef, 'enumValues' | 'fields' | 'optional' | 'conditional'>> = {}
): void {
  items.push({ id, family, label, valueKind, ...opts });
}

function gate(
  id: string,
  family: ChecklistFamily,
  label: string,
  opts: Partial<Pick<ChecklistItemDef, 'optional' | 'conditional'>> = {}
): void {
  scalar(id, family, label, 'boolean', opts);
}

function object(
  id: string,
  family: ChecklistFamily,
  label: string,
  fields: FieldSpec[],
  opts: Partial<Pick<ChecklistItemDef, 'optional' | 'conditional'>> = {}
): void {
  scalar(id, family, label, 'object', { fields, ...opts });
}

function repeatable(
  id: string,
  family: ChecklistFamily,
  label: string,
  fields: FieldSpec[],
  opts: Partial<Pick<ChecklistItemDef, 'conditional'>> = {}
): void {
  items.push({ id, family, label, valueKind: 'object', fields, repeatable: true, ...opts });
}

/** Boolean gate + a conditional string explanation, required whenever the gate is true. */
function boolWithExplanation(id: string, family: ChecklistFamily, label: string): void {
  gate(id, family, `${label}?`);
  scalar(`${id}.explanation`, family, `${label}: explanation`, 'string', {
    conditional: { dependsOn: id, equals: true },
  });
}

// ============================================================================
// identity - legal name, other names, native alphabet, nationality, IDs
// ============================================================================

scalar('identity.surname', 'identity', 'Surname (legal last name)', 'string');
scalar('identity.given_names', 'identity', 'Given names (legal first/middle names)', 'string');
scalar('identity.full_name_native_alphabet', 'identity', 'Full name in native alphabet', 'string', {
  optional: true,
});
gate('identity.has_used_other_names', 'identity', 'Has the applicant used other names (maiden, alias, religious)');
repeatable('identity.other_names_used', 'identity', 'Other names used', [{ key: 'fullName', valueKind: 'string' }], {
  conditional: { dependsOn: 'identity.has_used_other_names', equals: true },
});
gate('identity.has_telecode', 'identity', 'Does the applicant have a telecode representation of their name');
scalar('identity.telecode', 'identity', 'Telecode', 'string', {
  conditional: { dependsOn: 'identity.has_telecode', equals: true },
});
scalar('identity.sex', 'identity', 'Sex', 'enum', { enumValues: ['male', 'female'] });
scalar('identity.marital_status', 'identity', 'Marital status', 'enum', {
  enumValues: [
    'single',
    'married',
    'common_law_marriage',
    'civil_union_domestic_partnership',
    'widowed',
    'divorced',
    'legally_separated',
    'other',
  ],
});
scalar('identity.date_of_birth', 'identity', 'Date of birth', 'date');
object('identity.place_of_birth', 'identity', 'Place of birth', [
  { key: 'city', valueKind: 'string' },
  { key: 'stateOrProvince', valueKind: 'string', optional: true },
  { key: 'country', valueKind: 'string' },
]);
scalar('identity.nationality', 'identity', 'Nationality', 'string');
gate('identity.holds_other_nationality', 'identity', 'Holds nationality other than the primary one declared above');
scalar('identity.other_nationality', 'identity', 'Other nationality held', 'string', {
  conditional: { dependsOn: 'identity.holds_other_nationality', equals: true },
});
gate(
  'identity.is_permanent_resident_other_country',
  'identity',
  'Is a permanent resident of a country other than their nationality'
);
scalar('identity.permanent_resident_country', 'identity', 'Country of other permanent residence', 'string', {
  conditional: { dependsOn: 'identity.is_permanent_resident_other_country', equals: true },
});
gate('identity.has_national_id', 'identity', 'Has a national identification number');
scalar('identity.national_id_number', 'identity', 'National identification number', 'string', {
  conditional: { dependsOn: 'identity.has_national_id', equals: true },
});
gate('identity.has_us_ssn', 'identity', 'Has a U.S. Social Security number');
scalar('identity.us_ssn', 'identity', 'U.S. Social Security number', 'string', {
  conditional: { dependsOn: 'identity.has_us_ssn', equals: true },
});
gate('identity.has_us_taxpayer_id', 'identity', 'Has a U.S. Taxpayer ID number');
scalar('identity.us_taxpayer_id', 'identity', 'U.S. Taxpayer ID number', 'string', {
  conditional: { dependsOn: 'identity.has_us_taxpayer_id', equals: true },
});
gate('identity.has_clan_or_tribe', 'identity', 'Has a clan or tribe affiliation to declare');
scalar('identity.clan_or_tribe', 'identity', 'Clan/tribe', 'string', {
  conditional: { dependsOn: 'identity.has_clan_or_tribe', equals: true },
});

// ============================================================================
// residency - home and mailing address
// ============================================================================

const ADDRESS_FIELDS: FieldSpec[] = [
  { key: 'line1', valueKind: 'string' },
  { key: 'line2', valueKind: 'string', optional: true },
  { key: 'city', valueKind: 'string' },
  { key: 'stateOrProvince', valueKind: 'string', optional: true },
  { key: 'postalCode', valueKind: 'string', optional: true },
  { key: 'country', valueKind: 'string' },
];

object('residency.home_address', 'residency', 'Home address', ADDRESS_FIELDS);
gate('residency.mailing_same_as_home', 'residency', 'Mailing address is the same as home address');
object('residency.mailing_address', 'residency', 'Mailing address', ADDRESS_FIELDS, {
  conditional: { dependsOn: 'residency.mailing_same_as_home', equals: false },
});

// ============================================================================
// contact - phones, emails, social media
// ============================================================================

scalar('contact.primary_phone', 'contact', 'Primary phone number', 'string');
repeatable('contact.other_phones', 'contact', 'Other phone numbers used in the last five years', [
  { key: 'phone', valueKind: 'string' },
]);
scalar('contact.primary_email', 'contact', 'Primary email address', 'string');
repeatable('contact.other_emails', 'contact', 'Other email addresses used in the last five years', [
  { key: 'email', valueKind: 'string' },
]);

/**
 * Representative, closed set of named social media platforms. As with
 * `../fieldMap.ts`'s stance, this is not claimed to be a verbatim replica
 * of the live CEAC platform list - `contact.social_media_other` (below)
 * covers anything not named here.
 */
const SOCIAL_MEDIA_PLATFORMS = ['facebook', 'instagram', 'x_twitter', 'linkedin', 'youtube', 'tiktok'] as const;

for (const platform of SOCIAL_MEDIA_PLATFORMS) {
  gate(`contact.social_media.${platform}.has_account`, 'contact', `Has a ${platform} account`);
  scalar(`contact.social_media.${platform}.handle`, 'contact', `${platform} handle/username`, 'string', {
    conditional: { dependsOn: `contact.social_media.${platform}.has_account`, equals: true },
  });
}

repeatable(
  'contact.social_media_other',
  'contact',
  'Other social media platforms not listed above',
  [
    { key: 'platform', valueKind: 'string' },
    { key: 'handle', valueKind: 'string' },
  ]
);

// ============================================================================
// passport - document details and loss history
// ============================================================================

scalar('passport.type', 'passport', 'Passport/travel document type', 'enum', {
  enumValues: ['regular', 'official', 'diplomatic', 'laissez_passer', 'other'],
});
scalar('passport.number', 'passport', 'Passport number', 'string');
gate('passport.has_book_number', 'passport', 'Passport has a booklet number');
scalar('passport.book_number', 'passport', 'Passport booklet number', 'string', {
  conditional: { dependsOn: 'passport.has_book_number', equals: true },
});
object('passport.issuing_location', 'passport', 'Where the passport was issued', [
  { key: 'city', valueKind: 'string' },
  { key: 'stateOrProvince', valueKind: 'string', optional: true },
  { key: 'country', valueKind: 'string' },
]);
scalar('passport.issuance_date', 'passport', 'Passport issuance date', 'date');
scalar('passport.expiration_date', 'passport', 'Passport expiration date', 'date');
gate('passport.ever_lost_or_stolen', 'passport', 'Has ever had a passport/travel document lost or stolen');
repeatable(
  'passport.loss_history',
  'passport',
  'Lost or stolen passport/travel document history',
  [
    { key: 'documentType', valueKind: 'string' },
    { key: 'documentNumber', valueKind: 'string', optional: true },
    { key: 'countryOfIssuance', valueKind: 'string' },
    { key: 'approximateDateOfLoss', valueKind: 'date', optional: true },
    { key: 'explanation', valueKind: 'string' },
  ],
  { conditional: { dependsOn: 'passport.ever_lost_or_stolen', equals: true } }
);

// ============================================================================
// travel - purpose, plans, stay, address, payer, companions
// ============================================================================

scalar('travel.purpose', 'travel', 'Purpose of trip to the U.S.', 'string');
gate('travel.has_specific_plans', 'travel', 'Has made specific travel plans');
object(
  'travel.specific_plans',
  'travel',
  'Specific travel plan details',
  [
    { key: 'arrivalDate', valueKind: 'date' },
    { key: 'lengthOfStay', valueKind: 'string' },
    { key: 'usAddressLine1', valueKind: 'string' },
    { key: 'usAddressCity', valueKind: 'string' },
    { key: 'usAddressState', valueKind: 'string' },
  ],
  { conditional: { dependsOn: 'travel.has_specific_plans', equals: true } }
);
object(
  'travel.intended_plans',
  'travel',
  'Intended (approximate) travel plan details',
  [
    { key: 'intendedArrivalDate', valueKind: 'string' },
    { key: 'intendedLengthOfStay', valueKind: 'string' },
  ],
  { conditional: { dependsOn: 'travel.has_specific_plans', equals: false } }
);
scalar('travel.payer', 'travel', 'Who is paying for the trip', 'enum', {
  enumValues: ['self', 'other_person', 'other_organization'],
});
object(
  'travel.payer_details',
  'travel',
  'Trip payer details',
  [
    { key: 'name', valueKind: 'string' },
    { key: 'relationship', valueKind: 'string' },
    { key: 'phone', valueKind: 'string', optional: true },
  ],
  { conditional: { dependsOn: 'travel.payer', in: ['other_person', 'other_organization'] } }
);
repeatable('travel.companions', 'travel', 'Travel companions', [
  { key: 'fullName', valueKind: 'string' },
  { key: 'relationship', valueKind: 'string' },
]);
gate('travel.traveling_with_group', 'travel', 'Is traveling as part of a group or organization');
scalar('travel.group_name', 'travel', 'Group or organization name', 'string', {
  conditional: { dependsOn: 'travel.traveling_with_group', equals: true },
});

// ============================================================================
// previous_us_travel - prior visits, license, visa, refusal, petition
// ============================================================================

gate('previous_us_travel.been_to_us_before', 'previous_us_travel', 'Has been to the U.S. before');
repeatable(
  'previous_us_travel.visits',
  'previous_us_travel',
  'Previous U.S. visits',
  [
    { key: 'arrivalDateApprox', valueKind: 'date' },
    { key: 'lengthOfStay', valueKind: 'string' },
    { key: 'purpose', valueKind: 'string' },
  ],
  { conditional: { dependsOn: 'previous_us_travel.been_to_us_before', equals: true } }
);
gate('previous_us_travel.held_us_drivers_license', 'previous_us_travel', 'Has held a U.S. driver’s license');
object(
  'previous_us_travel.drivers_license_details',
  'previous_us_travel',
  'U.S. driver’s license details',
  [
    { key: 'licenseNumber', valueKind: 'string' },
    { key: 'state', valueKind: 'string' },
  ],
  { conditional: { dependsOn: 'previous_us_travel.held_us_drivers_license', equals: true } }
);
gate('previous_us_travel.previously_issued_visa', 'previous_us_travel', 'Has previously been issued a U.S. visa');
object(
  'previous_us_travel.visa_details',
  'previous_us_travel',
  'Previous U.S. visa details',
  [
    { key: 'visaType', valueKind: 'string' },
    { key: 'visaNumber', valueKind: 'string', optional: true },
    { key: 'issueDate', valueKind: 'date' },
    { key: 'sameVisaType', valueKind: 'boolean' },
    { key: 'applyingSameLocation', valueKind: 'boolean' },
    { key: 'applyingInCountryOfPrincipalResidence', valueKind: 'boolean' },
    { key: 'tenPrinted', valueKind: 'boolean' },
  ],
  { conditional: { dependsOn: 'previous_us_travel.previously_issued_visa', equals: true } }
);
boolWithExplanation('previous_us_travel.visa_ever_lost_or_stolen', 'previous_us_travel', 'Has ever had a U.S. visa lost or stolen');
boolWithExplanation(
  'previous_us_travel.visa_ever_cancelled_or_revoked',
  'previous_us_travel',
  'Has ever had a U.S. visa cancelled or revoked'
);
gate('previous_us_travel.visa_ever_refused', 'previous_us_travel', 'Has ever had a U.S. visa refused');
object(
  'previous_us_travel.refusal_details',
  'previous_us_travel',
  'Visa refusal details',
  [
    { key: 'date', valueKind: 'date' },
    { key: 'visaTypeApplied', valueKind: 'string' },
    { key: 'reason', valueKind: 'string', optional: true },
  ],
  { conditional: { dependsOn: 'previous_us_travel.visa_ever_refused', equals: true } }
);
gate(
  'previous_us_travel.immigrant_petition_filed',
  'previous_us_travel',
  'Has ever had an immigrant petition filed on their behalf'
);
object(
  'previous_us_travel.petition_details',
  'previous_us_travel',
  'Immigrant petition details',
  [
    { key: 'petitionerName', valueKind: 'string' },
    { key: 'relationship', valueKind: 'string' },
    { key: 'filedDate', valueKind: 'date' },
  ],
  { conditional: { dependsOn: 'previous_us_travel.immigrant_petition_filed', equals: true } }
);

// ============================================================================
// us_contact - point of contact in the United States
// ============================================================================

scalar('us_contact.contact_type', 'us_contact', 'U.S. contact type', 'enum', {
  enumValues: ['person', 'organization'],
});
scalar('us_contact.name', 'us_contact', 'U.S. contact name', 'string');
scalar('us_contact.relationship', 'us_contact', 'Relationship to U.S. contact', 'string');
object('us_contact.address', 'us_contact', 'U.S. contact address', ADDRESS_FIELDS);
scalar('us_contact.phone', 'us_contact', 'U.S. contact phone', 'string');
scalar('us_contact.email', 'us_contact', 'U.S. contact email', 'string', { optional: true });

// ============================================================================
// family - parents, spouse/partner, other relatives in the U.S.
// ============================================================================

scalar('family.father_name', 'family', "Father's full name", 'string', { optional: true });
scalar('family.father_date_of_birth', 'family', "Father's date of birth", 'date', { optional: true });
scalar('family.father_in_us', 'family', 'Father is in the U.S.', 'boolean', { optional: true });
scalar('family.mother_name', 'family', "Mother's full name", 'string', { optional: true });
scalar('family.mother_date_of_birth', 'family', "Mother's date of birth", 'date', { optional: true });
scalar('family.mother_in_us', 'family', 'Mother is in the U.S.', 'boolean', { optional: true });
object(
  'family.spouse_partner_details',
  'family',
  'Spouse/partner details',
  [
    { key: 'fullName', valueKind: 'string' },
    { key: 'dateOfBirth', valueKind: 'date' },
    { key: 'nationality', valueKind: 'string' },
    { key: 'address', valueKind: 'string' },
  ],
  {
    conditional: {
      dependsOn: 'identity.marital_status',
      in: ['married', 'common_law_marriage', 'civil_union_domestic_partnership'],
    },
  }
);
repeatable('family.other_relatives_in_us', 'family', 'Other relatives in the U.S.', [
  { key: 'fullName', valueKind: 'string' },
  { key: 'relationship', valueKind: 'string' },
]);

// ============================================================================
// present_employment / previous_employment
// ============================================================================

scalar('present_employment.primary_occupation_category', 'present_employment', 'Primary occupation category', 'enum', {
  enumValues: ['employed', 'self_employed', 'student', 'unemployed', 'retired', 'homemaker', 'other'],
});
object(
  'present_employment.employer_details',
  'present_employment',
  'Present employer/business details',
  [
    { key: 'employerName', valueKind: 'string' },
    { key: 'addressLine1', valueKind: 'string' },
    { key: 'city', valueKind: 'string' },
    { key: 'stateOrProvince', valueKind: 'string', optional: true },
    { key: 'postalCode', valueKind: 'string', optional: true },
    { key: 'country', valueKind: 'string' },
    { key: 'phone', valueKind: 'string' },
    { key: 'jobTitle', valueKind: 'string' },
    { key: 'startDate', valueKind: 'date' },
    { key: 'monthlyIncome', valueKind: 'string' },
    { key: 'dutiesDescription', valueKind: 'string' },
  ],
  {
    conditional: {
      dependsOn: 'present_employment.primary_occupation_category',
      in: ['employed', 'self_employed'],
    },
  }
);

gate('previous_employment.was_previously_employed', 'previous_employment', 'Has been previously employed');
repeatable(
  'previous_employment.entries',
  'previous_employment',
  'Previous employment history',
  [
    { key: 'employerName', valueKind: 'string' },
    { key: 'addressLine1', valueKind: 'string' },
    { key: 'city', valueKind: 'string' },
    { key: 'stateOrProvince', valueKind: 'string', optional: true },
    { key: 'postalCode', valueKind: 'string', optional: true },
    { key: 'country', valueKind: 'string' },
    { key: 'phone', valueKind: 'string' },
    { key: 'jobTitle', valueKind: 'string' },
    { key: 'supervisorName', valueKind: 'string', optional: true },
    { key: 'startDate', valueKind: 'date' },
    { key: 'endDate', valueKind: 'date' },
    { key: 'dutiesDescription', valueKind: 'string' },
  ],
  { conditional: { dependsOn: 'previous_employment.was_previously_employed', equals: true } }
);

// ============================================================================
// education / languages / country_travel / organizations
// ============================================================================

repeatable('education.institutions', 'education', 'Educational institutions attended', [
  { key: 'institutionName', valueKind: 'string' },
  { key: 'addressLine1', valueKind: 'string' },
  { key: 'city', valueKind: 'string' },
  { key: 'stateOrProvince', valueKind: 'string', optional: true },
  { key: 'postalCode', valueKind: 'string', optional: true },
  { key: 'country', valueKind: 'string' },
  { key: 'courseOfStudy', valueKind: 'string' },
  { key: 'startDate', valueKind: 'date' },
  { key: 'endDate', valueKind: 'date', optional: true },
]);

repeatable('languages.spoken', 'languages', 'Languages spoken', [{ key: 'language', valueKind: 'string' }]);

repeatable('country_travel.countries_visited', 'country_travel', 'Countries visited in the last five years', [
  { key: 'country', valueKind: 'string' },
  { key: 'purpose', valueKind: 'string', optional: true },
]);

repeatable('organizations.memberships', 'organizations', 'Professional, social, or charitable organizations', [
  { key: 'organizationName', valueKind: 'string' },
  { key: 'organizationType', valueKind: 'string', optional: true },
]);

// ============================================================================
// specialized_skills / military_service / paramilitary
// ============================================================================

gate(
  'specialized_skills.has_specialized_skills',
  'specialized_skills',
  'Has specialized skills or training (firearms, explosives, nuclear, biological, or chemical)'
);
scalar('specialized_skills.details', 'specialized_skills', 'Specialized skills/training details', 'string', {
  conditional: { dependsOn: 'specialized_skills.has_specialized_skills', equals: true },
});

gate('military_service.has_served', 'military_service', 'Has served in the military');
repeatable(
  'military_service.entries',
  'military_service',
  'Military service history',
  [
    { key: 'country', valueKind: 'string' },
    { key: 'branch', valueKind: 'string' },
    { key: 'rank', valueKind: 'string', optional: true },
    { key: 'specialty', valueKind: 'string', optional: true },
    { key: 'startDate', valueKind: 'date' },
    { key: 'endDate', valueKind: 'date', optional: true },
  ],
  { conditional: { dependsOn: 'military_service.has_served', equals: true } }
);

gate(
  'paramilitary.has_been_involved',
  'paramilitary',
  'Has served in, or been involved with, a paramilitary unit, vigilante unit, rebel group, guerrilla group, or insurgent organization'
);
scalar('paramilitary.details', 'paramilitary', 'Paramilitary involvement details', 'string', {
  conditional: { dependsOn: 'paramilitary.has_been_involved', equals: true },
});

// ============================================================================
// security_background - every DS-160 security/background question family
// ============================================================================

const SECURITY_QUESTIONS: Array<{ slug: string; label: string }> = [
  // Health
  { slug: 'communicable_disease', label: 'Has a communicable disease of public health significance' },
  {
    slug: 'mental_or_physical_disorder_threat',
    label: 'Has a mental or physical disorder that poses or has posed a threat',
  },
  { slug: 'drug_abuser_or_addict', label: 'Is or has been a drug abuser or addict' },
  // Criminal
  { slug: 'arrested_or_convicted', label: 'Has ever been arrested or convicted of any offense' },
  { slug: 'controlled_substance_violation', label: 'Has ever violated a law related to controlled substances' },
  { slug: 'prostitution_or_vice', label: 'Has come to engage in prostitution or unlawful commercialized vice' },
  { slug: 'money_laundering', label: 'Has been involved in money laundering' },
  { slug: 'human_trafficking_committed', label: 'Has committed or conspired to commit human trafficking' },
  { slug: 'human_trafficking_aided', label: 'Has knowingly aided, abetted, or colluded in human trafficking' },
  {
    slug: 'human_trafficking_family_benefited',
    label: 'Is the family member of a trafficker who has knowingly benefited from the trafficking',
  },
  // Security-related
  {
    slug: 'espionage_sabotage_export_violation',
    label: 'Seeks to engage in espionage, sabotage, export control violations, or other illegal activity',
  },
  { slug: 'terrorist_activity', label: 'Has engaged in terrorist activity' },
  {
    slug: 'terrorist_org_member_or_representative',
    label: 'Is a member or representative of a terrorist organization',
  },
  { slug: 'terrorist_support_provided', label: 'Has provided material support to a terrorist or terrorist organization' },
  {
    slug: 'family_terrorist_activity_5yr',
    label: "Is the spouse, child, or family member of an individual who engaged in terrorist activity within the last five years",
  },
  { slug: 'genocide_participation', label: 'Has ordered, incited, committed, or participated in genocide' },
  { slug: 'torture_participation', label: 'Has ordered, incited, committed, or participated in torture' },
  {
    slug: 'extrajudicial_killing_participation',
    label: 'Has committed, ordered, incited, or participated in extrajudicial or political killings',
  },
  {
    slug: 'severe_religious_freedom_violations',
    label: 'Has engaged in particularly severe violations of religious freedom',
  },
  { slug: 'child_soldier_recruitment', label: 'Has recruited or used child soldiers' },
  {
    slug: 'forced_abortion_sterilization',
    label: 'Has been directly involved in the establishment/enforcement of population control forcing abortion/sterilization',
  },
  {
    slug: 'coercive_organ_transplantation',
    label: 'Has been directly involved in coercive transplantation of human organs or tissue',
  },
  // Immigration violations
  { slug: 'previously_removed_or_deported', label: 'Has ever been removed or deported from any country' },
  {
    slug: 'immigration_fraud_or_misrepresentation',
    label: 'Has sought to obtain, or assisted others in obtaining, a visa/entry/immigration benefit by fraud or misrepresentation',
  },
  { slug: 'failed_to_attend_removal_hearing', label: 'Has failed to attend a removal hearing within the last five years' },
  {
    slug: 'subject_of_removal_or_deportation_hearing',
    label: 'Has ever been the subject of a removal or deportation hearing',
  },
  {
    slug: 'unlawful_presence_or_visa_violation',
    label: 'Has been unlawfully present or otherwise violated the terms of a U.S. visa',
  },
  // Miscellaneous
  { slug: 'withheld_child_custody', label: 'Has withheld custody of a U.S. citizen child from a person granted custody' },
  { slug: 'unlawful_voting_in_us', label: 'Has voted in the United States in violation of any law or regulation' },
  {
    slug: 'renounced_citizenship_to_avoid_tax',
    label: 'Has renounced U.S. citizenship for the purpose of avoiding taxation',
  },
  {
    slug: 'public_school_attendance_without_reimbursement',
    label:
      'Has attended a public elementary school (grades K-8) on F (student) nonimmigrant status, or a public secondary school (grades 9-12) after November 30, 1996 without reimbursing the school',
  },
];

for (const q of SECURITY_QUESTIONS) {
  boolWithExplanation(`security_background.${q.slug}`, 'security_background', q.label);
}

// ============================================================================
// application_admin - filing location and preparer/interpreter
// ============================================================================

scalar('application_admin.filing_location', 'application_admin', 'Embassy/consulate applying at', 'string');
gate('application_admin.completed_by_self', 'application_admin', 'Application was completed by the applicant themself');
object(
  'application_admin.preparer_details',
  'application_admin',
  'Preparer details',
  [
    { key: 'fullName', valueKind: 'string' },
    { key: 'relationship', valueKind: 'string' },
    { key: 'addressLine1', valueKind: 'string' },
    { key: 'city', valueKind: 'string' },
    { key: 'country', valueKind: 'string' },
    { key: 'phone', valueKind: 'string' },
  ],
  { conditional: { dependsOn: 'application_admin.completed_by_self', equals: false } }
);
gate('application_admin.used_interpreter', 'application_admin', 'Used an interpreter to complete the application');
object(
  'application_admin.interpreter_details',
  'application_admin',
  'Interpreter details',
  [
    { key: 'fullName', valueKind: 'string' },
    { key: 'relationship', valueKind: 'string' },
  ],
  { conditional: { dependsOn: 'application_admin.used_interpreter', equals: true } }
);

/** The complete, ordered DS-160 dossier readiness checklist. */
export const DS160_READINESS_CHECKLIST: readonly ChecklistItemDef[] = items;

const ITEM_BY_ID: ReadonlyMap<string, ChecklistItemDef> = new Map(items.map((item) => [item.id, item]));

/** Look up a checklist item definition by its stable id. */
export function getChecklistItem(id: string): ChecklistItemDef | undefined {
  return ITEM_BY_ID.get(id);
}

/** All families that have at least one checklist item, in first-seen order. */
export const CHECKLIST_FAMILIES: readonly ChecklistFamily[] = Array.from(new Set(items.map((item) => item.family)));
