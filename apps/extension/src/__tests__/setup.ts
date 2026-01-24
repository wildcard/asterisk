/**
 * Test setup file
 *
 * Mocks Chrome extension APIs for unit tests.
 */

import '@testing-library/jest-dom';

// Mock Chrome API
const chromeMock = {
  tabs: {
    query: vi.fn(),
    create: vi.fn(),
  },
  runtime: {
    sendMessage: vi.fn(),
  },
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({}), // Return empty object by default
      set: vi.fn().mockResolvedValue(undefined),
    },
  },
};

// @ts-expect-error - Chrome API mock
global.chrome = chromeMock;

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
  // Re-apply default mock behaviors after clear
  chrome.storage.local.get = vi.fn().mockResolvedValue({});
  chrome.storage.local.set = vi.fn().mockResolvedValue(undefined);
});
