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
}

interface SettingsModalProps {
  onClose: () => void;
}

const DEFAULT_SETTINGS: Settings = {
  desktopApiUrl: 'http://localhost:1420',
  autoFillEnabled: true,
};

export function SettingsModal({ onClose }: SettingsModalProps) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const result = await chrome.storage.local.get(['desktopApiUrl', 'autoFillEnabled']);
      setSettings({
        desktopApiUrl: result.desktopApiUrl || DEFAULT_SETTINGS.desktopApiUrl,
        autoFillEnabled: result.autoFillEnabled ?? DEFAULT_SETTINGS.autoFillEnabled,
      });
    } catch (error) {
      console.error('[SettingsModal] Failed to load settings:', error);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await chrome.storage.local.set({
        desktopApiUrl: settings.desktopApiUrl,
        autoFillEnabled: settings.autoFillEnabled,
      });

      // Close modal after brief delay
      setTimeout(() => {
        onClose();
      }, 300);
    } catch (error) {
      console.error('[SettingsModal] Failed to save settings:', error);
      alert('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenFullSettings = async () => {
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
