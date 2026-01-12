use asterisk_vault::{
    InMemoryStore, Provenance, ProvenanceSource, VaultCategory, VaultItem, VaultStore,
};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::State;
use tiny_http::{Header, Response, Server};

// ============================================================================
// State Management
// ============================================================================

/// Application state holding the vault store
pub struct AppState {
    pub vault: Mutex<Box<dyn VaultStore>>,
}

/// Separate state for form snapshots (NOT part of vault)
pub struct FormSnapshotState {
    pub latest: Arc<Mutex<Option<FormSnapshotJson>>>,
}

// ============================================================================
// Vault Serializable Types for IPC
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
// Form Snapshot Types (mirrors TypeScript FormSnapshot)
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SelectOptionJson {
    pub value: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FieldNodeJson {
    pub id: String,
    pub name: String,
    pub label: String,
    #[serde(rename = "type")]
    pub field_type: String,
    pub semantic: String,
    pub required: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub validation: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub autocomplete: Option<String>,
    #[serde(rename = "maxLength", skip_serializing_if = "Option::is_none")]
    pub max_length: Option<u32>,
    #[serde(rename = "minLength", skip_serializing_if = "Option::is_none")]
    pub min_length: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub placeholder: Option<String>,
    #[serde(rename = "inputMode", skip_serializing_if = "Option::is_none")]
    pub input_mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub options: Option<Vec<SelectOptionJson>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FormFingerprintJson {
    #[serde(rename = "fieldCount")]
    pub field_count: u32,
    #[serde(rename = "fieldTypes")]
    pub field_types: Vec<String>,
    #[serde(rename = "requiredCount")]
    pub required_count: u32,
    pub hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FormSnapshotJson {
    pub url: String,
    pub domain: String,
    pub title: String,
    #[serde(rename = "capturedAt")]
    pub captured_at: String,
    pub fingerprint: FormFingerprintJson,
    pub fields: Vec<FieldNodeJson>,
}

// ============================================================================
// Type Conversions (Vault)
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
// Tauri Commands - Vault
// ============================================================================

#[tauri::command]
fn vault_set(key: String, item: VaultItemJson, state: State<AppState>) -> Result<(), String> {
    let vault_item = VaultItem::try_from(item)?;
    let mut vault = state.vault.lock().map_err(|e| e.to_string())?;
    vault.set(key, vault_item).map_err(|e| e.to_string())
}

#[tauri::command]
fn vault_get(key: String, state: State<AppState>) -> Result<Option<VaultItemJson>, String> {
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
// Tauri Commands - Form Snapshots
// ============================================================================

#[tauri::command]
fn get_latest_form_snapshot(
    state: State<FormSnapshotState>,
) -> Result<Option<FormSnapshotJson>, String> {
    let latest = state.latest.lock().map_err(|e| e.to_string())?;
    Ok(latest.clone())
}

// ============================================================================
// HTTP Server for Extension Bridge
// ============================================================================

fn start_http_server(snapshot_store: Arc<Mutex<Option<FormSnapshotJson>>>) {
    thread::spawn(move || {
        let server = match Server::http("127.0.0.1:17373") {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[Asterisk HTTP] Failed to start server: {}", e);
                return;
            }
        };

        println!("[Asterisk HTTP] Server listening on http://127.0.0.1:17373");

        for mut request in server.incoming_requests() {
            let url = request.url().to_string();
            let method = request.method().to_string();

            // CORS headers for extension requests
            let cors_headers = vec![
                Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap(),
                Header::from_bytes(
                    &b"Access-Control-Allow-Methods"[..],
                    &b"GET, POST, OPTIONS"[..],
                )
                .unwrap(),
                Header::from_bytes(
                    &b"Access-Control-Allow-Headers"[..],
                    &b"Content-Type"[..],
                )
                .unwrap(),
            ];

            // Handle CORS preflight
            if method == "OPTIONS" {
                let mut response = Response::empty(204);
                for header in cors_headers {
                    response.add_header(header);
                }
                let _ = request.respond(response);
                continue;
            }

            // Route: GET /health
            if method == "GET" && url == "/health" {
                let mut response = Response::from_string("OK");
                for header in cors_headers {
                    response.add_header(header);
                }
                let _ = request.respond(response);
                continue;
            }

            // Route: GET /v1/form-snapshots (for browser fallback)
            if method == "GET" && url == "/v1/form-snapshots" {
                let json_response = match snapshot_store.lock() {
                    Ok(store) => match &*store {
                        Some(snapshot) => serde_json::to_string(snapshot).unwrap_or_else(|_| "null".to_string()),
                        None => "null".to_string(),
                    },
                    Err(_) => "null".to_string(),
                };
                let mut response = Response::from_string(json_response);
                response.add_header(
                    Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..])
                        .unwrap(),
                );
                for header in cors_headers {
                    response.add_header(header);
                }
                let _ = request.respond(response);
                continue;
            }

            // Route: POST /v1/form-snapshots
            if method == "POST" && url == "/v1/form-snapshots" {
                let mut body = String::new();
                if let Err(e) = request.as_reader().read_to_string(&mut body) {
                    eprintln!("[Asterisk HTTP] Failed to read body: {}", e);
                    let mut response = Response::from_string("Bad Request").with_status_code(400);
                    for header in cors_headers {
                        response.add_header(header);
                    }
                    let _ = request.respond(response);
                    continue;
                }

                match serde_json::from_str::<FormSnapshotJson>(&body) {
                    Ok(snapshot) => {
                        println!(
                            "[Asterisk HTTP] Received form snapshot: {} ({} fields)",
                            snapshot.domain,
                            snapshot.fields.len()
                        );

                        // Store the snapshot
                        if let Ok(mut store) = snapshot_store.lock() {
                            *store = Some(snapshot);
                        }

                        let mut response = Response::from_string(r#"{"status":"ok"}"#);
                        response.add_header(
                            Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..])
                                .unwrap(),
                        );
                        for header in cors_headers {
                            response.add_header(header);
                        }
                        let _ = request.respond(response);
                    }
                    Err(e) => {
                        eprintln!("[Asterisk HTTP] Invalid JSON: {}", e);
                        let mut response =
                            Response::from_string(format!(r#"{{"error":"{}"}}"#, e))
                                .with_status_code(400);
                        response.add_header(
                            Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..])
                                .unwrap(),
                        );
                        for header in cors_headers {
                            response.add_header(header);
                        }
                        let _ = request.respond(response);
                    }
                }
                continue;
            }

            // 404 for unknown routes
            let mut response = Response::from_string("Not Found").with_status_code(404);
            for header in cors_headers {
                response.add_header(header);
            }
            let _ = request.respond(response);
        }
    });
}

// ============================================================================
// App Entry Point
// ============================================================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize vault store (in-memory for now)
    let vault_store: Box<dyn VaultStore> = Box::new(InMemoryStore::new());

    // Initialize form snapshot store (separate from vault)
    let snapshot_store: Arc<Mutex<Option<FormSnapshotJson>>> = Arc::new(Mutex::new(None));

    // Start HTTP server for extension bridge
    start_http_server(Arc::clone(&snapshot_store));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AppState {
            vault: Mutex::new(vault_store),
        })
        .manage(FormSnapshotState {
            latest: snapshot_store,
        })
        .invoke_handler(tauri::generate_handler![
            vault_set,
            vault_get,
            vault_list,
            vault_delete,
            get_latest_form_snapshot,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
