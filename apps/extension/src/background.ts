/**
 * Asterisk Background Service Worker
 *
 * Receives form snapshots from content scripts and forwards them
 * to the desktop app via localhost HTTP.
 */

import type { FormSnapshot, FillCommand, FillPlan, VaultItem, FieldFill } from '@asterisk/core';
import { generateFillPlan } from '@asterisk/core';

// ============================================================================
// Constants
// ============================================================================

const DESKTOP_API_URL = 'http://127.0.0.1:17373/v1/form-snapshots';
const FILL_COMMANDS_URL = 'http://127.0.0.1:17373/v1/fill-commands';
const DESKTOP_BRIDGE_MESSAGE = 'ASTERISK_FORM_SNAPSHOT';
const FILL_COMMAND_MESSAGE = 'ASTERISK_FILL_COMMAND';
// Chrome Alarms API has 1-minute minimum, so we use that for persistent polling
const HEALTH_CHECK_ALARM = 'asterisk-health-check';
const FILL_POLL_ALARM = 'asterisk-fill-poll';
const ALARM_PERIOD_MINUTES = 1; // Minimum supported by Chrome Alarms API

// Track connection status to avoid spamming
let lastConnectionAttempt = 0;
let isDesktopAvailable = true;
const CONNECTION_RETRY_INTERVAL = 5000; // 5 seconds

// Store latest form snapshots per tab for popup access
const formSnapshotsByTab = new Map<number, FormSnapshot>();

// Cache vault data for local fill plan generation with TTL
let cachedVaultItems: VaultItem[] = [];
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// Desktop Communication
// ============================================================================

/**
 * Fetch vault items from desktop app for local fill plan generation
 */
async function fetchVaultItems(): Promise<VaultItem[]> {
  // Check cache expiry and clear if expired
  if (Date.now() - cacheTimestamp > CACHE_TTL_MS) {
    cachedVaultItems = [];
    cacheTimestamp = 0;
  }

  // Return cached items if valid
  if (cachedVaultItems.length > 0 && !isDesktopAvailable) {
    return cachedVaultItems;
  }

  try {
    const response = await fetch('http://127.0.0.1:17373/v1/vault', {
      method: 'GET',
    });

    if (response.ok) {
      const items: VaultItem[] = await response.json();
      cachedVaultItems = items;
      cacheTimestamp = Date.now(); // Update cache timestamp
      isDesktopAvailable = true;
      return items;
    }

    // HTTP error response - mark desktop as unavailable
    isDesktopAvailable = false;
    return cachedVaultItems;
  } catch {
    // Network error - mark desktop as unavailable
    isDesktopAvailable = false;
    return cachedVaultItems;
  }
}

/**
 * Generate fill plan locally using @asterisk/core matching
 */
async function generateLocalFillPlan(snapshot: FormSnapshot): Promise<FillPlan | null> {
  try {
    // Ensure we have vault data
    if (cachedVaultItems.length === 0) {
      await fetchVaultItems();
    }

    if (cachedVaultItems.length === 0) {
      return null;
    }

    // Generate fill plan using core matching logic
    const fillPlan = generateFillPlan(snapshot, cachedVaultItems);
    return fillPlan;
  } catch (error) {
    console.error('[Asterisk] Failed to generate fill plan:', error);
    return null;
  }
}

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

  console.log('[Asterisk] Found', tabs.length, 'tabs for domain:', command.targetDomain, '- tabs:', tabs.map(t => ({ id: t.id, url: t.url })));

  // Try to send to the first matching tab
  for (const tab of tabs) {
    if (!tab.id) continue;

    try {
      console.log('[Asterisk] Sending fill command to tab:', tab.id, tab.url);
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: FILL_COMMAND_MESSAGE,
        payload: command,
      });

      console.log('[Asterisk] Tab response:', response);

      if (response?.success) {
        return true;
      }
    } catch (error) {
      console.warn('[Asterisk] Failed to send to tab:', tab.id, tab.url, error);
      // Tab may not have content script loaded, try next tab
      continue;
    }
  }

  console.warn('[Asterisk] All tabs failed for domain:', command.targetDomain);
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

// Start polling using Chrome Alarms API (survives service worker restarts)
async function startFillCommandPolling(): Promise<void> {
  // Create recurring alarm for fill command polling
  await chrome.alarms.create(FILL_POLL_ALARM, {
    periodInMinutes: ALARM_PERIOD_MINUTES,
    delayInMinutes: 0, // Fire immediately first time
  });

  // Also poll immediately on startup
  pollFillCommands();
  console.log('[Asterisk] Fill command polling started via alarms');
}

async function startHealthCheckAlarm(): Promise<void> {
  // Create recurring alarm for health checks
  await chrome.alarms.create(HEALTH_CHECK_ALARM, {
    periodInMinutes: ALARM_PERIOD_MINUTES,
    delayInMinutes: 0,
  });
  console.log('[Asterisk] Health check alarm started');
}

// ============================================================================
// Popup Message Handlers
// ============================================================================

/**
 * Handle GET_POPUP_DATA - return current form and fill plan for a tab
 */
async function handleGetPopupData(tabId: number): Promise<any> {
  const snapshot = formSnapshotsByTab.get(tabId);

  if (!snapshot) {
    return {
      type: 'FORM_DATA',
      form: null,
      fillPlan: null,
      vaultItems: {},
    };
  }

  // Generate fill plan locally
  const fillPlan = await generateLocalFillPlan(snapshot);

  // Convert vault items to key-value map for preview
  const vaultMap: Record<string, string> = {};
  for (const item of cachedVaultItems) {
    vaultMap[item.key] = item.value;
  }

  return {
    type: 'FORM_DATA',
    form: snapshot,
    fillPlan: fillPlan,
    vaultItems: vaultMap,
  };
}

/**
 * Handle GET_DESKTOP_STATUS - return desktop connection status
 */
function handleGetDesktopStatus(): any {
  return {
    type: 'DESKTOP_STATUS',
    connected: isDesktopAvailable,
  };
}

/**
 * Handle EXECUTE_FILL - create fill command and send to content script
 */
async function handleExecuteFill(fillPlan: FillPlan, formSnapshot: FormSnapshot): Promise<any> {
  try {
    // Find the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      return { type: 'ERROR', message: 'No active tab found' };
    }

    // Resolve vault values for each recommendation
    const fills: FieldFill[] = [];
    for (const recommendation of fillPlan.recommendations) {
      if (recommendation.confidence === 0) continue;

      // Find the vault item
      const vaultItem = cachedVaultItems.find(item => item.key === recommendation.vaultKey);
      if (!vaultItem) {
        console.warn('[Asterisk] Vault item not found:', recommendation.vaultKey);
        continue;
      }

      fills.push({
        fieldId: recommendation.fieldId,
        value: vaultItem.value,
      });
    }

    if (fills.length === 0) {
      return { type: 'ERROR', message: 'No fields to fill' };
    }

    // Create fill command
    const fillCommand: FillCommand = {
      id: `popup-fill-${Date.now()}`,
      targetDomain: formSnapshot.domain,
      fills,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60000).toISOString(), // 1 minute expiry
    };

    // Send directly to the tab's content script
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: FILL_COMMAND_MESSAGE,
      payload: fillCommand,
    });

    if (response?.success) {
      return {
        type: 'FILL_RESULT',
        success: true,
        filledCount: fillCommand.fills.length,
      };
    }

    return { type: 'ERROR', message: 'Fill command failed' };
  } catch (error) {
    console.error('[Asterisk] Execute fill failed:', error);
    return { type: 'ERROR', message: 'Failed to send fill command' };
  }
}

// ============================================================================
// Message Handling
// ============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Security: Verify message comes from our extension
  if (sender.id && sender.id !== chrome.runtime.id) {
    console.warn('[Asterisk] Rejecting message from unknown sender:', sender.id);
    return false;
  }

  // Handle form snapshots from content scripts
  if (message.type === DESKTOP_BRIDGE_MESSAGE && message.payload) {
    const snapshot = message.payload as FormSnapshot;

    // Store snapshot for popup access
    if (sender.tab?.id) {
      formSnapshotsByTab.set(sender.tab.id, snapshot);
    }

    // Fire and forget - don't block the content script
    sendToDesktop(snapshot).then((success) => {
      if (success) {
        console.debug('[Asterisk] Sent form snapshot:', snapshot.domain, snapshot.fingerprint.fieldCount, 'fields');
        // Piggyback: also poll for fill commands when we receive a form snapshot
        // This gives us faster response when a form is active
        pollFillCommands();
      }
    });

    // Acknowledge receipt
    sendResponse({ received: true });
    return true;
  }

  // Handle popup messages (async)
  if (message.type === 'GET_POPUP_DATA') {
    const tabId = message.payload?.tabId;
    if (tabId) {
      handleGetPopupData(tabId).then(sendResponse);
      return true; // Will respond asynchronously
    }
  }

  if (message.type === 'GET_DESKTOP_STATUS') {
    sendResponse(handleGetDesktopStatus());
    return true;
  }

  if (message.type === 'EXECUTE_FILL') {
    const { fillPlan, formSnapshot } = message.payload;
    if (fillPlan && formSnapshot) {
      handleExecuteFill(fillPlan, formSnapshot).then(sendResponse);
      return true; // Will respond asynchronously
    }
  }

  // Return false for unhandled messages
  return false;
});

// ============================================================================
// Alarm Handling (survives service worker restarts)
// ============================================================================

chrome.alarms.onAlarm.addListener(async (alarm) => {
  console.debug('[Asterisk] Alarm fired:', alarm.name);

  if (alarm.name === HEALTH_CHECK_ALARM) {
    const wasAvailable = isDesktopAvailable;
    await checkDesktopHealth();

    // Start fill polling and fetch vault when desktop becomes available
    if (!wasAvailable && isDesktopAvailable) {
      await startFillCommandPolling();
      await fetchVaultItems();
    }
  }

  if (alarm.name === FILL_POLL_ALARM) {
    if (isDesktopAvailable) {
      await pollFillCommands();
    }
  }
});

// ============================================================================
// Extension Lifecycle
// ============================================================================

// Check desktop health on install/update and set up alarms
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[Asterisk] Extension installed/updated');

  // Set up recurring alarms (survive service worker restarts)
  await startHealthCheckAlarm();

  const available = await checkDesktopHealth();
  if (available) {
    await startFillCommandPolling();
    await fetchVaultItems();
  }
});

// Service worker startup - ensure alarms are set up
// This runs every time the service worker wakes up
(async () => {
  console.log('[Asterisk] Background service worker started - Hot reload enabled via CRXJS');

  // Check if alarms already exist (they persist across restarts)
  const existingAlarms = await chrome.alarms.getAll();
  const hasHealthAlarm = existingAlarms.some((a) => a.name === HEALTH_CHECK_ALARM);
  const hasFillAlarm = existingAlarms.some((a) => a.name === FILL_POLL_ALARM);

  // Ensure health check alarm exists
  if (!hasHealthAlarm) {
    await startHealthCheckAlarm();
  }

  // Check desktop availability and start fill polling if needed
  const available = await checkDesktopHealth();
  if (available && !hasFillAlarm) {
    await startFillCommandPolling();
  } else if (available) {
    // Poll immediately on startup even if alarm exists
    pollFillCommands();
  }

  // Fetch vault items if desktop is available
  if (available) {
    await fetchVaultItems();
  }
})();

// ============================================================================
// Security: Clear sensitive cache on extension suspend
// ============================================================================

chrome.runtime.onSuspend.addListener(() => {
  console.debug('[Asterisk] Service worker suspending - clearing vault cache');
  cachedVaultItems = [];
  cacheTimestamp = 0;
});
