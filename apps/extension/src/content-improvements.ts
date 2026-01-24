/**
 * Content Script Improvements - Enhanced Form Detection
 *
 * This module adds advanced field semantic detection, Shadow DOM support,
 * and better field identification strategies.
 */

import type { FieldSemantic } from '@asterisk/core';

// ============================================================================
// Semantic Field Detection
// ============================================================================

/**
 * Infer semantic meaning from field attributes and context
 *
 * Uses multiple heuristics:
 * 1. HTML autocomplete attribute (most reliable)
 * 2. Input type
 * 3. Name attribute patterns
 * 4. Label text patterns
 * 5. Placeholder patterns
 * 6. ID patterns
 */
export function inferFieldSemantic(element: HTMLElement, label: string): FieldSemantic {
  const input = element as HTMLInputElement;

  // 1. Autocomplete attribute (most reliable)
  const autocomplete = element.getAttribute('autocomplete')?.toLowerCase();
  if (autocomplete) {
    const semanticMap: Record<string, FieldSemantic> = {
      'given-name': 'firstName',
      'family-name': 'lastName',
      'name': 'fullName',
      'email': 'email',
      'tel': 'phone',
      'tel-national': 'phone',
      'street-address': 'street',
      'address-line1': 'street',
      'address-level2': 'city',
      'address-level1': 'state',
      'postal-code': 'zipCode',
      'country': 'country',
      'cc-number': 'creditCard',
      'cc-csc': 'cvv',
      'cc-exp': 'expiryDate',
      'username': 'username',
      'new-password': 'password',
      'current-password': 'password',
      'bday': 'dateOfBirth',
      'organization': 'company',
      'organization-title': 'jobTitle',
    };

    if (autocomplete in semanticMap) {
      return semanticMap[autocomplete];
    }
  }

  // 2. Input type
  const type = input.type?.toLowerCase();
  if (type === 'email') return 'email';
  if (type === 'password') return 'password';
  if (type === 'tel') return 'phone';

  // 3. Name attribute patterns
  const name = element.getAttribute('name')?.toLowerCase() || '';
  const namePatterns: Array<[RegExp, FieldSemantic]> = [
    [/first.*name|fname|given.*name/i, 'firstName'],
    [/last.*name|lname|surname|family.*name/i, 'lastName'],
    [/full.*name|name/i, 'fullName'],
    [/e?mail/i, 'email'],
    [/phone|tel|mobile|cell/i, 'phone'],
    [/street|address1|addr1/i, 'street'],
    [/city|town/i, 'city'],
    [/state|province|region/i, 'state'],
    [/zip|postal.*code|postcode/i, 'zipCode'],
    [/country/i, 'country'],
    [/card.*number|cc.*num|credit.*card/i, 'creditCard'],
    [/cvv|cvc|security.*code/i, 'cvv'],
    [/expir|exp.*date/i, 'expiryDate'],
    [/user.*name|login/i, 'username'],
    [/pass.*word|pwd/i, 'password'],
    [/birth|dob|birthday/i, 'dateOfBirth'],
    [/company|organization|employer/i, 'company'],
    [/title|position|role/i, 'jobTitle'],
  ];

  for (const [pattern, semantic] of namePatterns) {
    if (pattern.test(name)) {
      return semantic;
    }
  }

  // 4. Label text patterns (case-insensitive)
  const lowerLabel = label.toLowerCase();
  for (const [pattern, semantic] of namePatterns) {
    if (pattern.test(lowerLabel)) {
      return semantic;
    }
  }

  // 5. Placeholder patterns
  const placeholder = element.getAttribute('placeholder')?.toLowerCase() || '';
  for (const [pattern, semantic] of namePatterns) {
    if (pattern.test(placeholder)) {
      return semantic;
    }
  }

  // 6. ID patterns
  const id = element.id?.toLowerCase() || '';
  for (const [pattern, semantic] of namePatterns) {
    if (pattern.test(id)) {
      return semantic;
    }
  }

  return 'unknown';
}

// ============================================================================
// Shadow DOM Support
// ============================================================================

/**
 * Find all form fields including those in Shadow DOM
 */
export function findAllFields(root: Document | ShadowRoot = document): Element[] {
  const fields: Element[] = [];

  // Get fields in current scope
  const selector = 'input, select, textarea';
  fields.push(...Array.from(root.querySelectorAll(selector)));

  // Recursively search Shadow DOM
  const elementsWithShadow = root.querySelectorAll('*');
  for (const element of elementsWithShadow) {
    if (element.shadowRoot) {
      fields.push(...findAllFields(element.shadowRoot));
    }
  }

  return fields;
}

/**
 * Find label for element, supporting Shadow DOM
 */
export function findLabelInShadowDOM(element: HTMLElement): string | null {
  // Check if element is in Shadow DOM
  let currentRoot: Document | ShadowRoot = document;
  let current: Node | null = element;

  while (current) {
    if (current instanceof ShadowRoot) {
      currentRoot = current;
      break;
    }
    current = current.parentNode;
  }

  // 1. Explicit label in same scope
  if (element.id) {
    const label = currentRoot.querySelector(`label[for="${element.id}"]`);
    if (label?.textContent) {
      return label.textContent.trim();
    }
  }

  // 2. Wrapping label
  const parentLabel = element.closest('label');
  if (parentLabel?.textContent) {
    return parentLabel.textContent.trim();
  }

  return null;
}

// ============================================================================
// Field Visibility Detection
// ============================================================================

/**
 * Check if a field is actually visible to the user
 * Skips hidden, display:none, and zero-size elements
 */
export function isFieldVisible(element: HTMLElement): boolean {
  // Check if element or any parent has display: none
  let current: HTMLElement | null = element;
  while (current) {
    const style = window.getComputedStyle(current);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }
    current = current.parentElement;
  }

  // Check if element has zero size
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    return false;
  }

  // Check if element is off-screen (some forms hide fields this way)
  if (rect.top < -1000 || rect.left < -1000) {
    return false;
  }

  return true;
}

// ============================================================================
// Better Field Identification
// ============================================================================

/**
 * Generate stable, unique ID for a field
 * Uses multiple strategies to create IDs that survive page navigation
 */
export function generateStableFieldId(
  element: HTMLElement,
  index: number
): string {
  // 1. Use existing ID if available
  if (element.id) {
    return element.id;
  }

  // 2. Use name attribute if unique
  const name = element.getAttribute('name');
  if (name && isNameUnique(name)) {
    return `name-${name}`;
  }

  // 3. Use data-testid or similar test attributes
  const testId = element.getAttribute('data-testid') ||
                 element.getAttribute('data-test-id') ||
                 element.getAttribute('data-qa');
  if (testId) {
    return `test-${testId}`;
  }

  // 4. Generate from structure (more stable than simple index)
  const formIndex = getFormIndex(element);
  const fieldPath = getFieldPath(element);
  return `field-${formIndex}-${fieldPath}-${index}`;
}

function isNameUnique(name: string): boolean {
  const elements = document.querySelectorAll(`[name="${name}"]`);
  return elements.length === 1;
}

function getFormIndex(element: HTMLElement): number {
  const form = element.closest('form');
  if (!form) return 0;

  const forms = Array.from(document.querySelectorAll('form'));
  return forms.indexOf(form);
}

function getFieldPath(element: HTMLElement): string {
  const path: string[] = [];
  let current: HTMLElement | null = element;

  while (current && current !== document.body) {
    const tag = current.tagName.toLowerCase();
    const siblings = Array.from(current.parentElement?.children || []);
    const sameTagSiblings = siblings.filter(s => s.tagName.toLowerCase() === tag);

    if (sameTagSiblings.length > 1) {
      const index = sameTagSiblings.indexOf(current);
      path.unshift(`${tag}[${index}]`);
    } else {
      path.unshift(tag);
    }

    current = current.parentElement;

    // Stop at form boundary
    if (current?.tagName === 'FORM') break;
  }

  return path.join('>');
}

// ============================================================================
// Multi-Page Form Detection
// ============================================================================

/**
 * Detect if this appears to be part of a multi-step form
 * (e.g., wizards, checkout flows)
 */
export function detectMultiStepForm(): {
  isMultiStep: boolean;
  currentStep?: number;
  totalSteps?: number;
  stepIndicators?: string[];
} {
  // Look for common multi-step indicators
  const indicators = [
    // Progress indicators
    ...Array.from(document.querySelectorAll('[class*="step"], [class*="progress"], [id*="step"]')),
    // Stepper components
    ...Array.from(document.querySelectorAll('ol[class*="stepper"], ul[class*="steps"]')),
    // Breadcrumbs
    ...Array.from(document.querySelectorAll('[aria-label*="step"], [role="progressbar"]')),
  ];

  if (indicators.length === 0) {
    return { isMultiStep: false };
  }

  // Try to determine current and total steps
  const stepText = indicators
    .map(el => el.textContent?.toLowerCase() || '')
    .join(' ');

  const stepMatch = stepText.match(/step\s+(\d+)\s+of\s+(\d+)/i);
  if (stepMatch) {
    return {
      isMultiStep: true,
      currentStep: parseInt(stepMatch[1], 10),
      totalSteps: parseInt(stepMatch[2], 10),
    };
  }

  // Look for numbered steps
  const stepElements = Array.from(document.querySelectorAll('[class*="step-"]'));
  const activeStep = stepElements.find(el =>
    el.classList.contains('active') ||
    el.classList.contains('current') ||
    el.getAttribute('aria-current') === 'step'
  );

  if (activeStep && stepElements.length > 0) {
    const currentIndex = stepElements.indexOf(activeStep);
    return {
      isMultiStep: true,
      currentStep: currentIndex + 1,
      totalSteps: stepElements.length,
    };
  }

  return {
    isMultiStep: true,
  };
}

// ============================================================================
// Form Purpose Detection
// ============================================================================

/**
 * Infer the purpose of a form based on its fields and context
 */
export function inferFormPurpose(fields: { semantic: FieldSemantic }[]):
  'signup' | 'login' | 'checkout' | 'profile' | 'survey' | 'contact' | 'unknown' {

  const semantics = new Set(fields.map(f => f.semantic));

  // Login: password + (email or username)
  if (semantics.has('password') && (semantics.has('email') || semantics.has('username'))) {
    const hasName = semantics.has('firstName') || semantics.has('lastName') || semantics.has('fullName');
    if (!hasName) {
      return 'login';
    }
  }

  // Signup: name + email + password
  if ((semantics.has('firstName') || semantics.has('fullName')) &&
      semantics.has('email') &&
      semantics.has('password')) {
    return 'signup';
  }

  // Checkout: payment info
  if (semantics.has('creditCard') || semantics.has('cvv')) {
    return 'checkout';
  }

  // Profile: personal info without password
  if ((semantics.has('firstName') || semantics.has('fullName')) &&
      !semantics.has('password')) {
    return 'profile';
  }

  // Contact: email/phone without password
  if ((semantics.has('email') || semantics.has('phone')) &&
      !semantics.has('password') &&
      !semantics.has('creditCard')) {
    return 'contact';
  }

  return 'unknown';
}
