/**
 * Security Configuration
 *
 * Centralized security policies for the Asterisk extension.
 */

/**
 * Content Security Policy Configuration
 *
 * Defines the CSP directives for the extension popup and other contexts.
 */
export const CSP_POLICY = {
  /**
   * Default source for all resource types not explicitly defined.
   * Restricts to same-origin resources only (extension resources).
   */
  defaultSrc: ["'self'"],

  /**
   * Script source policy - only allow scripts from the extension itself.
   * No inline scripts allowed (prevents XSS attacks).
   */
  scriptSrc: ["'self'"],

  /**
   * Style source policy.
   * Allows 'unsafe-inline' for React CSS-in-JS patterns.
   * This is acceptable because:
   * - Styles cannot execute code
   * - No user-controlled content in styles
   * - React automatically escapes all JSX content
   */
  styleSrc: ["'self'", "'unsafe-inline'"],

  /**
   * Connect source policy - allowed origins for fetch/XHR/WebSocket.
   * Allows localhost connections for desktop API communication.
   */
  connectSrc: ["'self'", 'http://localhost:*', 'http://127.0.0.1:*'],
} as const;

/**
 * Helper to convert camelCase to kebab-case for CSP directive names.
 */
function toKebabCase(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * Generate CSP header string from policy object.
 *
 * @returns CSP header value ready for use in meta tag or HTTP header
 */
export const CSP_HEADER = Object.entries(CSP_POLICY)
  .map(([key, values]) => `${toKebabCase(key)} ${values.join(' ')}`)
  .join('; ');
