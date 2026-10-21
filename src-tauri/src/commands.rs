use std::sync::{Arc, Mutex};
use tauri::ipc::Channel;
use tauri::State;
use uuid::Uuid;
use zeroize::Zeroize;

use crate::crypto;
use crate::db::Database;
use crate::models::{
    BackupData, BackupEnvelope, BackupSummary, CreateGroupInput, CreateHostInput,
    CreateIdentityInput, CreateSnippetInput, CreateTunnelInput, Host, HostGroup, Identity,
    ImportResultSummary, ImportSshHostsInput, ImportTermiusInput, SerialConnectOptions,
    SerialPortInfo, ServerMetrics, Snippet, SshConfigHostCandidate, SshConfigParseResult,
    TelnetConnectOptions, TermiusParseResult, Tunnel, UpdateHostInput, UpdateSnippetInput,
    VaultStatus,
};
use crate::monitor;
use crate::serial::{self, SerialSessionManager};
use crate::sftp::{self, FileEntry};
use crate::ssh::{SshEvent, SshManager};
use crate::ssh_config_parser;
use crate::telnet::TelnetSessionManager;
use crate::third_party_importer;
use crate::tunnels::{TunnelManager, TunnelRuntimeStatus};

pub struct AppState {
    pub db: Arc<Database>,
    pub active_key: Mutex<Option<[u8; 32]>>,
    pub ssh_manager: Arc<SshManager>,
    pub tunnel_manager: Arc<TunnelManager>,
    pub serial_manager: Arc<SerialSessionManager>,
    pub telnet_manager: Arc<TelnetSessionManager>,
    pub sftp_manager: Arc<sftp::SftpManager>,
}

impl AppState {
    /// Returns the active 32-byte encryption key.
    /// If a master password is set and the vault is locked, returns an error.
    /// If no master password is set, derives a transparent local-device key using the unique vault salt.
    pub fn get_encryption_key(&self) -> Result<[u8; 32], String> {
        let (salt, _hash, is_password_enabled) = self
            .db
            .get_vault_salt_and_hash()
            .map_err(|e| format!("Database error while checking vault salt: {}", e))?;

        if is_password_enabled {
            let guard = self.active_key.lock().unwrap();
            match *guard {
                Some(key) => Ok(key),
                None => Err("Vault is locked. Please unlock with master password.".into()),
            }
        } else {
            // Master password is not enabled: derive a deterministic device-level key from unique salt
            crypto::derive_key("haze_ssh_device_key", salt.as_bytes())
                .map_err(|e| format!("Failed to derive local device encryption key: {}", e))
        }
    }
}

// --- Vault Commands ---

#[tauri::command]
pub fn vault_get_status(state: State<'_, AppState>) -> Result<VaultStatus, String> {
    let is_unlocked = state.active_key.lock().unwrap().is_some();
    state
        .db
        .get_vault_status(is_unlocked)
        .map_err(|e| format!("Failed to fetch vault status: {}", e))
}

#[tauri::command]
pub fn vault_set_master_password(
    password: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    match password {
        Some(pwd) if !pwd.trim().is_empty() => {
            let hash = crypto::hash_password(&pwd)
                .map_err(|e| format!("Error hashing master password: {}", e))?;

            let (salt, _, _) = state
                .db
                .get_vault_salt_and_hash()
                .map_err(|e| format!("Error getting vault salt: {}", e))?;

            let key = crypto::derive_key(&pwd, salt.as_bytes())
                .map_err(|e| format!("Error deriving key: {}", e))?;

            state
                .db
                .set_master_password(Some(&hash), true)
                .map_err(|e| format!("Failed to save master password settings: {}", e))?;

            let mut guard = state.active_key.lock().unwrap();
            *guard = Some(key);
            Ok(())
        }
        _ => {
            // Disable master password
            state
                .db
                .set_master_password(None, false)
                .map_err(|e| format!("Failed to disable master password: {}", e))?;

            let mut guard = state.active_key.lock().unwrap();
            if let Some(ref mut key) = *guard {
                key.zeroize();
            }
            *guard = None;
            Ok(())
        }
    }
}

#[tauri::command]
pub fn vault_unlock(password: String, state: State<'_, AppState>) -> Result<bool, String> {
    let (salt, hash_opt, is_enabled) = state
        .db
        .get_vault_salt_and_hash()
        .map_err(|e| format!("Database error: {}", e))?;

    if !is_enabled {
        return Ok(true);
    }

    let stored_hash = hash_opt.ok_or_else(|| "No master password configured".to_string())?;

    let is_valid = crypto::verify_password(&password, &stored_hash)
        .map_err(|e| format!("Password verification error: {}", e))?;

    if !is_valid {
        return Err("Incorrect master password. Please verify and try again.".into());
    }

    let key = crypto::derive_key(&password, salt.as_bytes())
        .map_err(|e| format!("Error deriving encryption key: {}", e))?;

    let mut guard = state.active_key.lock().unwrap();
    *guard = Some(key);

    Ok(true)
}

#[tauri::command]
pub fn vault_lock(state: State<'_, AppState>) -> Result<(), String> {
    let mut guard = state.active_key.lock().unwrap();
    if let Some(ref mut key) = *guard {
        key.zeroize();
    }
    *guard = None;
    Ok(())
}

// --- Host Commands ---

#[tauri::command]
pub fn host_list(state: State<'_, AppState>) -> Result<Vec<Host>, String> {
    state
        .db
        .list_hosts()
        .map_err(|e| format!("Failed to list hosts: {}", e))
}

#[tauri::command]
pub fn host_create(input: CreateHostInput, state: State<'_, AppState>) -> Result<Host, String> {
    state
        .db
        .create_host(input)
        .map_err(|e| format!("Failed to create host: {}", e))
}

#[tauri::command]
pub fn host_update(input: UpdateHostInput, state: State<'_, AppState>) -> Result<Host, String> {
    state
        .db
        .update_host(input)
        .map_err(|e| format!("Failed to update host: {}", e))
}

#[tauri::command]
pub fn host_delete(id: String, state: State<'_, AppState>) -> Result<bool, String> {
    state
        .db
        .delete_host(&id)
        .map_err(|e| format!("Failed to delete host: {}", e))
}

// --- Group Commands ---

#[tauri::command]
pub fn group_list(state: State<'_, AppState>) -> Result<Vec<HostGroup>, String> {
    state
        .db
        .list_groups()
        .map_err(|e| format!("Failed to list groups: {}", e))
}

#[tauri::command]
pub fn group_create(input: CreateGroupInput, state: State<'_, AppState>) -> Result<HostGroup, String> {
    state
        .db
        .create_group(input)
        .map_err(|e| format!("Failed to create group: {}", e))
}

#[tauri::command]
pub fn group_delete(id: String, state: State<'_, AppState>) -> Result<bool, String> {
    state
        .db
        .delete_group(&id)
        .map_err(|e| format!("Failed to delete group: {}", e))
}

// --- Identity Commands ---

#[tauri::command]
pub fn identity_list(state: State<'_, AppState>) -> Result<Vec<Identity>, String> {
    state
        .db
        .list_identities()
        .map_err(|e| format!("Failed to list identities: {}", e))
}

#[tauri::command]
pub fn identity_create(
    input: CreateIdentityInput,
    state: State<'_, AppState>,
) -> Result<Identity, String> {
    let key = state.get_encryption_key()?;

    let encrypted_secret = crypto::encrypt_secret(&input.secret, &key)
        .map_err(|e| format!("Failed to encrypt identity secret: {}", e))?;

    let encrypted_passphrase = match &input.passphrase {
        Some(pass) if !pass.is_empty() => Some(
            crypto::encrypt_secret(pass, &key)
                .map_err(|e| format!("Failed to encrypt identity passphrase: {}", e))?,
        ),
        _ => None,
    };

    state
        .db
        .create_identity(input, encrypted_secret, encrypted_passphrase)
        .map_err(|e| format!("Failed to store identity: {}", e))
}

#[tauri::command]
pub fn identity_delete(id: String, state: State<'_, AppState>) -> Result<bool, String> {
    state
        .db
        .delete_identity(&id)
        .map_err(|e| format!("Failed to delete identity: {}", e))
}

// --- Snippet Commands ---

#[tauri::command]
pub fn snippet_list(state: State<'_, AppState>) -> Result<Vec<Snippet>, String> {
    state
        .db
        .list_snippets()
        .map_err(|e| format!("Failed to list snippets: {}", e))
}

#[tauri::command]
pub fn snippet_create(
    input: CreateSnippetInput,
    state: State<'_, AppState>,
) -> Result<Snippet, String> {
    state
        .db
        .create_snippet(input)
        .map_err(|e| format!("Failed to create snippet: {}", e))
}

#[tauri::command]
pub fn snippet_update(
    input: UpdateSnippetInput,
    state: State<'_, AppState>,
) -> Result<Snippet, String> {
    let snippet_id = input.id.clone();
    state
        .db
        .update_snippet(input)
        .map_err(|e| format!("Failed to update snippet '{}': {}", snippet_id, e))
}

#[tauri::command]
pub fn snippet_delete(id: String, state: State<'_, AppState>) -> Result<bool, String> {
    state
        .db
        .delete_snippet(&id)
        .map_err(|e| format!("Failed to delete snippet: {}", e))
}

// --- Tunnel Commands ---

#[tauri::command]
pub fn tunnel_list(state: State<'_, AppState>) -> Result<Vec<Tunnel>, String> {
    state
        .db
        .list_tunnels()
        .map_err(|e| format!("Failed to list tunnels: {}", e))
}

#[tauri::command]
pub fn tunnel_create(
    input: CreateTunnelInput,
    state: State<'_, AppState>,
) -> Result<Tunnel, String> {
    state
        .db
        .create_tunnel(input)
        .map_err(|e| format!("Failed to create tunnel: {}", e))
}

#[tauri::command]
pub fn tunnel_delete(id: String, state: State<'_, AppState>) -> Result<bool, String> {
    state
        .db
        .delete_tunnel(&id)
        .map_err(|e| format!("Failed to delete tunnel: {}", e))
}

#[tauri::command]
pub async fn tunnel_start(id: String, state: State<'_, AppState>) -> Result<(), String> {
    let tunnels = state
        .db
        .list_tunnels()
        .map_err(|e| format!("Failed to list tunnels: {}", e))?;
    let tunnel = tunnels
        .into_iter()
        .find(|t| t.id == id)
        .ok_or_else(|| format!("Tunnel '{}' not found", id))?;

    let hosts = state
        .db
        .list_hosts()
        .map_err(|e| format!("Failed to list hosts: {}", e))?;
    let host = hosts
        .into_iter()
        .find(|h| h.id == tunnel.host_id)
        .ok_or_else(|| format!("Target host '{}' not found", tunnel.host_id))?;

    let mut secret = None;
    let mut passphrase = None;

    if let Some(ref iid) = host.identity_id {
        let enc_key = state.get_encryption_key()?;
        let (enc_secret, enc_pass) = state
            .db
            .get_identity_secret(iid)
            .map_err(|e| format!("Failed to get identity secret: {}", e))?;
        secret = Some(
            crypto::decrypt_secret(&enc_secret, &enc_key)
                .map_err(|e| format!("Failed to decrypt identity secret: {}", e))?,
        );

        if let Some(ref ep) = enc_pass {
            passphrase = Some(
                crypto::decrypt_secret(ep, &enc_key)
                    .map_err(|e| format!("Failed to decrypt identity passphrase: {}", e))?,
            );
        }
    }

    state
        .tunnel_manager
        .start_tunnel(tunnel, host, secret, passphrase)
        .await
}

#[tauri::command]
pub async fn tunnel_stop(id: String, state: State<'_, AppState>) -> Result<(), String> {
    state.tunnel_manager.stop_tunnel(&id).await
}

#[tauri::command]
pub async fn tunnel_get_statuses(
    state: State<'_, AppState>,
) -> Result<Vec<TunnelRuntimeStatus>, String> {
    Ok(state.tunnel_manager.get_statuses().await)
}

// --- Key Generation Command ---

#[tauri::command]
pub fn key_generate(
    algorithm: String,
    comment: Option<String>,
) -> Result<crypto::GeneratedKeyPair, String> {
    crypto::generate_ssh_key(&algorithm, comment.as_deref())
        .map_err(|e| format!("SSH key generation error: {}", e))
}

// --- SSH Session Commands ---

#[tauri::command]
pub async fn ssh_connect(
    host_id: Option<String>,
    hostname: Option<String>,
    port: Option<u16>,
    username: Option<String>,
    password: Option<String>,
    cols: u32,
    rows: u32,
    on_event: Channel<SshEvent>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let session_id = Uuid::new_v4().to_string();

    let (target_host, target_port, target_user, target_pass, target_key, target_passphrase) =
        if let Some(hid) = host_id {
            let hosts = state.db.list_hosts().map_err(|e| e.to_string())?;
            let host = hosts
                .into_iter()
                .find(|h| h.id == hid)
                .ok_or_else(|| format!("Host not found: {}", hid))?;

            let mut pass = None;
            let mut key = None;
            let mut passphrase = None;

            if let Some(ref iid) = host.identity_id {
                let enc_key = state.get_encryption_key()?;
                let (enc_secret, enc_pass) = state.db.get_identity_secret(iid).map_err(|e| e.to_string())?;
                let secret = crypto::decrypt_secret(&enc_secret, &enc_key)
                    .map_err(|e| format!("Failed to decrypt identity secret: {}", e))?;

                if let Some(ep) = enc_pass {
                    passphrase = Some(crypto::decrypt_secret(&ep, &enc_key)
                        .map_err(|e| format!("Failed to decrypt identity passphrase: {}", e))?);
                }

                if secret.contains("PRIVATE KEY") {
                    key = Some(secret);
                } else {
                    pass = Some(secret);
                }
            }

            let u = host.username.or(username).unwrap_or_else(|| "root".into());
            (host.hostname, host.port, u, pass, key, passphrase)
        } else {
            let h = hostname.ok_or_else(|| "Hostname is required".to_string())?;
            let p = port.unwrap_or(22);
            let u = username.unwrap_or_else(|| "root".into());
            (h, p, u, password, None, None)
        };

    state
        .ssh_manager
        .start_session(
            session_id.clone(),
            target_host,
            target_port,
            target_user,
            target_pass,
            target_key,
            target_passphrase,
            cols,
            rows,
            on_event,
        )
        .await
        .map_err(|e| e.to_string())?;

    Ok(session_id)
}

#[tauri::command]
pub fn ssh_write(
    session_id: String,
    data: Vec<u8>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .ssh_manager
        .write_data(&session_id, data)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ssh_resize(
    session_id: String,
    cols: u32,
    rows: u32,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .ssh_manager
        .resize_pty(&session_id, cols, rows)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ssh_disconnect(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .ssh_manager
        .disconnect_session(&session_id)
        .map_err(|e| e.to_string())
}

// --- SFTP Commands ---

#[tauri::command]
pub async fn sftp_list_remote(
    host_id: String,
    remote_path: String,
    state: State<'_, AppState>,
) -> Result<Vec<FileEntry>, String> {
    sftp::sftp_list(host_id, remote_path, &state).await
}

#[tauri::command]
pub async fn sftp_read_file(
    host_id: String,
    remote_path: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    sftp::sftp_read_text(host_id, remote_path, &state).await
}

#[tauri::command]
pub async fn sftp_write_file(
    host_id: String,
    remote_path: String,
    content: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    sftp::sftp_write_text(host_id, remote_path, content, &state).await
}

#[tauri::command]
pub async fn sftp_delete_file(
    host_id: String,
    remote_path: String,
    is_dir: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    sftp::sftp_delete(host_id, remote_path, is_dir, &state).await
}

#[tauri::command]
pub async fn sftp_mkdir(
    host_id: String,
    remote_path: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    sftp::sftp_mkdir(host_id, remote_path, &state).await
}

#[tauri::command]
pub async fn sftp_rename_file(
    host_id: String,
    old_path: String,
    new_path: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    sftp::sftp_rename(host_id, old_path, new_path, &state).await
}

#[tauri::command]
pub async fn sftp_upload_file(
    host_id: String,
    local_path: String,
    remote_path: String,
    state: State<'_, AppState>,
) -> Result<u64, String> {
    sftp::sftp_upload_file(host_id, local_path, remote_path, &state).await
}

#[tauri::command]
pub async fn sftp_download_file(
    host_id: String,
    remote_path: String,
    local_path: String,
    state: State<'_, AppState>,
) -> Result<u64, String> {
    sftp::sftp_download_file(host_id, remote_path, local_path, &state).await
}

#[tauri::command]
pub async fn sftp_canonicalize(
    host_id: String,
    remote_path: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    sftp::sftp_canonicalize(host_id, remote_path, &state).await
}

#[tauri::command]
pub async fn sftp_disconnect(
    host_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.sftp_manager.disconnect(&host_id).await;
    Ok(())
}

#[tauri::command]
pub fn sftp_list_local(path: String) -> Result<Vec<FileEntry>, String> {
    sftp::local_list(path)
}

#[tauri::command]
pub fn sftp_get_local_home() -> Result<String, String> {
    Ok(sftp::get_local_home())
}

#[tauri::command]
pub fn sftp_local_mkdir(path: String) -> Result<(), String> {
    sftp::local_mkdir(path)
}

#[tauri::command]
pub fn sftp_local_delete(path: String, is_dir: bool) -> Result<(), String> {
    sftp::local_delete(path, is_dir)
}

#[tauri::command]
pub fn sftp_local_rename(old_path: String, new_path: String) -> Result<(), String> {
    sftp::local_rename(old_path, new_path)
}

// --- Backup & Restore Commands ---

#[tauri::command]
pub fn backup_export(passphrase: String, state: State<'_, AppState>) -> Result<String, String> {
    if passphrase.trim().is_empty() {
        return Err("Export passphrase cannot be empty. A strong passphrase is required to secure your backup.".into());
    }

    let active_key = state.get_encryption_key()?;
    let backup_data = state
        .db
        .export_backup_data(&active_key)
        .map_err(|e| format!("Failed to export backup data from database: {}", e))?;

    let json_payload = serde_json::to_string(&backup_data)
        .map_err(|e| format!("Serialization error during backup generation: {}", e))?;

    let envelope = crypto::export_backup_envelope(&json_payload, &passphrase)
        .map_err(|e| format!("Encryption error during backup package generation: {}", e))?;

    serde_json::to_string_pretty(&envelope)
        .map_err(|e| format!("Failed to serialize backup envelope: {}", e))
}

#[tauri::command]
pub fn backup_inspect(backup_json: String, passphrase: String) -> Result<BackupSummary, String> {
    if passphrase.trim().is_empty() {
        return Err("Decryption passphrase cannot be empty.".into());
    }

    let envelope: BackupEnvelope = serde_json::from_str(&backup_json)
        .map_err(|e| format!("Invalid backup file format. Expected a valid Haze SSH .haze JSON archive: {}", e))?;

    let decrypted_payload = crypto::decrypt_backup_envelope(&envelope, &passphrase)
        .map_err(|e| format!("Failed to decrypt backup: {}", e))?;

    let data: BackupData = serde_json::from_str(&decrypted_payload)
        .map_err(|e| format!("Corrupted backup payload: unable to parse data structure ({})", e))?;

    Ok(BackupSummary {
        version: data.version,
        exported_at: data.exported_at,
        groups_count: data.groups.len(),
        identities_count: data.identities.len(),
        hosts_count: data.hosts.len(),
        snippets_count: data.snippets.len(),
        tunnels_count: data.tunnels.len(),
    })
}

#[tauri::command]
pub fn backup_restore(
    backup_json: String,
    passphrase: String,
    strategy: String,
    state: State<'_, AppState>,
) -> Result<BackupSummary, String> {
    if passphrase.trim().is_empty() {
        return Err("Decryption passphrase cannot be empty.".into());
    }

    let is_overwrite = match strategy.to_lowercase().as_str() {
        "overwrite" => true,
        "merge" => false,
        other => {
            return Err(format!(
                "Invalid restore strategy '{}'. Supported strategies are 'merge' and 'overwrite'.",
                other
            ))
        }
    };

    let active_key = state.get_encryption_key()?;

    let envelope: BackupEnvelope = serde_json::from_str(&backup_json)
        .map_err(|e| format!("Invalid backup file format. Expected a valid Haze SSH .haze JSON archive: {}", e))?;

    let decrypted_payload = crypto::decrypt_backup_envelope(&envelope, &passphrase)
        .map_err(|e| format!("Failed to decrypt backup: {}", e))?;

    let data: BackupData = serde_json::from_str(&decrypted_payload)
        .map_err(|e| format!("Corrupted backup payload: unable to parse data structure ({})", e))?;

    state
        .db
        .restore_backup_data(data, &active_key, is_overwrite)
        .map_err(|e| format!("Failed to apply restored backup: {}", e))
}

// --- OpenSSH Config Importer Commands ---

#[tauri::command]
pub fn ssh_config_parse(
    custom_path: Option<String>,
    state: State<'_, AppState>,
) -> Result<SshConfigParseResult, String> {
    let existing_hosts = state
        .db
        .list_hosts()
        .map_err(|e| format!("Failed to load existing hosts: {}", e))?;

    ssh_config_parser::parse_ssh_config(custom_path.as_deref(), &existing_hosts)
}

#[tauri::command]
pub fn ssh_config_import(
    input: ImportSshHostsInput,
    state: State<'_, AppState>,
) -> Result<ImportResultSummary, String> {
    if input.candidates.is_empty() {
        return Err("No hosts selected for import. Please select at least one host.".into());
    }

    let active_key = state.get_encryption_key()?;

    state
        .db
        .import_ssh_config_hosts(
            input.candidates,
            input.import_keys_as_identities,
            &active_key,
        )
        .map_err(|e| format!("Failed to import OpenSSH hosts: {}", e))
}

// --- Termius & PuTTY Importer Commands ---

#[tauri::command]
pub fn termius_parse(
    json_content: String,
    state: State<'_, AppState>,
) -> Result<TermiusParseResult, String> {
    let existing_hosts = state
        .db
        .list_hosts()
        .map_err(|e| format!("Failed to load existing hosts: {}", e))?;

    third_party_importer::parse_termius_json(&json_content, &existing_hosts)
}

#[tauri::command]
pub fn termius_import(
    input: ImportTermiusInput,
    state: State<'_, AppState>,
) -> Result<ImportResultSummary, String> {
    if input.candidates.is_empty() && input.snippets.is_empty() {
        return Err("No hosts or snippets selected for import.".into());
    }

    let active_key = state.get_encryption_key()?;

    state
        .db
        .import_termius_data(
            input.candidates,
            input.snippets,
            input.import_keys_as_identities,
            &active_key,
        )
        .map_err(|e| format!("Failed to import Termius configurations: {}", e))
}

#[tauri::command]
pub fn putty_parse(
    reg_content: String,
    state: State<'_, AppState>,
) -> Result<Vec<SshConfigHostCandidate>, String> {
    let existing_hosts = state
        .db
        .list_hosts()
        .map_err(|e| format!("Failed to load existing hosts: {}", e))?;

    third_party_importer::parse_putty_reg(&reg_content, &existing_hosts)
}

#[tauri::command]
pub fn putty_import(
    input: ImportSshHostsInput,
    state: State<'_, AppState>,
) -> Result<ImportResultSummary, String> {
    if input.candidates.is_empty() {
        return Err("No PuTTY sessions selected for import.".into());
    }

    let active_key = state.get_encryption_key()?;

    state
        .db
        .import_ssh_config_hosts(
            input.candidates,
            input.import_keys_as_identities,
            &active_key,
        )
        .map_err(|e| format!("Failed to import PuTTY sessions: {}", e))
}

#[tauri::command]
pub async fn host_fetch_metrics(
    host_id: String,
    state: State<'_, AppState>,
) -> Result<ServerMetrics, String> {
    monitor::fetch_server_metrics(&host_id, &state).await
}

#[tauri::command]
pub fn serial_list_ports() -> Result<Vec<SerialPortInfo>, String> {
    serial::list_serial_ports()
}

#[tauri::command]
pub async fn serial_connect(
    options: SerialConnectOptions,
    on_event: Channel<SshEvent>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let session_id = Uuid::new_v4().to_string();
    state
        .serial_manager
        .start_session(session_id.clone(), options, on_event)
        .await?;
    Ok(session_id)
}

#[tauri::command]
pub async fn serial_write(
    session_id: String,
    data: Vec<u8>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.serial_manager.write(&session_id, data).await
}

#[tauri::command]
pub async fn serial_disconnect(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.serial_manager.disconnect(&session_id).await
}

#[tauri::command]
pub async fn telnet_connect(
    options: TelnetConnectOptions,
    on_event: Channel<SshEvent>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let session_id = Uuid::new_v4().to_string();
    state
        .telnet_manager
        .start_session(session_id.clone(), options, on_event)
        .await?;
    Ok(session_id)
}

#[tauri::command]
pub async fn telnet_write(
    session_id: String,
    data: Vec<u8>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.telnet_manager.write(&session_id, data).await
}

#[tauri::command]
pub async fn telnet_disconnect(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.telnet_manager.disconnect(&session_id).await
}



