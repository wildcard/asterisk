/**
 * Settings Modal Component
 *
 * Allows users to configure extension settings:
 * - Desktop API URL
 * - Auto-fill enabled toggle
 * - Link to full desktop settings
 */

import { useEffect, useState } from 'react';

interface Settings {
  desktopApiUrl: string;
  autoFillEnabled: boolean;
  autoCloseAfterFill: boolean;
  showKeyboardShortcuts: boolean;
}

interface SettingsModalProps {
  onClose: () => void;
}

const DEFAULT_SETTINGS: Settings = {
  desktopApiUrl: 'http://localhost:1420',
  autoFillEnabled: true,
  autoCloseAfterFill: true,
  showKeyboardShortcuts: true,
};

/**
 * Validates desktop API URL to prevent open redirect attacks
 * Only allows localhost URLs with http/https protocols
 */
function isValidDesktopUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const allowedHosts = ['localhost', '127.0.0.1', '[::1]'];
    return ['http:', 'https:'].includes(parsed.protocol) &&
           allowedHosts.includes(parsed.hostname);
  } catch {
    return false;
  }
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const result = await chrome.storage.local.get([
        'desktopApiUrl',
        'autoFillEnabled',
        'autoCloseAfterFill',
        'showKeyboardShortcuts',
      ]);
      setSettings({
        desktopApiUrl: result.desktopApiUrl || DEFAULT_SETTINGS.desktopApiUrl,
        autoFillEnabled: result.autoFillEnabled ?? DEFAULT_SETTINGS.autoFillEnabled,
        autoCloseAfterFill: result.autoCloseAfterFill ?? DEFAULT_SETTINGS.autoCloseAfterFill,
        showKeyboardShortcuts: result.showKeyboardShortcuts ?? DEFAULT_SETTINGS.showKeyboardShortcuts,
      });
    } catch (error) {
      console.error('[SettingsModal] Failed to load settings:', error);
    }
  };

  const handleSave = async () => {
    // Clear previous errors
    setError(null);

    // Validate desktop URL before saving
    if (!isValidDesktopUrl(settings.desktopApiUrl)) {
      setError('Invalid desktop URL. Must be localhost with http:// or https://');
      return;
    }

    setSaving(true);
    try {
      await chrome.storage.local.set({
        desktopApiUrl: settings.desktopApiUrl,
        autoFillEnabled: settings.autoFillEnabled,
        autoCloseAfterFill: settings.autoCloseAfterFill,
        showKeyboardShortcuts: settings.showKeyboardShortcuts,
      });

      // Close modal after brief delay
      setTimeout(() => {
        onClose();
      }, 300);
    } catch (error) {
      console.error('[SettingsModal] Failed to save settings:', error);
      setError('Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenFullSettings = async () => {
    // Validate URL before navigation (defense in depth)
    if (!isValidDesktopUrl(settings.desktopApiUrl)) {
      setError('Invalid desktop URL configured. Please update settings.');
      return;
    }
    await chrome.tabs.create({ url: `${settings.desktopApiUrl}#settings` });
    window.close();
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    // Close modal if clicking the overlay (not the content)
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-content">
        <div className="modal-header">
          <div className="modal-title">Extension Settings</div>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          {error && (
            <div className="error-message" style={{ marginBottom: '16px' }}>
              {error}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Desktop API URL</label>
            <input
              type="text"
              className="form-input"
              value={settings.desktopApiUrl}
              onChange={(e) => setSettings({ ...settings, desktopApiUrl: e.target.value })}
              placeholder="http://localhost:1420"
            />
          </div>

          <div className="form-group">
            <label className="form-checkbox">
              <input
                type="checkbox"
                checked={settings.autoFillEnabled}
                onChange={(e) => setSettings({ ...settings, autoFillEnabled: e.target.checked })}
              />
              <span>Enable automatic form filling</span>
            </label>
          </div>

          <div className="form-group">
            <label className="form-checkbox">
              <input
                type="checkbox"
                checked={settings.autoCloseAfterFill}
                onChange={(e) => setSettings({ ...settings, autoCloseAfterFill: e.target.checked })}
              />
              <span>Auto-close popup after filling</span>
            </label>
          </div>

          <div className="form-group">
            <label className="form-checkbox">
              <input
                type="checkbox"
                checked={settings.showKeyboardShortcuts}
                onChange={(e) => setSettings({ ...settings, showKeyboardShortcuts: e.target.checked })}
              />
              <span>Show keyboard shortcuts hint</span>
            </label>
          </div>

          <div className="form-group">
            <button className="btn-link" onClick={handleOpenFullSettings}>
              Open Full Settings in Desktop App →
            </button>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
