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
  ],

  // Webserver configuration - start the Tauri dev server if not running
  // Comment this out if you want to manually start the server
  webServer: {
    command: 'cd ../desktop && pnpm tauri dev',
    url: 'http://localhost:1420',
    reuseExistingServer: true,
    timeout: 120 * 1000, // 2 minutes for Tauri to start
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
