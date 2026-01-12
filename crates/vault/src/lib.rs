/*!
 * Asterisk Vault - Secure storage for user personal data
 *
 * This crate provides a trait-based vault system that can be swapped
 * between different storage backends (in-memory, encrypted file, etc.)
 */

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use thiserror::Error;

// ============================================================================
// Error Types
// ============================================================================

#[derive(Error, Debug)]
pub enum VaultError {
    #[error("Item not found: {0}")]
    NotFound(String),

    #[error("Invalid key: {0}")]
    InvalidKey(String),

    #[error("Serialization error: {0}")]
    SerializationError(String),

    #[error("Storage error: {0}")]
    StorageError(String),
}

pub type Result<T> = std::result::Result<T, VaultError>;

// ============================================================================
// Data Types
// ============================================================================

/// Tracks where a piece of data came from and when
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Provenance {
    /// How the data was acquired
    pub source: ProvenanceSource,

    /// When the data was created/acquired
    pub timestamp: DateTime<Utc>,

    /// Confidence level in the data (0.0 to 1.0)
    pub confidence: f64,

    /// Optional: Original source URL or file path
    pub origin: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ProvenanceSource {
    UserEntered,
    Imported,
    Autofilled,
}

/// Metadata about when and how a vault item was used
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct VaultMetadata {
    pub created: DateTime<Utc>,
    pub updated: DateTime<Utc>,
    pub last_used: Option<DateTime<Utc>>,
    pub usage_count: u32,
}

impl Default for VaultMetadata {
    fn default() -> Self {
        let now = Utc::now();
        Self {
            created: now,
            updated: now,
            last_used: None,
            usage_count: 0,
        }
    }
}

/// Category for organizing vault items
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum VaultCategory {
    Identity,
    Contact,
    Address,
    Financial,
    Custom,
}

/// A single item stored in the user's vault
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct VaultItem {
    /// Unique identifier for this item
    pub key: String,

    /// The actual data value (encrypted at rest in future versions)
    pub value: String,

    /// User-friendly label for display
    pub label: String,

    /// Category for organization
    pub category: VaultCategory,

    /// Where this data came from
    pub provenance: Provenance,

    /// Storage metadata
    pub metadata: VaultMetadata,
}

impl VaultItem {
    /// Create a new vault item with default metadata
    pub fn new(
        key: impl Into<String>,
        value: impl Into<String>,
        label: impl Into<String>,
        category: VaultCategory,
        provenance: Provenance,
    ) -> Self {
        Self {
            key: key.into(),
            value: value.into(),
            label: label.into(),
            category,
            provenance,
            metadata: VaultMetadata::default(),
        }
    }

    /// Update the item's value and timestamp
    pub fn update_value(&mut self, new_value: impl Into<String>) {
        self.value = new_value.into();
        self.metadata.updated = Utc::now();
    }

    /// Mark the item as used
    pub fn mark_used(&mut self) {
        self.metadata.last_used = Some(Utc::now());
        self.metadata.usage_count += 1;
    }
}

// ============================================================================
// Vault Store Trait
// ============================================================================

/// Trait for swappable vault storage backends
///
/// Implementations can provide different storage strategies:
/// - InMemoryStore (current): Fast, volatile storage for development
/// - EncryptedFileStore (future): Encrypted storage with OS keychain
/// - CloudStore (future): Encrypted cloud sync
pub trait VaultStore: Send + Sync {
    /// Store or update a vault item
    fn set(&mut self, key: String, item: VaultItem) -> Result<()>;

    /// Retrieve a vault item by key
    fn get(&self, key: &str) -> Result<Option<VaultItem>>;

    /// List all vault items
    fn list(&self) -> Result<Vec<VaultItem>>;

    /// Delete a vault item by key
    fn delete(&mut self, key: &str) -> Result<()>;

    /// Check if a key exists
    fn exists(&self, key: &str) -> bool {
        self.get(key).ok().flatten().is_some()
    }

    /// Get the number of items in the vault
    fn len(&self) -> usize {
        self.list().map(|items| items.len()).unwrap_or(0)
    }

    /// Check if the vault is empty
    fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Clear all items from the vault
    fn clear(&mut self) -> Result<()>;
}

// ============================================================================
// In-Memory Store Implementation
// ============================================================================

/// Simple in-memory vault store for development
///
/// This implementation is NOT persistent and NOT encrypted.
/// It's suitable for:
/// - Development and testing
/// - Proof of concept
/// - Temporary storage
///
/// For production, use an encrypted store implementation.
#[derive(Debug, Default)]
pub struct InMemoryStore {
    items: HashMap<String, VaultItem>,
}

impl InMemoryStore {
    /// Create a new empty in-memory store
    pub fn new() -> Self {
        Self {
            items: HashMap::new(),
        }
    }

    /// Create a store with initial items
    pub fn with_items(items: Vec<VaultItem>) -> Self {
        let mut store = Self::new();
        for item in items {
            let _ = store.set(item.key.clone(), item);
        }
        store
    }
}

impl VaultStore for InMemoryStore {
    fn set(&mut self, key: String, item: VaultItem) -> Result<()> {
        if key.is_empty() {
            return Err(VaultError::InvalidKey("Key cannot be empty".to_string()));
        }

        self.items.insert(key, item);
        Ok(())
    }

    fn get(&self, key: &str) -> Result<Option<VaultItem>> {
        Ok(self.items.get(key).cloned())
    }

    fn list(&self) -> Result<Vec<VaultItem>> {
        Ok(self.items.values().cloned().collect())
    }

    fn delete(&mut self, key: &str) -> Result<()> {
        match self.items.remove(key) {
            Some(_) => Ok(()),
            None => Err(VaultError::NotFound(key.to_string())),
        }
    }

    fn clear(&mut self) -> Result<()> {
        self.items.clear();
        Ok(())
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_item(key: &str) -> VaultItem {
        VaultItem::new(
            key,
            "test_value",
            "Test Label",
            VaultCategory::Contact,
            Provenance {
                source: ProvenanceSource::UserEntered,
                timestamp: Utc::now(),
                confidence: 1.0,
                origin: None,
            },
        )
    }

    #[test]
    fn test_in_memory_store_crud() {
        let mut store = InMemoryStore::new();

        // Create
        let item = create_test_item("email");
        store.set("email".to_string(), item.clone()).unwrap();

        // Read
        let retrieved = store.get("email").unwrap().unwrap();
        assert_eq!(retrieved.key, "email");
        assert_eq!(retrieved.value, "test_value");

        // Update
        let mut updated_item = item.clone();
        updated_item.update_value("new_value");
        store.set("email".to_string(), updated_item).unwrap();

        let retrieved = store.get("email").unwrap().unwrap();
        assert_eq!(retrieved.value, "new_value");

        // Delete
        store.delete("email").unwrap();
        assert!(store.get("email").unwrap().is_none());
    }

    #[test]
    fn test_list_items() {
        let mut store = InMemoryStore::new();

        store.set("email".to_string(), create_test_item("email")).unwrap();
        store.set("phone".to_string(), create_test_item("phone")).unwrap();

        let items = store.list().unwrap();
        assert_eq!(items.len(), 2);
    }

    #[test]
    fn test_delete_nonexistent() {
        let mut store = InMemoryStore::new();
        assert!(store.delete("nonexistent").is_err());
    }

    #[test]
    fn test_empty_key() {
        let mut store = InMemoryStore::new();
        let item = create_test_item("");
        assert!(store.set("".to_string(), item).is_err());
    }

    #[test]
    fn test_mark_used() {
        let mut item = create_test_item("test");
        assert_eq!(item.metadata.usage_count, 0);
        assert!(item.metadata.last_used.is_none());

        item.mark_used();
        assert_eq!(item.metadata.usage_count, 1);
        assert!(item.metadata.last_used.is_some());
    }

    #[test]
    fn test_vault_item_update() {
        let mut item = create_test_item("test");
        let original_updated = item.metadata.updated;

        // Wait a tiny bit to ensure timestamp changes
        std::thread::sleep(std::time::Duration::from_millis(10));

        item.update_value("new_value");
        assert_eq!(item.value, "new_value");
        assert!(item.metadata.updated > original_updated);
    }
}
