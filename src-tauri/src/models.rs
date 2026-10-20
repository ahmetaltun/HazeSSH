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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupEnvelope {
    pub format: String,
    pub version: u32,
    pub salt: String,
    pub nonce: String,
    pub ciphertext: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupIdentity {
    pub id: String,
    pub name: String,
    pub identity_type: String,
    pub username: Option<String>,
    pub secret: String,
    pub passphrase: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupData {
    pub version: u32,
    pub exported_at: i64,
    pub groups: Vec<HostGroup>,
    pub identities: Vec<BackupIdentity>,
    pub hosts: Vec<Host>,
    pub snippets: Vec<Snippet>,
    pub tunnels: Vec<Tunnel>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupSummary {
    pub version: u32,
    pub exported_at: i64,
    pub groups_count: usize,
    pub identities_count: usize,
    pub hosts_count: usize,
    pub snippets_count: usize,
    pub tunnels_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshConfigHostCandidate {
    pub label: String,
    pub hostname: String,
    pub port: u16,
    pub username: Option<String>,
    pub identity_file: Option<String>,
    pub proxy_jump: Option<String>,
    pub group_name: Option<String>,
    pub is_duplicate: bool,
    pub is_known_host: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshConfigParseResult {
    pub config_path: String,
    pub found_config: bool,
    pub found_known_hosts: bool,
    pub candidates: Vec<SshConfigHostCandidate>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportSshHostsInput {
    pub candidates: Vec<SshConfigHostCandidate>,
    pub import_keys_as_identities: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResultSummary {
    pub imported_hosts_count: usize,
    pub imported_groups_count: usize,
    pub imported_identities_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TermiusParseResult {
    pub candidates: Vec<SshConfigHostCandidate>,
    pub snippets: Vec<CreateSnippetInput>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportTermiusInput {
    pub candidates: Vec<SshConfigHostCandidate>,
    pub snippets: Vec<CreateSnippetInput>,
    pub import_keys_as_identities: bool,
}
