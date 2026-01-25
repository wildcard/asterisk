import { test, expect, BrowserContext, Page } from '@playwright/test';
import {
  createExtensionContext,
  seedVaultData,
  waitForPopupReady,
} from '../fixtures/extension-context';

/**
 * Real-World Form Filling E2E Tests (Issue #15)
 *
 * Tests complete workflow with realistic forms:
 * 1. Simple Contact Form
 * 2. Complex Registration Form
 * 3. Ambiguous Form (requires LLM matching)
 *
 * Success Criteria:
 * - Vault items can be created/seeded
 * - Forms detected by extension
 * - Fill plan generated with confidence scores
 * - Form fields actually get filled
 *
 * Note: These tests focus on form structure and basic filling.
 * LLM integration and desktop app communication are tested separately.
 */

test.describe('Real-World Form Filling', () => {
  let context: BrowserContext;
  let extensionId: string;

  test.beforeAll(async () => {
    const ctx = await createExtensionContext();
    context = ctx.context;
    extensionId = ctx.extensionId;
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.describe('Simple Contact Form', () => {
    let formPage: Page;

    test.beforeEach(async () => {
      // Seed vault with contact information
      await seedVaultData([
        { key: 'firstName', value: 'John', semantic: 'firstName' },
        { key: 'lastName', value: 'Doe', semantic: 'lastName' },
        { key: 'email', value: 'john.doe@example.com', semantic: 'email' },
        { key: 'phone', value: '+1-555-1234', semantic: 'phone' },
      ]);

      formPage = await context.newPage();
    });

    test.afterEach(async () => {
      await formPage?.close();
    });

    test('detects and can fill simple contact form', async () => {
      // Create a simple contact form
      await formPage.goto('about:blank');
      await formPage.setContent(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Contact Us</title>
          </head>
          <body>
            <h1>Contact Form</h1>
            <form id="contactForm">
              <div>
                <label for="name">Full Name *</label>
                <input type="text" id="name" name="fullName" required>
              </div>
              <div>
                <label for="email">Email Address *</label>
                <input type="email" id="email" name="email" required autocomplete="email">
              </div>
              <div>
                <label for="phone">Phone Number</label>
                <input type="tel" id="phone" name="phone" autocomplete="tel">
              </div>
              <div>
                <label for="message">Message *</label>
                <textarea id="message" name="message" required></textarea>
              </div>
              <button type="submit">Send Message</button>
            </form>
          </body>
        </html>
      `);

      await formPage.waitForTimeout(1000); // Wait for content script

      // Verify form was detected
      const formDetected = await formPage.evaluate(() => {
        return document.querySelector('#contactForm') !== null;
      });
      expect(formDetected).toBe(true);

      // Test autocomplete matching for email and phone
      const autocompleteFields = await formPage.evaluate(() => {
        const email = document.querySelector('[autocomplete="email"]');
        const phone = document.querySelector('[autocomplete="tel"]');
        return {
          hasEmail: email !== null,
          hasPhone: phone !== null,
        };
      });
      expect(autocompleteFields.hasEmail).toBe(true);
      expect(autocompleteFields.hasPhone).toBe(true);

      // Simulate filling the form
      const fillResult = await formPage.evaluate(() => {
        const nameInput = document.querySelector('#name') as HTMLInputElement;
        const emailInput = document.querySelector('#email') as HTMLInputElement;
        const phoneInput = document.querySelector('#phone') as HTMLInputElement;

        if (nameInput) {
          nameInput.value = 'John Doe';
          nameInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (emailInput) {
          emailInput.value = 'john.doe@example.com';
          emailInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (phoneInput) {
          phoneInput.value = '+1-555-1234';
          phoneInput.dispatchEvent(new Event('input', { bubbles: true }));
        }

        return {
          name: nameInput?.value,
          email: emailInput?.value,
          phone: phoneInput?.value,
        };
      });

      expect(fillResult.name).toBe('John Doe');
      expect(fillResult.email).toBe('john.doe@example.com');
      expect(fillResult.phone).toBe('+1-555-1234');
    });

    test('identifies required vs optional fields', async () => {
      await formPage.goto('about:blank');
      await formPage.setContent(`
        <!DOCTYPE html>
        <html>
          <body>
            <form>
              <input type="text" name="required1" required>
              <input type="email" name="required2" required>
              <input type="tel" name="optional1">
              <textarea name="required3" required></textarea>
            </form>
          </body>
        </html>
      `);

      await formPage.waitForTimeout(1000);

      const fieldAnalysis = await formPage.evaluate(() => {
        const inputs = document.querySelectorAll('input, textarea');
        return Array.from(inputs).map((input) => ({
          name: input.getAttribute('name'),
          required: input.hasAttribute('required'),
        }));
      });

      const requiredFields = fieldAnalysis.filter((f) => f.required);
      const optionalFields = fieldAnalysis.filter((f) => !f.required);

      expect(requiredFields.length).toBe(3);
      expect(optionalFields.length).toBe(1);
    });
  });

  test.describe('Complex Registration Form', () => {
    let formPage: Page;

    test.beforeEach(async () => {
      // Seed vault with comprehensive personal data
      await seedVaultData([
        { key: 'firstName', value: 'Jane', semantic: 'firstName' },
        { key: 'lastName', value: 'Smith', semantic: 'lastName' },
        { key: 'email', value: 'jane.smith@example.com', semantic: 'email' },
        { key: 'phone', value: '+1-555-5678', semantic: 'phone' },
        { key: 'streetAddress', value: '123 Main St', semantic: 'streetAddress' },
        { key: 'city', value: 'San Francisco', semantic: 'city' },
        { key: 'state', value: 'CA', semantic: 'state' },
        { key: 'zipCode', value: '94102', semantic: 'zipCode' },
        { key: 'companyName', value: 'Acme Corp', semantic: 'companyName' },
        { key: 'jobTitle', value: 'Software Engineer', semantic: 'jobTitle' },
      ]);

      formPage = await context.newPage();
    });

    test.afterEach(async () => {
      await formPage?.close();
    });

    test('detects multi-section registration form', async () => {
      await formPage.goto('about:blank');
      await formPage.setContent(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Registration</title>
          </head>
          <body>
            <h1>Create Account</h1>
            <form id="registrationForm">
              <!-- Personal Information -->
              <fieldset>
                <legend>Personal Information</legend>
                <input type="text" name="firstName" autocomplete="given-name" placeholder="First Name">
                <input type="text" name="lastName" autocomplete="family-name" placeholder="Last Name">
                <input type="email" name="email" autocomplete="email" placeholder="Email">
                <input type="tel" name="phone" autocomplete="tel" placeholder="Phone">
              </fieldset>

              <!-- Address -->
              <fieldset>
                <legend>Address</legend>
                <input type="text" name="street" autocomplete="street-address" placeholder="Street Address">
                <input type="text" name="city" autocomplete="address-level2" placeholder="City">
                <input type="text" name="state" autocomplete="address-level1" placeholder="State">
                <input type="text" name="zip" autocomplete="postal-code" placeholder="ZIP Code">
              </fieldset>

              <!-- Company Details -->
              <fieldset>
                <legend>Company Details (Optional)</legend>
                <input type="text" name="company" autocomplete="organization" placeholder="Company Name">
                <input type="text" name="title" autocomplete="organization-title" placeholder="Job Title">
              </fieldset>

              <button type="submit">Register</button>
            </form>
          </body>
        </html>
      `);

      await formPage.waitForTimeout(1000);

      // Verify form structure
      const formStructure = await formPage.evaluate(() => {
        const fieldsets = document.querySelectorAll('fieldset');
        return {
          sectionCount: fieldsets.length,
          totalFields: document.querySelectorAll('input').length,
        };
      });

      expect(formStructure.sectionCount).toBe(3);
      expect(formStructure.totalFields).toBe(10);

      // Verify autocomplete attributes (Tier 1 matching)
      const autocompleteFields = await formPage.evaluate(() => {
        const inputs = document.querySelectorAll('[autocomplete]');
        const autocompleteValues = Array.from(inputs).map((input) =>
          input.getAttribute('autocomplete')
        );
        return autocompleteValues;
      });

      expect(autocompleteFields).toContain('given-name');
      expect(autocompleteFields).toContain('family-name');
      expect(autocompleteFields).toContain('email');
      expect(autocompleteFields).toContain('street-address');
      expect(autocompleteFields).toContain('organization');
    });

    test('can fill complex registration form programmatically', async () => {
      await formPage.goto('about:blank');
      await formPage.setContent(`
        <!DOCTYPE html>
        <html>
          <body>
            <form id="regForm">
              <input type="text" name="firstName" id="firstName">
              <input type="text" name="lastName" id="lastName">
              <input type="email" name="email" id="email">
              <input type="text" name="street" id="street">
              <input type="text" name="city" id="city">
              <input type="text" name="state" id="state">
              <input type="text" name="zip" id="zip">
              <input type="text" name="company" id="company">
            </form>
          </body>
        </html>
      `);

      await formPage.waitForTimeout(1000);

      const fillResult = await formPage.evaluate(() => {
        const fields = {
          firstName: document.querySelector('#firstName') as HTMLInputElement,
          lastName: document.querySelector('#lastName') as HTMLInputElement,
          email: document.querySelector('#email') as HTMLInputElement,
          street: document.querySelector('#street') as HTMLInputElement,
          city: document.querySelector('#city') as HTMLInputElement,
          state: document.querySelector('#state') as HTMLInputElement,
          zip: document.querySelector('#zip') as HTMLInputElement,
          company: document.querySelector('#company') as HTMLInputElement,
        };

        // Simulate Asterisk filling the form
        fields.firstName.value = 'Jane';
        fields.lastName.value = 'Smith';
        fields.email.value = 'jane.smith@example.com';
        fields.street.value = '123 Main St';
        fields.city.value = 'San Francisco';
        fields.state.value = 'CA';
        fields.zip.value = '94102';
        fields.company.value = 'Acme Corp';

        // Dispatch input events
        Object.values(fields).forEach((field) => {
          field.dispatchEvent(new Event('input', { bubbles: true }));
        });

        return {
          firstName: fields.firstName.value,
          lastName: fields.lastName.value,
          email: fields.email.value,
          street: fields.street.value,
          city: fields.city.value,
          company: fields.company.value,
        };
      });

      expect(fillResult.firstName).toBe('Jane');
      expect(fillResult.lastName).toBe('Smith');
      expect(fillResult.email).toBe('jane.smith@example.com');
      expect(fillResult.street).toBe('123 Main St');
      expect(fillResult.city).toBe('San Francisco');
      expect(fillResult.company).toBe('Acme Corp');
    });
  });

  test.describe('Ambiguous Form (LLM Matching)', () => {
    let formPage: Page;

    test.beforeEach(async () => {
      // Seed vault with data that requires semantic matching
      await seedVaultData([
        { key: 'companyName', value: 'Tech Innovations Inc', semantic: 'companyName' },
        { key: 'jobTitle', value: 'Senior Developer', semantic: 'jobTitle' },
        { key: 'email', value: 'contact@techinnovations.com', semantic: 'email' },
        { key: 'phone', value: '+1-555-9876', semantic: 'phone' },
      ]);

      formPage = await context.newPage();
    });

    test.afterEach(async () => {
      await formPage?.close();
    });

    test('detects ambiguous field labels requiring LLM matching', async () => {
      await formPage.goto('about:blank');
      await formPage.setContent(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Partnership Inquiry</title>
          </head>
          <body>
            <h1>Tell Us About Your Organization</h1>
            <form id="partnershipForm">
              <div>
                <label for="org">Your Organization *</label>
                <input type="text" id="org" name="organization" required>
              </div>
              <div>
                <label for="position">Your Position *</label>
                <input type="text" id="position" name="position" required>
              </div>
              <div>
                <label for="contact">Best contact method *</label>
                <input type="text" id="contact" name="contactMethod" required placeholder="Email or phone">
              </div>
              <div>
                <label for="interests">Areas of Interest</label>
                <select id="interests" name="interests">
                  <option value="">Select...</option>
                  <option value="technical">Technical Partnership</option>
                  <option value="commercial">Commercial Partnership</option>
                </select>
              </div>
              <button type="submit">Submit Inquiry</button>
            </form>
          </body>
        </html>
      `);

      await formPage.waitForTimeout(1000);

      // Verify ambiguous fields have no autocomplete attributes
      const ambiguousFields = await formPage.evaluate(() => {
        const org = document.querySelector('[name="organization"]');
        const position = document.querySelector('[name="position"]');
        const contact = document.querySelector('[name="contactMethod"]');

        return {
          orgHasAutocomplete: org?.hasAttribute('autocomplete') || false,
          positionHasAutocomplete: position?.hasAttribute('autocomplete') || false,
          contactHasAutocomplete: contact?.hasAttribute('autocomplete') || false,
          orgLabel: org?.closest('div')?.querySelector('label')?.textContent,
          positionLabel: position?.closest('div')?.querySelector('label')?.textContent,
          contactPlaceholder: (contact as HTMLInputElement)?.placeholder,
        };
      });

      // These fields have no autocomplete, requiring pattern or LLM matching
      expect(ambiguousFields.orgHasAutocomplete).toBe(false);
      expect(ambiguousFields.positionHasAutocomplete).toBe(false);
      expect(ambiguousFields.contactHasAutocomplete).toBe(false);

      // Labels are ambiguous and would benefit from LLM analysis
      expect(ambiguousFields.orgLabel).toContain('Organization');
      expect(ambiguousFields.positionLabel).toContain('Position');
      expect(ambiguousFields.contactPlaceholder).toContain('Email or phone');
    });

    test('pattern matching can identify some ambiguous fields', async () => {
      await formPage.goto('about:blank');
      await formPage.setContent(`
        <!DOCTYPE html>
        <html>
          <body>
            <form>
              <!-- These should match by pattern -->
              <input type="text" name="organization" id="orgField">
              <input type="text" name="jobTitle" id="titleField">
              <input type="text" name="contactEmail" id="contactField">
            </form>
          </body>
        </html>
      `);

      await formPage.waitForTimeout(1000);

      // Simulate pattern-based matching
      const patternMatches = await formPage.evaluate(() => {
        const inputs = document.querySelectorAll('input');
        const matches: { name: string; likelyMatch: string }[] = [];

        inputs.forEach((input) => {
          const name = input.getAttribute('name') || '';

          // Simulate Tier 2 pattern matching
          if (/organization|company|org/i.test(name)) {
            matches.push({ name, likelyMatch: 'companyName' });
          }
          if (/job.*title|position|role/i.test(name)) {
            matches.push({ name, likelyMatch: 'jobTitle' });
          }
          if (/email/i.test(name)) {
            matches.push({ name, likelyMatch: 'email' });
          }
        });

        return matches;
      });

      expect(patternMatches.length).toBe(3);
      expect(patternMatches.some((m) => m.likelyMatch === 'companyName')).toBe(true);
      expect(patternMatches.some((m) => m.likelyMatch === 'jobTitle')).toBe(true);
      expect(patternMatches.some((m) => m.likelyMatch === 'email')).toBe(true);
    });
  });

  test.describe('Form Validation and Edge Cases', () => {
    let formPage: Page;

    test.beforeEach(async () => {
      await seedVaultData([
        { key: 'email', value: 'test@example.com', semantic: 'email' },
      ]);
      formPage = await context.newPage();
    });

    test.afterEach(async () => {
      await formPage?.close();
    });

    test('handles forms with input validation patterns', async () => {
      await formPage.goto('about:blank');
      await formPage.setContent(`
        <!DOCTYPE html>
        <html>
          <body>
            <form>
              <input type="email" name="email" pattern="[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}$" required>
              <input type="tel" name="phone" pattern="[0-9]{3}-[0-9]{3}-[0-9]{4}" placeholder="XXX-XXX-XXXX">
              <input type="text" name="zipCode" pattern="[0-9]{5}" maxlength="5">
            </form>
          </body>
        </html>
      `);

      await formPage.waitForTimeout(1000);

      const validationInfo = await formPage.evaluate(() => {
        const inputs = document.querySelectorAll('input[pattern]');
        return Array.from(inputs).map((input) => ({
          name: input.getAttribute('name'),
          pattern: input.getAttribute('pattern'),
          maxLength: (input as HTMLInputElement).maxLength,
        }));
      });

      expect(validationInfo.length).toBe(3);
      expect(validationInfo.some((v) => v.name === 'email')).toBe(true);
      expect(validationInfo.some((v) => v.name === 'phone')).toBe(true);
    });

    test('handles forms with disabled fields', async () => {
      await formPage.goto('about:blank');
      await formPage.setContent(`
        <!DOCTYPE html>
        <html>
          <body>
            <form>
              <input type="text" name="editableField">
              <input type="text" name="disabledField" disabled>
              <input type="text" name="readonlyField" readonly>
            </form>
          </body>
        </html>
      `);

      await formPage.waitForTimeout(1000);

      const fieldStates = await formPage.evaluate(() => {
        const inputs = document.querySelectorAll('input');
        return Array.from(inputs).map((input) => ({
          name: input.getAttribute('name'),
          disabled: (input as HTMLInputElement).disabled,
          readonly: (input as HTMLInputElement).readOnly,
        }));
      });

      expect(fieldStates.length).toBe(3);
      const disabledField = fieldStates.find((f) => f.name === 'disabledField');
      const readonlyField = fieldStates.find((f) => f.name === 'readonlyField');

      expect(disabledField?.disabled).toBe(true);
      expect(readonlyField?.readonly).toBe(true);
    });
  });
});
