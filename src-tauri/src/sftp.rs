use std::fs;
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;
use russh::client;
use russh_keys::key;
use russh_sftp::client::SftpSession;
use serde::{Deserialize, Serialize};

use crate::commands::AppState;
use crate::crypto;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_symlink: bool,
    pub size: u64,
    pub modified: u64,
    pub permissions: String,
}

struct SftpClientHandler;

#[async_trait::async_trait]
impl client::Handler for SftpClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &key::PublicKey,
    ) -> Result<bool, Self::Error> {
        Ok(true)
    }
}

/// Helper to connect and authenticate an SFTP session for a given host
async fn connect_sftp(
    host_id: &str,
    state: &AppState,
) -> Result<SftpSession, String> {
    let hosts = state.db.list_hosts().map_err(|e| e.to_string())?;
    let host = hosts
        .into_iter()
        .find(|h| h.id == host_id)
        .ok_or_else(|| format!("Host '{}' not found", host_id))?;

    let mut config = client::Config::default();
    config.keepalive_interval = Some(Duration::from_secs(30));
    let config = Arc::new(config);

    let connect_future = client::connect(config, (host.hostname.as_str(), host.port), SftpClientHandler);
    let mut session = tokio::time::timeout(Duration::from_secs(12), connect_future)
        .await
        .map_err(|_| "Connection timed out after 12 seconds".to_string())?
        .map_err(|e| format!("Failed to connect to host: {}", e))?;

    let username = host.username.unwrap_or_else(|| "root".into());
    let mut auth_success = false;

    if let Some(ref iid) = host.identity_id {
        let enc_key = state.get_encryption_key()?;
        let (enc_secret, enc_pass) = state.db.get_identity_secret(iid).map_err(|e| e.to_string())?;
        let secret = crypto::decrypt_secret(&enc_secret, &enc_key)
            .map_err(|e| format!("Failed to decrypt identity secret: {}", e))?;

        if secret.contains("PRIVATE KEY") {
            let pass = if let Some(ref ep) = enc_pass {
                Some(crypto::decrypt_secret(ep, &enc_key)
                    .map_err(|e| format!("Failed to decrypt passphrase: {}", e))?)
            } else {
                None
            };

            if let Ok(key_pair) = russh_keys::decode_secret_key(&secret, pass.as_deref()) {
                if let Ok(success) = session.authenticate_publickey(&username, Arc::new(key_pair)).await {
                    auth_success = success;
                }
            }
        } else {
            if let Ok(success) = session.authenticate_password(&username, &secret).await {
                auth_success = success;
            }
        }
    }

    if !auth_success {
        return Err(format!("Authentication failed for user '{}'", username));
    }

    let channel = session
        .channel_open_session()
        .await
        .map_err(|e| format!("Failed to open session channel: {}", e))?;

    channel
        .request_subsystem(true, "sftp")
        .await
        .map_err(|e| format!("Failed to request SFTP subsystem: {}", e))?;

    let sftp = SftpSession::new(channel.into_stream())
        .await
        .map_err(|e| format!("Failed to initialize SFTP session: {}", e))?;

    Ok(sftp)
}

// --- Remote SFTP Handlers ---

pub async fn sftp_list(
    host_id: String,
    remote_path: String,
    state: &AppState,
) -> Result<Vec<FileEntry>, String> {
    let sftp = connect_sftp(&host_id, state).await?;
    let path_str = if remote_path.trim().is_empty() { "." } else { &remote_path };

    let entries = sftp
        .read_dir(path_str)
        .await
        .map_err(|e| format!("Failed to read remote directory '{}': {}", path_str, e))?;

    let mut result = Vec::new();
    for entry in entries {
        let filename = entry.file_name();
        if filename == "." || filename == ".." {
            continue;
        }

        let full_path = if path_str.ends_with('/') {
            format!("{}{}", path_str, filename)
        } else {
            format!("{}/{}", path_str, filename)
        };

        let file_type = entry.file_type();
        let is_dir = file_type.is_dir();
        let is_symlink = file_type.is_symlink();
        let metadata = entry.metadata();
        let size = metadata.size.unwrap_or(0);
        let modified = metadata.mtime.unwrap_or(0) as u64;
        let permissions = format!("{:o}", metadata.permissions.unwrap_or(0) & 0o777);

        result.push(FileEntry {
            name: filename,
            path: full_path,
            is_dir,
            is_symlink,
            size,
            modified,
            permissions,
        });
    }

    // Sort directories first, then alphabetically
    result.sort_by(|a, b| {
        if a.is_dir == b.is_dir {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        } else if a.is_dir {
            std::cmp::Ordering::Less
        } else {
            std::cmp::Ordering::Greater
        }
    });

    Ok(result)
}

pub async fn sftp_read_text(
    host_id: String,
    remote_path: String,
    state: &AppState,
) -> Result<String, String> {
    use tokio::io::AsyncReadExt;

    let sftp = connect_sftp(&host_id, state).await?;
    let mut file = sftp
        .open(&remote_path)
        .await
        .map_err(|e| format!("Failed to open remote file '{}': {}", remote_path, e))?;

    let mut content = Vec::new();
    file.read_to_end(&mut content)
        .await
        .map_err(|e| format!("Failed to read remote file content: {}", e))?;

    String::from_utf8(content)
        .map_err(|e| format!("Remote file is not valid UTF-8 text: {}", e))
}

pub async fn sftp_write_text(
    host_id: String,
    remote_path: String,
    content: String,
    state: &AppState,
) -> Result<(), String> {
    use tokio::io::AsyncWriteExt;

    let sftp = connect_sftp(&host_id, state).await?;
    let mut file = sftp
        .create(&remote_path)
        .await
        .map_err(|e| format!("Failed to create remote file '{}': {}", remote_path, e))?;

    file.write_all(content.as_bytes())
        .await
        .map_err(|e| format!("Failed to write content to remote file: {}", e))?;

    file.flush()
        .await
        .map_err(|e| format!("Failed to flush remote file: {}", e))?;

    Ok(())
}

pub async fn sftp_delete(
    host_id: String,
    remote_path: String,
    is_dir: bool,
    state: &AppState,
) -> Result<(), String> {
    let sftp = connect_sftp(&host_id, state).await?;
    if is_dir {
        sftp.remove_dir(&remote_path)
            .await
            .map_err(|e| format!("Failed to remove remote directory '{}': {}", remote_path, e))?;
    } else {
        sftp.remove_file(&remote_path)
            .await
            .map_err(|e| format!("Failed to remove remote file '{}': {}", remote_path, e))?;
    }
    Ok(())
}

pub async fn sftp_mkdir(
    host_id: String,
    remote_path: String,
    state: &AppState,
) -> Result<(), String> {
    let sftp = connect_sftp(&host_id, state).await?;
    sftp.create_dir(&remote_path)
        .await
        .map_err(|e| format!("Failed to create directory '{}': {}", remote_path, e))
}

pub async fn sftp_rename(
    host_id: String,
    old_path: String,
    new_path: String,
    state: &AppState,
) -> Result<(), String> {
    let sftp = connect_sftp(&host_id, state).await?;
    sftp.rename(&old_path, &new_path)
        .await
        .map_err(|e| format!("Failed to rename '{}' to '{}': {}", old_path, new_path, e))
}

// --- Local Filesystem Handlers ---

pub fn local_list(local_path: String) -> Result<Vec<FileEntry>, String> {
    let target = if local_path.trim().is_empty() {
        std::env::var("HOME").unwrap_or_else(|_| ".".into())
    } else {
        local_path
    };

    let p = Path::new(&target);
    let read_dir = fs::read_dir(p)
        .map_err(|e| format!("Failed to read local directory '{}': {}", target, e))?;

    let mut result = Vec::new();
    for entry in read_dir.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue; // Mute hidden dotfiles by default
        }

        let metadata = entry.metadata().ok();
        let is_dir = metadata.as_ref().map(|m| m.is_dir()).unwrap_or(false);
        let is_symlink = metadata.as_ref().map(|m| m.is_symlink()).unwrap_or(false);
        let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);
        let modified = metadata
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);

        let path = entry.path().to_string_lossy().to_string();

        result.push(FileEntry {
            name,
            path,
            is_dir,
            is_symlink,
            size,
            modified,
            permissions: "0755".into(),
        });
    }

    result.sort_by(|a, b| {
        if a.is_dir == b.is_dir {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        } else if a.is_dir {
            std::cmp::Ordering::Less
        } else {
            std::cmp::Ordering::Greater
        }
    });

    Ok(result)
}

pub fn get_local_home() -> String {
    std::env::var("HOME").unwrap_or_else(|_| "/".into())
}
