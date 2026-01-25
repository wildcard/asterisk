/**
 * Security Configuration Tests
 *
 * Validates that CSP configuration is consistent across all files.
 */

import { describe, it, expect } from 'vitest';
import { CSP_POLICY, CSP_HEADER } from '../config/security';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Security Configuration', () => {
  describe('CSP_POLICY structure', () => {
    it('defines all required directives', () => {
      expect(CSP_POLICY).toHaveProperty('defaultSrc');
      expect(CSP_POLICY).toHaveProperty('scriptSrc');
      expect(CSP_POLICY).toHaveProperty('styleSrc');
      expect(CSP_POLICY).toHaveProperty('connectSrc');
    });

    it('uses secure defaults for defaultSrc', () => {
      expect(CSP_POLICY.defaultSrc).toEqual(["'self'"]);
    });

    it('disallows inline scripts', () => {
      expect(CSP_POLICY.scriptSrc).toEqual(["'self'"]);
      expect(CSP_POLICY.scriptSrc).not.toContain("'unsafe-inline'");
    });

    it('allows unsafe-inline styles for React', () => {
      expect(CSP_POLICY.styleSrc).toContain("'self'");
      expect(CSP_POLICY.styleSrc).toContain("'unsafe-inline'");
    });

    it('restricts connections to localhost only', () => {
      expect(CSP_POLICY.connectSrc).toContain("'self'");
      expect(CSP_POLICY.connectSrc).toContain('http://localhost:*');
      expect(CSP_POLICY.connectSrc).toContain('http://127.0.0.1:*');
    });
  });

  describe('CSP_HEADER generation', () => {
    it('generates valid CSP header string', () => {
      expect(CSP_HEADER).toBeTruthy();
      expect(typeof CSP_HEADER).toBe('string');
      expect(CSP_HEADER.length).toBeGreaterThan(0);
    });

    it('contains all directives in kebab-case', () => {
      expect(CSP_HEADER).toContain('default-src');
      expect(CSP_HEADER).toContain('script-src');
      expect(CSP_HEADER).toContain('style-src');
      expect(CSP_HEADER).toContain('connect-src');
    });

    it('formats directives correctly', () => {
      expect(CSP_HEADER).toMatch(/default-src 'self'/);
      expect(CSP_HEADER).toMatch(/script-src 'self'/);
      expect(CSP_HEADER).toMatch(/style-src 'self' 'unsafe-inline'/);
      expect(CSP_HEADER).toMatch(/connect-src 'self' http:\/\/localhost:\* http:\/\/127\.0\.0\.1:\*/);
    });

    it('separates directives with semicolons', () => {
      const directives = CSP_HEADER.split('; ');
      expect(directives.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('HTML CSP synchronization', () => {
    it('matches CSP in popup.html', () => {
      const htmlPath = join(__dirname, '../popup/popup.html');
      const htmlContent = readFileSync(htmlPath, 'utf-8');

      // Extract CSP content attribute value from HTML
      // Look for Content-Security-Policy meta tag specifically
      const cspMatch = htmlContent.match(/http-equiv="Content-Security-Policy"[^>]+content="([^"]+)"/);
      expect(cspMatch).toBeTruthy();

      const htmlCSP = cspMatch![1];

      // Should match our generated CSP_HEADER
      expect(htmlCSP).toBe(CSP_HEADER);
    });
  });

  describe('Security best practices', () => {
    it('does not allow eval', () => {
      expect(CSP_HEADER).not.toContain("'unsafe-eval'");
    });

    it('does not allow inline scripts', () => {
      // Check script-src specifically
      const scriptSrcMatch = CSP_HEADER.match(/script-src ([^;]+)/);
      expect(scriptSrcMatch).toBeTruthy();
      expect(scriptSrcMatch![1]).not.toContain("'unsafe-inline'");
    });

    it('does not allow external connections', () => {
      // Should only allow self and localhost
      const connectSrcMatch = CSP_HEADER.match(/connect-src ([^;]+)/);
      expect(connectSrcMatch).toBeTruthy();

      const connectSrc = connectSrcMatch![1];
      expect(connectSrc).not.toContain('https://');
      expect(connectSrc).not.toContain('http://example.com');
    });

    it('uses restrictive default-src', () => {
      const defaultSrcMatch = CSP_HEADER.match(/default-src ([^;]+)/);
      expect(defaultSrcMatch).toBeTruthy();
      expect(defaultSrcMatch![1]).toBe("'self'");
    });
  });
});
