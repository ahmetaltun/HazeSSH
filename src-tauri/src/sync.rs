use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use serde::{Deserialize, Serialize};
use std::path::Path;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum SyncError {
    #[error("Network error: {0}")]
    Network(String),

    #[error("API error ({status}): {message}")]
    Api { status: u16, message: String },

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitFileGetInput {
    pub provider: String, // "github" | "gitlab" | "gitea" | "custom"
    pub repository: String, // "owner/repo" or "project_id"
    pub branch: Option<String>,
    pub file_path: String,
    pub token: String,
    pub base_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitFileGetOutput {
    pub content: String,
    pub sha: String,
    pub file_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitFilePutInput {
    pub provider: String,
    pub repository: String,
    pub branch: Option<String>,
    pub file_path: String,
    pub token: String,
    pub content: String,
    pub commit_message: Option<String>,
    pub sha: Option<String>,
    pub base_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitFilePutOutput {
    pub sha: String,
    pub commit_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebDavRequestInput {
    pub url: String,
    pub method: String, // "GET" | "PUT" | "PROPFIND" | "MKCOL"
    pub username: Option<String>,
    pub password: Option<String>,
    pub body: Option<String>,
    pub timeout_seconds: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebDavRequestOutput {
    pub status: u16,
    pub body: String,
    pub etag: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalFolderSyncInput {
    pub folder_path: String,
    pub file_name: Option<String>,
    pub content: Option<String>, // if Some, it's a write; if None, it's a read
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalFolderSyncOutput {
    pub content: String,
    pub full_path: String,
    pub modified_at: i64,
}

fn percent_encode(input: &str) -> String {
    let mut encoded = String::with_capacity(input.len() * 3);
    for byte in input.bytes() {
        match byte {
            b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(byte as char);
            }
            _ => {
                encoded.push_str(&format!("%{:02X}", byte));
            }
        }
    }
    encoded
}

/// Helper function to execute curl with arbitrary headers and capture status code
async fn execute_sync_curl(
    method: &str,
    url: &str,
    headers: &[(String, String)],
    body: Option<&str>,
    timeout_secs: u64,
) -> Result<(u16, String, Option<String>), SyncError> {
    let mut cmd = tokio::process::Command::new("curl");
    cmd.arg("-sS")
        .arg("-X")
        .arg(method)
        .arg("--max-time")
        .arg(timeout_secs.to_string())
        .arg("-i") // Include HTTP response headers to extract ETag and status code
        .arg(url);

    for (k, v) in headers {
        cmd.arg("-H").arg(format!("{}: {}", k, v));
    }

    if let Some(payload) = body {
        cmd.arg("--data-binary").arg(payload);
    }

    let output = cmd
        .output()
        .await
        .map_err(|e| SyncError::Network(format!("Failed to execute sync curl: {}", e)))?;

    let full_response = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() && full_response.trim().is_empty() {
        return Err(SyncError::Network(if stderr.trim().is_empty() {
            format!("curl exited with status {:?}", output.status.code())
        } else {
            stderr
        }));
    }

    // Parse HTTP header / body split: \r\n\r\n or \n\n
    let (header_part, body_part) = if let Some(idx) = full_response.find("\r\n\r\n") {
        (&full_response[..idx], &full_response[idx + 4..])
    } else if let Some(idx) = full_response.find("\n\n") {
        (&full_response[..idx], &full_response[idx + 2..])
    } else {
        ("", full_response.as_str())
    };

    // Extract status code from the first line (e.g., "HTTP/1.1 200 OK" or "HTTP/2 200")
    let status_code: u16 = header_part
        .lines()
        .next()
        .and_then(|line| {
            let mut parts = line.split_whitespace();
            parts.next(); // Skip HTTP version
            parts.next().and_then(|code| code.parse().ok())
        })
        .unwrap_or(200);

    // Extract ETag if present
    let mut etag = None;
    for line in header_part.lines() {
        let lower = line.to_lowercase();
        if lower.starts_with("etag:") {
            etag = Some(line[5..].trim().trim_matches('"').to_string());
            break;
        }
    }

    Ok((status_code, body_part.to_string(), etag))
}

/// Fetches file content and version SHA from GitHub, GitLab, or Gitea
pub async fn git_file_get(input: GitFileGetInput) -> Result<GitFileGetOutput, String> {
    let branch = input.branch.as_deref().unwrap_or("main");
    let provider = input.provider.to_lowercase();
    let clean_path = input.file_path.trim_start_matches('/');

    let (url, headers) = match provider.as_str() {
        "gitlab" => {
            let base = input
                .base_url
                .as_deref()
                .unwrap_or("https://gitlab.com")
                .trim_end_matches('/');

            let encoded_project = percent_encode(&input.repository);
            let encoded_path = percent_encode(clean_path);
            let u = format!(
                "{}/api/v4/projects/{}/repository/files/{}?ref={}",
                base, encoded_project, encoded_path, branch
            );
            let h = vec![
                ("PRIVATE-TOKEN".to_string(), input.token.clone()),
                ("Accept".to_string(), "application/json".to_string()),
            ];
            (u, h)
        }
        "gitea" => {
            let base = input
                .base_url
                .as_deref()
                .unwrap_or("https://gitea.com")
                .trim_end_matches('/');
            let u = format!(
                "{}/api/v1/repos/{}/contents/{}?ref={}",
                base, input.repository, clean_path, branch
            );
            let h = vec![
                ("Authorization".to_string(), format!("token {}", input.token)),
                ("Accept".to_string(), "application/json".to_string()),
            ];
            (u, h)
        }
        _ => {
            // Default to GitHub
            let base = input
                .base_url
                .as_deref()
                .unwrap_or("https://api.github.com")
                .trim_end_matches('/');
            let u = format!(
                "{}/repos/{}/contents/{}?ref={}",
                base, input.repository, clean_path, branch
            );
            let h = vec![
                ("Authorization".to_string(), format!("Bearer {}", input.token)),
                ("Accept".to_string(), "application/vnd.github+json".to_string()),
                ("User-Agent".to_string(), "Haze-SSH-Client".to_string()),
            ];
            (u, h)
        }
    };

    let (status, body, _) = execute_sync_curl("GET", &url, &headers, None, 30)
        .await
        .map_err(|e| e.to_string())?;

    if status == 404 {
        return Err(format!(
            "Remote file '{}' not found in branch '{}' (HTTP 404).",
            clean_path, branch
        ));
    }

    if status >= 400 {
        return Err(format!("Git provider returned HTTP {}: {}", status, body.trim()));
    }

    let parsed: serde_json::Value = serde_json::from_str(&body)
        .map_err(|e| format!("Failed to parse Git response JSON: {}", e))?;

    let raw_content_base64 = parsed
        .get("content")
        .and_then(|c| c.as_str())
        .ok_or_else(|| "Response JSON missing 'content' field".to_string())?;

    // GitHub/GitLab often includes newline characters in base64 string
    let sanitized_base64: String = raw_content_base64
        .chars()
        .filter(|c| !c.is_whitespace())
        .collect();

    let decoded_bytes = BASE64
        .decode(&sanitized_base64)
        .map_err(|e| format!("Failed to decode base64 file content: {}", e))?;

    let content_str = String::from_utf8(decoded_bytes)
        .map_err(|e| format!("Remote file content is not valid UTF-8: {}", e))?;

    let sha = parsed
        .get("sha")
        .or_else(|| parsed.get("commit_id"))
        .or_else(|| parsed.get("blob_id"))
        .and_then(|s| s.as_str())
        .unwrap_or("")
        .to_string();

    Ok(GitFileGetOutput {
        content: content_str,
        sha,
        file_path: clean_path.to_string(),
    })
}

/// Commits an updated or newly created file to GitHub, GitLab, or Gitea
pub async fn git_file_put(input: GitFilePutInput) -> Result<GitFilePutOutput, String> {
    let branch = input.branch.as_deref().unwrap_or("main");
    let provider = input.provider.to_lowercase();
    let clean_path = input.file_path.trim_start_matches('/');
    let commit_msg = input
        .commit_message
        .unwrap_or_else(|| format!("chore: sync Haze SSH vault ({})", chrono::Utc::now().to_rfc3339()));

    let encoded_content = BASE64.encode(input.content.as_bytes());

    let (url, method, headers, payload) = match provider.as_str() {
        "gitlab" => {
            let base = input
                .base_url
                .as_deref()
                .unwrap_or("https://gitlab.com")
                .trim_end_matches('/');

            let encoded_project = percent_encode(&input.repository);
            let encoded_path = percent_encode(clean_path);
            let u = format!(
                "{}/api/v4/projects/{}/repository/files/{}",
                base, encoded_project, encoded_path
            );

            let method = if input.sha.is_some() { "PUT" } else { "POST" };
            let body = serde_json::json!({
                "branch": branch,
                "commit_message": commit_msg,
                "content": input.content,
                "encoding": "text",
            })
            .to_string();

            let h = vec![
                ("PRIVATE-TOKEN".to_string(), input.token.clone()),
                ("Content-Type".to_string(), "application/json".to_string()),
            ];
            (u, method, h, body)
        }
        "gitea" => {
            let base = input
                .base_url
                .as_deref()
                .unwrap_or("https://gitea.com")
                .trim_end_matches('/');
            let u = format!(
                "{}/api/v1/repos/{}/contents/{}",
                base, input.repository, clean_path
            );
            let mut map = serde_json::json!({
                "branch": branch,
                "message": commit_msg,
                "content": encoded_content,
            });

            if let Some(ref sha) = input.sha
                && !sha.is_empty() {
                map["sha"] = serde_json::Value::String(sha.clone());
            }

            let h = vec![
                ("Authorization".to_string(), format!("token {}", input.token)),
                ("Content-Type".to_string(), "application/json".to_string()),
            ];
            (u, "PUT", h, map.to_string())
        }
        _ => {
            // Default to GitHub
            let base = input
                .base_url
                .as_deref()
                .unwrap_or("https://api.github.com")
                .trim_end_matches('/');
            let u = format!(
                "{}/repos/{}/contents/{}",
                base, input.repository, clean_path
            );

            let mut map = serde_json::json!({
                "message": commit_msg,
                "content": encoded_content,
                "branch": branch,
            });

            if let Some(ref sha) = input.sha
                && !sha.is_empty() {
                map["sha"] = serde_json::Value::String(sha.clone());
            }

            let h = vec![
                ("Authorization".to_string(), format!("Bearer {}", input.token)),
                ("Accept".to_string(), "application/vnd.github+json".to_string()),
                ("User-Agent".to_string(), "Haze-SSH-Client".to_string()),
                ("Content-Type".to_string(), "application/json".to_string()),
            ];
            (u, "PUT", h, map.to_string())
        }
    };

    let (status, body, _) = execute_sync_curl(method, &url, &headers, Some(&payload), 45)
        .await
        .map_err(|e| e.to_string())?;

    if status >= 400 {
        if status == 409 {
            return Err("Conflict detected (HTTP 409): Remote repository has newer changes. Please pull and merge before pushing.".into());
        }
        return Err(format!("Git commit failed (HTTP {}): {}", status, body.trim()));
    }

    let parsed: serde_json::Value = serde_json::from_str(&body)
        .map_err(|e| format!("Failed to parse Git commit response JSON: {}", e))?;

    let new_sha = parsed
        .get("content")
        .and_then(|c| c.get("sha"))
        .or_else(|| parsed.get("commit"))
        .or_else(|| parsed.get("sha"))
        .and_then(|s| s.as_str())
        .unwrap_or("")
        .to_string();

    let commit_url = parsed
        .get("commit")
        .and_then(|c| c.get("html_url"))
        .and_then(|s| s.as_str())
        .map(|s| s.to_string());

    Ok(GitFilePutOutput {
        sha: new_sha,
        commit_url,
    })
}

/// Executes a WebDAV request (GET, PUT, PROPFIND, MKCOL) with optional Basic auth
pub async fn webdav_request(input: WebDavRequestInput) -> Result<WebDavRequestOutput, String> {
    let timeout = input.timeout_seconds.unwrap_or(45);
    let mut headers = Vec::new();

    if let (Some(u), Some(p)) = (&input.username, &input.password) {
        let credentials = format!("{}:{}", u, p);
        let encoded = BASE64.encode(credentials.as_bytes());
        headers.push(("Authorization".to_string(), format!("Basic {}", encoded)));
    }

    if input.method.eq_ignore_ascii_case("PUT") {
        headers.push(("Content-Type".to_string(), "application/json".to_string()));
    } else if input.method.eq_ignore_ascii_case("PROPFIND") {
        headers.push(("Depth".to_string(), "1".to_string()));
        headers.push(("Content-Type".to_string(), "application/xml".to_string()));
    }

    let (status, body, etag) = execute_sync_curl(
        &input.method,
        &input.url,
        &headers,
        input.body.as_deref(),
        timeout,
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(WebDavRequestOutput { status, body, etag })
}

/// Reads or writes vault backup to local shared folder (Syncthing, iCloud Drive, Nextcloud)
pub fn local_folder_sync(input: LocalFolderSyncInput) -> Result<LocalFolderSyncOutput, String> {
    let target_dir = Path::new(&input.folder_path);
    if !target_dir.exists() {
        std::fs::create_dir_all(target_dir)
            .map_err(|e| format!("Failed to create sync directory '{}': {}", input.folder_path, e))?;
    }

    let file_name = input.file_name.as_deref().unwrap_or("haze-vault.haze");
    let full_path = target_dir.join(file_name);

    if let Some(content_to_write) = input.content {
        let temp_path = target_dir.join(format!("{}.tmp", file_name));
        std::fs::write(&temp_path, &content_to_write)
            .map_err(|e| format!("Failed to write sync temp file: {}", e))?;

        std::fs::rename(&temp_path, &full_path)
            .map_err(|e| format!("Failed to atomically replace '{}': {}", full_path.display(), e))?;

        let modified_at = chrono::Utc::now().timestamp_millis();

        Ok(LocalFolderSyncOutput {
            content: content_to_write,
            full_path: full_path.to_string_lossy().to_string(),
            modified_at,
        })
    } else {
        if !full_path.exists() {
            return Err(format!(
                "Local sync file '{}' does not exist in folder '{}'.",
                file_name, input.folder_path
            ));
        }

        let content = std::fs::read_to_string(&full_path)
            .map_err(|e| format!("Failed to read sync file '{}': {}", full_path.display(), e))?;

        let metadata = std::fs::metadata(&full_path)
            .map_err(|e| format!("Failed to get file metadata: {}", e))?;

        let modified_at = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64)
            .unwrap_or_else(|| chrono::Utc::now().timestamp_millis());

        Ok(LocalFolderSyncOutput {
            content,
            full_path: full_path.to_string_lossy().to_string(),
            modified_at,
        })
    }
}
