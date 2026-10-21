use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use russh::client;
use russh::ChannelMsg;
use russh_keys::key;
use chrono::Utc;

use crate::commands::AppState;
use crate::crypto;
use crate::models::ServerMetrics;

pub const PROBE_COMMAND: &str = r#"
echo '===HAZE_PROBE_START==='
echo '---OS---'
uname -s -r -m 2>/dev/null || uname -a 2>/dev/null
echo '---CORES---'
(grep -c ^processor /proc/cpuinfo 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 1)
echo '---UPTIME---'
cat /proc/uptime 2>/dev/null || uptime 2>/dev/null
echo '---LOADAVG---'
cat /proc/loadavg 2>/dev/null || uptime 2>/dev/null
echo '---MEM---'
cat /proc/meminfo 2>/dev/null
echo '---DISK---'
df -k / 2>/dev/null
echo '===HAZE_PROBE_END==='
"#;

struct MonitorClientHandler;

#[async_trait::async_trait]
impl client::Handler for MonitorClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &key::PublicKey,
    ) -> Result<bool, Self::Error> {
        Ok(true)
    }
}

/// Executes the agentless health probe over SSH and parses system metrics
pub async fn fetch_server_metrics(
    host_id: &str,
    state: &AppState,
) -> Result<ServerMetrics, String> {
    let hosts = state.db.list_hosts().map_err(|e| format!("Database error: {}", e))?;
    let host = hosts
        .into_iter()
        .find(|h| h.id == host_id)
        .ok_or_else(|| format!("Host with ID '{}' not found in vault", host_id))?;

    let mut config = client::Config::default();
    config.keepalive_interval = Some(Duration::from_secs(30));
    let config = Arc::new(config);

    let connect_future = client::connect(config, (host.hostname.as_str(), host.port), MonitorClientHandler);
    let mut session = tokio::time::timeout(Duration::from_secs(6), connect_future)
        .await
        .map_err(|_| format!("Connection to {}:{} timed out after 6 seconds", host.hostname, host.port))?
        .map_err(|e| format!("Failed to connect to {}:{}: {}", host.hostname, host.port, e))?;

    let username = host.username.unwrap_or_else(|| "root".into());
    let mut auth_success = false;

    if let Some(ref iid) = host.identity_id {
        let enc_key = state.get_encryption_key()?;
        let (enc_secret, enc_pass) = state
            .db
            .get_identity_secret(iid)
            .map_err(|e| format!("Failed to read credentials: {}", e))?;

        let secret = crypto::decrypt_secret(&enc_secret, &enc_key)
            .map_err(|e| format!("Failed to decrypt identity secret: {}", e))?;

        if secret.contains("PRIVATE KEY") {
            let pass = if let Some(ref ep) = enc_pass {
                Some(
                    crypto::decrypt_secret(ep, &enc_key)
                        .map_err(|e| format!("Failed to decrypt key passphrase: {}", e))?,
                )
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
        return Err(format!("SSH authentication failed for user '{}' on {}:{}", username, host.hostname, host.port));
    }

    let mut channel = session
        .channel_open_session()
        .await
        .map_err(|e| format!("Failed to open session channel on {}: {}", host.hostname, e))?;

    channel
        .exec(true, PROBE_COMMAND)
        .await
        .map_err(|e| format!("Failed to execute metrics probe on {}: {}", host.hostname, e))?;

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

    let _ = tokio::time::timeout(Duration::from_secs(6), collect_future).await;
    let raw_output = String::from_utf8_lossy(&stdout_buffer).to_string();

    let mut metrics = parse_probe_output(host_id, &raw_output);
    if metrics.error.is_none() && metrics.cpu_cores == 1 && metrics.uptime_seconds.is_none() && metrics.memory_total_bytes.is_none() {
        metrics.error = Some("Probe returned empty or unparseable telemetry output".into());
    }

    Ok(metrics)
}

/// Parses the tagged probe output into a structured `ServerMetrics` model
pub fn parse_probe_output(host_id: &str, raw: &str) -> ServerMetrics {
    let mut sections: HashMap<&str, String> = HashMap::new();
    let mut current_section: Option<&str> = None;

    for line in raw.lines() {
        let trimmed = line.trim();
        if trimmed == "===HAZE_PROBE_START===" || trimmed == "===HAZE_PROBE_END===" {
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

    // 1. Parse OS
    let os_name = sections.get("OS").and_then(|s| {
        s.lines().find(|l| !l.trim().is_empty()).map(|l| l.trim().to_string())
    });

    // 2. Parse Cores
    let cpu_cores = sections.get("CORES").map(|s| {
        s.lines()
            .find_map(|l| l.trim().parse::<u32>().ok())
            .unwrap_or(1)
    }).unwrap_or(1).max(1);

    // 3. Parse Uptime
    let (uptime_seconds, uptime_formatted) = parse_uptime_section(sections.get("UPTIME"));

    // 4. Parse Load Average & CPU %
    let (load_1m, load_5m, load_15m, cpu_usage_percent) = parse_loadavg_section(sections.get("LOADAVG"), cpu_cores);

    // 5. Parse Memory
    let (memory_total_bytes, memory_used_bytes, memory_free_bytes, memory_usage_percent) =
        parse_meminfo_section(sections.get("MEM"));

    // 6. Parse Disk
    let (disk_total_bytes, disk_used_bytes, disk_free_bytes, disk_usage_percent, disk_mount_path) =
        parse_disk_section(sections.get("DISK"));

    ServerMetrics {
        host_id: host_id.to_string(),
        os_name,
        uptime_seconds,
        uptime_formatted,
        cpu_cores,
        load_1m,
        load_5m,
        load_15m,
        cpu_usage_percent,
        memory_total_bytes,
        memory_used_bytes,
        memory_free_bytes,
        memory_usage_percent,
        disk_total_bytes,
        disk_used_bytes,
        disk_free_bytes,
        disk_usage_percent,
        disk_mount_path,
        timestamp: Utc::now().timestamp(),
        error: None,
    }
}

fn parse_uptime_section(uptime_sec: Option<&String>) -> (Option<u64>, Option<String>) {
    let content = match uptime_sec {
        Some(c) => c,
        None => return (None, None),
    };

    // Try /proc/uptime first (e.g. "123456.78 987654.32")
    for line in content.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if let Some(first) = parts.first() {
            if let Ok(secs_f) = first.parse::<f64>() {
                let secs = secs_f as u64;
                let formatted = format_uptime(secs);
                return (Some(secs), Some(formatted));
            }
        }
    }

    // Fallback: parse standard BSD/Unix `uptime` string (e.g. "up 14 days,  3:24" or "up 2:15")
    for line in content.lines() {
        if let Some(up_idx) = line.find("up ") {
            let after_up = &line[up_idx + 3..];
            if let Some(comma_or_users) = after_up.find(",").or_else(|| after_up.find("user")) {
                let up_snippet = after_up[..comma_or_users].trim();
                return (None, Some(up_snippet.to_string()));
            }
        }
    }

    (None, None)
}

fn format_uptime(total_seconds: u64) -> String {
    let days = total_seconds / 86400;
    let hours = (total_seconds % 86400) / 3600;
    let minutes = (total_seconds % 3600) / 60;

    if days > 0 {
        format!("{}d {}h {}m", days, hours, minutes)
    } else if hours > 0 {
        format!("{}h {}m", hours, minutes)
    } else {
        format!("{}m", minutes)
    }
}

fn parse_loadavg_section(load_sec: Option<&String>, cpu_cores: u32) -> (Option<f32>, Option<f32>, Option<f32>, Option<f32>) {
    let content = match load_sec {
        Some(c) => c,
        None => return (None, None, None, None),
    };

    for line in content.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        // /proc/loadavg: "0.14 0.25 0.18 1/245 12345"
        if parts.len() >= 3 {
            let l1 = parts[0].parse::<f32>().ok();
            let l5 = parts[1].parse::<f32>().ok();
            let l15 = parts[2].parse::<f32>().ok();

            if let Some(l1_val) = l1 {
                let usage_percent = ((l1_val / cpu_cores.max(1) as f32) * 100.0).clamp(0.0, 100.0);
                return (Some(l1_val), l5, l15, Some(usage_percent));
            }
        }

        // Fallback for `uptime` format: "... load averages: 0.14, 0.25, 0.18"
        if let Some(idx) = line.find("load average") {
            let after_colon = line[idx..].split(':').nth(1).unwrap_or("");
            let clean = after_colon.replace(',', " ");
            let load_nums: Vec<f32> = clean
                .split_whitespace()
                .filter_map(|s| s.parse::<f32>().ok())
                .collect();

            if load_nums.len() >= 3 {
                let l1 = load_nums[0];
                let usage_percent = ((l1 / cpu_cores.max(1) as f32) * 100.0).clamp(0.0, 100.0);
                return (Some(l1), Some(load_nums[1]), Some(load_nums[2]), Some(usage_percent));
            }
        }
    }

    (None, None, None, None)
}

fn parse_meminfo_section(mem_sec: Option<&String>) -> (Option<u64>, Option<u64>, Option<u64>, Option<f32>) {
    let content = match mem_sec {
        Some(c) => c,
        None => return (None, None, None, None),
    };

    let mut mem_total_kb: Option<u64> = None;
    let mut mem_free_kb: Option<u64> = None;
    let mut mem_available_kb: Option<u64> = None;
    let mut buffers_kb: u64 = 0;
    let mut cached_kb: u64 = 0;

    for line in content.lines() {
        let mut parts = line.split_whitespace();
        let key = parts.next().unwrap_or("");
        let val = parts.next().and_then(|v| v.parse::<u64>().ok());

        match key {
            "MemTotal:" => mem_total_kb = val,
            "MemFree:" => mem_free_kb = val,
            "MemAvailable:" => mem_available_kb = val,
            "Buffers:" => buffers_kb = val.unwrap_or(0),
            "Cached:" => cached_kb = val.unwrap_or(0),
            _ => {}
        }
    }

    if let Some(total_kb) = mem_total_kb {
        if total_kb == 0 {
            return (None, None, None, None);
        }

        let total_bytes = total_kb * 1024;
        let (used_bytes, free_bytes) = if let Some(avail_kb) = mem_available_kb {
            let avail_bytes = avail_kb * 1024;
            let used = total_bytes.saturating_sub(avail_bytes);
            (used, avail_bytes)
        } else if let Some(free_kb) = mem_free_kb {
            let raw_free = free_kb * 1024;
            let buff_cache = (buffers_kb + cached_kb) * 1024;
            let effective_free = (raw_free + buff_cache).min(total_bytes);
            let used = total_bytes.saturating_sub(effective_free);
            (used, effective_free)
        } else {
            return (Some(total_bytes), None, None, None);
        };

        let usage_percent = ((used_bytes as f64 / total_bytes as f64) * 100.0) as f32;
        return (
            Some(total_bytes),
            Some(used_bytes),
            Some(free_bytes),
            Some(usage_percent.clamp(0.0, 100.0)),
        );
    }

    (None, None, None, None)
}

fn parse_disk_section(disk_sec: Option<&String>) -> (Option<u64>, Option<u64>, Option<u64>, Option<f32>, Option<String>) {
    let content = match disk_sec {
        Some(c) => c,
        None => return (None, None, None, None, None),
    };

    // Lines from `df -k /`:
    // Filesystem     1K-blocks    Used Available Use% Mounted on
    // /dev/sda1       51474024 8234560  40598744  17% /
    let non_header_lines: Vec<&str> = content
        .lines()
        .filter(|l| !l.contains("Filesystem") && !l.trim().is_empty())
        .collect();

    if non_header_lines.is_empty() {
        return (None, None, None, None, None);
    }

    // Combine all tokens in case long device names broke across lines
    let all_tokens: Vec<&str> = non_header_lines
        .iter()
        .flat_map(|l| l.split_whitespace())
        .collect();

    // Standard columns: [device, 1K-blocks, Used, Available, Use%, Mounted-on]
    if all_tokens.len() >= 6 {
        let total_kb = all_tokens[1].parse::<u64>().ok();
        let used_kb = all_tokens[2].parse::<u64>().ok();
        let avail_kb = all_tokens[3].parse::<u64>().ok();
        let percent_str = all_tokens[4].trim_end_matches('%');
        let percent = percent_str.parse::<f32>().ok();
        let mount_path = all_tokens[5].to_string();

        if let (Some(tot), Some(used), Some(avail)) = (total_kb, used_kb, avail_kb) {
            let total_bytes = tot * 1024;
            let used_bytes = used * 1024;
            let free_bytes = avail * 1024;
            let calculated_pct = percent.unwrap_or_else(|| {
                if total_bytes > 0 {
                    ((used_bytes as f64 / total_bytes as f64) * 100.0) as f32
                } else {
                    0.0
                }
            });

            return (
                Some(total_bytes),
                Some(used_bytes),
                Some(free_bytes),
                Some(calculated_pct.clamp(0.0, 100.0)),
                Some(mount_path),
            );
        }
    }

    (None, None, None, None, None)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_linux_probe_output() {
        let mock_raw = r#"
===HAZE_PROBE_START===
---OS---
Linux 6.8.0-45-generic x86_64
---CORES---
4
---UPTIME---
172800.50 680000.20
---LOADAVG---
0.80 0.45 0.30 2/312 4589
---MEM---
MemTotal:        16384000 kB
MemFree:          2048000 kB
MemAvailable:    12288000 kB
Buffers:           512000 kB
Cached:           6144000 kB
---DISK---
Filesystem     1K-blocks      Used Available Use% Mounted on
/dev/nvme0n1p2 100000000  30000000  70000000  30% /
===HAZE_PROBE_END===
"#;

        let metrics = parse_probe_output("test-host-1", mock_raw);

        assert_eq!(metrics.host_id, "test-host-1");
        assert_eq!(metrics.os_name.as_deref(), Some("Linux 6.8.0-45-generic x86_64"));
        assert_eq!(metrics.cpu_cores, 4);
        assert_eq!(metrics.uptime_seconds, Some(172800));
        assert_eq!(metrics.uptime_formatted.as_deref(), Some("2d 0h 0m"));

        // Loadavg 0.80 on 4 cores = 20%
        assert_eq!(metrics.load_1m, Some(0.80));
        assert_eq!(metrics.cpu_usage_percent, Some(20.0));

        // Memory: 16GB total, 12GB available => 4GB used (25%)
        assert_eq!(metrics.memory_total_bytes, Some(16384000 * 1024));
        assert_eq!(metrics.memory_used_bytes, Some(4096000 * 1024));
        assert_eq!(metrics.memory_usage_percent, Some(25.0));

        // Disk: 100GB total, 30GB used => 30%
        assert_eq!(metrics.disk_total_bytes, Some(100000000 * 1024));
        assert_eq!(metrics.disk_used_bytes, Some(30000000 * 1024));
        assert_eq!(metrics.disk_usage_percent, Some(30.0));
        assert_eq!(metrics.disk_mount_path.as_deref(), Some("/"));
        assert!(metrics.error.is_none());
    }

    #[test]
    fn test_parse_broken_or_partial_output() {
        let mock_raw = r#"
===HAZE_PROBE_START===
---OS---
Linux Minimal
---CORES---
invalid
---UPTIME---
invalid
---LOADAVG---
---MEM---
---DISK---
===HAZE_PROBE_END===
"#;

        let metrics = parse_probe_output("test-partial", mock_raw);
        assert_eq!(metrics.cpu_cores, 1);
        assert_eq!(metrics.os_name.as_deref(), Some("Linux Minimal"));
        assert!(metrics.uptime_seconds.is_none());
        assert!(metrics.memory_total_bytes.is_none());
    }
}
