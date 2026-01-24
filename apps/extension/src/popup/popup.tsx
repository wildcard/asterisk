/**
 * Asterisk Popup Component
 *
 * Main UI for the extension popup, allowing users to:
 * - See detected forms on the current page
 * - Preview field match statistics
 * - Fill matched fields without opening desktop app
 * - Open desktop app for detailed review
 */

import { useEffect, useState } from 'react';
import type { FormSnapshot, FillPlan } from '@asterisk/core';
import { SettingsModal } from './SettingsModal';

// ============================================================================
// Types
// ============================================================================

interface PopupState {
  loading: boolean;
  error: string | null;
  desktopConnected: boolean;
  currentForm: FormSnapshot | null;
  fillPlan: FillPlan | null;
  filling: boolean;
  showSettings: boolean;
}

// Message types for background responses
type BackgroundResponse =
  | { type: 'FORM_DATA'; form: FormSnapshot | null; fillPlan: FillPlan | null }
  | { type: 'DESKTOP_STATUS'; connected: boolean }
  | { type: 'FILL_RESULT'; success: boolean; filledCount: number }
  | { type: 'ERROR'; message: string };

// ============================================================================
// Main Component
// ============================================================================

export function Popup() {
  const [state, setState] = useState<PopupState>({
    loading: true,
    error: null,
    desktopConnected: false,
    currentForm: null,
    fillPlan: null,
    filling: false,
    showSettings: false,
  });

  // Load initial data on mount
  useEffect(() => {
    loadPopupData();
  }, []);

  const loadPopupData = async () => {
    try {
      // Get current tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        setState(prev => ({ ...prev, loading: false, error: 'No active tab found' }));
        return;
      }

      // Request form data and desktop status from background script
      const response = await chrome.runtime.sendMessage({
        type: 'GET_POPUP_DATA',
        payload: { tabId: tab.id },
      }) as BackgroundResponse;

      if (response.type === 'FORM_DATA') {
        setState(prev => ({
          ...prev,
          loading: false,
          currentForm: response.form,
          fillPlan: response.fillPlan,
        }));
      } else if (response.type === 'ERROR') {
        setState(prev => ({ ...prev, loading: false, error: response.message }));
      }

      // Check desktop connection status
      const statusResponse = await chrome.runtime.sendMessage({
        type: 'GET_DESKTOP_STATUS',
      }) as BackgroundResponse;

      if (statusResponse.type === 'DESKTOP_STATUS') {
        setState(prev => ({ ...prev, desktopConnected: statusResponse.connected }));
      }
    } catch (error) {
      console.error('[Popup] Failed to load data:', error);
      setState(prev => ({
        ...prev,
        loading: false,
        error: 'Failed to communicate with extension background script',
      }));
    }
  };

  const handleFillAll = async () => {
    if (!state.fillPlan || !state.currentForm) return;

    setState(prev => ({ ...prev, filling: true, error: null }));

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'EXECUTE_FILL',
        payload: { fillPlan: state.fillPlan, formSnapshot: state.currentForm },
      }) as BackgroundResponse;

      if (response.type === 'FILL_RESULT' && response.success) {
        // Show success briefly, then close popup
        setTimeout(() => window.close(), 1000);
      } else if (response.type === 'ERROR') {
        setState(prev => ({ ...prev, filling: false, error: response.message }));
      }
    } catch (error) {
      console.error('[Popup] Fill failed:', error);
      setState(prev => ({
        ...prev,
        filling: false,
        error: 'Failed to fill fields',
      }));
    }
  };

  const handleOpenDesktop = async () => {
    if (!state.desktopConnected) {
      setState(prev => ({
        ...prev,
        error: 'Desktop app not running. Please start Asterisk first.',
      }));
      return;
    }

    await chrome.tabs.create({ url: 'http://localhost:1420' });
    window.close();
  };

  // ============================================================================
  // Render Logic
  // ============================================================================

  const { loading, error, desktopConnected, currentForm, fillPlan, filling } = state;

  // Calculate match statistics
  const matchedCount = fillPlan?.recommendations.filter(r => r.confidence > 0).length ?? 0;
  const unmatchedCount = (currentForm?.fingerprint.fieldCount ?? 0) - matchedCount;
  const hasMatches = matchedCount > 0;

  return (
    <>
      {/* Header */}
      <div className="popup-header">
        <div className="popup-title">Asterisk Form Filler</div>
        <div className="popup-domain">
          {currentForm?.domain ?? 'No page loaded'}
        </div>
      </div>

      {/* Content */}
      <div className="popup-content">
        {loading && (
          <div className="empty-state">
            <div className="spinner" />
            <div className="empty-state-title">Loading...</div>
          </div>
        )}

        {error && (
          <div className="error-message">{error}</div>
        )}

        {!loading && !error && !currentForm && (
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <div className="empty-state-title">No Form Detected</div>
            <div className="empty-state-description">
              Navigate to a page with a form to see filling options.
            </div>
          </div>
        )}

        {!loading && !error && currentForm && (
          <>
            {/* Status Section */}
            <div className="status-section">
              <div className="status-item">
                <span className="status-icon">📋</span>
                <span className="status-text">Form Detected</span>
                <span className="status-count">
                  {currentForm.fingerprint.fieldCount} fields
                </span>
              </div>

              {hasMatches && (
                <div className="status-item">
                  <span className="status-icon">✓</span>
                  <span className="status-text">Matched Automatically</span>
                  <span className="status-count">{matchedCount} fields</span>
                </div>
              )}

              {unmatchedCount > 0 && (
                <div className="status-item warning">
                  <span className="status-icon">⚠</span>
                  <span className="status-text">Need Attention</span>
                  <span className="status-count">{unmatchedCount} fields</span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="action-section">
              <button
                className="btn btn-primary"
                disabled={!hasMatches || filling}
                onClick={handleFillAll}
              >
                {filling ? (
                  <>
                    <span className="spinner" /> Filling...
                  </>
                ) : (
                  'Fill All Matched Fields'
                )}
              </button>

              <button
                className="btn btn-secondary"
                onClick={handleOpenDesktop}
                disabled={filling}
              >
                Review and Customize
              </button>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="popup-footer">
        <div className="connection-status">
          <span className={`status-indicator ${desktopConnected ? 'connected' : 'disconnected'}`} />
          <span>
            {desktopConnected ? 'Desktop app connected' : 'Desktop app not connected'}
          </span>
        </div>

        <button
          className="settings-button"
          onClick={() => setState(prev => ({ ...prev, showSettings: true }))}
        >
          ⚙ Settings
        </button>
      </div>

      {/* Settings Modal */}
      {state.showSettings && (
        <SettingsModal onClose={() => setState(prev => ({ ...prev, showSettings: false }))} />
      )}
    </>
  );
}
