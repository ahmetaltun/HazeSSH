use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use russh::client;
use russh_keys::key;
use russh_sftp::client::fs::ReadDir;
use russh_sftp::client::SftpSession;
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;

use crate::commands::AppState;

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

pub struct SftpSessionEntry {
    pub sftp: SftpSession,
    pub handle: client::Handle<SftpClientHandler>,
}

pub struct SftpManager {
    sessions: Arc<Mutex<HashMap<String, Arc<SftpSessionEntry>>>>,
}

impl SftpManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Retrieve an existing active session, or connect and cache a new one.
    pub async fn get_session(
        &self,
        host_id: &str,
        state: &AppState,
    ) -> Result<Arc<SftpSessionEntry>, String> {
        let mut map = self.sessions.lock().await;
        if let Some(entry) = map.get(host_id) {
            return Ok(entry.clone());
        }

        let (sftp, handle) = connect_sftp(host_id, state).await?;
        let entry = Arc::new(SftpSessionEntry { sftp, handle });
        map.insert(host_id.to_string(), entry.clone());
        Ok(entry)
    }

    /// Invalidate and cleanly terminate a cached session (e.g. on disconnect or network error).
    pub async fn invalidate(&self, host_id: &str) {
        let mut map = self.sessions.lock().await;
        if let Some(entry) = map.remove(host_id) {
            let _ = entry.sftp.close().await;
            let _ = entry
                .handle
                .disconnect(russh::Disconnect::ByApplication, "SFTP session closed", "en")
                .await;
        }
    }

    /// Disconnect SFTP session for a specific host.
    pub async fn disconnect(&self, host_id: &str) {
        self.invalidate(host_id).await;
    }
}

impl Default for SftpManager {
    fn default() -> Self {
        Self::new()
    }
}

pub struct SftpClientHandler;

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
) -> Result<(SftpSession, client::Handle<SftpClientHandler>), String> {
    let hosts = state.db.list_hosts().map_err(|e| e.to_string())?;
    let host = hosts
        .into_iter()
        .find(|h| h.id == host_id)
        .ok_or_else(|| format!("Host '{}' not found", host_id))?;

    let mut config = client::Config::default();
    config.keepalive_interval = Some(Duration::from_secs(30));
    let config = Arc::new(config);

    let connect_future = async {
        let stream = tokio::net::TcpStream::connect((host.hostname.as_str(), host.port))
            .await
            .map_err(russh::Error::from)?;
        let _ = stream.set_nodelay(true);
        client::connect_stream(config, stream, SftpClientHandler).await
    };
    let mut session = tokio::time::timeout(Duration::from_secs(12), connect_future)
        .await
        .map_err(|_| "Connection timed out after 12 seconds".to_string())?
        .map_err(|e| format!("Failed to connect to host: {}", e))?;

    let username = host.username.unwrap_or_else(|| "root".into());
    let mut auth_success = false;

    if let Some(ref iid) = host.identity_id {
        let (secret, pass) = state.get_decrypted_identity(iid)?;

        if secret.contains("PRIVATE KEY") {
            if let Ok(key_pair) = russh_keys::decode_secret_key(&secret, pass.as_deref())
                && let Ok(success) = session.authenticate_publickey(&username, Arc::new(key_pair)).await {
                    auth_success = success;
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

    Ok((sftp, session))
}

fn parse_dir_entries(entries: ReadDir, path_str: &str) -> Vec<FileEntry> {
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

    result
}

// --- Remote SFTP Handlers ---

pub async fn sftp_list(
    host_id: String,
    remote_path: String,
    state: &AppState,
) -> Result<Vec<FileEntry>, String> {
    let path_str = if remote_path.trim().is_empty() { "." } else { &remote_path };

    let session = state.sftp_manager.get_session(&host_id, state).await?;
    match session.sftp.read_dir(path_str).await {
        Ok(entries) => Ok(parse_dir_entries(entries, path_str)),
        Err(_) => {
            // Channel may have been dropped or closed by server; invalidate and retry once
            state.sftp_manager.invalidate(&host_id).await;
            let session = state.sftp_manager.get_session(&host_id, state).await?;
            let entries = session
                .sftp
                .read_dir(path_str)
                .await
                .map_err(|e| format!("Failed to read remote directory '{}': {}", path_str, e))?;
            Ok(parse_dir_entries(entries, path_str))
        }
    }
}

pub async fn sftp_read_text(
    host_id: String,
    remote_path: String,
    state: &AppState,
) -> Result<String, String> {
    use tokio::io::AsyncReadExt;

    let session = state.sftp_manager.get_session(&host_id, state).await?;
    let mut file = match session.sftp.open(&remote_path).await {
        Ok(f) => f,
        Err(_) => {
            state.sftp_manager.invalidate(&host_id).await;
            let session = state.sftp_manager.get_session(&host_id, state).await?;
            session
                .sftp
                .open(&remote_path)
                .await
                .map_err(|e| format!("Failed to open remote file '{}': {}", remote_path, e))?
        }
    };

    let mut content = Vec::new();
    file.read_to_end(&mut content)
        .await
        .map_err(|e| format!("Failed to read remote file content: {}", e))?;

    String::from_utf8(content)
        .map_err(|e| format!("Remote file is not valid UTF-8 text: {}", e))
}

pub async fn sftp_read_binary(
    host_id: String,
    remote_path: String,
    state: &AppState,
) -> Result<String, String> {
    use tokio::io::AsyncReadExt;

    let session = state.sftp_manager.get_session(&host_id, state).await?;
    let mut file = match session.sftp.open(&remote_path).await {
        Ok(f) => f,
        Err(_) => {
            state.sftp_manager.invalidate(&host_id).await;
            let session = state.sftp_manager.get_session(&host_id, state).await?;
            session
                .sftp
                .open(&remote_path)
                .await
                .map_err(|e| format!("Failed to open remote file '{}': {}", remote_path, e))?
        }
    };

    if let Ok(meta) = session.sftp.metadata(&remote_path).await
        && let Some(size) = meta.size
        && size > 30 * 1024 * 1024
    {
        return Err(format!(
            "File size ({} MB) exceeds preview limit of 30 MB. Please download the file to view.",
            size / (1024 * 1024)
        ));
    }

    let mut content = Vec::new();
    file.read_to_end(&mut content)
        .await
        .map_err(|e| format!("Failed to read remote file binary content: {}", e))?;

    Ok(BASE64.encode(&content))
}

pub async fn sftp_write_text(
    host_id: String,
    remote_path: String,
    content: String,
    state: &AppState,
) -> Result<(), String> {
    use tokio::io::AsyncWriteExt;

    let session = state.sftp_manager.get_session(&host_id, state).await?;
    let mut file = match session.sftp.create(&remote_path).await {
        Ok(f) => f,
        Err(_) => {
            state.sftp_manager.invalidate(&host_id).await;
            let session = state.sftp_manager.get_session(&host_id, state).await?;
            session
                .sftp
                .create(&remote_path)
                .await
                .map_err(|e| format!("Failed to create remote file '{}': {}", remote_path, e))?
        }
    };

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
    let session = state.sftp_manager.get_session(&host_id, state).await?;
    let res = if is_dir {
        session.sftp.remove_dir(&remote_path).await
    } else {
        session.sftp.remove_file(&remote_path).await
    };

    if res.is_err() {
        state.sftp_manager.invalidate(&host_id).await;
        let session = state.sftp_manager.get_session(&host_id, state).await?;
        if is_dir {
            session
                .sftp
                .remove_dir(&remote_path)
                .await
                .map_err(|e| format!("Failed to remove remote directory '{}': {}", remote_path, e))?;
        } else {
            session
                .sftp
                .remove_file(&remote_path)
                .await
                .map_err(|e| format!("Failed to remove remote file '{}': {}", remote_path, e))?;
        }
    }
    Ok(())
}

pub async fn sftp_mkdir(
    host_id: String,
    remote_path: String,
    state: &AppState,
) -> Result<(), String> {
    let session = state.sftp_manager.get_session(&host_id, state).await?;
    match session.sftp.create_dir(&remote_path).await {
        Ok(()) => Ok(()),
        Err(_) => {
            state.sftp_manager.invalidate(&host_id).await;
            let session = state.sftp_manager.get_session(&host_id, state).await?;
            session
                .sftp
                .create_dir(&remote_path)
                .await
                .map_err(|e| format!("Failed to create directory '{}': {}", remote_path, e))
        }
    }
}

pub async fn sftp_rename(
    host_id: String,
    old_path: String,
    new_path: String,
    state: &AppState,
) -> Result<(), String> {
    let session = state.sftp_manager.get_session(&host_id, state).await?;
    match session.sftp.rename(&old_path, &new_path).await {
        Ok(()) => Ok(()),
        Err(_) => {
            state.sftp_manager.invalidate(&host_id).await;
            let session = state.sftp_manager.get_session(&host_id, state).await?;
            session
                .sftp
                .rename(&old_path, &new_path)
                .await
                .map_err(|e| format!("Failed to rename '{}' to '{}': {}", old_path, new_path, e))
        }
    }
}

async fn upload_single_file_stream(
    sftp: &SftpSession,
    local_path: &Path,
    remote_path: &str,
) -> Result<u64, String> {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    let mut local_file = tokio::fs::File::open(local_path)
        .await
        .map_err(|e| format!("Failed to open local file '{}': {}", local_path.display(), e))?;

    let mut remote_file = sftp
        .create(remote_path)
        .await
        .map_err(|e| format!("Failed to create remote file '{}': {}", remote_path, e))?;

    let mut buffer = [0u8; 64 * 1024];
    let mut total_bytes = 0u64;

    loop {
        let bytes_read = local_file
            .read(&mut buffer)
            .await
            .map_err(|e| format!("Failed to read from local file: {}", e))?;

        if bytes_read == 0 {
            break;
        }

        remote_file
            .write_all(&buffer[..bytes_read])
            .await
            .map_err(|e| format!("Failed to write data to remote file: {}", e))?;

        total_bytes += bytes_read as u64;
    }

    remote_file
        .flush()
        .await
        .map_err(|e| format!("Failed to flush remote file: {}", e))?;

    Ok(total_bytes)
}

fn upload_dir_recursive<'a>(
    sftp: &'a SftpSession,
    local_dir: &'a Path,
    remote_dir: &'a str,
) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<u64, String>> + Send + 'a>> {
    Box::pin(async move {
        let _ = sftp.create_dir(remote_dir).await;
        let mut total = 0u64;
        let mut entries = tokio::fs::read_dir(local_dir)
            .await
            .map_err(|e| format!("Failed to read local directory '{}': {}", local_dir.display(), e))?;

        while let Some(entry) = entries.next_entry().await.map_err(|e| e.to_string())? {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            let remote_entry_path = if remote_dir.ends_with('/') {
                format!("{}{}", remote_dir, name)
            } else {
                format!("{}/{}", remote_dir, name)
            };

            if path.is_dir() {
                total += upload_dir_recursive(sftp, &path, &remote_entry_path).await?;
            } else {
                total += upload_single_file_stream(sftp, &path, &remote_entry_path).await?;
            }
        }

        Ok(total)
    })
}

pub async fn sftp_upload_file(
    host_id: String,
    local_path: String,
    remote_path: String,
    state: &AppState,
) -> Result<u64, String> {
    let local_path_buf = std::path::PathBuf::from(&local_path);
    let session = state.sftp_manager.get_session(&host_id, state).await?;

    if local_path_buf.is_dir() {
        upload_dir_recursive(&session.sftp, &local_path_buf, &remote_path).await
    } else {
        upload_single_file_stream(&session.sftp, &local_path_buf, &remote_path).await
    }
}

async fn download_single_file_stream(
    sftp: &SftpSession,
    remote_path: &str,
    local_path: &Path,
) -> Result<u64, String> {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    let mut remote_file = sftp
        .open(remote_path)
        .await
        .map_err(|e| format!("Failed to open remote file '{}': {}", remote_path, e))?;

    let mut local_file = tokio::fs::File::create(local_path)
        .await
        .map_err(|e| format!("Failed to create local file '{}': {}", local_path.display(), e))?;

    let mut buffer = [0u8; 64 * 1024];
    let mut total_bytes = 0u64;

    loop {
        let bytes_read = remote_file
            .read(&mut buffer)
            .await
            .map_err(|e| format!("Failed to read data from remote file: {}", e))?;

        if bytes_read == 0 {
            break;
        }

        local_file
            .write_all(&buffer[..bytes_read])
            .await
            .map_err(|e| format!("Failed to write data to local file: {}", e))?;

        total_bytes += bytes_read as u64;
    }

    local_file
        .flush()
        .await
        .map_err(|e| format!("Failed to flush local file: {}", e))?;

    Ok(total_bytes)
}

fn download_dir_recursive<'a>(
    sftp: &'a SftpSession,
    remote_dir: &'a str,
    local_dir: &'a Path,
) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<u64, String>> + Send + 'a>> {
    Box::pin(async move {
        tokio::fs::create_dir_all(local_dir)
            .await
            .map_err(|e| format!("Failed to create local directory '{}': {}", local_dir.display(), e))?;

        let mut total = 0u64;
        let entries = sftp
            .read_dir(remote_dir)
            .await
            .map_err(|e| format!("Failed to read remote directory '{}': {}", remote_dir, e))?;

        for entry in entries {
            let filename = entry.file_name();
            if filename == "." || filename == ".." {
                continue;
            }
            let remote_entry_path = if remote_dir.ends_with('/') {
                format!("{}{}", remote_dir, filename)
            } else {
                format!("{}/{}", remote_dir, filename)
            };
            let local_entry_path = local_dir.join(&filename);

            if entry.file_type().is_dir() {
                total += download_dir_recursive(sftp, &remote_entry_path, &local_entry_path).await?;
            } else {
                total += download_single_file_stream(sftp, &remote_entry_path, &local_entry_path).await?;
            }
        }

        Ok(total)
    })
}

pub async fn sftp_download_file(
    host_id: String,
    remote_path: String,
    local_path: String,
    state: &AppState,
) -> Result<u64, String> {
    let local_path_buf = std::path::PathBuf::from(&local_path);
    let session = state.sftp_manager.get_session(&host_id, state).await?;

    let is_remote_dir = match session.sftp.metadata(&remote_path).await {
        Ok(meta) => meta.file_type().is_dir(),
        Err(_) => false,
    };

    if is_remote_dir {
        download_dir_recursive(&session.sftp, &remote_path, &local_path_buf).await
    } else {
        download_single_file_stream(&session.sftp, &remote_path, &local_path_buf).await
    }
}

pub async fn sftp_canonicalize(
    host_id: String,
    remote_path: String,
    state: &AppState,
) -> Result<String, String> {
    let target = if remote_path.trim().is_empty() { "." } else { &remote_path };
    let session = state.sftp_manager.get_session(&host_id, state).await?;
    match session.sftp.canonicalize(target).await {
        Ok(res) => Ok(res),
        Err(_) => {
            state.sftp_manager.invalidate(&host_id).await;
            let session = state.sftp_manager.get_session(&host_id, state).await?;
            session
                .sftp
                .canonicalize(target)
                .await
                .map_err(|e| format!("Failed to canonicalize remote path '{}': {}", target, e))
        }
    }
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

pub fn local_mkdir(path: String) -> Result<(), String> {
    fs::create_dir_all(&path)
        .map_err(|e| format!("Failed to create local directory '{}': {}", path, e))
}

pub fn local_delete(path: String, is_dir: bool) -> Result<(), String> {
    let p = Path::new(&path);
    if is_dir {
        fs::remove_dir_all(p)
            .map_err(|e| format!("Failed to remove local directory '{}': {}", path, e))
    } else {
        fs::remove_file(p)
            .map_err(|e| format!("Failed to remove local file '{}': {}", path, e))
    }
}

pub fn local_rename(old_path: String, new_path: String) -> Result<(), String> {
    fs::rename(&old_path, &new_path)
        .map_err(|e| format!("Failed to rename local path '{}' to '{}': {}", old_path, new_path, e))
}

pub fn local_read_binary(local_path: String) -> Result<String, String> {
    use std::io::Read;

    let p = Path::new(&local_path);
    if let Ok(meta) = p.metadata()
        && meta.len() > 30 * 1024 * 1024
    {
        return Err(format!(
            "File size ({} MB) exceeds preview limit of 30 MB. Please open externally to view.",
            meta.len() / (1024 * 1024)
        ));
    }

    let mut f = fs::File::open(p)
        .map_err(|e| format!("Failed to open local file '{}': {}", local_path, e))?;
    let mut content = Vec::new();
    f.read_to_end(&mut content)
        .map_err(|e| format!("Failed to read local file: {}", e))?;
    Ok(BASE64.encode(&content))
}

pub fn local_read_file(local_path: String) -> Result<String, String> {
    let p = Path::new(&local_path);
    if let Ok(meta) = p.metadata()
        && meta.len() > 10 * 1024 * 1024
    {
        return Err(format!(
            "File size ({} MB) exceeds preview/editor limit of 10 MB.",
            meta.len() / (1024 * 1024)
        ));
    }

    fs::read_to_string(p)
        .map_err(|e| format!("Failed to read local file '{}': {}", local_path, e))
}

pub fn local_write_file(local_path: String, content: String) -> Result<(), String> {
    fs::write(&local_path, content.as_bytes())
        .map_err(|e| format!("Failed to write to local file '{}': {}", local_path, e))
}


