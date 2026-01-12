import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './App.css';

interface VaultItem {
  key: string;
  value: string;
  label: string;
  category: string;
  provenance: {
    source: string;
    timestamp: string;
    confidence: number;
    origin?: string;
  };
  metadata: {
    created: string;
    updated: string;
    last_used?: string;
    usage_count: number;
  };
}

function App() {
  const [items, setItems] = useState<VaultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState<string>('contact');

  // Load vault items on mount
  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await invoke<VaultItem[]>('vault_list');
      setItems(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!key || !value || !label) {
      setError('Please fill in all fields');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const newItem: VaultItem = {
        key,
        value,
        label,
        category,
        provenance: {
          source: 'user_entered',
          timestamp: new Date().toISOString(),
          confidence: 1.0,
        },
        metadata: {
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          usage_count: 0,
        },
      };

      await invoke('vault_set', { key, item: newItem });

      // Clear form
      setKey('');
      setValue('');
      setLabel('');
      setCategory('contact');

      // Reload items
      await loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (itemKey: string) => {
    if (!confirm(`Delete "${itemKey}"?`)) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await invoke('vault_delete', { key: itemKey });
      await loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <header className="header">
        <h1>Asterisk Vault</h1>
        <p>Securely manage your personal data</p>
      </header>

      <main className="main">
        {/* Add Item Form */}
        <section className="form-section">
          <h2>Add New Item</h2>
          <form onSubmit={handleAdd} className="add-form">
            <div className="form-group">
              <label htmlFor="key">Key</label>
              <input
                id="key"
                type="text"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="e.g., email_personal"
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="label">Label</label>
              <input
                id="label"
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g., Personal Email"
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="value">Value</label>
              <input
                id="value"
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="e.g., you@example.com"
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="category">Category</label>
              <select
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                disabled={loading}
              >
                <option value="identity">Identity</option>
                <option value="contact">Contact</option>
                <option value="address">Address</option>
                <option value="financial">Financial</option>
                <option value="custom">Custom</option>
              </select>
            </div>

            <button type="submit" disabled={loading}>
              {loading ? 'Adding...' : 'Add Item'}
            </button>
          </form>
        </section>

        {/* Error Display */}
        {error && (
          <div className="error">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Items List */}
        <section className="items-section">
          <div className="items-header">
            <h2>Vault Items ({items.length})</h2>
            <button onClick={loadItems} disabled={loading}>
              Refresh
            </button>
          </div>

          {loading && items.length === 0 ? (
            <p className="loading">Loading...</p>
          ) : items.length === 0 ? (
            <p className="empty">No items in vault. Add one above!</p>
          ) : (
            <div className="items-list">
              {items.map((item) => (
                <div key={item.key} className="item-card">
                  <div className="item-header">
                    <div>
                      <h3>{item.label}</h3>
                      <span className="item-category">{item.category}</span>
                    </div>
                    <button
                      onClick={() => handleDelete(item.key)}
                      className="delete-btn"
                      disabled={loading}
                    >
                      Delete
                    </button>
                  </div>
                  <div className="item-body">
                    <div className="item-field">
                      <strong>Key:</strong> {item.key}
                    </div>
                    <div className="item-field">
                      <strong>Value:</strong> {item.value}
                    </div>
                    <div className="item-meta">
                      <small>
                        Created: {new Date(item.metadata.created).toLocaleString()}
                      </small>
                      {item.metadata.usage_count > 0 && (
                        <small>Used {item.metadata.usage_count} times</small>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
