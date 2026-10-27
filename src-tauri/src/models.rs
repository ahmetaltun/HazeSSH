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
    #[serde(default)]
    pub enable_audit_log: Option<bool>,
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
    #[serde(default)]
    pub enable_audit_log: Option<bool>,
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
    #[serde(default)]
    pub enable_audit_log: Option<bool>,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PuttyDetectResult {
    pub sessions_dir: String,
    pub found: bool,
    pub candidates: Vec<SshConfigHostCandidate>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerMetrics {
    pub host_id: String,
    pub os_name: Option<String>,
    pub uptime_seconds: Option<u64>,
    pub uptime_formatted: Option<String>,
    pub cpu_cores: u32,
    pub load_1m: Option<f32>,
    pub load_5m: Option<f32>,
    pub load_15m: Option<f32>,
    pub cpu_usage_percent: Option<f32>,
    pub memory_total_bytes: Option<u64>,
    pub memory_used_bytes: Option<u64>,
    pub memory_free_bytes: Option<u64>,
    pub memory_usage_percent: Option<f32>,
    pub disk_total_bytes: Option<u64>,
    pub disk_used_bytes: Option<u64>,
    pub disk_free_bytes: Option<u64>,
    pub disk_usage_percent: Option<f32>,
    pub disk_mount_path: Option<String>,
    pub timestamp: i64,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SerialPortInfo {
    pub port_name: String,
    pub port_type: String, // "usb", "pci", "bluetooth", "unknown"
    pub manufacturer: Option<String>,
    pub product: Option<String>,
    pub serial_number: Option<String>,
    pub vid: Option<u16>,
    pub pid: Option<u16>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SerialConnectOptions {
    pub port_name: String,
    pub baud_rate: u32,
    pub data_bits: Option<u8>,
    pub parity: Option<String>,
    pub stop_bits: Option<u8>,
    pub flow_control: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelnetConnectOptions {
    pub host: String,
    pub port: u16,
    pub terminal_type: Option<String>,
    pub cols: Option<u16>,
    pub rows: Option<u16>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContainerItem {
    pub id: String,
    pub names: String,
    pub image: String,
    pub status: String,
    pub state: String,
    pub ports: String,
    pub engine: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceItem {
    pub unit: String,
    pub load_state: String,
    pub active_state: String,
    pub sub_state: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenPortItem {
    pub protocol: String,
    pub local_address: String,
    pub local_port: u16,
    pub foreign_address: String,
    pub state: String,
    pub process: Option<String>,
    pub pid: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerToolboxOverview {
    pub host_id: String,
    pub containers: Vec<ContainerItem>,
    pub services: Vec<ServiceItem>,
    pub ports: Vec<OpenPortItem>,
    pub docker_installed: bool,
    pub systemd_installed: bool,
    pub timestamp: i64,
    pub error: Option<String>,
}



