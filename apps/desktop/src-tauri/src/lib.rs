use asterisk_vault::{
    InMemoryStore, Provenance, ProvenanceSource, VaultCategory, VaultItem, VaultStore,
};
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::State;
use tiny_http::{Header, Response, Server};

// ============================================================================
// State Management
// ============================================================================

/// Application state holding the vault store
pub struct AppState {
    pub vault: Arc<Mutex<Box<dyn VaultStore>>>,
}

/// Separate state for form snapshots (NOT part of vault)
pub struct FormSnapshotState {
    pub latest: Arc<Mutex<Option<FormSnapshotJson>>>,
}

/// State for pending fill commands (desktop → extension)
pub struct FillCommandState {
    pub commands: Arc<Mutex<Vec<FillCommandJson>>>,
}

/// State for audit log storage
pub struct AuditState {
    pub log_path: PathBuf,
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
// Fill Command Types (desktop → extension communication)
// ============================================================================

/// A single field fill instruction
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FieldFillJson {
    /// The field ID to fill (matches FieldNode.id)
    #[serde(rename = "fieldId")]
    pub field_id: String,
    /// The value to fill into the field
    pub value: String,
}

/// Command sent from desktop to extension to fill a form
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FillCommandJson {
    /// Unique command ID for deduplication
    pub id: String,
    /// Domain to match (e.g., 'github.com')
    #[serde(rename = "targetDomain")]
    pub target_domain: String,
    /// URL pattern to match (optional)
    #[serde(rename = "targetUrl", skip_serializing_if = "Option::is_none")]
    pub target_url: Option<String>,
    /// Fields to fill with their values
    pub fills: Vec<FieldFillJson>,
    /// When the command was created (ISO 8601)
    #[serde(rename = "createdAt")]
    pub created_at: String,
    /// Command expires after this time (ISO 8601)
    #[serde(rename = "expiresAt")]
    pub expires_at: String,
}

// ============================================================================
// Audit Log Types (mirrors TypeScript audit.ts)
// ============================================================================

/// Redaction level applied to a value in the audit log
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RedactionLevel {
    None,
    Partial,
    Masked,
}

/// Disposition category for a fill recommendation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Disposition {
    Safe,
    Review,
    Blocked,
}

/// A single field in an audit entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditItemJson {
    /// The DOM element ID of the field
    #[serde(rename = "fieldId")]
    pub field_id: String,
    /// Human-readable label for the field
    pub label: String,
    /// Field type (text, email, tel, etc.)
    pub kind: String,
    /// Confidence score for the match (0-1)
    pub confidence: f64,
    /// Disposition category based on confidence
    pub disposition: Disposition,
    /// Whether this field was actually applied
    pub applied: bool,
    /// The vault key that provided the value
    pub source: String,
    /// Redacted version of the old (original) value
    #[serde(rename = "oldValueRedacted")]
    pub old_value_redacted: String,
    /// Redacted version of the new (filled) value
    #[serde(rename = "newValueRedacted")]
    pub new_value_redacted: String,
    /// Level of redaction applied
    pub redaction: RedactionLevel,
    /// Whether user explicitly confirmed this field
    #[serde(rename = "userConfirmed")]
    pub user_confirmed: bool,
    /// Optional notes (e.g., "undo", "user override")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
}

/// Summary statistics for an audit entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditSummaryJson {
    /// Total fields in the fill plan
    #[serde(rename = "plannedCount")]
    pub planned_count: u32,
    /// Fields that were actually applied
    #[serde(rename = "appliedCount")]
    pub applied_count: u32,
    /// Fields that were blocked (low confidence)
    #[serde(rename = "blockedCount")]
    pub blocked_count: u32,
    /// Fields that required user review
    #[serde(rename = "reviewedCount")]
    pub reviewed_count: u32,
}

/// A single audit log entry representing one fill operation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditEntryJson {
    /// Unique identifier (UUID)
    pub id: String,
    /// ISO timestamp when the operation occurred
    #[serde(rename = "createdAt")]
    pub created_at: String,
    /// Full URL where the form was filled
    pub url: String,
    /// Domain of the form
    pub domain: String,
    /// Form fingerprint hash for identification
    pub fingerprint: String,
    /// Summary statistics
    pub summary: AuditSummaryJson,
    /// Individual field items
    pub items: Vec<AuditItemJson>,
}

/// Response from audit_list command with pagination support
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditListResponse {
    /// List of audit entries
    pub items: Vec<AuditEntryJson>,
    /// Cursor for next page, if more entries exist
    #[serde(rename = "nextCursor", skip_serializing_if = "Option::is_none")]
    pub next_cursor: Option<u32>,
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
// Tauri Commands - Audit Log
// ============================================================================

/// Append a new audit entry to the log file
#[tauri::command]
fn audit_append(entry: AuditEntryJson, state: State<AuditState>) -> Result<(), String> {
    // Ensure parent directory exists
    if let Some(parent) = state.log_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create audit directory: {}", e))?;
    }

    // Serialize to JSON line
    let json_line =
        serde_json::to_string(&entry).map_err(|e| format!("Failed to serialize entry: {}", e))?;

    // Append to file
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&state.log_path)
        .map_err(|e| format!("Failed to open audit log: {}", e))?;

    writeln!(file, "{}", json_line).map_err(|e| format!("Failed to write audit entry: {}", e))?;

    println!(
        "[Asterisk Audit] Logged entry {} for {}",
        entry.id, entry.domain
    );
    Ok(())
}

/// List audit entries with optional pagination
#[tauri::command]
fn audit_list(
    limit: Option<u32>,
    cursor: Option<u32>,
    state: State<AuditState>,
) -> Result<AuditListResponse, String> {
    let limit = limit.unwrap_or(50).min(100) as usize;
    let start = cursor.unwrap_or(0) as usize;

    // Read all entries from file
    let file = match fs::File::open(&state.log_path) {
        Ok(f) => f,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            // No audit log yet, return empty
            return Ok(AuditListResponse {
                items: vec![],
                next_cursor: None,
            });
        }
        Err(e) => return Err(format!("Failed to open audit log: {}", e)),
    };

    let reader = BufReader::new(file);
    let mut entries: Vec<AuditEntryJson> = Vec::new();

    for line in reader.lines() {
        let line = line.map_err(|e| format!("Failed to read line: {}", e))?;
        if line.trim().is_empty() {
            continue;
        }
        match serde_json::from_str::<AuditEntryJson>(&line) {
            Ok(entry) => entries.push(entry),
            Err(e) => {
                eprintln!("[Asterisk Audit] Skipping malformed entry: {}", e);
                continue;
            }
        }
    }

    // Sort by createdAt descending (newest first)
    entries.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    // Apply pagination
    let total = entries.len();
    let page: Vec<AuditEntryJson> = entries.into_iter().skip(start).take(limit).collect();

    let next_cursor = if start + page.len() < total {
        Some((start + page.len()) as u32)
    } else {
        None
    };

    Ok(AuditListResponse {
        items: page,
        next_cursor,
    })
}

/// Get a single audit entry by ID
#[tauri::command]
fn audit_get(id: String, state: State<AuditState>) -> Result<Option<AuditEntryJson>, String> {
    let file = match fs::File::open(&state.log_path) {
        Ok(f) => f,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Ok(None);
        }
        Err(e) => return Err(format!("Failed to open audit log: {}", e)),
    };

    let reader = BufReader::new(file);

    for line in reader.lines() {
        let line = line.map_err(|e| format!("Failed to read line: {}", e))?;
        if line.trim().is_empty() {
            continue;
        }
        if let Ok(entry) = serde_json::from_str::<AuditEntryJson>(&line) {
            if entry.id == id {
                return Ok(Some(entry));
            }
        }
    }

    Ok(None)
}

/// Clear all audit log entries (deletes the file)
#[tauri::command]
fn audit_clear(state: State<AuditState>) -> Result<(), String> {
    match fs::remove_file(&state.log_path) {
        Ok(_) => {
            println!("[Asterisk Audit] Audit log cleared");
            Ok(())
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            // File doesn't exist, that's fine
            Ok(())
        }
        Err(e) => Err(format!("Failed to clear audit log: {}", e)),
    }
}

/// Get the file path of the audit log
#[tauri::command]
fn audit_path(state: State<AuditState>) -> Result<String, String> {
    state
        .log_path
        .to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Invalid audit path".to_string())
}

// ============================================================================
// HTTP Server for Extension Bridge
// ============================================================================

fn start_http_server(
    snapshot_store: Arc<Mutex<Option<FormSnapshotJson>>>,
    vault_store: Arc<Mutex<Box<dyn VaultStore>>>,
    fill_command_store: Arc<Mutex<Vec<FillCommandJson>>>,
) {
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
                    &b"GET, POST, DELETE, OPTIONS"[..],
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

            // Route: GET /v1/vault (list all vault items)
            if method == "GET" && url == "/v1/vault" {
                let json_response = match vault_store.lock() {
                    Ok(vault) => match vault.list() {
                        Ok(items) => {
                            let json_items: Vec<VaultItemJson> =
                                items.into_iter().map(VaultItemJson::from).collect();
                            serde_json::to_string(&json_items).unwrap_or_else(|_| "[]".to_string())
                        }
                        Err(_) => "[]".to_string(),
                    },
                    Err(_) => "[]".to_string(),
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

            // Route: POST /v1/vault (add a vault item)
            if method == "POST" && url == "/v1/vault" {
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

                match serde_json::from_str::<VaultItemJson>(&body) {
                    Ok(item_json) => {
                        let key = item_json.key.clone();
                        match VaultItem::try_from(item_json) {
                            Ok(vault_item) => {
                                if let Ok(mut vault) = vault_store.lock() {
                                    let _ = vault.set(key, vault_item);
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
                    }
                    Err(e) => {
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

            // Route: DELETE /v1/vault?key=xxx (delete a vault item)
            if method == "DELETE" && url.starts_with("/v1/vault?key=") {
                let key = url.strip_prefix("/v1/vault?key=").unwrap_or("");
                let key = urlencoding::decode(key).unwrap_or_default().to_string();

                if let Ok(mut vault) = vault_store.lock() {
                    let _ = vault.delete(&key);
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
                continue;
            }

            // Route: POST /v1/fill-commands (desktop sends a fill command)
            if method == "POST" && url == "/v1/fill-commands" {
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

                match serde_json::from_str::<FillCommandJson>(&body) {
                    Ok(command) => {
                        println!(
                            "[Asterisk HTTP] Received fill command: {} -> {} fields",
                            command.target_domain,
                            command.fills.len()
                        );

                        // Store the command
                        if let Ok(mut store) = fill_command_store.lock() {
                            // Remove any existing command with same ID
                            store.retain(|c| c.id != command.id);
                            store.push(command);
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
                        eprintln!("[Asterisk HTTP] Invalid fill command JSON: {}", e);
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

            // Route: GET /v1/fill-commands?domain=xxx (extension polls for commands)
            if method == "GET" && url.starts_with("/v1/fill-commands") {
                let domain = if url.contains("?domain=") {
                    url.split("?domain=").nth(1).map(|s| {
                        urlencoding::decode(s).unwrap_or_default().to_string()
                    })
                } else {
                    None
                };

                let json_response = match fill_command_store.lock() {
                    Ok(store) => {
                        // Filter by domain if specified, also filter out expired commands
                        let now = chrono::Utc::now().to_rfc3339();
                        let commands: Vec<&FillCommandJson> = store
                            .iter()
                            .filter(|c| c.expires_at > now)
                            .filter(|c| domain.as_ref().map_or(true, |d| &c.target_domain == d))
                            .collect();
                        serde_json::to_string(&commands).unwrap_or_else(|_| "[]".to_string())
                    }
                    Err(_) => "[]".to_string(),
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

            // Route: DELETE /v1/fill-commands?id=xxx (extension acknowledges command completion)
            if method == "DELETE" && url.starts_with("/v1/fill-commands?id=") {
                let id = url.strip_prefix("/v1/fill-commands?id=").unwrap_or("");
                let id = urlencoding::decode(id).unwrap_or_default().to_string();

                if let Ok(mut store) = fill_command_store.lock() {
                    store.retain(|c| c.id != id);
                }
                println!("[Asterisk HTTP] Fill command completed: {}", id);
                let mut response = Response::from_string(r#"{"status":"ok"}"#);
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
    let vault_store: Arc<Mutex<Box<dyn VaultStore>>> =
        Arc::new(Mutex::new(Box::new(InMemoryStore::new())));

    // Initialize form snapshot store (separate from vault)
    let snapshot_store: Arc<Mutex<Option<FormSnapshotJson>>> = Arc::new(Mutex::new(None));

    // Initialize fill command store (desktop → extension)
    let fill_command_store: Arc<Mutex<Vec<FillCommandJson>>> = Arc::new(Mutex::new(Vec::new()));

    // Initialize audit log path (in app data directory)
    let audit_log_path = dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("asterisk")
        .join("audit.jsonl");

    // Start HTTP server for extension bridge
    start_http_server(
        Arc::clone(&snapshot_store),
        Arc::clone(&vault_store),
        Arc::clone(&fill_command_store),
    );

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AppState {
            vault: Arc::clone(&vault_store),
        })
        .manage(FormSnapshotState {
            latest: snapshot_store,
        })
        .manage(FillCommandState {
            commands: fill_command_store,
        })
        .manage(AuditState {
            log_path: audit_log_path,
        })
        .invoke_handler(tauri::generate_handler![
            vault_set,
            vault_get,
            vault_list,
            vault_delete,
            get_latest_form_snapshot,
            audit_append,
            audit_list,
            audit_get,
            audit_clear,
            audit_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
