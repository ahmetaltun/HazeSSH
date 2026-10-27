use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use chrono::Utc;
use russh::client;
use russh::ChannelMsg;
use russh_keys::key;
use tokio::sync::Mutex;
use serde::{Deserialize, Serialize};

use crate::commands::AppState;
use crate::models::{
    ContainerItem, DockerDiskUsage, OpenPortItem, ProcessItem, ServerToolboxOverview,
    ServiceItem, StorageMountItem,
};

/// High-speed core inspection probe (<150ms remote execution).
/// Extracts containers list, services, listening ports, top processes, and storage mounts.
pub const FAST_TOOLBOX_PROBE_COMMAND: &str = r#"
echo '===HAZE_TOOLBOX_START==='
echo '---DOCKER_CHECK---'
which docker 2>/dev/null || which podman 2>/dev/null || echo 'none'
echo '---CONTAINERS---'
(docker ps -a --format '{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.State}}\t{{.Ports}}\tdocker' 2>/dev/null || podman ps -a --format '{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.State}}\t{{.Ports}}\tpodman' 2>/dev/null)
echo '---SYSTEMD_CHECK---'
which systemctl 2>/dev/null || echo 'none'
echo '---SERVICES---'
systemctl list-units --type=service --all --no-pager --plain --no-legend 2>/dev/null
echo '---PORTS---'
(ss -tulpn 2>/dev/null || netstat -tulpn 2>/dev/null)
echo '---PROCESSES---'
ps -eo pid,user,%cpu,%mem,args --sort=-%cpu 2>/dev/null | head -n 40
echo '---STORAGE---'
df -h -P 2>/dev/null
echo '===HAZE_TOOLBOX_END==='
"#;

/// Heavy background telemetry probe.
/// Runs `docker stats` and `docker system df` concurrently via background subshells to cut latency in half.
pub const HEAVY_TELEMETRY_PROBE_COMMAND: &str = r#"
tmp_stats=$(mktemp 2>/dev/null || echo "/tmp/haze_stats_$$")
tmp_df=$(mktemp 2>/dev/null || echo "/tmp/haze_df_$$")
( (docker stats --no-stream --format '{{.ID}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}' 2>/dev/null || podman stats --no-stream --format '{{.ID}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}' 2>/dev/null) > "$tmp_stats" 2>/dev/null ) &
PID_STATS=$!
( (docker system df 2>/dev/null) > "$tmp_df" 2>/dev/null ) &
PID_DF=$!
wait $PID_STATS $PID_DF 2>/dev/null
echo '===HAZE_TELEMETRY_START==='
echo '---CONTAINER_STATS---'
cat "$tmp_stats" 2>/dev/null
rm -f "$tmp_stats" 2>/dev/null
echo '---DOCKER_DF---'
cat "$tmp_df" 2>/dev/null
rm -f "$tmp_df" 2>/dev/null
echo '===HAZE_TELEMETRY_END==='
"#;

pub const TOOLBOX_PROBE_COMMAND: &str = FAST_TOOLBOX_PROBE_COMMAND;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContainerStatsMetric {
    pub cpu_percent: String,
    pub memory_usage: String,
    pub memory_percent: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolboxTelemetry {
    pub host_id: String,
    pub container_stats: HashMap<String, ContainerStatsMetric>,
    pub docker_disk_usage: Option<DockerDiskUsage>,
}

pub struct ToolboxClientHandler;

#[async_trait::async_trait]
impl client::Handler for ToolboxClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &key::PublicKey,
    ) -> Result<bool, Self::Error> {
        Ok(true)
    }
}

pub struct ToolboxSessionEntry {
    pub session: client::Handle<ToolboxClientHandler>,
    pub last_used: Instant,
}

/// Thread-safe SSH connection pool for agentless toolbox operations.
/// Reuses open authenticated sessions, avoiding 1.5-2.5s TCP/crypto handshakes on every request.
pub struct ToolboxManager {
    sessions: Arc<Mutex<HashMap<String, Arc<Mutex<ToolboxSessionEntry>>>>>,
}

impl ToolboxManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Retrieves an existing active session or establishes a new authenticated session.
    pub async fn get_session(
        &self,
        host_id: &str,
        state: &AppState,
    ) -> Result<Arc<Mutex<ToolboxSessionEntry>>, String> {
        let mut map = self.sessions.lock().await;

        if let Some(entry_arc) = map.get(host_id) {
            let mut entry = entry_arc.lock().await;
            if !entry.session.is_closed() && entry.last_used.elapsed() < Duration::from_secs(90) {
                entry.last_used = Instant::now();
                return Ok(entry_arc.clone());
            }
        }

        // Establish fresh session
        let session = connect_toolbox_ssh(host_id, state).await?;
        let entry_arc = Arc::new(Mutex::new(ToolboxSessionEntry {
            session,
            last_used: Instant::now(),
        }));
        map.insert(host_id.to_string(), entry_arc.clone());
        Ok(entry_arc)
    }

    /// Evicts an invalid or broken session from the pool.
    pub async fn invalidate_session(&self, host_id: &str) {
        let mut map = self.sessions.lock().await;
        map.remove(host_id);
    }
}

impl Default for ToolboxManager {
    fn default() -> Self {
        Self::new()
    }
}

async fn connect_toolbox_ssh(
    host_id: &str,
    state: &AppState,
) -> Result<client::Handle<ToolboxClientHandler>, String> {
    let hosts = state.db.list_hosts().map_err(|e| format!("Database error: {}", e))?;
    let host = hosts
        .into_iter()
        .find(|h| h.id == host_id)
        .ok_or_else(|| format!("Host with ID '{}' not found in vault", host_id))?;

    let mut config = client::Config::default();
    config.keepalive_interval = Some(Duration::from_secs(15));
    let config = Arc::new(config);

    let connect_future = client::connect(config, (host.hostname.as_str(), host.port), ToolboxClientHandler);
    let mut session = tokio::time::timeout(Duration::from_secs(8), connect_future)
        .await
        .map_err(|_| format!("Connection to {}:{} timed out after 8 seconds", host.hostname, host.port))?
        .map_err(|e| format!("Failed to connect to {}:{}: {}", host.hostname, host.port, e))?;

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
        return Err(format!("SSH authentication failed for user '{}' on {}:{}", username, host.hostname, host.port));
    }

    Ok(session)
}

/// Helper to execute a remote command returning stdout, utilizing the connection pool.
async fn run_remote_ssh_command(
    host_id: &str,
    state: &AppState,
    cmd: &str,
    timeout_secs: u64,
) -> Result<String, String> {
    // 1. Obtain pooled session
    let entry_arc = state.toolbox_manager.get_session(host_id, state).await?;
    let entry = entry_arc.lock().await;

    let channel_res = entry.session.channel_open_session().await;
    let mut channel = match channel_res {
        Ok(ch) => ch,
        Err(_) => {
            // Disconnect/socket drop recovery: clear pool and reconnect once
            drop(entry);
            state.toolbox_manager.invalidate_session(host_id).await;
            let fresh_arc = state.toolbox_manager.get_session(host_id, state).await?;
            let fresh_entry = fresh_arc.lock().await;
            fresh_entry.session.channel_open_session().await.map_err(|e| {
                format!("Failed to open session channel on host {}: {}", host_id, e)
            })?
        }
    };

    channel
        .exec(true, cmd)
        .await
        .map_err(|e| format!("Failed to execute command on host {}: {}", host_id, e))?;

    let mut stdout_buffer = Vec::new();
    let collect_future = async {
        while let Some(msg) = channel.wait().await {
            match msg {
                ChannelMsg::Data { ref data } => {
                    stdout_buffer.extend_from_slice(data);
                }
                ChannelMsg::ExitStatus { .. } => {
                    break;
                }
                ChannelMsg::Close => {
                    break;
                }
                _ => {}
            }
        }
    };

    let _ = tokio::time::timeout(Duration::from_secs(timeout_secs), collect_future).await;
    Ok(String::from_utf8_lossy(&stdout_buffer).to_string())
}

/// Executes the fast core inspection probe over SSH and parses telemetry (<200ms)
pub async fn fetch_server_toolbox_overview(
    host_id: &str,
    state: &AppState,
) -> Result<ServerToolboxOverview, String> {
    let raw_output = run_remote_ssh_command(host_id, state, FAST_TOOLBOX_PROBE_COMMAND, 8).await?;
    let overview = parse_toolbox_output(host_id, &raw_output);
    Ok(overview)
}

/// Executes the heavy telemetry probe (Docker stats & system df) in the background
pub async fn fetch_server_toolbox_telemetry(
    host_id: &str,
    state: &AppState,
) -> Result<ToolboxTelemetry, String> {
    let raw_output = run_remote_ssh_command(host_id, state, HEAVY_TELEMETRY_PROBE_COMMAND, 10).await?;
    let telemetry = parse_telemetry_output(host_id, &raw_output);
    Ok(telemetry)
}

/// Executes a container action (start, stop, restart) on the remote host
pub async fn execute_container_action(
    host_id: &str,
    container_id: &str,
    action: &str,
    state: &AppState,
) -> Result<String, String> {
    if !["start", "stop", "restart"].contains(&action) {
        return Err(format!("Invalid container action '{}'. Allowed: start, stop, restart", action));
    }

    let clean_id: String = container_id.chars().filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_').collect();
    if clean_id.is_empty() {
        return Err("Invalid container ID format".into());
    }

    let cmd = format!(
        "(docker {} {} 2>&1 || podman {} {} 2>&1)",
        action, clean_id, action, clean_id
    );

    run_remote_ssh_command(host_id, state, &cmd, 15).await
}

/// Fetches recent logs from a container
pub async fn fetch_container_logs(
    host_id: &str,
    container_id: &str,
    tail_lines: u32,
    state: &AppState,
) -> Result<String, String> {
    let clean_id: String = container_id.chars().filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_').collect();
    if clean_id.is_empty() {
        return Err("Invalid container ID format".into());
    }
    let lines = tail_lines.clamp(10, 1000);
    let cmd = format!(
        "(docker logs --tail {} {} 2>&1 || podman logs --tail {} {} 2>&1)",
        lines, clean_id, lines, clean_id
    );

    run_remote_ssh_command(host_id, state, &cmd, 10).await
}

/// Executes a systemd service action (start, stop, restart, kill)
pub async fn execute_service_action(
    host_id: &str,
    service_unit: &str,
    action: &str,
    state: &AppState,
) -> Result<String, String> {
    if !["start", "stop", "restart", "kill"].contains(&action) {
        return Err(format!(
            "Invalid service action '{}'. Allowed: start, stop, restart, kill",
            action
        ));
    }

    let clean_unit: String = service_unit
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_' || *c == '.' || *c == '@')
        .collect();
    if clean_unit.is_empty() {
        return Err("Invalid service unit name".into());
    }

    let cmd = if action == "kill" {
        format!(
            "(systemctl kill -s SIGKILL {} 2>&1 || sudo -n systemctl kill -s SIGKILL {} 2>&1 || systemctl kill {} 2>&1 || sudo -n systemctl kill {} 2>&1)",
            clean_unit, clean_unit, clean_unit, clean_unit
        )
    } else {
        format!(
            "(systemctl {} {} 2>&1 || sudo -n systemctl {} {} 2>&1)",
            action, clean_unit, action, clean_unit
        )
    };

    run_remote_ssh_command(host_id, state, &cmd, 15).await
}

/// Fetches journalctl logs for a systemd service unit
pub async fn fetch_service_logs(
    host_id: &str,
    service_unit: &str,
    tail_lines: u32,
    state: &AppState,
) -> Result<String, String> {
    let clean_unit: String = service_unit.chars().filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_' || *c == '.' || *c == '@').collect();
    if clean_unit.is_empty() {
        return Err("Invalid service unit name".into());
    }
    let lines = tail_lines.clamp(10, 1000);
    let cmd = format!(
        "(journalctl -u {} -n {} --no-pager 2>&1 || sudo -n journalctl -u {} -n {} --no-pager 2>&1)",
        clean_unit, lines, clean_unit, lines
    );

    run_remote_ssh_command(host_id, state, &cmd, 10).await
}

/// Kills a process by PID
pub async fn execute_kill_process(
    host_id: &str,
    pid: u32,
    state: &AppState,
) -> Result<String, String> {
    if pid <= 1 {
        return Err("Cannot kill system init PID 1".into());
    }

    let cmd = format!(
        "(kill -15 {} 2>&1 || kill -9 {} 2>&1 || sudo -n kill -9 {} 2>&1)",
        pid, pid, pid
    );

    run_remote_ssh_command(host_id, state, &cmd, 10).await
}

/// Prunes unused docker build cache, volumes, and stopped containers
pub async fn execute_docker_prune(
    host_id: &str,
    state: &AppState,
) -> Result<String, String> {
    let cmd = "(docker system prune -f 2>&1 || podman system prune -f 2>&1)";
    run_remote_ssh_command(host_id, state, cmd, 30).await
}

/// Parses the tagged probe output into a structured `ServerToolboxOverview`
pub fn parse_toolbox_output(host_id: &str, raw: &str) -> ServerToolboxOverview {
    let mut sections: HashMap<&str, String> = HashMap::new();
    let mut current_section: Option<&str> = None;

    for line in raw.lines() {
        let trimmed = line.trim();
        if trimmed == "===HAZE_TOOLBOX_START===" || trimmed == "===HAZE_TOOLBOX_END===" {
            continue;
        }

        if trimmed.starts_with("---") && trimmed.ends_with("---") && trimmed.len() > 6 {
            let section_name = &trimmed[3..trimmed.len() - 3];
            current_section = Some(section_name);
            sections.entry(section_name).or_default();
            continue;
        }

        if let Some(sec) = current_section {
            let entry = sections.entry(sec).or_default();
            entry.push_str(line);
            entry.push('\n');
        }
    }

    // 1. Docker / Podman check
    let docker_installed = sections
        .get("DOCKER_CHECK")
        .map(|s| {
            let t = s.trim();
            !t.is_empty() && t != "none" && !t.contains("not found")
        })
        .unwrap_or(false);

    // 2. Container stats map (ID prefix -> (cpu_percent, memory_usage, memory_percent))
    let mut stats_map: HashMap<String, (String, String, String)> = HashMap::new();
    if let Some(stats_content) = sections.get("CONTAINER_STATS") {
        for line in stats_content.lines() {
            let parts: Vec<&str> = line.split('\t').collect();
            if parts.len() >= 4 {
                let id_prefix = parts[0].trim().chars().take(12).collect::<String>();
                let cpu = parts[1].trim().to_string();
                let mem_usage = parts[2].trim().to_string();
                let mem_pct = parts[3].trim().to_string();
                stats_map.insert(id_prefix, (cpu, mem_usage, mem_pct));
            }
        }
    }

    // 3. Containers
    let mut containers = Vec::new();
    if let Some(content) = sections.get("CONTAINERS") {
        for line in content.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with("CONTAINER ID") {
                continue;
            }
            let parts: Vec<&str> = line.split('\t').collect();
            if parts.len() >= 6 {
                let full_id = parts[0].trim().to_string();
                let short_id: String = full_id.chars().take(12).collect();
                let stats = stats_map.get(&short_id);

                containers.push(ContainerItem {
                    id: full_id,
                    names: parts[1].trim().to_string(),
                    image: parts[2].trim().to_string(),
                    status: parts[3].trim().to_string(),
                    state: parts[4].trim().to_lowercase(),
                    ports: parts[5].trim().to_string(),
                    engine: parts.get(6).unwrap_or(&"docker").trim().to_string(),
                    cpu_percent: stats.map(|s| s.0.clone()),
                    memory_usage: stats.map(|s| s.1.clone()),
                    memory_percent: stats.map(|s| s.2.clone()),
                });
            }
        }
    }

    // 4. Systemd check
    let systemd_installed = sections
        .get("SYSTEMD_CHECK")
        .map(|s| {
            let t = s.trim();
            !t.is_empty() && t != "none" && !t.contains("not found")
        })
        .unwrap_or(false);

    // 5. Services
    let mut services = Vec::new();
    if let Some(content) = sections.get("SERVICES") {
        for line in content.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with("UNIT") {
                continue;
            }
            let tokens: Vec<&str> = line.split_whitespace().collect();
            if tokens.len() >= 4 {
                let unit = tokens[0].trim_start_matches(['●', '*', ' ']).to_string();
                if !unit.ends_with(".service") {
                    continue;
                }
                let load_state = tokens[1].to_string();
                let active_state = tokens[2].to_string();
                let sub_state = tokens[3].to_string();
                let description = if tokens.len() > 4 {
                    tokens[4..].join(" ")
                } else {
                    String::new()
                };

                services.push(ServiceItem {
                    unit,
                    load_state,
                    active_state,
                    sub_state,
                    description,
                });
            }
        }
    }

    // 6. Open Ports
    let mut ports = Vec::new();
    if let Some(content) = sections.get("PORTS") {
        for line in content.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with("Netid") || line.starts_with("Active") || line.starts_with("Proto") {
                continue;
            }
            let tokens: Vec<&str> = line.split_whitespace().collect();
            if tokens.len() >= 5 {
                let proto = tokens[0].to_lowercase();
                if !proto.starts_with("tcp") && !proto.starts_with("udp") {
                    continue;
                }

                let (state, local_idx, proc_start_idx) = if tokens[1] == "LISTEN" || tokens[1] == "UNCONN" {
                    (tokens[1].to_string(), 4, 6)
                } else if tokens.len() >= 6 && (tokens[5] == "LISTEN" || tokens[5] == "UNCONN") {
                    (tokens[5].to_string(), 3, 6)
                } else {
                    (tokens[1].to_string(), 4, 6)
                };

                let local_str = tokens.get(local_idx).unwrap_or(&"");
                let foreign_str = tokens.get(local_idx + 1).unwrap_or(&"*:*").to_string();

                if let Some(last_colon) = local_str.rfind(':') {
                    let addr = &local_str[..last_colon];
                    let port_str = &local_str[last_colon + 1..];
                    if let Ok(port_num) = port_str.parse::<u16>() {
                        let proc_tokens = if tokens.len() > proc_start_idx {
                            tokens[proc_start_idx..].join(" ")
                        } else {
                            String::new()
                        };

                        let (process, pid) = parse_process_and_pid(&proc_tokens);

                        ports.push(OpenPortItem {
                            protocol: proto,
                            local_address: if addr.is_empty() || addr == "*" { "0.0.0.0".into() } else { addr.to_string() },
                            local_port: port_num,
                            foreign_address: foreign_str,
                            state,
                            process,
                            pid,
                        });
                    }
                }
            }
        }
    }

    ports.sort_by_key(|p| p.local_port);

    // 7. Processes
    let mut processes = Vec::new();
    if let Some(content) = sections.get("PROCESSES") {
        for line in content.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with("PID") {
                continue;
            }
            let tokens: Vec<&str> = line.split_whitespace().collect();
            if tokens.len() >= 5
                && let Ok(pid) = tokens[0].parse::<u32>()
            {
                let user = tokens[1].to_string();
                let cpu_percent = tokens[2].parse::<f32>().unwrap_or(0.0);
                let memory_percent = tokens[3].parse::<f32>().unwrap_or(0.0);
                let command = tokens[4..].join(" ");

                processes.push(ProcessItem {
                    pid,
                    user,
                    cpu_percent,
                    memory_percent,
                    command,
                });
            }
        }
    }

    // 8. Storage & Mounts (df -h -P)
    let mut storage = Vec::new();
    if let Some(content) = sections.get("STORAGE") {
        for line in content.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with("Filesystem") {
                continue;
            }
            let tokens: Vec<&str> = line.split_whitespace().collect();
            if tokens.len() >= 6 {
                let filesystem = tokens[0].to_string();
                let total_size = tokens[1].to_string();
                let used_size = tokens[2].to_string();
                let available_size = tokens[3].to_string();
                let usage_percent = tokens[4].trim_end_matches('%').parse::<f32>().unwrap_or(0.0);
                let mount_point = tokens[5].to_string();

                // Skip non-interesting temporary filesystems
                if filesystem.starts_with("/dev/") || mount_point == "/" || mount_point.starts_with("/home") || mount_point.starts_with("/data") || mount_point.starts_with("/var") {
                    storage.push(StorageMountItem {
                        filesystem,
                        total_size,
                        used_size,
                        available_size,
                        usage_percent,
                        mount_point,
                    });
                }
            }
        }
    }

    // 9. Docker Disk Usage (docker system df)
    let docker_disk_usage = sections.get("DOCKER_DF").and_then(|content| parse_docker_df(content));

    ServerToolboxOverview {
        host_id: host_id.to_string(),
        containers,
        services,
        ports,
        processes,
        storage,
        docker_disk_usage,
        docker_installed,
        systemd_installed,
        timestamp: Utc::now().timestamp(),
        error: None,
    }
}

/// Parses the output of `docker system df`
pub fn parse_docker_df(content: &str) -> Option<DockerDiskUsage> {
    let mut images_size = None;
    let mut containers_size = None;
    let mut volumes_size = None;
    let mut build_cache_size = None;

    for line in content.lines() {
        let lower = line.to_lowercase();
        let tokens: Vec<&str> = line.split_whitespace().collect();
        if lower.starts_with("images") && tokens.len() >= 4 {
            images_size = Some(format!("{} ({} reclaimable)", tokens[3], tokens.get(4).unwrap_or(&"")));
        } else if lower.starts_with("containers") && tokens.len() >= 3 {
            containers_size = Some(tokens[2].to_string());
        } else if lower.starts_with("local volumes") && tokens.len() >= 4 {
            volumes_size = Some(tokens[3].to_string());
        } else if lower.starts_with("build cache") && tokens.len() >= 4 {
            build_cache_size = Some(tokens[3].to_string());
        }
    }

    if images_size.is_some() || containers_size.is_some() {
        Some(DockerDiskUsage {
            images_size,
            containers_size,
            volumes_size,
            build_cache_size,
        })
    } else {
        None
    }
}

/// Parses the tagged output of the heavy background telemetry probe
pub fn parse_telemetry_output(host_id: &str, raw: &str) -> ToolboxTelemetry {
    let mut sections: HashMap<&str, String> = HashMap::new();
    let mut current_section: Option<&str> = None;

    for line in raw.lines() {
        let trimmed = line.trim();
        if trimmed == "===HAZE_TELEMETRY_START===" || trimmed == "===HAZE_TELEMETRY_END===" {
            continue;
        }

        if trimmed.starts_with("---") && trimmed.ends_with("---") && trimmed.len() > 6 {
            let section_name = &trimmed[3..trimmed.len() - 3];
            current_section = Some(section_name);
            sections.entry(section_name).or_default();
            continue;
        }

        if let Some(sec) = current_section {
            let entry = sections.entry(sec).or_default();
            entry.push_str(line);
            entry.push('\n');
        }
    }

    let mut container_stats: HashMap<String, ContainerStatsMetric> = HashMap::new();
    if let Some(stats_content) = sections.get("CONTAINER_STATS") {
        for line in stats_content.lines() {
            let parts: Vec<&str> = line.split('\t').collect();
            if parts.len() >= 4 {
                let id_prefix = parts[0].trim().chars().take(12).collect::<String>();
                let cpu = parts[1].trim().to_string();
                let mem_usage = parts[2].trim().to_string();
                let mem_pct = parts[3].trim().to_string();
                container_stats.insert(
                    id_prefix,
                    ContainerStatsMetric {
                        cpu_percent: cpu,
                        memory_usage: mem_usage,
                        memory_percent: mem_pct,
                    },
                );
            }
        }
    }

    let docker_disk_usage = sections.get("DOCKER_DF").and_then(|content| parse_docker_df(content));

    ToolboxTelemetry {
        host_id: host_id.to_string(),
        container_stats,
        docker_disk_usage,
    }
}

fn parse_process_and_pid(raw: &str) -> (Option<String>, Option<u32>) {
    if raw.is_empty() {
        return (None, None);
    }

    if let Some(users_idx) = raw.find("users:((") {
        let inside = &raw[users_idx + 8..];
        let prog = inside.split('"').nth(1).map(|s| s.to_string());
        let pid = if let Some(pid_idx) = inside.find("pid=") {
            let after_pid = &inside[pid_idx + 4..];
            after_pid
                .chars()
                .take_while(|c| c.is_ascii_digit())
                .collect::<String>()
                .parse::<u32>()
                .ok()
        } else {
            None
        };
        return (prog, pid);
    }

    if let Some(slash_idx) = raw.find('/') {
        let pid_str = &raw[..slash_idx].trim();
        let prog_str = &raw[slash_idx + 1..].trim();
        let pid = pid_str.parse::<u32>().ok();
        let prog = if prog_str.is_empty() { None } else { Some(prog_str.to_string()) };
        return (prog, pid);
    }

    (Some(raw.trim().to_string()), None)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_toolbox_output() {
        let mock_raw = r#"
===HAZE_TOOLBOX_START===
---DOCKER_CHECK---
/usr/bin/docker
---CONTAINERS---
c85f53882737	nginx-proxy	nginx:alpine	Up 3 hours	running	0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp	docker
a1b2c3d4e5f6	redis-cache	redis:7-alpine	Exited (0) 10 minutes ago	exited		docker
---CONTAINER_STATS---
c85f53882737	0.15%	42.1MiB / 3.8GiB	1.08%
---SYSTEMD_CHECK---
/bin/systemctl
---SERVICES---
cron.service loaded active running Regular background program processing daemon
nginx.service loaded active running A high performance web server
sshd.service loaded active running OpenSSH server daemon
failed.service loaded failed failed Failed Service Test
---PORTS---
tcp LISTEN 0 128 0.0.0.0:22 0.0.0.0:* users:(("sshd",pid=842,fd=3))
tcp LISTEN 0 511 127.0.0.1:6379 0.0.0.0:* users:(("redis-server",pid=1023,fd=6))
udp UNCONN 0 0 0.0.0.0:5353 0.0.0.0:* users:(("avahi-daemon",pid=650,fd=12))
---PROCESSES---
PID USER %CPU %MEM COMMAND
842 root 0.1 0.2 /usr/sbin/sshd -D
1023 redis 0.4 1.5 redis-server 127.0.0.1:6379
---STORAGE---
Filesystem 1024-blocks Used Available Capacity Mounted on
/dev/sda1 40G 12G 28G 30% /
/dev/sdb1 100G 45G 55G 45% /data
---DOCKER_DF---
TYPE TOTAL ACTIVE SIZE RECLAIMABLE
Images 5 2 1.4GB 800MB (57%)
Containers 2 1 12MB 0B (0%)
Local Volumes 1 1 50MB 0B (0%)
Build Cache 0 0 0B 0B
===HAZE_TOOLBOX_END===
"#;

        let overview = parse_toolbox_output("host-test-1", mock_raw);

        assert_eq!(overview.host_id, "host-test-1");
        assert!(overview.docker_installed);
        assert!(overview.systemd_installed);

        // Containers & Stats
        assert_eq!(overview.containers.len(), 2);
        assert_eq!(overview.containers[0].id, "c85f53882737");
        assert_eq!(overview.containers[0].names, "nginx-proxy");
        assert_eq!(overview.containers[0].state, "running");
        assert_eq!(overview.containers[0].cpu_percent.as_deref(), Some("0.15%"));
        assert_eq!(overview.containers[0].memory_usage.as_deref(), Some("42.1MiB / 3.8GiB"));

        // Services
        assert_eq!(overview.services.len(), 4);
        assert_eq!(overview.services[0].unit, "cron.service");
        assert_eq!(overview.services[0].active_state, "active");
        assert_eq!(overview.services[3].unit, "failed.service");
        assert_eq!(overview.services[3].active_state, "failed");

        // Ports
        assert_eq!(overview.ports.len(), 3);
        assert_eq!(overview.ports[0].local_port, 22);
        assert_eq!(overview.ports[0].process.as_deref(), Some("sshd"));
        assert_eq!(overview.ports[0].pid, Some(842));

        // Processes
        assert_eq!(overview.processes.len(), 2);
        assert_eq!(overview.processes[0].pid, 842);
        assert_eq!(overview.processes[0].user, "root");
        assert_eq!(overview.processes[0].command, "/usr/sbin/sshd -D");

        // Storage
        assert_eq!(overview.storage.len(), 2);
        assert_eq!(overview.storage[0].mount_point, "/");
        assert_eq!(overview.storage[0].total_size, "40G");
        assert_eq!(overview.storage[0].usage_percent, 30.0);

        // Docker DF
        assert!(overview.docker_disk_usage.is_some());
    }

    #[test]
    fn test_parse_telemetry_output() {
        let mock_telemetry_raw = r#"
===HAZE_TELEMETRY_START===
---CONTAINER_STATS---
c85f53882737	0.22%	55.4MiB / 3.8GiB	1.42%
---DOCKER_DF---
TYPE TOTAL ACTIVE SIZE RECLAIMABLE
Images 6 3 1.8GB 900MB (50%)
Containers 3 2 15MB 0B (0%)
Local Volumes 1 1 50MB 0B (0%)
Build Cache 0 0 0B 0B
===HAZE_TELEMETRY_END===
"#;

        let telemetry = parse_telemetry_output("host-1", mock_telemetry_raw);
        assert_eq!(telemetry.host_id, "host-1");
        let stats = telemetry.container_stats.get("c85f53882737");
        assert!(stats.is_some());
        assert_eq!(stats.unwrap().cpu_percent, "0.22%");
        assert_eq!(stats.unwrap().memory_usage, "55.4MiB / 3.8GiB");
        assert!(telemetry.docker_disk_usage.is_some());
    }
}
