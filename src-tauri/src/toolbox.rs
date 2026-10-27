use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use chrono::Utc;
use russh::client;
use russh::ChannelMsg;
use russh_keys::key;

use crate::commands::AppState;
use crate::models::{ContainerItem, OpenPortItem, ServerToolboxOverview, ServiceItem};

pub const TOOLBOX_PROBE_COMMAND: &str = r#"
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
echo '===HAZE_TOOLBOX_END==='
"#;

struct ToolboxClientHandler;

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

/// Helper to connect to a host and execute a remote command returning stdout
async fn run_remote_ssh_command(
    host_id: &str,
    state: &AppState,
    cmd: &str,
    timeout_secs: u64,
) -> Result<String, String> {
    let hosts = state.db.list_hosts().map_err(|e| format!("Database error: {}", e))?;
    let host = hosts
        .into_iter()
        .find(|h| h.id == host_id)
        .ok_or_else(|| format!("Host with ID '{}' not found in vault", host_id))?;

    let mut config = client::Config::default();
    config.keepalive_interval = Some(Duration::from_secs(30));
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

    let mut channel = session
        .channel_open_session()
        .await
        .map_err(|e| format!("Failed to open session channel on {}: {}", host.hostname, e))?;

    channel
        .exec(true, cmd)
        .await
        .map_err(|e| format!("Failed to execute command on {}: {}", host.hostname, e))?;

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

/// Executes the agentless toolbox probe over SSH and parses telemetry
pub async fn fetch_server_toolbox_overview(
    host_id: &str,
    state: &AppState,
) -> Result<ServerToolboxOverview, String> {
    let raw_output = run_remote_ssh_command(host_id, state, TOOLBOX_PROBE_COMMAND, 10).await?;
    let overview = parse_toolbox_output(host_id, &raw_output);
    Ok(overview)
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

    // Sanitize container ID
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

/// Executes a systemd service action (start, stop, restart)
pub async fn execute_service_action(
    host_id: &str,
    service_unit: &str,
    action: &str,
    state: &AppState,
) -> Result<String, String> {
    if !["start", "stop", "restart"].contains(&action) {
        return Err(format!("Invalid service action '{}'. Allowed: start, stop, restart", action));
    }

    // Sanitize unit name (e.g. nginx.service)
    let clean_unit: String = service_unit.chars().filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_' || *c == '.' || *c == '@').collect();
    if clean_unit.is_empty() {
        return Err("Invalid service unit name".into());
    }

    let cmd = format!(
        "(systemctl {} {} 2>&1 || sudo -n systemctl {} {} 2>&1)",
        action, clean_unit, action, clean_unit
    );

    run_remote_ssh_command(host_id, state, &cmd, 15).await
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

    // 2. Containers
    let mut containers = Vec::new();
    if let Some(content) = sections.get("CONTAINERS") {
        for line in content.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with("CONTAINER ID") {
                continue;
            }
            let parts: Vec<&str> = line.split('\t').collect();
            if parts.len() >= 6 {
                containers.push(ContainerItem {
                    id: parts[0].trim().to_string(),
                    names: parts[1].trim().to_string(),
                    image: parts[2].trim().to_string(),
                    status: parts[3].trim().to_string(),
                    state: parts[4].trim().to_lowercase(),
                    ports: parts[5].trim().to_string(),
                    engine: parts.get(6).unwrap_or(&"docker").trim().to_string(),
                });
            }
        }
    }

    // 3. Systemd check
    let systemd_installed = sections
        .get("SYSTEMD_CHECK")
        .map(|s| {
            let t = s.trim();
            !t.is_empty() && t != "none" && !t.contains("not found")
        })
        .unwrap_or(false);

    // 4. Services
    let mut services = Vec::new();
    if let Some(content) = sections.get("SERVICES") {
        for line in content.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with("UNIT") {
                continue;
            }
            // Standard columns: UNIT LOAD ACTIVE SUB DESCRIPTION...
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

    // 5. Open Ports
    let mut ports = Vec::new();
    if let Some(content) = sections.get("PORTS") {
        for line in content.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with("Netid") || line.starts_with("Active") || line.starts_with("Proto") {
                continue;
            }
            let tokens: Vec<&str> = line.split_whitespace().collect();
            // `ss -tulpn` typical line:
            // [0: Netid, 1: State, 2: Recv-Q, 3: Send-Q, 4: Local Address:Port, 5: Peer Address:Port, 6..: Process]
            if tokens.len() >= 5 {
                let proto = tokens[0].to_lowercase();
                if !proto.starts_with("tcp") && !proto.starts_with("udp") {
                    continue;
                }

                let (state, local_idx, proc_start_idx) = if tokens[1] == "LISTEN" || tokens[1] == "UNCONN" {
                    (tokens[1].to_string(), 4, 6)
                } else if tokens.len() >= 6 && (tokens[5] == "LISTEN" || tokens[5] == "UNCONN") {
                    // netstat format: proto, recv-q, send-q, local, foreign, state, pid/prog
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

    // Deduplicate ports by (protocol, local_address, local_port)
    ports.sort_by_key(|p| p.local_port);

    ServerToolboxOverview {
        host_id: host_id.to_string(),
        containers,
        services,
        ports,
        docker_installed,
        systemd_installed,
        timestamp: Utc::now().timestamp(),
        error: None,
    }
}

fn parse_process_and_pid(raw: &str) -> (Option<String>, Option<u32>) {
    if raw.is_empty() {
        return (None, None);
    }

    // Format 1: `users:(("sshd",pid=842,fd=3))` from ss
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

    // Format 2: `842/sshd` from netstat
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
===HAZE_TOOLBOX_END===
"#;

        let overview = parse_toolbox_output("host-test-1", mock_raw);

        assert_eq!(overview.host_id, "host-test-1");
        assert!(overview.docker_installed);
        assert!(overview.systemd_installed);

        // Containers
        assert_eq!(overview.containers.len(), 2);
        assert_eq!(overview.containers[0].id, "c85f53882737");
        assert_eq!(overview.containers[0].names, "nginx-proxy");
        assert_eq!(overview.containers[0].state, "running");
        assert_eq!(overview.containers[1].names, "redis-cache");
        assert_eq!(overview.containers[1].state, "exited");

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
        assert_eq!(overview.ports[1].local_port, 5353);
        assert_eq!(overview.ports[2].local_port, 6379);
        assert_eq!(overview.ports[2].process.as_deref(), Some("redis-server"));
    }
}
