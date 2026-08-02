import { defineConfig, devices } from '@playwright/test';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EXTENSION_PATH = resolve(__dirname, '../extension/dist');

/**
 * Playwright configuration for Asterisk E2E tests
 *
 * Projects:
 * - desktop-app: Tests for Tauri desktop application (localhost:1420)
 * - extension-popup: Tests for Chrome extension popup (requires headed mode)
 *
 * Run tests with:
 * - pnpm test:desktop - Desktop app tests only
 * - pnpm test:extension - Extension popup tests only
 * - pnpm test - All tests
 */
export default defineConfig({
  testDir: './e2e-tests',
  // Waits for the Rust backend's HTTP bridge (:17373) to be ready, not just
  // Vite (:1420, covered by the webServer.url check below) - see
  // global-setup.ts for why this is necessary.
  globalSetup: './global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',

  use: {
    baseURL: 'http://localhost:1420',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'desktop-app',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /llm-matching\.spec\.ts/,
    },
    {
      name: 'extension-popup',
      use: {
        ...devices['Desktop Chrome'],
        headless: false, // Required for Chrome extensions
      },
      testMatch: /extension-popup\.spec\.ts/,
    },
    {
      name: 'form-filling',
      use: {
        ...devices['Desktop Chrome'],
        headless: false, // Required for Chrome extensions
      },
      testMatch: /(form-filling-integration|real-world-forms)\.spec\.ts/,
    },
  ],

  // Webserver configuration - start required servers if not already running.
  // Comment out an entry if you want to manage that server manually.
  webServer: [
    {
      command: 'cd ../desktop && pnpm tauri dev',
      url: 'http://localhost:1420',
      reuseExistingServer: true,
      timeout: 120 * 1000, // 2 minutes for Tauri to start
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      // Static server for the form-filling/real-world-forms specs, which
      // navigate to http://127.0.0.1:8765/test-llm-form.html. Reuses
      // scripts/start-test-server.sh so there's a single source of truth
      // for "how do I serve the test forms" (also documented in the QA
      // README's manual-testing instructions).
      command: './scripts/start-test-server.sh',
      url: 'http://127.0.0.1:8765/test-llm-form.html',
      reuseExistingServer: true,
      timeout: 30 * 1000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
