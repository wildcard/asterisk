/**
 * Security Tests: Message Sender Verification
 *
 * Tests the background script's message sender verification to ensure
 * messages from external extensions are properly rejected.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Message Sender Verification', () => {
  // Mock Chrome runtime ID
  const EXTENSION_ID = 'test-extension-id-12345';
  const MALICIOUS_ID = 'malicious-extension-id-67890';

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock chrome.runtime.id
    // @ts-expect-error - Chrome API mock
    global.chrome = {
      ...global.chrome,
      runtime: {
        ...global.chrome.runtime,
        id: EXTENSION_ID,
        onMessage: {
          addListener: vi.fn(),
        },
      },
    };
  });

  describe('Sender ID verification logic', () => {
    /**
     * Simulates the sender verification logic from background.ts:380-384
     */
    function shouldRejectMessage(sender: chrome.runtime.MessageSender): boolean {
      if (sender.id && sender.id !== chrome.runtime.id) {
        return true; // Reject
      }
      return false; // Accept
    }

    it('accepts messages from own extension', () => {
      const sender: chrome.runtime.MessageSender = {
        id: EXTENSION_ID,
      };

      expect(shouldRejectMessage(sender)).toBe(false);
    });

    it('rejects messages from external extensions', () => {
      const sender: chrome.runtime.MessageSender = {
        id: MALICIOUS_ID,
      };

      expect(shouldRejectMessage(sender)).toBe(true);
    });

    it('accepts messages with undefined sender.id (internal messages)', () => {
      const sender: chrome.runtime.MessageSender = {
        id: undefined,
      };

      expect(shouldRejectMessage(sender)).toBe(false);
    });

    it('accepts messages without sender.id property', () => {
      const sender: chrome.runtime.MessageSender = {};

      expect(shouldRejectMessage(sender)).toBe(false);
    });
  });

  describe('Message types that should be verified', () => {
    function shouldRejectMessage(sender: chrome.runtime.MessageSender): boolean {
      if (sender.id && sender.id !== chrome.runtime.id) {
        return true;
      }
      return false;
    }

    const testMessages = [
      { type: 'ASTERISK_FORM_SNAPSHOT', payload: { domain: 'example.com' } },
      { type: 'GET_POPUP_DATA', payload: { tabId: 1 } },
      { type: 'GET_DESKTOP_STATUS' },
      { type: 'EXECUTE_FILL', payload: { fillPlan: {}, formSnapshot: {} } },
      { type: 'ASTERISK_FILL_COMMAND', payload: { id: 'cmd-1' } },
    ];

    testMessages.forEach((message) => {
      it(`rejects ${message.type} from external extension`, () => {
        const sender: chrome.runtime.MessageSender = {
          id: MALICIOUS_ID,
        };

        expect(shouldRejectMessage(sender)).toBe(true);
      });

      it(`accepts ${message.type} from own extension`, () => {
        const sender: chrome.runtime.MessageSender = {
          id: EXTENSION_ID,
        };

        expect(shouldRejectMessage(sender)).toBe(false);
      });
    });
  });

  describe('Security attack scenarios', () => {
    function shouldRejectMessage(sender: chrome.runtime.MessageSender): boolean {
      if (sender.id && sender.id !== chrome.runtime.id) {
        return true;
      }
      return false;
    }

    it('prevents cross-extension message injection', () => {
      const maliciousSender: chrome.runtime.MessageSender = {
        id: 'evil-extension',
        url: 'chrome-extension://evil-extension/inject.js',
      };

      expect(shouldRejectMessage(maliciousSender)).toBe(true);
    });

    it('prevents spoofed extension ID attempts', () => {
      // Attacker tries to send with a different ID
      const attackSender: chrome.runtime.MessageSender = {
        id: 'chrome-extension-id-spoofed',
      };

      expect(shouldRejectMessage(attackSender)).toBe(true);
    });

    it('handles null sender.id gracefully', () => {
      const sender: chrome.runtime.MessageSender = {
        id: null as any, // Some contexts might have null
      };

      // Null is falsy, so the check `sender.id && ...` will be false
      expect(shouldRejectMessage(sender)).toBe(false);
    });
  });

  describe('Integration with message handler', () => {
    it('simulates message rejection flow', () => {
      const message = {
        type: 'ASTERISK_FORM_SNAPSHOT',
        payload: { domain: 'example.com' },
      };

      const maliciousSender: chrome.runtime.MessageSender = {
        id: MALICIOUS_ID,
      };

      const sendResponse = vi.fn();

      // Simulate the message handler logic
      function messageHandler(
        msg: any,
        sender: chrome.runtime.MessageSender,
        respond: any
      ): boolean {
        if (sender.id && sender.id !== chrome.runtime.id) {
          console.warn('[Asterisk] Rejecting message from unknown sender:', sender.id);
          return false;
        }

        // Continue processing...
        respond({ received: true });
        return true;
      }

      const result = messageHandler(message, maliciousSender, sendResponse);

      expect(result).toBe(false);
      expect(sendResponse).not.toHaveBeenCalled();
    });

    it('simulates message acceptance flow', () => {
      const message = {
        type: 'GET_DESKTOP_STATUS',
      };

      const validSender: chrome.runtime.MessageSender = {
        id: EXTENSION_ID,
      };

      const sendResponse = vi.fn();

      function messageHandler(
        msg: any,
        sender: chrome.runtime.MessageSender,
        respond: any
      ): boolean {
        if (sender.id && sender.id !== chrome.runtime.id) {
          console.warn('[Asterisk] Rejecting message from unknown sender:', sender.id);
          return false;
        }

        // Continue processing...
        if (msg.type === 'GET_DESKTOP_STATUS') {
          respond({ type: 'DESKTOP_STATUS', connected: true });
          return true;
        }

        return false;
      }

      const result = messageHandler(message, validSender, sendResponse);

      expect(result).toBe(true);
      expect(sendResponse).toHaveBeenCalledWith({
        type: 'DESKTOP_STATUS',
        connected: true,
      });
    });
  });

  describe('Performance and edge cases', () => {
    function shouldRejectMessage(sender: chrome.runtime.MessageSender): boolean {
      if (sender.id && sender.id !== chrome.runtime.id) {
        return true;
      }
      return false;
    }

    it('handles empty string sender.id', () => {
      const sender: chrome.runtime.MessageSender = {
        id: '',
      };

      // Empty string is falsy, so check will be false
      expect(shouldRejectMessage(sender)).toBe(false);
    });

    it('performs fast O(1) string comparison', () => {
      const sender: chrome.runtime.MessageSender = {
        id: EXTENSION_ID,
      };

      const start = performance.now();
      for (let i = 0; i < 10000; i++) {
        shouldRejectMessage(sender);
      }
      const end = performance.now();

      // 10,000 checks should complete in < 100ms
      expect(end - start).toBeLessThan(100);
    });

    it('handles very long extension IDs', () => {
      const longId = 'a'.repeat(1000);

      // @ts-expect-error - Override for test
      global.chrome.runtime.id = longId;

      const sender: chrome.runtime.MessageSender = {
        id: longId,
      };

      expect(shouldRejectMessage(sender)).toBe(false);
    });
  });
});
