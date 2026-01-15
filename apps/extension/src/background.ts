/**
 * Asterisk Background Service Worker
 *
 * Receives form snapshots from content scripts and forwards them
 * to the desktop app via localhost HTTP.
 */

import type { FormSnapshot, FillCommand } from '@asterisk/core';

// ============================================================================
// Constants
// ============================================================================

const DESKTOP_API_URL = 'http://127.0.0.1:17373/v1/form-snapshots';
const FILL_COMMANDS_URL = 'http://127.0.0.1:17373/v1/fill-commands';
const DESKTOP_BRIDGE_MESSAGE = 'ASTERISK_FORM_SNAPSHOT';
const FILL_COMMAND_MESSAGE = 'ASTERISK_FILL_COMMAND';
const FILL_POLL_INTERVAL = 2000; // Poll every 2 seconds

// Track connection status to avoid spamming
let lastConnectionAttempt = 0;
let isDesktopAvailable = true;
const CONNECTION_RETRY_INTERVAL = 5000; // 5 seconds

// ============================================================================
// Desktop Communication
// ============================================================================

async function sendToDesktop(snapshot: FormSnapshot): Promise<boolean> {
  // Rate limit connection attempts when desktop is unavailable
  const now = Date.now();
  if (!isDesktopAvailable && now - lastConnectionAttempt < CONNECTION_RETRY_INTERVAL) {
    return false;
  }
  lastConnectionAttempt = now;

  try {
    const response = await fetch(DESKTOP_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(snapshot),
    });

    if (response.ok) {
      isDesktopAvailable = true;
      return true;
    }

    // Server returned an error
    console.debug('[Asterisk] Desktop returned error:', response.status);
    return false;
  } catch {
    // Connection failed - desktop probably not running
    // Silently fail without spamming console
    isDesktopAvailable = false;
    return false;
  }
}

// ============================================================================
// Health Check
// ============================================================================

async function checkDesktopHealth(): Promise<boolean> {
  try {
    const response = await fetch('http://127.0.0.1:17373/health', {
      method: 'GET',
    });
    isDesktopAvailable = response.ok;
    return response.ok;
  } catch {
    isDesktopAvailable = false;
    return false;
  }
}

// ============================================================================
// Fill Command Polling
// ============================================================================

// Track processed commands to avoid duplicates
const processedCommands = new Set<string>();

async function pollFillCommands(): Promise<void> {
  if (!isDesktopAvailable) return;

  try {
    const response = await fetch(FILL_COMMANDS_URL, {
      method: 'GET',
    });

    if (!response.ok) return;

    const commands: FillCommand[] = await response.json();

    for (const command of commands) {
      // Skip already processed commands
      if (processedCommands.has(command.id)) continue;

      // Check if command is expired
      if (new Date(command.expiresAt) < new Date()) {
        processedCommands.add(command.id);
        await acknowledgeFillCommand(command.id);
        continue;
      }

      // Try to send to matching tab
      const success = await sendFillCommandToTab(command);

      if (success) {
        processedCommands.add(command.id);
        await acknowledgeFillCommand(command.id);
        console.debug('[Asterisk] Fill command executed:', command.id, command.fills.length, 'fields');
      }
    }
  } catch {
    // Silently fail - desktop may not be running
  }
}

async function sendFillCommandToTab(command: FillCommand): Promise<boolean> {
  // Find tabs matching the target domain
  const tabs = await chrome.tabs.query({ url: `*://${command.targetDomain}/*` });

  if (tabs.length === 0) {
    console.debug('[Asterisk] No tabs found for domain:', command.targetDomain);
    return false;
  }

  // Try to send to the first matching tab
  for (const tab of tabs) {
    if (!tab.id) continue;

    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: FILL_COMMAND_MESSAGE,
        payload: command,
      });

      if (response?.success) {
        return true;
      }
    } catch {
      // Tab may not have content script loaded, try next tab
      continue;
    }
  }

  return false;
}

async function acknowledgeFillCommand(commandId: string): Promise<void> {
  try {
    await fetch(`${FILL_COMMANDS_URL}?id=${encodeURIComponent(commandId)}`, {
      method: 'DELETE',
    });
  } catch {
    // Silently fail
  }
}

// Start polling
let pollInterval: ReturnType<typeof setInterval> | null = null;

function startFillCommandPolling(): void {
  if (pollInterval) return;

  pollInterval = setInterval(pollFillCommands, FILL_POLL_INTERVAL);
  // Also poll immediately
  pollFillCommands();
}

// ============================================================================
// Message Handling
// ============================================================================

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === DESKTOP_BRIDGE_MESSAGE && message.payload) {
    const snapshot = message.payload as FormSnapshot;

    // Fire and forget - don't block the content script
    sendToDesktop(snapshot).then((success) => {
      if (success) {
        console.debug('[Asterisk] Sent form snapshot:', snapshot.domain, snapshot.fingerprint.fieldCount, 'fields');
      }
    });

    // Acknowledge receipt
    sendResponse({ received: true });
  }

  // Return true to indicate async response (even though we don't use it)
  return true;
});

// ============================================================================
// Extension Lifecycle
// ============================================================================

// Check desktop health on install/update
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[Asterisk] Extension installed/updated');
  const available = await checkDesktopHealth();
  if (available) {
    startFillCommandPolling();
  }
});

// Periodic health check (every 30 seconds when extension is active)
setInterval(async () => {
  const wasAvailable = isDesktopAvailable;
  await checkDesktopHealth();

  // Start polling when desktop becomes available
  if (!wasAvailable && isDesktopAvailable) {
    startFillCommandPolling();
  }
}, 30000);

// Start polling on service worker startup
checkDesktopHealth().then((available) => {
  if (available) {
    startFillCommandPolling();
  }
});

// Log startup
console.log('[Asterisk] Background service worker started');
