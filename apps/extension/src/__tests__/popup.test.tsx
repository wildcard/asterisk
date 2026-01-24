/**
 * Popup Component Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Popup } from '../popup/popup';
import type { FormSnapshot, FillPlan } from '@asterisk/core';

// Mock form data
const mockFormSnapshot: FormSnapshot = {
  domain: 'example.com',
  url: 'https://example.com/form',
  timestamp: Date.now(),
  fingerprint: {
    fieldCount: 3,
    hash: 'mock-hash',
  },
  fields: [],
};

const mockFillPlan: FillPlan = {
  formHash: 'mock-hash',
  recommendations: [
    {
      fieldId: 'field1',
      dataKey: 'firstName',
      confidence: 0.9,
      reason: 'Label match',
    },
    {
      fieldId: 'field2',
      dataKey: 'lastName',
      confidence: 0.8,
      reason: 'Name pattern',
    },
  ],
};

describe('Popup', () => {
  beforeEach(() => {
    // Reset window.close mock
    vi.stubGlobal('close', vi.fn());
  });

  describe('Loading State', () => {
    it('shows loading skeleton initially', async () => {
      // Mock chrome API to never resolve (keeps loading state)
      chrome.tabs.query = vi.fn(() => new Promise(() => {}));

      render(<Popup />);

      // Should show skeleton, not spinner
      const skeleton = document.querySelector('.skeleton-container');
      expect(skeleton).toBeInTheDocument();
    });
  });

  describe('No Form State', () => {
    it('shows empty state when no form detected', async () => {
      chrome.tabs.query = vi.fn().mockResolvedValue([{ id: 1 }]);
      chrome.runtime.sendMessage = vi.fn()
        .mockResolvedValueOnce({ type: 'FORM_DATA', form: null, fillPlan: null })
        .mockResolvedValueOnce({ type: 'DESKTOP_STATUS', connected: false });

      render(<Popup />);

      await waitFor(() => {
        expect(screen.getByText('No Form Detected')).toBeInTheDocument();
      });

      expect(screen.getByText(/Navigate to a page with a form/)).toBeInTheDocument();
    });
  });

  describe('Form Detected State', () => {
    beforeEach(() => {
      chrome.tabs.query = vi.fn().mockResolvedValue([{ id: 1 }]);
      chrome.runtime.sendMessage = vi.fn()
        .mockResolvedValueOnce({
          type: 'FORM_DATA',
          form: mockFormSnapshot,
          fillPlan: mockFillPlan,
        })
        .mockResolvedValueOnce({ type: 'DESKTOP_STATUS', connected: true });
    });

    it('displays form detection info', async () => {
      render(<Popup />);

      await waitFor(() => {
        expect(screen.getByText('Form Detected')).toBeInTheDocument();
      });

      expect(screen.getByText('3 fields')).toBeInTheDocument();
      expect(screen.getByText('Matched Automatically')).toBeInTheDocument();
      expect(screen.getByText('2 fields')).toBeInTheDocument();
    });

    it('shows unmatched fields warning', async () => {
      render(<Popup />);

      await waitFor(() => {
        expect(screen.getByText('Need Attention')).toBeInTheDocument();
      });

      expect(screen.getByText('1 fields')).toBeInTheDocument(); // 3 total - 2 matched = 1
    });

    it('shows domain in header', async () => {
      render(<Popup />);

      await waitFor(() => {
        expect(screen.getByText('example.com')).toBeInTheDocument();
      });
    });
  });

  describe('Fill Button Interaction', () => {
    beforeEach(() => {
      chrome.tabs.query = vi.fn().mockResolvedValue([{ id: 1 }]);
      chrome.runtime.sendMessage = vi.fn()
        .mockResolvedValueOnce({
          type: 'FORM_DATA',
          form: mockFormSnapshot,
          fillPlan: mockFillPlan,
        })
        .mockResolvedValueOnce({ type: 'DESKTOP_STATUS', connected: true });
    });

    it('enables fill button when matches exist', async () => {
      render(<Popup />);

      await waitFor(() => {
        const fillButton = screen.getByText('Fill All Matched Fields');
        expect(fillButton).toBeEnabled();
      });
    });

    it('executes fill on button click', async () => {
      const user = userEvent.setup();
      chrome.runtime.sendMessage = vi.fn()
        .mockResolvedValueOnce({
          type: 'FORM_DATA',
          form: mockFormSnapshot,
          fillPlan: mockFillPlan,
        })
        .mockResolvedValueOnce({ type: 'DESKTOP_STATUS', connected: true })
        .mockResolvedValueOnce({ type: 'FILL_RESULT', success: true, filledCount: 2 });

      render(<Popup />);

      await waitFor(() => {
        expect(screen.getByText('Fill All Matched Fields')).toBeInTheDocument();
      });

      const fillButton = screen.getByText('Fill All Matched Fields');
      await user.click(fillButton);

      await waitFor(() => {
        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
          type: 'EXECUTE_FILL',
          payload: { fillPlan: mockFillPlan, formSnapshot: mockFormSnapshot },
        });
      });
    });

    it('disables fill button when no matches', async () => {
      chrome.runtime.sendMessage = vi.fn()
        .mockResolvedValueOnce({
          type: 'FORM_DATA',
          form: mockFormSnapshot,
          fillPlan: { formHash: 'mock-hash', recommendations: [] },
        })
        .mockResolvedValueOnce({ type: 'DESKTOP_STATUS', connected: true });

      render(<Popup />);

      await waitFor(() => {
        const fillButton = screen.getByText('Fill All Matched Fields');
        expect(fillButton).toBeDisabled();
      });
    });
  });

  describe('Desktop Connection Status', () => {
    it('shows connected status when desktop is running', async () => {
      chrome.tabs.query = vi.fn().mockResolvedValue([{ id: 1 }]);
      chrome.runtime.sendMessage = vi.fn()
        .mockResolvedValueOnce({ type: 'FORM_DATA', form: null, fillPlan: null })
        .mockResolvedValueOnce({ type: 'DESKTOP_STATUS', connected: true });

      render(<Popup />);

      await waitFor(() => {
        expect(screen.getByText('Desktop app connected')).toBeInTheDocument();
      });

      const indicator = document.querySelector('.status-indicator');
      expect(indicator).toHaveClass('connected');
    });

    it('shows disconnected status when desktop is not running', async () => {
      chrome.tabs.query = vi.fn().mockResolvedValue([{ id: 1 }]);
      chrome.runtime.sendMessage = vi.fn()
        .mockResolvedValueOnce({ type: 'FORM_DATA', form: null, fillPlan: null })
        .mockResolvedValueOnce({ type: 'DESKTOP_STATUS', connected: false });

      render(<Popup />);

      await waitFor(() => {
        expect(screen.getByText('Desktop app not connected')).toBeInTheDocument();
      });

      const indicator = document.querySelector('.status-indicator');
      expect(indicator).toHaveClass('disconnected');
    });
  });

  describe('Desktop App Opening', () => {
    it('opens desktop app when connected', async () => {
      const user = userEvent.setup();
      chrome.tabs.query = vi.fn().mockResolvedValue([{ id: 1 }]);
      chrome.runtime.sendMessage = vi.fn()
        .mockResolvedValueOnce({
          type: 'FORM_DATA',
          form: mockFormSnapshot,
          fillPlan: mockFillPlan,
        })
        .mockResolvedValueOnce({ type: 'DESKTOP_STATUS', connected: true });

      render(<Popup />);

      await waitFor(() => {
        expect(screen.getByText('Review and Customize')).toBeInTheDocument();
      });

      const reviewButton = screen.getByText('Review and Customize');
      await user.click(reviewButton);

      expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'http://localhost:1420' });
      expect(window.close).toHaveBeenCalled();
    });

    it('shows error when desktop not connected', async () => {
      const user = userEvent.setup();
      chrome.tabs.query = vi.fn().mockResolvedValue([{ id: 1 }]);
      chrome.runtime.sendMessage = vi.fn()
        .mockResolvedValueOnce({
          type: 'FORM_DATA',
          form: mockFormSnapshot,
          fillPlan: mockFillPlan,
        })
        .mockResolvedValueOnce({ type: 'DESKTOP_STATUS', connected: false });

      render(<Popup />);

      await waitFor(() => {
        expect(screen.getByText('Review and Customize')).toBeInTheDocument();
      });

      const reviewButton = screen.getByText('Review and Customize');
      await user.click(reviewButton);

      await waitFor(() => {
        expect(
          screen.getByText(/Desktop app not running. Please start Asterisk first/)
        ).toBeInTheDocument();
      });

      expect(chrome.tabs.create).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('shows error message when tab query fails', async () => {
      chrome.tabs.query = vi.fn().mockResolvedValue([]);

      render(<Popup />);

      await waitFor(() => {
        expect(screen.getByText('No active tab found')).toBeInTheDocument();
      });
    });

    it('shows error message when background script fails', async () => {
      chrome.tabs.query = vi.fn().mockResolvedValue([{ id: 1 }]);
      chrome.runtime.sendMessage = vi.fn().mockResolvedValue({
        type: 'ERROR',
        message: 'Background script error',
      });

      render(<Popup />);

      await waitFor(() => {
        expect(screen.getByText('Background script error')).toBeInTheDocument();
      });
    });
  });

  describe('Settings Modal', () => {
    it('opens settings modal on button click', async () => {
      const user = userEvent.setup();
      chrome.tabs.query = vi.fn().mockResolvedValue([{ id: 1 }]);
      chrome.runtime.sendMessage = vi.fn()
        .mockResolvedValueOnce({ type: 'FORM_DATA', form: null, fillPlan: null })
        .mockResolvedValueOnce({ type: 'DESKTOP_STATUS', connected: false });

      render(<Popup />);

      await waitFor(() => {
        expect(screen.getByText('⚙ Settings')).toBeInTheDocument();
      });

      const settingsButton = screen.getByText('⚙ Settings');
      await user.click(settingsButton);

      await waitFor(() => {
        expect(screen.getByText('Extension Settings')).toBeInTheDocument();
      });
    });
  });
});
