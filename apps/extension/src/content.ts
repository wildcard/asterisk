/**
 * Asterisk Content Script - Form Detection
 *
 * Detects forms on web pages and extracts structural information
 * WITHOUT capturing any user-entered values.
 */

// CRITICAL: Log immediately when script loads to verify it's running
console.log('[Asterisk Content] Script loaded at', new Date().toISOString());
console.log('[Asterisk Content] Extension ID:', chrome?.runtime?.id || 'UNDEFINED');
console.log('[Asterisk Content] URL:', window.location.href);

// CRITICAL: Check if we're on the desktop app itself
// The desktop app (localhost:1420) contains forms in its UI, but we should never try to
// detect or fill them - that would cause "Extension context invalidated" errors
const IS_DESKTOP_APP = window.location.hostname === 'localhost' && window.location.port === '1420';

if (IS_DESKTOP_APP) {
  console.log('[Asterisk Content] Skipping desktop app page - content script disabled');
}

import type { FieldNode, FieldType, FormFingerprint, FormSnapshot, SelectOption, FillCommand } from '@asterisk/core';

// ============================================================================
// Constants
// ============================================================================

const DEBOUNCE_MS = 500;
const DESKTOP_BRIDGE_MESSAGE = 'ASTERISK_FORM_SNAPSHOT';
const FILL_COMMAND_MESSAGE = 'ASTERISK_FILL_COMMAND';

// ============================================================================
// Type Guards and Helpers
// ============================================================================

function isInputElement(el: Element): el is HTMLInputElement {
  return el.tagName === 'INPUT';
}

function isSelectElement(el: Element): el is HTMLSelectElement {
  return el.tagName === 'SELECT';
}

function isTextAreaElement(el: Element): el is HTMLTextAreaElement {
  return el.tagName === 'TEXTAREA';
}

function isFormField(el: Element): el is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  return isInputElement(el) || isSelectElement(el) || isTextAreaElement(el);
}

// ============================================================================
// Field Type Mapping
// ============================================================================

function getFieldType(element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): FieldType {
  if (isSelectElement(element)) {
    return 'select';
  }

  if (isTextAreaElement(element)) {
    return 'textarea';
  }

  // HTMLInputElement
  const inputType = element.type.toLowerCase();

  switch (inputType) {
    case 'email':
      return 'email';
    case 'password':
      return 'password';
    case 'tel':
      return 'tel';
    case 'url':
      return 'url';
    case 'number':
      return 'number';
    case 'date':
    case 'datetime':
    case 'datetime-local':
    case 'month':
    case 'week':
    case 'time':
      return 'date';
    case 'checkbox':
      return 'checkbox';
    case 'radio':
      return 'radio';
    default:
      return 'text';
  }
}

// ============================================================================
// Label Detection
// ============================================================================

function findLabelForElement(element: HTMLElement): string {
  // 1. Check for explicit label via 'for' attribute
  if (element.id) {
    const label = document.querySelector(`label[for="${element.id}"]`);
    if (label?.textContent) {
      return label.textContent.trim();
    }
  }

  // 2. Check for wrapping label
  const parentLabel = element.closest('label');
  if (parentLabel?.textContent) {
    // Remove the input's value from label text
    const text = parentLabel.textContent.trim();
    return text;
  }

  // 3. Check aria-label
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) {
    return ariaLabel.trim();
  }

  // 4. Check aria-labelledby
  const ariaLabelledBy = element.getAttribute('aria-labelledby');
  if (ariaLabelledBy) {
    const labelEl = document.getElementById(ariaLabelledBy);
    if (labelEl?.textContent) {
      return labelEl.textContent.trim();
    }
  }

  // 5. Check placeholder
  const placeholder = element.getAttribute('placeholder');
  if (placeholder) {
    return placeholder.trim();
  }

  // 6. Check title attribute
  const title = element.getAttribute('title');
  if (title) {
    return title.trim();
  }

  // 7. Fall back to name attribute
  const name = element.getAttribute('name');
  if (name) {
    // Convert snake_case or camelCase to readable
    return name
      .replace(/([A-Z])/g, ' $1')
      .replace(/[_-]/g, ' ')
      .trim();
  }

  return '';
}

// ============================================================================
// Field Extraction
// ============================================================================

function extractSelectOptions(select: HTMLSelectElement): SelectOption[] {
  const options: SelectOption[] = [];
  for (const option of select.options) {
    // Skip placeholder options
    if (option.value === '' && option.disabled) continue;
    options.push({
      value: option.value,
      label: option.textContent?.trim() || option.value,
    });
  }
  return options;
}

function extractFieldNode(
  element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  index: number
): FieldNode | null {
  // Skip hidden and submit fields
  if (isInputElement(element)) {
    const type = element.type.toLowerCase();
    if (type === 'hidden' || type === 'submit' || type === 'button' || type === 'reset' || type === 'image') {
      return null;
    }
  }

  const fieldType = getFieldType(element);
  const label = findLabelForElement(element);

  // Build base field node - NEVER include currentValue
  const fieldNode: FieldNode = {
    id: element.id || `field-${index}`,
    name: element.name || '',
    label,
    type: fieldType,
    semantic: 'unknown', // Will be inferred later by the desktop app
    required: element.required || element.getAttribute('aria-required') === 'true',
    autocomplete: element.autocomplete || undefined,
    placeholder: 'placeholder' in element ? element.placeholder || undefined : undefined,
  };

  // Add constraints
  if (isInputElement(element) || isTextAreaElement(element)) {
    if (element.maxLength > 0) {
      fieldNode.maxLength = element.maxLength;
    }
    if (element.minLength > 0) {
      fieldNode.minLength = element.minLength;
    }
  }

  // Add pattern validation
  if (isInputElement(element) && element.pattern) {
    fieldNode.validation = element.pattern;
  }

  // Add inputMode
  const inputMode = element.getAttribute('inputmode');
  if (inputMode) {
    fieldNode.inputMode = inputMode;
  }

  // Add options for select elements
  if (isSelectElement(element)) {
    fieldNode.options = extractSelectOptions(element);
  }

  return fieldNode;
}

// ============================================================================
// Form Snapshot Creation
// ============================================================================

async function computeFingerprint(fields: FieldNode[]): Promise<FormFingerprint> {
  const fieldTypes = fields.map((f) => f.type).sort();
  const requiredCount = fields.filter((f) => f.required).length;

  // Create fingerprint data for hashing
  const fingerprintData = JSON.stringify({
    fieldCount: fields.length,
    fieldTypes,
    requiredCount,
  });

  // Compute SHA-256 hash
  const encoder = new TextEncoder();
  const data = encoder.encode(fingerprintData);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  return {
    fieldCount: fields.length,
    fieldTypes,
    requiredCount,
    hash,
  };
}

function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return '';
  }
}

async function extractFormSnapshot(form: HTMLFormElement): Promise<FormSnapshot | null> {
  // Find all form fields
  const fieldElements = form.querySelectorAll('input, select, textarea');
  const fields: FieldNode[] = [];

  let index = 0;
  for (const el of fieldElements) {
    if (!isFormField(el)) continue;

    const fieldNode = extractFieldNode(el, index);
    if (fieldNode) {
      fields.push(fieldNode);
      index++;
    }
  }

  // Skip forms with no meaningful fields
  if (fields.length === 0) {
    return null;
  }

  const fingerprint = await computeFingerprint(fields);

  return {
    url: window.location.href,
    domain: extractDomain(window.location.href),
    title: document.title,
    capturedAt: new Date().toISOString(),
    fingerprint,
    fields,
  };
}

// ============================================================================
// Page Scanning
// ============================================================================

async function scanPageForForms(): Promise<FormSnapshot[]> {
  const forms = document.querySelectorAll('form');
  const snapshots: FormSnapshot[] = [];

  for (const form of forms) {
    const snapshot = await extractFormSnapshot(form);
    if (snapshot) {
      snapshots.push(snapshot);
    }
  }

  // Also check for "implicit forms" - fields not inside a <form> tag
  const orphanFields = document.querySelectorAll('input:not(form input), select:not(form select), textarea:not(form textarea)');
  if (orphanFields.length > 0) {
    const fields: FieldNode[] = [];
    let index = 0;

    for (const el of orphanFields) {
      if (!isFormField(el)) continue;
      const fieldNode = extractFieldNode(el, index);
      if (fieldNode) {
        fields.push(fieldNode);
        index++;
      }
    }

    if (fields.length > 0) {
      const fingerprint = await computeFingerprint(fields);
      snapshots.push({
        url: window.location.href,
        domain: extractDomain(window.location.href),
        title: document.title,
        capturedAt: new Date().toISOString(),
        fingerprint,
        fields,
      });
    }
  }

  return snapshots;
}

// ============================================================================
// Messaging
// ============================================================================

function sendSnapshotsToBackground(snapshots: FormSnapshot[]): void {
  if (snapshots.length === 0) return;

  // Send the most significant form (most fields)
  const primarySnapshot = snapshots.reduce((best, current) =>
    current.fields.length > best.fields.length ? current : best
  );

  chrome.runtime.sendMessage({
    type: DESKTOP_BRIDGE_MESSAGE,
    payload: primarySnapshot,
  }).catch(() => {
    // Silently ignore - extension context may be invalidated
  });
}

// ============================================================================
// Debouncing
// ============================================================================

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastFingerprint = '';

function debouncedScan(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(async () => {
    const snapshots = await scanPageForForms();

    // Avoid sending duplicate snapshots
    if (snapshots.length > 0) {
      const currentFingerprint = snapshots.map((s) => s.fingerprint.hash).join(',');
      if (currentFingerprint !== lastFingerprint) {
        lastFingerprint = currentFingerprint;
        sendSnapshotsToBackground(snapshots);
      }
    }
  }, DEBOUNCE_MS);
}

// ============================================================================
// Event Listeners
// ============================================================================

function setupEventListeners(): void {
  // Initial scan after page load
  debouncedScan();

  // Scan on focus into form fields
  document.addEventListener('focusin', (event) => {
    if (event.target instanceof Element && isFormField(event.target)) {
      debouncedScan();
    }
  });

  // Watch for DOM changes (dynamic forms)
  const observer = new MutationObserver((mutations) => {
    // Check if any mutations involve form-related elements
    const hasFormChanges = mutations.some((mutation) => {
      // Check added nodes
      for (const node of mutation.addedNodes) {
        if (node instanceof Element) {
          if (node.matches('form, input, select, textarea') ||
              node.querySelector('form, input, select, textarea')) {
            return true;
          }
        }
      }
      return false;
    });

    if (hasFormChanges) {
      debouncedScan();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

// ============================================================================
// Fill Command Handling
// ============================================================================

/**
 * Find a form field element by its ID
 * Handles both standard IDs and our generated field-X IDs
 */
function findFieldElement(fieldId: string): HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null {
  // First try to find by exact ID
  let element = document.getElementById(fieldId);
  if (element && isFormField(element)) {
    return element;
  }

  // If the fieldId is our generated format (field-X), find by index
  const match = fieldId.match(/^field-(\d+)$/);
  if (match) {
    const index = parseInt(match[1], 10);
    const allFields = document.querySelectorAll('input, select, textarea');
    let visibleIndex = 0;

    for (const el of allFields) {
      if (!isFormField(el)) continue;

      // Skip hidden and button-like inputs
      if (isInputElement(el)) {
        const type = el.type.toLowerCase();
        if (type === 'hidden' || type === 'submit' || type === 'button' || type === 'reset' || type === 'image') {
          continue;
        }
      }

      if (visibleIndex === index) {
        return el;
      }
      visibleIndex++;
    }
  }

  // Try to find by name attribute
  element = document.querySelector(`[name="${fieldId}"]`);
  if (element && isFormField(element)) {
    return element;
  }

  return null;
}

/**
 * Fill a single form field with a value
 */
function fillField(element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string): boolean {
  try {
    if (isSelectElement(element)) {
      // Find matching option
      for (const option of element.options) {
        if (option.value === value || option.textContent?.trim() === value) {
          element.value = option.value;
          element.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
      }
      return false;
    }

    if (isInputElement(element)) {
      const type = element.type.toLowerCase();

      if (type === 'checkbox') {
        element.checked = value === 'true' || value === '1' || value === 'on';
        element.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }

      if (type === 'radio') {
        // For radio buttons, find the one with matching value
        const name = element.name;
        const radio = document.querySelector(`input[type="radio"][name="${name}"][value="${value}"]`) as HTMLInputElement;
        if (radio) {
          radio.checked = true;
          radio.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
        return false;
      }
    }

    // Text-like inputs and textareas
    element.value = value;

    // Dispatch events to trigger any listeners
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));

    // For React/Vue controlled inputs, also dispatch a native input event
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
      'value'
    )?.set;

    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }

    return true;
  } catch (e) {
    console.error('[Asterisk] Failed to fill field:', e);
    return false;
  }
}

/**
 * Execute a fill command from the desktop app
 */
function executeFillCommand(command: FillCommand): { success: boolean; filledCount: number } {
  let filledCount = 0;

  for (const fill of command.fills) {
    const element = findFieldElement(fill.fieldId);

    if (!element) {
      console.debug('[Asterisk] Field not found:', fill.fieldId);
      continue;
    }

    if (fillField(element, fill.value)) {
      filledCount++;
      console.debug('[Asterisk] Filled field:', fill.fieldId);
    }
  }

  return {
    success: filledCount > 0,
    filledCount,
  };
}

// ============================================================================
// Fill Command Message Listener
// ============================================================================

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === FILL_COMMAND_MESSAGE && message.payload) {
    const command = message.payload as FillCommand;

    // Verify domain matches
    const currentDomain = window.location.hostname;
    if (command.targetDomain !== currentDomain) {
      console.debug('[Asterisk] Domain mismatch:', command.targetDomain, 'vs', currentDomain);
      sendResponse({ success: false, reason: 'domain_mismatch' });
      return true;
    }

    const result = executeFillCommand(command);
    console.log('[Asterisk] Fill command executed:', result.filledCount, 'of', command.fills.length, 'fields filled');

    sendResponse({ success: result.success, filledCount: result.filledCount });
  }

  return true;
});

// ============================================================================
// Initialize
// ============================================================================

// Only initialize if we're NOT on the desktop app page
if (!IS_DESKTOP_APP) {
  // Run when content script loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupEventListeners);
  } else {
    setupEventListeners();
  }
}
