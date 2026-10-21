use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use crate::models::{Host, SshConfigHostCandidate, SshConfigParseResult};

/// Returns the user's home directory across macOS, Linux, and Windows.
pub fn get_user_home() -> String {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| "/".into())
}

/// Expands a leading tilde (~) with the user's home directory.
pub fn expand_tilde(path_str: &str, home: &str) -> String {
    if path_str == "~" {
        home.to_string()
    } else if let Some(stripped) = path_str.strip_prefix("~/") {
        format!("{}/{}", home.trim_end_matches('/'), stripped)
    } else {
        path_str.to_string()
    }
}

/// Resolves standard OpenSSH paths: ~/.ssh/config and ~/.ssh/known_hosts.
pub fn get_default_ssh_paths() -> (PathBuf, PathBuf) {
    let home = get_user_home();
    let ssh_dir = PathBuf::from(home).join(".ssh");
    (ssh_dir.join("config"), ssh_dir.join("known_hosts"))
}

/// Reads ~/.ssh/known_hosts to extract known hostnames and IP addresses.
pub fn parse_known_hosts(path: &Path) -> HashSet<String> {
    let mut known = HashSet::new();
    if !path.exists() {
        return known;
    }

    if let Ok(content) = fs::read_to_string(path) {
        for line in content.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') || line.starts_with('@') {
                continue;
            }

            // Standard format: host1,host2,192.168.1.1 key_type base64_key
            if let Some(host_part) = line.split_whitespace().next() {
                // If hashed (|1|...), skip parsing raw hostnames
                if host_part.starts_with("|1|") {
                    continue;
                }

                for item in host_part.split(',') {
                    let cleaned = item.trim().trim_start_matches('[').trim_end_matches(']');
                    // Remove port suffix if present e.g. [host]:2222 -> host
                    let host_only = if let Some((h, _)) = cleaned.split_once(':') {
                        h
                    } else {
                        cleaned
                    };

                    if !host_only.is_empty() {
                        known.insert(host_only.to_lowercase());
                    }
                }
            }
        }
    }

    known
}

#[derive(Default, Debug, Clone)]
struct StanzaDraft {
    patterns: Vec<String>,
    hostname: Option<String>,
    port: Option<u16>,
    username: Option<String>,
    identity_file: Option<String>,
    proxy_jump: Option<String>,
    group_name: Option<String>,
}

/// Parses raw OpenSSH config string content into candidates with resolved fallbacks and known-host checks.
pub fn parse_ssh_config_from_str(
    content: &str,
    home: &str,
    known_hosts_set: &HashSet<String>,
    existing_hosts: &[Host],
) -> Vec<SshConfigHostCandidate> {
    let mut candidates: Vec<SshConfigHostCandidate> = Vec::new();
    let mut stanzas: Vec<StanzaDraft> = Vec::new();
    let mut current_stanza: Option<StanzaDraft> = None;
    let mut current_group_hint: Option<String> = None;

    for line in content.lines() {
        let trimmed = line.trim();

        if trimmed.is_empty() {
            continue;
        }

        // Detect comment lines: check for section / group hints
        if let Some(comment) = trimmed.strip_prefix('#') {
            let comment_text = comment.trim();
            // Filter out boilerplate or simple divider lines
            let clean = comment_text
                .trim_matches(|c| c == '-' || c == '=' || c == '*' || c == '#')
                .trim();

            if clean.len() >= 3 && clean.len() <= 40 && !clean.starts_with("vim:") {
                // If it looks like a section header (e.g., "Production", "AWS Bastions")
                current_group_hint = Some(clean.to_string());
            }
            continue;
        }

        // Separate directive keyword and argument
        let (key, value) = if let Some((k, v)) = trimmed.split_once('=') {
            (k.trim(), v.trim())
        } else if let Some((k, v)) = trimmed.split_once(char::is_whitespace) {
            (k.trim(), v.trim())
        } else {
            (trimmed, "")
        };

        let key_lower = key.to_lowercase();
        // Remove surrounding quotes if present
        let clean_value = value
            .trim_matches('"')
            .trim_matches('\'')
            .trim();

        match key_lower.as_str() {
            "host" => {
                // Store previous stanza
                if let Some(prev) = current_stanza.take() {
                    stanzas.push(prev);
                }

                let patterns: Vec<String> = clean_value
                    .split_whitespace()
                    .map(|s| s.to_string())
                    .collect();

                let is_wildcard_all = patterns.iter().any(|p| p == "*");

                current_stanza = Some(StanzaDraft {
                    patterns,
                    hostname: None,
                    port: None,
                    username: None,
                    identity_file: None,
                    proxy_jump: None,
                    group_name: if is_wildcard_all {
                        None
                    } else {
                        current_group_hint.clone()
                    },
                });
            }
            "hostname" => {
                if let Some(ref mut stanza) = current_stanza {
                    stanza.hostname = Some(clean_value.to_string());
                }
            }
            "user" => {
                let user_val = clean_value.to_string();
                if let Some(ref mut stanza) = current_stanza {
                    stanza.username = Some(user_val);
                }
            }
            "port" => {
                if let Ok(parsed_port) = clean_value.parse::<u16>()
                    && let Some(ref mut stanza) = current_stanza {
                        stanza.port = Some(parsed_port);
                    }
            }
            "identityfile" => {
                let expanded = expand_tilde(clean_value, home);
                if let Some(ref mut stanza) = current_stanza {
                    stanza.identity_file = Some(expanded);
                }
            }
            "proxyjump" => {
                let jump_val = clean_value.to_string();
                if let Some(ref mut stanza) = current_stanza {
                    stanza.proxy_jump = Some(jump_val);
                }
            }
            _ => {
                // Other OpenSSH directives (e.g. ForwardAgent, ServerAliveInterval)
            }
        }
    }

    if let Some(last) = current_stanza.take() {
        stanzas.push(last);
    }

    // Pass 1: Extract global fallbacks (e.g., from Host *)
    let mut global_user: Option<String> = None;
    let mut global_port: Option<u16> = None;
    let mut global_identity_file: Option<String> = None;
    let mut global_proxy_jump: Option<String> = None;

    for s in &stanzas {
        if s.patterns.iter().any(|p| p == "*") {
            if s.username.is_some() && global_user.is_none() {
                global_user = s.username.clone();
            }
            if s.port.is_some() && global_port.is_none() {
                global_port = s.port;
            }
            if s.identity_file.is_some() && global_identity_file.is_none() {
                global_identity_file = s.identity_file.clone();
            }
            if s.proxy_jump.is_some() && global_proxy_jump.is_none() {
                global_proxy_jump = s.proxy_jump.clone();
            }
        }
    }

    // Pass 2: Flush concrete host candidates
    for stanza in stanzas {
        let is_wildcard_only = stanza
            .patterns
            .iter()
            .all(|p| p == "*" || p.contains('*') || p.contains('?'));

        if is_wildcard_only {
            continue;
        }

        for pattern in stanza.patterns {
            if pattern == "*" || pattern.contains('*') || pattern.contains('?') || pattern.starts_with('!') {
                continue;
            }

            let final_hostname = stanza
                .hostname
                .clone()
                .unwrap_or_else(|| pattern.clone());

            let final_port = stanza.port.or(global_port).unwrap_or(22);
            let final_user = stanza.username.clone().or_else(|| global_user.clone());
            let final_identity = stanza
                .identity_file
                .clone()
                .or_else(|| global_identity_file.clone());
            let final_proxy_jump = stanza
                .proxy_jump
                .clone()
                .or_else(|| global_proxy_jump.clone());

            // Check if duplicate exists in current Haze database
            let is_duplicate = existing_hosts.iter().any(|h| {
                let same_host = h.hostname.eq_ignore_ascii_case(&final_hostname)
                    || h.label.eq_ignore_ascii_case(&pattern);
                let same_port = h.port == final_port;
                same_host && same_port
            });

            // Check if host is recognized in known_hosts
            let is_known = known_hosts_set.contains(&final_hostname.to_lowercase())
                || known_hosts_set.contains(&pattern.to_lowercase());

            candidates.push(SshConfigHostCandidate {
                label: pattern,
                hostname: final_hostname,
                port: final_port,
                username: final_user,
                identity_file: final_identity,
                proxy_jump: final_proxy_jump,
                group_name: stanza.group_name.clone(),
                is_duplicate,
                is_known_host: is_known,
            });
        }
    }

    candidates
}

/// Parses an OpenSSH config file and compares candidates against current Haze hosts.
pub fn parse_ssh_config(
    custom_path: Option<&str>,
    existing_hosts: &[Host],
) -> Result<SshConfigParseResult, String> {
    let (default_config, default_known) = get_default_ssh_paths();
    let config_path = match custom_path {
        Some(p) if !p.trim().is_empty() => PathBuf::from(p),
        _ => default_config,
    };

    let known_hosts_set = parse_known_hosts(&default_known);
    let found_known_hosts = default_known.exists();

    if !config_path.exists() {
        return Ok(SshConfigParseResult {
            config_path: config_path.to_string_lossy().to_string(),
            found_config: false,
            found_known_hosts,
            candidates: Vec::new(),
        });
    }

    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read SSH config from '{}': {}", config_path.display(), e))?;

    let home = get_user_home();
    let candidates = parse_ssh_config_from_str(&content, &home, &known_hosts_set, existing_hosts);

    Ok(SshConfigParseResult {
        config_path: config_path.to_string_lossy().to_string(),
        found_config: true,
        found_known_hosts,
        candidates,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_expand_tilde() {
        let home = "/home/developer";
        assert_eq!(expand_tilde("~", home), "/home/developer");
        assert_eq!(
            expand_tilde("~/.ssh/id_ed25519", home),
            "/home/developer/.ssh/id_ed25519"
        );
        assert_eq!(
            expand_tilde("/etc/ssh/ssh_host_rsa_key", home),
            "/etc/ssh/ssh_host_rsa_key"
        );
    }

    #[test]
    fn test_parse_ssh_config_from_str_comprehensive() {
        let config_data = r#"
# ========================
# Production Bastions
# ========================
Host bastion-prod
    HostName bastion.prod.company.com
    User admin
    Port 2222
    IdentityFile ~/.ssh/prod_id_ed25519

# Cloud Nodes
Host node-01 node-02
    HostName 10.0.1.50
    ProxyJump bastion-prod

Host *
    User devops
    Port 22
"#;
        let mut known = HashSet::new();
        known.insert("bastion.prod.company.com".to_string());

        let candidates = parse_ssh_config_from_str(config_data, "/Users/dev", &known, &[]);

        assert_eq!(candidates.len(), 3);

        // Candidate 0: bastion-prod
        let b = &candidates[0];
        assert_eq!(b.label, "bastion-prod");
        assert_eq!(b.hostname, "bastion.prod.company.com");
        assert_eq!(b.username.as_deref(), Some("admin"));
        assert_eq!(b.port, 2222);
        assert_eq!(b.identity_file.as_deref(), Some("/Users/dev/.ssh/prod_id_ed25519"));
        assert_eq!(b.group_name.as_deref(), Some("Production Bastions"));
        assert!(b.is_known_host);

        // Candidate 1 & 2: node-01, node-02
        let n1 = &candidates[1];
        assert_eq!(n1.label, "node-01");
        assert_eq!(n1.proxy_jump.as_deref(), Some("bastion-prod"));
        assert_eq!(n1.group_name.as_deref(), Some("Cloud Nodes"));
        // Inherited global user fallback
        assert_eq!(n1.username.as_deref(), Some("devops"));
    }
}
