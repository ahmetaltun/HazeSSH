use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultStatus {
    pub is_locked: bool,
    pub has_master_password: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HostGroup {
    pub id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub color: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateGroupInput {
    pub parent_id: Option<String>,
    pub name: String,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Identity {
    pub id: String,
    pub name: String,
    pub identity_type: String, // "password", "key", "cert"
    pub username: Option<String>,
    // Plaintext is only populated when unlocked and needed
    pub has_secret: bool,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateIdentityInput {
    pub name: String,
    pub identity_type: String,
    pub username: Option<String>,
    pub secret: String, // password or private key plaintext
    pub passphrase: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Host {
    pub id: String,
    pub group_id: Option<String>,
    pub label: String,
    pub hostname: String,
    pub port: u16,
    pub username: Option<String>,
    pub auth_type: String, // "identity", "interactive", "agent"
    pub identity_id: Option<String>,
    pub jump_host_id: Option<String>,
    pub tags: Vec<String>,
    pub color: Option<String>,
    pub terminal_theme: Option<String>,
    pub startup_snippet_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateHostInput {
    pub group_id: Option<String>,
    pub label: String,
    pub hostname: String,
    pub port: Option<u16>,
    pub username: Option<String>,
    pub auth_type: Option<String>,
    pub identity_id: Option<String>,
    pub jump_host_id: Option<String>,
    pub tags: Option<Vec<String>>,
    pub color: Option<String>,
    pub terminal_theme: Option<String>,
    pub startup_snippet_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateHostInput {
    pub id: String,
    pub group_id: Option<String>,
    pub label: String,
    pub hostname: String,
    pub port: u16,
    pub username: Option<String>,
    pub auth_type: String,
    pub identity_id: Option<String>,
    pub jump_host_id: Option<String>,
    pub tags: Vec<String>,
    pub color: Option<String>,
    pub terminal_theme: Option<String>,
    pub startup_snippet_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Snippet {
    pub id: String,
    pub title: String,
    pub script: String,
    pub description: Option<String>,
    pub tags: Vec<String>,
    pub run_on_connect: bool,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSnippetInput {
    pub title: String,
    pub script: String,
    pub description: Option<String>,
    pub tags: Option<Vec<String>>,
    pub run_on_connect: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateSnippetInput {
    pub id: String,
    pub title: String,
    pub script: String,
    pub description: Option<String>,
    pub tags: Option<Vec<String>>,
    pub run_on_connect: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tunnel {
    pub id: String,
    pub host_id: String,
    pub name: String,
    pub tunnel_type: String, // "local", "remote", "dynamic"
    pub local_host: String,
    pub local_port: u16,
    pub remote_host: Option<String>,
    pub remote_port: Option<u16>,
    pub auto_start: bool,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateTunnelInput {
    pub host_id: String,
    pub name: String,
    pub tunnel_type: String,
    pub local_host: Option<String>,
    pub local_port: u16,
    pub remote_host: Option<String>,
    pub remote_port: Option<u16>,
    pub auto_start: Option<bool>,
}
