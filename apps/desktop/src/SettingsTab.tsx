import { useState, useEffect, useCallback } from 'react';

// Check if we're running in Tauri context
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// ============================================================================
// Types
// ============================================================================

interface Settings {
  apiKey: string;
  useLlmMatching: boolean;
  llmModel: string;
}

const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  useLlmMatching: false,
  llmModel: 'claude-sonnet-4-5-20250929',
};

const STORAGE_KEY = 'asterisk_settings';

// ============================================================================
// Settings Storage
// ============================================================================

async function loadSettings(): Promise<Settings> {
  try {
    if (isTauri) {
      // In Tauri, check if API key is set and load other settings from localStorage
      const { invoke } = await import('@tauri-apps/api/core');
      try {
        const hasApiKey = await invoke<boolean>('has_api_key');
        const stored = localStorage.getItem(STORAGE_KEY);
        const localSettings = stored ? JSON.parse(stored) : DEFAULT_SETTINGS;

        // If we have an API key in Tauri state, preserve the placeholder
        if (hasApiKey && !localSettings.apiKey) {
          localSettings.apiKey = '••••••••••••••••';
        }

        return localSettings;
      } catch {
        // Settings command not available yet, fall back to localStorage
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : DEFAULT_SETTINGS;
      }
    } else {
      // In browser, use localStorage
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : DEFAULT_SETTINGS;
    }
  } catch (err) {
    console.error('Failed to load settings:', err);
    return DEFAULT_SETTINGS;
  }
}

async function saveSettings(settings: Settings): Promise<void> {
  try {
    if (isTauri) {
      // In Tauri, save API key via command and other settings via localStorage
      const { invoke } = await import('@tauri-apps/api/core');

      // Save API key to Tauri state if it's not the placeholder
      if (settings.apiKey && settings.apiKey !== '••••••••••••••••') {
        await invoke('set_api_key', { apiKey: settings.apiKey });
      }

      // Save other settings to localStorage (excluding actual API key)
      const settingsToStore = {
        ...settings,
        apiKey: '', // Don't store actual API key in localStorage
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settingsToStore));
    } else {
      // In browser, use localStorage
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    }
  } catch (err) {
    console.error('Failed to save settings:', err);
    throw err;
  }
}

// ============================================================================
// Component
// ============================================================================

export function SettingsTab() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);

  // Load settings on mount
  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const loaded = await loadSettings();
      setSettings(loaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Save settings
  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      await saveSettings(settings);
      setSuccess('Settings saved successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  // Validate API key format (basic check)
  const isValidApiKey = (key: string): boolean => {
    // Anthropic API keys start with "sk-ant-" and are fairly long
    return key === '' || (key.startsWith('sk-ant-') && key.length > 20);
  };

  // Test API key connection
  const handleTestConnection = async () => {
    if (!settings.apiKey) {
      setError('Please enter an API key first');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      // Test with a minimal API call
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': settings.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: settings.llmModel,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      });

      if (response.ok) {
        setSuccess('API key is valid! Connection successful.');
      } else {
        const data = await response.json().catch(() => ({}));
        setError(`API error: ${data.error?.message || response.statusText}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection test failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="settings-loading">Loading settings...</div>;
  }

  return (
    <div className="settings-tab">
      <section className="settings-section">
        <h2>API Configuration</h2>
        <p className="settings-description">
          Configure your Claude API key to enable LLM-powered matching for ambiguous form fields.
        </p>

        {/* API Key Input */}
        <div className="form-group">
          <label htmlFor="apiKey">Claude API Key</label>
          <div className="api-key-input">
            <input
              id="apiKey"
              type={showApiKey ? 'text' : 'password'}
              value={settings.apiKey}
              onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
              placeholder="sk-ant-..."
              disabled={saving}
              className={!isValidApiKey(settings.apiKey) ? 'invalid' : ''}
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="toggle-visibility"
              title={showApiKey ? 'Hide API key' : 'Show API key'}
            >
              {showApiKey ? '👁️' : '👁️‍🗨️'}
            </button>
          </div>
          {settings.apiKey && !isValidApiKey(settings.apiKey) && (
            <small className="field-error">
              API key should start with "sk-ant-"
            </small>
          )}
          <small className="field-hint">
            Get your API key from{' '}
            <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer">
              console.anthropic.com
            </a>
          </small>
        </div>

        {/* Model Selection */}
        <div className="form-group">
          <label htmlFor="llmModel">Model</label>
          <select
            id="llmModel"
            value={settings.llmModel}
            onChange={(e) => setSettings({ ...settings, llmModel: e.target.value })}
            disabled={saving}
          >
            <option value="claude-sonnet-4-5-20250929">Claude Sonnet 4.5 (Recommended)</option>
            <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5 (Faster)</option>
            <option value="claude-opus-4-5-20251101">Claude Opus 4.5 (Most capable)</option>
          </select>
        </div>

        {/* Test Connection Button */}
        <div className="button-group">
          <button
            onClick={handleTestConnection}
            disabled={saving || !settings.apiKey}
            className="secondary-btn"
          >
            {saving ? 'Testing...' : 'Test Connection'}
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h2>Matching Options</h2>

        {/* LLM Matching Toggle */}
        <div className="form-group toggle-group">
          <label htmlFor="useLlmMatching" className="toggle-label">
            <input
              id="useLlmMatching"
              type="checkbox"
              checked={settings.useLlmMatching}
              onChange={(e) => setSettings({ ...settings, useLlmMatching: e.target.checked })}
              disabled={saving || !settings.apiKey}
            />
            <span className="toggle-text">
              Use LLM for ambiguous fields
            </span>
          </label>
          <small className="field-hint">
            When enabled, fields that can't be matched via autocomplete hints will be analyzed
            using Claude to determine the best vault match. Requires valid API key.
          </small>
        </div>
      </section>

      {/* Messages */}
      {error && (
        <div className="settings-error">
          <strong>Error:</strong> {error}
        </div>
      )}
      {success && (
        <div className="settings-success">
          {success}
        </div>
      )}

      {/* Save Button */}
      <div className="settings-actions">
        <button
          onClick={handleSave}
          disabled={saving || !isValidApiKey(settings.apiKey)}
          className="primary-btn"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      {/* Info Section */}
      <section className="settings-info">
        <h3>About LLM Matching</h3>
        <p>
          Asterisk uses a hybrid approach to match form fields to your vault data:
        </p>
        <ul>
          <li>
            <strong>Tier 1 - Autocomplete:</strong> High-confidence matching via HTML autocomplete attributes (95% confidence)
          </li>
          <li>
            <strong>Tier 2 - Pattern:</strong> Matching via field name and label patterns (70-90% confidence)
          </li>
          <li>
            <strong>Tier 3 - LLM:</strong> Semantic analysis for ambiguous fields (requires API key)
          </li>
        </ul>
        <p className="security-note">
          <strong>Security:</strong> Your API key is stored locally and never sent to Asterisk servers.
          LLM requests only include field metadata (label, type, placeholder) - never your vault values.
        </p>
      </section>
    </div>
  );
}

export default SettingsTab;
