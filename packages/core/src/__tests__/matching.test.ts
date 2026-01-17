import { describe, it, expect } from 'vitest';
import {
  matchByAutocomplete,
  matchByPattern,
  generateFillPlan,
  type VaultItem,
  type FieldNode,
} from '../matching';

describe('matchByAutocomplete', () => {
  const vaultItems: VaultItem[] = [
    {
      key: 'firstName',
      category: 'identity',
      label: 'First Name',
      value: 'John',
      provenance: {
        source: 'user_entered',
        timestamp: new Date(),
        confidence: 1.0,
      },
      metadata: {
        created: new Date(),
        updated: new Date(),
      },
    },
    {
      key: 'email',
      category: 'contact',
      label: 'Email Address',
      value: 'john@example.com',
      provenance: {
        source: 'user_entered',
        timestamp: new Date(),
        confidence: 1.0,
      },
      metadata: {
        created: new Date(),
        updated: new Date(),
      },
    },
    {
      key: 'phone',
      category: 'contact',
      label: 'Phone Number',
      value: '+1234567890',
      provenance: {
        source: 'user_entered',
        timestamp: new Date(),
        confidence: 1.0,
      },
      metadata: {
        created: new Date(),
        updated: new Date(),
      },
    },
  ];

  it('should match given-name autocomplete to firstName vault item', () => {
    const field: FieldNode = {
      id: 'field-1',
      name: 'fname',
      label: 'First Name',
      type: 'text',
      semantic: 'firstName',
      required: false,
      autocomplete: 'given-name',
    };

    const match = matchByAutocomplete(field, vaultItems);
    expect(match).toBeDefined();
    expect(match?.vaultKey).toBe('firstName');
    expect(match?.confidence).toBeGreaterThanOrEqual(0.95);
    expect(match?.matchTier).toBe('autocomplete');
  });

  it('should match email autocomplete to email vault item', () => {
    const field: FieldNode = {
      id: 'field-2',
      name: 'email',
      label: 'Email',
      type: 'email',
      semantic: 'email',
      required: false,
      autocomplete: 'email',
    };

    const match = matchByAutocomplete(field, vaultItems);
    expect(match).toBeDefined();
    expect(match?.vaultKey).toBe('email');
    expect(match?.confidence).toBeGreaterThanOrEqual(0.95);
  });

  it('should match tel autocomplete to phone vault item', () => {
    const field: FieldNode = {
      id: 'field-3',
      name: 'phone',
      label: 'Phone Number',
      type: 'tel',
      semantic: 'phone',
      required: false,
      autocomplete: 'tel',
    };

    const match = matchByAutocomplete(field, vaultItems);
    expect(match).toBeDefined();
    expect(match?.vaultKey).toBe('phone');
    expect(match?.confidence).toBeGreaterThanOrEqual(0.95);
  });

  it('should NOT match tel field to firstName (regression test for phone bug)', () => {
    const vaultWithoutPhone: VaultItem[] = [
      {
        key: 'firstName',
        category: 'identity',
        label: 'First Name',
        value: 'John',
        provenance: {
          source: 'user_entered',
          timestamp: new Date(),
          confidence: 1.0,
        },
        metadata: {
          created: new Date(),
          updated: new Date(),
        },
      },
    ];

    const field: FieldNode = {
      id: 'field-tel',
      name: 'phone',
      label: 'Phone Number',
      type: 'tel',
      semantic: 'phone',
      required: false,
      autocomplete: 'tel',
    };

    const match = matchByAutocomplete(field, vaultWithoutPhone);
    expect(match).toBeUndefined();
  });

  it('should return undefined for unsupported autocomplete values', () => {
    const field: FieldNode = {
      id: 'field-4',
      name: 'custom',
      label: 'Custom Field',
      type: 'text',
      semantic: 'unknown',
      required: false,
      autocomplete: 'unsupported-value',
    };

    const match = matchByAutocomplete(field, vaultItems);
    expect(match).toBeUndefined();
  });
});

describe('matchByPattern', () => {
  const vaultItems: VaultItem[] = [
    {
      key: 'firstName',
      category: 'identity',
      label: 'First Name',
      value: 'John',
      provenance: {
        source: 'user_entered',
        timestamp: new Date(),
        confidence: 1.0,
      },
      metadata: {
        created: new Date(),
        updated: new Date(),
      },
    },
    {
      key: 'email',
      category: 'contact',
      label: 'Email Address',
      value: 'john@example.com',
      provenance: {
        source: 'user_entered',
        timestamp: new Date(),
        confidence: 1.0,
      },
      metadata: {
        created: new Date(),
        updated: new Date(),
      },
    },
  ];

  it('should match email type + email in name to email vault item', () => {
    const field: FieldNode = {
      id: 'field-1',
      name: 'user_email',
      label: 'Email',
      type: 'email',
      semantic: 'email',
      required: false,
    };

    const match = matchByPattern(field, vaultItems);
    expect(match).toBeDefined();
    expect(match?.vaultKey).toBe('email');
    expect(match?.matchTier).toBe('pattern');
    expect(match?.confidence).toBeGreaterThan(0.7);
    expect(match?.confidence).toBeLessThan(0.95);
  });

  it('should match by label containing "first name"', () => {
    const field: FieldNode = {
      id: 'field-2',
      name: 'fname',
      label: 'Enter your First Name',
      type: 'text',
      semantic: 'unknown',
      required: false,
    };

    const match = matchByPattern(field, vaultItems);
    expect(match).toBeDefined();
    expect(match?.vaultKey).toBe('firstName');
  });

  it('should return undefined when no pattern matches', () => {
    const field: FieldNode = {
      id: 'field-3',
      name: 'custom_field',
      label: 'Custom Data',
      type: 'text',
      semantic: 'unknown',
      required: false,
    };

    const match = matchByPattern(field, vaultItems);
    expect(match).toBeUndefined();
  });
});

describe('generateFillPlan', () => {
  const vaultItems: VaultItem[] = [
    {
      key: 'firstName',
      category: 'identity',
      label: 'First Name',
      value: 'John',
      provenance: {
        source: 'user_entered',
        timestamp: new Date(),
        confidence: 1.0,
      },
      metadata: {
        created: new Date(),
        updated: new Date(),
      },
    },
    {
      key: 'email',
      category: 'contact',
      label: 'Email Address',
      value: 'john@example.com',
      provenance: {
        source: 'user_entered',
        timestamp: new Date(),
        confidence: 1.0,
      },
      metadata: {
        created: new Date(),
        updated: new Date(),
      },
    },
  ];

  it('should generate fill plan with mixed tier matches', () => {
    const formSnapshot = {
      url: 'https://example.com/form',
      title: 'Test Form',
      domain: 'example.com',
      fingerprint: {
        fieldCount: 3,
        fieldTypes: ['text', 'email', 'text'],
        requiredCount: 0,
        hash: 'test-form-123',
      },
      fields: [
        {
          id: 'field-1',
          name: 'fname',
          label: 'First Name',
          type: 'text',
          semantic: 'firstName',
          required: false,
          autocomplete: 'given-name',
        },
        {
          id: 'field-2',
          name: 'email',
          label: 'Email',
          type: 'email',
          semantic: 'email',
          required: false,
        },
        {
          id: 'field-3',
          name: 'unknown',
          label: 'Unknown Field',
          type: 'text',
          semantic: 'unknown',
          required: false,
        },
      ],
      capturedAt: new Date().toISOString(),
    };

    const plan = generateFillPlan(formSnapshot, vaultItems);

    expect(plan.formFingerprint).toBe('test-form-123');
    expect(plan.recommendations).toHaveLength(2);
    expect(plan.unmatchedFields).toHaveLength(1);
    expect(plan.unmatchedFields[0]).toBe('field-3');

    // Verify tier 1 match (autocomplete)
    const firstNameMatch = plan.recommendations.find(r => r.fieldId === 'field-1');
    expect(firstNameMatch?.matchTier).toBe('autocomplete');
    expect(firstNameMatch?.confidence).toBeGreaterThanOrEqual(0.95);

    // Verify tier 2 match (pattern)
    const emailMatch = plan.recommendations.find(r => r.fieldId === 'field-2');
    expect(emailMatch?.matchTier).toBe('pattern');
  });

  it('should handle form with no matches', () => {
    const formSnapshot = {
      url: 'https://example.com/form',
      title: 'Test Form',
      domain: 'example.com',
      fingerprint: {
        fieldCount: 1,
        fieldTypes: ['text'],
        requiredCount: 0,
        hash: 'test-form-456',
      },
      fields: [
        {
          id: 'field-1',
          name: 'custom1',
          label: 'Custom Field 1',
          type: 'text',
          semantic: 'unknown',
          required: false,
        },
      ],
      capturedAt: new Date().toISOString(),
    };

    const plan = generateFillPlan(formSnapshot, vaultItems);

    expect(plan.recommendations).toHaveLength(0);
    expect(plan.unmatchedFields).toHaveLength(1);
  });
});
