use asterisk_vault::{
    InMemoryStore, Provenance, ProvenanceSource, VaultCategory, VaultItem, VaultStore,
};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;

// ============================================================================
// State Management
// ============================================================================

/// Application state holding the vault store
pub struct AppState {
    pub vault: Mutex<Box<dyn VaultStore>>,
}

// ============================================================================
// Serializable Types for IPC
// ============================================================================

/// Simplified VaultItem for JSON serialization across IPC
/// Mirrors the TypeScript VaultItem type
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultItemJson {
    pub key: String,
    pub value: String,
    pub label: String,
    pub category: String,
    pub provenance: ProvenanceJson,
    pub metadata: VaultMetadataJson,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProvenanceJson {
    pub source: String,
    pub timestamp: String,
    pub confidence: f64,
    pub origin: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultMetadataJson {
    pub created: String,
    pub updated: String,
    pub last_used: Option<String>,
    pub usage_count: u32,
}

// ============================================================================
// Type Conversions
// ============================================================================

impl From<VaultItem> for VaultItemJson {
    fn from(item: VaultItem) -> Self {
        Self {
            key: item.key,
            value: item.value,
            label: item.label,
            category: match item.category {
                VaultCategory::Identity => "identity".to_string(),
                VaultCategory::Contact => "contact".to_string(),
                VaultCategory::Address => "address".to_string(),
                VaultCategory::Financial => "financial".to_string(),
                VaultCategory::Custom => "custom".to_string(),
            },
            provenance: ProvenanceJson {
                source: match item.provenance.source {
                    ProvenanceSource::UserEntered => "user_entered".to_string(),
                    ProvenanceSource::Imported => "imported".to_string(),
                    ProvenanceSource::Autofilled => "autofilled".to_string(),
                },
                timestamp: item.provenance.timestamp.to_rfc3339(),
                confidence: item.provenance.confidence,
                origin: item.provenance.origin,
            },
            metadata: VaultMetadataJson {
                created: item.metadata.created.to_rfc3339(),
                updated: item.metadata.updated.to_rfc3339(),
                last_used: item.metadata.last_used.map(|dt| dt.to_rfc3339()),
                usage_count: item.metadata.usage_count,
            },
        }
    }
}

impl TryFrom<VaultItemJson> for VaultItem {
    type Error = String;

    fn try_from(json: VaultItemJson) -> Result<Self, Self::Error> {
        use chrono::DateTime;

        let category = match json.category.as_str() {
            "identity" => VaultCategory::Identity,
            "contact" => VaultCategory::Contact,
            "address" => VaultCategory::Address,
            "financial" => VaultCategory::Financial,
            "custom" => VaultCategory::Custom,
            _ => return Err(format!("Invalid category: {}", json.category)),
        };

        let source = match json.provenance.source.as_str() {
            "user_entered" => ProvenanceSource::UserEntered,
            "imported" => ProvenanceSource::Imported,
            "autofilled" => ProvenanceSource::Autofilled,
            _ => return Err(format!("Invalid source: {}", json.provenance.source)),
        };

        let timestamp = DateTime::parse_from_rfc3339(&json.provenance.timestamp)
            .map_err(|e| format!("Invalid timestamp: {}", e))?
            .with_timezone(&chrono::Utc);

        let created = DateTime::parse_from_rfc3339(&json.metadata.created)
            .map_err(|e| format!("Invalid created timestamp: {}", e))?
            .with_timezone(&chrono::Utc);

        let updated = DateTime::parse_from_rfc3339(&json.metadata.updated)
            .map_err(|e| format!("Invalid updated timestamp: {}", e))?
            .with_timezone(&chrono::Utc);

        let last_used = json
            .metadata
            .last_used
            .map(|s| {
                DateTime::parse_from_rfc3339(&s)
                    .map(|dt| dt.with_timezone(&chrono::Utc))
                    .map_err(|e| format!("Invalid last_used timestamp: {}", e))
            })
            .transpose()?;

        Ok(VaultItem {
            key: json.key,
            value: json.value,
            label: json.label,
            category,
            provenance: Provenance {
                source,
                timestamp,
                confidence: json.provenance.confidence,
                origin: json.provenance.origin,
            },
            metadata: asterisk_vault::VaultMetadata {
                created,
                updated,
                last_used,
                usage_count: json.metadata.usage_count,
            },
        })
    }
}

// ============================================================================
// Tauri Commands
// ============================================================================

#[tauri::command]
fn vault_set(
    key: String,
    item: VaultItemJson,
    state: State<AppState>,
) -> Result<(), String> {
    let vault_item = VaultItem::try_from(item)?;
    let mut vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault.set(key, vault_item).map_err(|e| e.to_string())
}

#[tauri::command]
fn vault_get(
    key: String,
    state: State<AppState>,
) -> Result<Option<VaultItemJson>, String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault
        .get(&key)
        .map(|opt| opt.map(VaultItemJson::from))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn vault_list(state: State<AppState>) -> Result<Vec<VaultItemJson>, String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault
        .list()
        .map(|items| items.into_iter().map(VaultItemJson::from).collect())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn vault_delete(key: String, state: State<AppState>) -> Result<(), String> {
    let mut vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault.delete(&key).map_err(|e| e.to_string())
}

// ============================================================================
// App Entry Point
// ============================================================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize vault store (in-memory for now)
    let vault_store: Box<dyn VaultStore> = Box::new(InMemoryStore::new());

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AppState {
            vault: Mutex::new(vault_store),
        })
        .invoke_handler(tauri::generate_handler![
            vault_set,
            vault_get,
            vault_list,
            vault_delete,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
