import { test, expect, BrowserContext, Page } from '@playwright/test';
import { createExtensionContext, seedVaultData } from '../fixtures/extension-context';
import vaultItems from '../fixtures/vault-items.json' with { type: 'json' };

/**
 * Extension Popup E2E Tests
 *
 * LIMITATION: These tests open the popup directly via chrome-extension:// URL,
 * which means the popup doesn't have proper tab context (it sees itself as the
 * active tab instead of the form page). This limits what we can test automatically.
 *
 * Tests are structured in two categories:
 * 1. UI Tests - Test popup rendering, empty states, and connection status
 * 2. Integration Tests - Require manual verification or future tooling improvements
 *
 * Prerequisites:
 * - Desktop app running on http://127.0.0.1:17373
 * - Test form server running on http://127.0.0.1:8765
 * - Extension built at apps/extension/dist
 */

test.describe('Extension Popup E2E', () => {
  let context: BrowserContext;
  let extensionId: string;
  let popupPage: Page;

  test.beforeAll(async () => {
    const ctx = await createExtensionContext();
    context = ctx.context;
    extensionId = ctx.extensionId;
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.describe('Popup UI Rendering', () => {
    test.beforeEach(async () => {
      await seedVaultData(vaultItems);

      popupPage = await context.newPage();
      await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);
      await popupPage.waitForLoadState('domcontentloaded');
      await popupPage.waitForTimeout(500);
    });

    test.afterEach(async () => {
      await popupPage?.close();
    });

    test('renders popup header correctly', async () => {
      const header = popupPage.locator('.popup-header');
      await expect(header).toBeVisible();

      const title = popupPage.locator('.popup-title');
      await expect(title).toHaveText('Asterisk Form Filler');
    });

    test('shows desktop connection status in footer', async () => {
      const footer = popupPage.locator('.popup-footer');
      await expect(footer).toBeVisible();

      const connectionStatus = popupPage.locator('.connection-status');
      await expect(connectionStatus).toBeVisible();
      await expect(connectionStatus).toContainText(/Desktop app/i);
    });

    test('displays settings button', async () => {
      const settingsButton = popupPage.locator('.settings-button');
      await expect(settingsButton).toBeVisible();
      await expect(settingsButton).toContainText('Settings');
    });

    test('shows empty state when no form detected', async () => {
      // Since popup opens without tab context, it shows empty state
      const emptyState = popupPage.locator('.empty-state');
      await expect(emptyState).toBeVisible();

      const emptyTitle = popupPage.locator('.empty-state-title:has-text("No Form Detected")');
      await expect(emptyTitle).toBeVisible();

      const emptyDescription = popupPage.locator('.empty-state-description');
      await expect(emptyDescription).toContainText(/Navigate to a page with a form/i);
    });

    test('empty state displays clipboard icon', async () => {
      const emptyIcon = popupPage.locator('.empty-state-icon');
      await expect(emptyIcon).toBeVisible();
      await expect(emptyIcon).toHaveText('📋');
    });

    test('no action buttons shown in empty state', async () => {
      // When no form is detected, action buttons shouldn't be rendered
      const actionSection = popupPage.locator('.action-section');
      await expect(actionSection).toBeHidden();
    });
  });

  test.describe('Visual Regression', () => {
    test.beforeEach(async () => {
      popupPage = await context.newPage();
      await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);
      await popupPage.waitForLoadState('domcontentloaded');
      await popupPage.waitForTimeout(500);
    });

    test.afterEach(async () => {
      await popupPage?.close();
    });

    test('empty state matches expected layout', async () => {
      await expect(popupPage).toHaveScreenshot('popup-empty-state.png', {
        maxDiffPixels: 100,
      });
    });
  });

  test.describe('Manual Integration Tests', () => {
    /**
     * The following tests require manual execution because Playwright
     * cannot properly simulate the extension popup opening with tab context.
     *
     * To manually test:
     * 1. Build extension: cd apps/extension && pnpm build
     * 2. Load extension in Chrome: chrome://extensions -> Load unpacked -> apps/extension/dist
     * 3. Start desktop app: cd apps/desktop && pnpm tauri dev
     * 4. Open test form: http://127.0.0.1:8765/test-llm-form.html
     * 5. Click extension icon
     * 6. Verify:
     *    - Form detection status shows "Form Detected" with field count
     *    - Matched fields count is displayed
     *    - "Fill All Matched Fields" button is enabled
     *    - Clicking fill button populates form fields
     *    - Desktop connection status shows "Desktop app connected"
     */

    test.skip('shows form detection when form exists', async () => {
      // Requires tab context - must be tested manually
    });

    test.skip('shows matched field count', async () => {
      // Requires tab context - must be tested manually
    });

    test.skip('fill button is enabled when matches exist', async () => {
      // Requires tab context - must be tested manually
    });

    test.skip('clicking fill populates form fields', async () => {
      // Requires tab context - must be tested manually
    });
  });
});
