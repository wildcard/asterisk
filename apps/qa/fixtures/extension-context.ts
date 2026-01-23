import { chromium, BrowserContext } from '@playwright/test';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EXTENSION_PATH = resolve(__dirname, '../../extension/dist');

/**
 * Creates a browser context with the Asterisk Chrome extension loaded
 *
 * Returns:
 * - context: BrowserContext with extension loaded
 * - extensionId: The dynamic extension ID assigned by Chrome
 *
 * Note: Uses launchPersistentContext which requires headed mode.
 * The extension ID is extracted from the service worker URL.
 */
export async function createExtensionContext(): Promise<{
  context: BrowserContext;
  extensionId: string;
}> {
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
    ],
  });

  // Get extension ID from service worker
  // Chrome assigns a dynamic ID like "abcdefghijklmnopqrstuvwxyz123456"
  let extensionId = '';
  const serviceWorkers = context.serviceWorkers();
  for (const worker of serviceWorkers) {
    const url = worker.url();
    if (url.includes('chrome-extension://')) {
      extensionId = new URL(url).hostname;
      break;
    }
  }

  // Wait for service worker if not immediately available
  if (!extensionId) {
    const worker = await context.waitForEvent('serviceworker');
    extensionId = new URL(worker.url()).hostname;
  }

  return { context, extensionId };
}

/**
 * Opens the extension popup for a specific tab by injecting popup content
 * into the page context. This simulates the user clicking the extension icon.
 *
 * Note: This is a workaround since Playwright can't directly click extension icons.
 * We navigate to the popup URL from within the target tab to maintain tab context.
 */
export async function openPopupForTab(context: BrowserContext, extensionId: string, targetTabPage: any) {
  // Navigate the target tab to the popup URL
  // This ensures chrome.tabs.query({ active: true }) returns the correct tab
  await targetTabPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  await targetTabPage.waitForLoadState('domcontentloaded');
  return targetTabPage;
}

/**
 * Wait for desktop app API to be ready by attempting to connect
 *
 * @param maxRetries - Maximum number of retry attempts (default: 20)
 * @param delayMs - Delay between retries in ms (default: 500)
 */
async function waitForDesktopApp(maxRetries: number = 20, delayMs: number = 500): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      // Try a simple GET to the vault endpoint
      const response = await fetch('http://127.0.0.1:17373/v1/vault');
      // If we get any response (even 404/500), server is up
      return;
    } catch (error) {
      // Server not ready yet, wait and retry
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  throw new Error('Desktop app did not become ready after ' + (maxRetries * delayMs / 1000) + ' seconds');
}

/**
 * Seeds vault data by making POST requests to the desktop app API
 *
 * Assumes desktop app is running on http://127.0.0.1:17373
 * Waits for the server to be ready before seeding data
 *
 * @param items - Array of vault items to seed
 */
export async function seedVaultData(items: any[]): Promise<void> {
  // Wait for desktop app to be ready first
  await waitForDesktopApp();

  for (const item of items) {
    await fetch('http://127.0.0.1:17373/v1/vault', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });
  }
}

/**
 * Clears all vault data by making DELETE requests to the desktop app API
 *
 * Assumes desktop app is running on http://127.0.0.1:17373
 */
export async function clearVaultData(): Promise<void> {
  // Assuming there's a clear endpoint, or we fetch all and delete individually
  // This is a placeholder - adjust based on actual API
  const response = await fetch('http://127.0.0.1:17373/v1/vault');
  const items = await response.json();

  for (const item of items) {
    await fetch(`http://127.0.0.1:17373/v1/vault/${item.id}`, {
      method: 'DELETE',
    });
  }
}

/**
 * Helper to check if running in CI environment
 *
 * Returns true if CI=true environment variable is set
 * Use this to skip tests that require local desktop app or GUI
 */
export function skipInCI(): boolean {
  return process.env.CI === 'true';
}

/**
 * Mock desktop app offline state by blocking all requests to desktop API
 *
 * @param page - The page to apply the mock to
 *
 * @example
 * await mockDesktopOffline(popupPage);
 * await popupPage.reload();
 * // Desktop connection will now fail
 */
export async function mockDesktopOffline(page: any): Promise<void> {
  await page.route('http://127.0.0.1:17373/**', (route: any) =>
    route.abort('failed')
  );
}

/**
 * Wait for popup to finish loading and be ready for interaction
 *
 * Waits for:
 * - DOM content to load
 * - Loading spinners to disappear (if present)
 * - Short stabilization period
 *
 * @param page - The popup page to wait for
 * @param timeout - Maximum wait time in ms (default: 5000)
 *
 * @example
 * await popupPage.goto(popupUrl);
 * await waitForPopupReady(popupPage);
 * // Now safe to interact with popup
 */
export async function waitForPopupReady(page: any, timeout: number = 5000): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(500);

  // Wait for loading spinner to disappear (if it exists)
  const spinner = page.locator('.loading-spinner, .spinner, [data-loading="true"]');
  await spinner.waitFor({ state: 'hidden', timeout }).catch(() => {
    // Spinner may not exist, that's ok
  });
}
