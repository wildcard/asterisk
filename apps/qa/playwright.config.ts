import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Asterisk E2E tests
 *
 * Assumes the Tauri dev server is running on localhost:1420
 * Run tests with: pnpm test
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
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
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
