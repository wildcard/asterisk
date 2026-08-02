/**
 * Playwright global setup.
 *
 * `webServer.url` (playwright.config.ts) only waits for the Vite dev server
 * on :1420 to respond - `pnpm tauri dev` starts Vite first and compiles +
 * launches the Rust backend (and its HTTP bridge on :17373) afterward,
 * which on a cold `cargo build` can take well over a minute. Without this
 * gate, tests that hit :17373 can start running before the bridge exists,
 * which produces confusing failures far from the real cause: the desktop
 * app's Vault "Add Item" flow silently fails its POST to :17373 (Vault
 * Items count stays 0), and the extension's install-time health check
 * latches "not connected" for up to a minute (its alarm-based recheck is
 * capped at Chrome's 1-minute alarm minimum - see background.ts
 * ALARM_PERIOD_MINUTES).
 *
 * This runs once, after webServer(s) report ready and before any test or
 * worker starts, so every project can assume the backend is already live.
 */

const HEALTH_URL = 'http://127.0.0.1:17373/health';
const MAX_WAIT_MS = 60_000;
const POLL_INTERVAL_MS = 500;

export default async function globalSetup(): Promise<void> {
  const deadline = Date.now() + MAX_WAIT_MS;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(HEALTH_URL);
      if (response.ok) {
        console.log(`[global-setup] Desktop app backend ready at ${HEALTH_URL}`);
        return;
      }
    } catch {
      // Not ready yet - keep polling.
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(
    `[global-setup] Desktop app backend did not become ready at ${HEALTH_URL} within ${MAX_WAIT_MS / 1000}s. ` +
      'Is the Rust build unusually slow, or did the webServer command fail? Check the webServer stdout/stderr above.'
  );
}
