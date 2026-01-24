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
import { FieldPreviewList } from './FieldPreviewList';
import { Toast, type ToastType } from './Toast';
import { LoadingSkeleton } from './LoadingSkeleton';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';

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
  vaultItems: Map<string, string>;
  fieldToggles: Record<string, boolean>;
  showFieldPreview: boolean;
  toast: { message: string; type: ToastType } | null;
  autoCloseAfterFill: boolean;
  showKeyboardShortcuts: boolean;
}

// Message types for background responses
type BackgroundResponse =
  | { type: 'FORM_DATA'; form: FormSnapshot | null; fillPlan: FillPlan | null; vaultItems: Record<string, string> }
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
    vaultItems: new Map(),
    fieldToggles: {},
    showFieldPreview: false,
    toast: null,
    autoCloseAfterFill: true,
    showKeyboardShortcuts: true,
  });

  // Load initial data and settings on mount
  useEffect(() => {
    loadPopupData();
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const result = await chrome.storage.local.get([
        'autoCloseAfterFill',
        'showKeyboardShortcuts',
      ]);
      setState(prev => ({
        ...prev,
        autoCloseAfterFill: result.autoCloseAfterFill ?? true,
        showKeyboardShortcuts: result.showKeyboardShortcuts ?? true,
      }));
    } catch (error) {
      console.error('[Popup] Failed to load settings:', error);
    }
  };

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
        // Initialize field toggles (all enabled by default)
        const fieldToggles: Record<string, boolean> = {};
        if (response.fillPlan) {
          response.fillPlan.recommendations.forEach(rec => {
            fieldToggles[rec.fieldId] = true;
          });
        }

        setState(prev => ({
          ...prev,
          loading: false,
          currentForm: response.form,
          fillPlan: response.fillPlan,
          vaultItems: new Map(Object.entries(response.vaultItems || {})),
          fieldToggles,
          showFieldPreview: false, // collapsed by default
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

  const handleToggleField = (fieldId: string) => {
    setState(prev => ({
      ...prev,
      fieldToggles: {
        ...prev.fieldToggles,
        [fieldId]: !prev.fieldToggles[fieldId],
      },
    }));
  };

  const handleFillAll = async () => {
    if (!state.fillPlan || !state.currentForm) return;

    // Filter fill plan to only include enabled fields
    const enabledRecommendations = state.fillPlan.recommendations.filter(
      rec => state.fieldToggles[rec.fieldId] !== false
    );

    if (enabledRecommendations.length === 0) {
      setState(prev => ({ ...prev, error: 'No fields selected for filling' }));
      return;
    }

    const filteredFillPlan: FillPlan = {
      ...state.fillPlan,
      recommendations: enabledRecommendations,
    };

    setState(prev => ({ ...prev, filling: true, error: null }));

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'EXECUTE_FILL',
        payload: { fillPlan: filteredFillPlan, formSnapshot: state.currentForm },
      }) as BackgroundResponse;

      if (response.type === 'FILL_RESULT' && response.success) {
        // Show success toast
        setState(prev => ({
          ...prev,
          filling: false,
          toast: {
            message: `Successfully filled ${response.filledCount} field${response.filledCount !== 1 ? 's' : ''}`,
            type: 'success',
          },
        }));

        // Close popup after delay if setting enabled
        if (state.autoCloseAfterFill) {
          setTimeout(() => window.close(), 1500);
        }
      } else if (response.type === 'ERROR') {
        setState(prev => ({
          ...prev,
          filling: false,
          toast: { message: response.message, type: 'error' },
        }));
      }
    } catch (error) {
      console.error('[Popup] Fill failed:', error);
      setState(prev => ({
        ...prev,
        filling: false,
        toast: { message: 'Failed to fill fields', type: 'error' },
      }));
    }
  };

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onEscape: () => window.close(),
    onEnter: () => {
      if (hasMatches && !filling) {
        handleFillAll();
      }
    },
    enabled: state.showKeyboardShortcuts,
  });

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
      <div className="popup-header" role="banner">
        <div className="popup-title">Asterisk Form Filler</div>
        <div className="popup-domain" aria-label="Current domain">
          {currentForm?.domain ?? 'No page loaded'}
        </div>
      </div>

      {/* Content */}
      <div className="popup-content">
        {loading && <LoadingSkeleton />}

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

            {/* Field Preview Section (collapsible) */}
            {hasMatches && (
              <div className="preview-toggle-section">
                <button
                  className="preview-toggle-button"
                  onClick={() => setState(prev => ({ ...prev, showFieldPreview: !prev.showFieldPreview }))}
                >
                  <span>{state.showFieldPreview ? '▼' : '▶'}</span>
                  <span>Preview & Customize Fields</span>
                  <span className="preview-toggle-count">
                    {Object.values(state.fieldToggles).filter(Boolean).length} selected
                  </span>
                </button>

                {state.showFieldPreview && fillPlan && (
                  <FieldPreviewList
                    form={currentForm}
                    fillPlan={fillPlan}
                    fieldToggles={state.fieldToggles}
                    onToggleField={handleToggleField}
                    vaultItems={state.vaultItems}
                  />
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="action-section" role="group" aria-label="Form actions">
              <button
                className="btn btn-primary"
                disabled={!hasMatches || filling}
                onClick={handleFillAll}
                aria-label={`Fill ${Object.values(state.fieldToggles).filter(Boolean).length} selected fields`}
              >
                {filling ? (
                  <>
                    <span className="spinner" role="status" aria-label="Filling fields" /> Filling...
                  </>
                ) : (
                  'Fill All Matched Fields'
                )}
              </button>

              <button
                className="btn btn-secondary"
                onClick={handleOpenDesktop}
                disabled={filling}
                aria-label="Open desktop app for detailed review"
              >
                Review and Customize
              </button>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="popup-footer" role="contentinfo">
        <div className="connection-status" role="status" aria-live="polite">
          <span
            className={`status-indicator ${desktopConnected ? 'connected' : 'disconnected'}`}
            aria-label={desktopConnected ? 'Connected' : 'Disconnected'}
          />
          <span>
            {desktopConnected ? 'Desktop app connected' : 'Desktop app not connected'}
          </span>
        </div>

        <button
          className="settings-button"
          onClick={() => setState(prev => ({ ...prev, showSettings: true }))}
          aria-label="Open settings"
        >
          ⚙ Settings
        </button>
      </div>

      {/* Settings Modal */}
      {state.showSettings && (
        <SettingsModal onClose={() => setState(prev => ({ ...prev, showSettings: false }))} />
      )}

      {/* Toast Notifications */}
      {state.toast && (
        <Toast
          message={state.toast.message}
          type={state.toast.type}
          onClose={() => setState(prev => ({ ...prev, toast: null }))}
        />
      )}

      {/* Keyboard Shortcuts Hint */}
      {state.showKeyboardShortcuts && !loading && (
        <div className="keyboard-hints">
          <span className="keyboard-hint">
            <kbd>Esc</kbd> Close
          </span>
          {hasMatches && (
            <span className="keyboard-hint">
              <kbd>Enter</kbd> Fill
            </span>
          )}
        </div>
      )}
    </>
  );
}
