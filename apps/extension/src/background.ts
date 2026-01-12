/**
 * Asterisk Background Service Worker
 *
 * Receives form snapshots from content scripts and forwards them
 * to the desktop app via localhost HTTP.
 */

import type { FormSnapshot } from '@asterisk/core';

// ============================================================================
// Constants
// ============================================================================

const DESKTOP_API_URL = 'http://127.0.0.1:17373/v1/form-snapshots';
const DESKTOP_BRIDGE_MESSAGE = 'ASTERISK_FORM_SNAPSHOT';

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
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Asterisk] Extension installed/updated');
  checkDesktopHealth();
});

// Periodic health check (every 30 seconds when extension is active)
setInterval(() => {
  if (!isDesktopAvailable) {
    checkDesktopHealth();
  }
}, 30000);

// Log startup
console.log('[Asterisk] Background service worker started');
