use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use crate::models::{
    CreateSnippetInput, Host, PuttyDetectResult, SshConfigHostCandidate, TermiusParseResult,
};
use crate::ssh_config_parser::get_user_home;

/// Decodes standard URL percent-encoding (e.g., %20 -> space).
pub fn decode_percent_encoded(input: &str) -> String {
    let mut result = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();

    while let Some(ch) = chars.next() {
        if ch == '%' {
            let hex: String = chars.by_ref().take(2).collect();
            if hex.len() == 2
                && let Ok(byte) = u8::from_str_radix(&hex, 16) {
                    result.push(byte as char);
                    continue;
                }
            result.push('%');
            result.push_str(&hex);
        } else {
            result.push(ch);
        }
    }
    result
}

/// Parses a Termius export JSON string and returns candidate hosts and snippets.
pub fn parse_termius_json(
    json_content: &str,
    existing_hosts: &[Host],
) -> Result<TermiusParseResult, String> {
    let clean_json = json_content.trim_start_matches('\u{feff}');
    let root: Value = serde_json::from_str(clean_json)
        .map_err(|e| format!("Invalid JSON file: {}", e))?;

    let mut candidates: Vec<SshConfigHostCandidate> = Vec::new();
    let mut snippets: Vec<CreateSnippetInput> = Vec::new();

    // Map group IDs to group labels/names if present
    let mut group_id_map: HashMap<String, String> = HashMap::new();

    // Helper to extract string from multiple possible field keys
    let get_first_str = |obj: &serde_json::Map<String, Value>, keys: &[&str]| -> Option<String> {
        for &k in keys {
            if let Some(v) = obj.get(k)
                && let Some(s) = v.as_str() {
                    let trimmed = s.trim();
                    if !trimmed.is_empty() {
                        return Some(trimmed.to_string());
                    }
                }
        }
        None
    };

    // Helper to process a group JSON object
    let process_group = |obj: &serde_json::Map<String, Value>, group_map: &mut HashMap<String, String>| {
        let label = get_first_str(obj, &["label", "name", "title"]);
        let id = get_first_str(obj, &["id", "_id", "uuid"]);
        if let (Some(l), Some(i)) = (label, id) {
            group_map.insert(i, l);
        }
    };

    // Helper to process a host JSON object
    let process_host = |obj: &serde_json::Map<String, Value>,
                        existing: &[Host],
                        candidates: &mut Vec<SshConfigHostCandidate>,
                        group_map: &HashMap<String, String>| {
        let label = get_first_str(obj, &["label", "name", "alias"])
            .unwrap_or_else(|| "Unnamed Host".to_string());

        let hostname = match get_first_str(obj, &["address", "hostname", "ip", "host"]) {
            Some(h) => h,
            None => return, // Cannot import a host without an address
        };

        let port = obj
            .get("port")
            .and_then(|p| {
                p.as_u64().map(|n| n as u16).or_else(|| {
                    p.as_str().and_then(|s| s.trim().parse::<u16>().ok())
                })
            })
            .unwrap_or(22);

        let username = get_first_str(obj, &["username", "user"]);
        let identity_file = get_first_str(obj, &["identity_file", "key_path", "private_key_path"]);

        let group_name = if let Some(gid) = get_first_str(obj, &["group_id", "folder_id", "parent_id"]) {
            group_map.get(&gid).cloned()
        } else {
            get_first_str(obj, &["group", "folder", "group_name"])
        };

        let is_duplicate = existing.iter().any(|h| {
            let same_host = h.hostname.eq_ignore_ascii_case(&hostname)
                || h.label.eq_ignore_ascii_case(&label);
            let same_port = h.port == port;
            same_host && same_port
        });

        candidates.push(SshConfigHostCandidate {
            label,
            hostname,
            port,
            username,
            identity_file,
            proxy_jump: None,
            group_name,
            is_duplicate,
            is_known_host: false,
        });
    };

    // Helper to process a snippet JSON object
    let process_snippet = |obj: &serde_json::Map<String, Value>,
                           snippets: &mut Vec<CreateSnippetInput>| {
        let title = get_first_str(obj, &["label", "name", "title"])
            .unwrap_or_else(|| "Untitled Snippet".to_string());

        if let Some(script) = get_first_str(obj, &["script", "text", "command", "body"]) {
            let description = get_first_str(obj, &["description", "desc"]);
            snippets.push(CreateSnippetInput {
                title,
                script,
                description,
                tags: Some(vec!["termius-import".to_string()]),
                run_on_connect: Some(false),
            });
        }
    };

    // Case 1: Root is an Object
    if let Some(root_obj) = root.as_object() {
        // Collect groups first if grouped
        if let Some(groups_arr) = root_obj.get("groups").and_then(|v| v.as_array()) {
            for item in groups_arr {
                if let Some(obj) = item.as_object() {
                    process_group(obj, &mut group_id_map);
                }
            }
        }

        // Process hosts list
        if let Some(hosts_arr) = root_obj.get("hosts").and_then(|v| v.as_array()) {
            for item in hosts_arr {
                if let Some(obj) = item.as_object() {
                    process_host(obj, existing_hosts, &mut candidates, &group_id_map);
                }
            }
        }

        // Process snippets list
        if let Some(snippets_arr) = root_obj.get("snippets").and_then(|v| v.as_array()) {
            for item in snippets_arr {
                if let Some(obj) = item.as_object() {
                    process_snippet(obj, &mut snippets);
                }
            }
        }

        // Check if entries are inside a generic "data" array
        if let Some(data_arr) = root_obj.get("data").and_then(|v| v.as_array()) {
            for item in data_arr {
                if let Some(obj) = item.as_object() {
                    let entry_type = get_first_str(obj, &["_type", "type"]).unwrap_or_default();
                    match entry_type.as_str() {
                        "group" | "folder" => process_group(obj, &mut group_id_map),
                        "snippet" => process_snippet(obj, &mut snippets),
                        _ => {
                            if obj.contains_key("address") || obj.contains_key("hostname") {
                                process_host(obj, existing_hosts, &mut candidates, &group_id_map);
                            }
                        }
                    }
                }
            }
        }
    } else if let Some(root_arr) = root.as_array() {
        // Case 2: Root is an Array of items
        for item in root_arr {
            if let Some(obj) = item.as_object() {
                let entry_type = get_first_str(obj, &["_type", "type"]).unwrap_or_default();
                match entry_type.as_str() {
                    "group" | "folder" => process_group(obj, &mut group_id_map),
                    "snippet" => process_snippet(obj, &mut snippets),
                    _ => {
                        if obj.contains_key("address") || obj.contains_key("hostname") {
                            process_host(obj, existing_hosts, &mut candidates, &group_id_map);
                        }
                    }
                }
            }
        }
    }

    Ok(TermiusParseResult {
        candidates,
        snippets,
    })
}

#[derive(Default, Clone)]
struct PuttySessionDraft {
    session_name: String,
    hostname: Option<String>,
    port: Option<u16>,
    username: Option<String>,
    key_file: Option<String>,
    protocol: Option<String>,
}

impl PuttySessionDraft {
    fn parse_line(&mut self, line: &str) {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with(';') || trimmed.starts_with('#') {
            return;
        }

        if let Some((key_part, val_part)) = trimmed.split_once('=') {
            let key = key_part.trim().trim_matches('"');
            let raw_val = val_part.trim();

            match key {
                "HostName" => {
                    let clean = raw_val.trim_matches('"').replace("\\\\", "\\");
                    if !clean.is_empty() {
                        self.hostname = Some(clean);
                    }
                }
                "PortNumber" => {
                    if let Some(hex_part) = raw_val.strip_prefix("dword:")
                        && let Ok(parsed_hex) = u32::from_str_radix(hex_part, 16)
                    {
                        self.port = Some(parsed_hex as u16);
                    } else if let Ok(parsed_dec) = raw_val.trim_matches('"').parse::<u16>() {
                        self.port = Some(parsed_dec);
                    }
                }
                "UserName" => {
                    let clean = raw_val.trim_matches('"').trim();
                    if !clean.is_empty() {
                        self.username = Some(clean.to_string());
                    }
                }
                "PublicKeyFile" => {
                    let clean = raw_val.trim_matches('"').replace("\\\\", "\\");
                    if !clean.is_empty() {
                        self.key_file = Some(clean);
                    }
                }
                "Protocol" => {
                    let clean = raw_val.trim_matches('"').trim();
                    if !clean.is_empty() {
                        self.protocol = Some(clean.to_string());
                    }
                }
                _ => {}
            }
        }
    }

    fn to_candidate(self, existing: &[Host]) -> Option<SshConfigHostCandidate> {
        let raw_name = self.session_name.trim();
        if raw_name.eq_ignore_ascii_case("Default Settings") || raw_name.is_empty() {
            return None;
        }

        let hostname = match self.hostname {
            Some(h) if !h.trim().is_empty() => h.trim().to_string(),
            _ => return None,
        };

        // Strictly focus on SSH sessions: ignore telnet, serial, rlogin, raw, etc.
        if let Some(ref proto) = self.protocol {
            let p = proto.trim().to_lowercase();
            if !p.is_empty() && p != "ssh" {
                return None;
            }
        }

        let port = self.port.unwrap_or(22);
        let label = raw_name.to_string();

        let is_duplicate = existing.iter().any(|h| {
            let same_host = h.hostname.eq_ignore_ascii_case(&hostname)
                || h.label.eq_ignore_ascii_case(&label);
            let same_port = h.port == port;
            same_host && same_port
        });

        let group_name = if let Some((grp, _)) = label.split_once('/') {
            Some(grp.trim().to_string())
        } else if let Some((grp, _)) = label.split_once(" - ") {
            Some(grp.trim().to_string())
        } else {
            Some("PuTTY Sessions".to_string())
        };

        Some(SshConfigHostCandidate {
            label,
            hostname,
            port,
            username: self.username,
            identity_file: self.key_file,
            proxy_jump: None,
            group_name,
            is_duplicate,
            is_known_host: false,
        })
    }
}

/// Parses a Windows Registry PuTTY .reg file containing saved sessions.
pub fn parse_putty_reg(
    reg_content: &str,
    existing_hosts: &[Host],
) -> Result<Vec<SshConfigHostCandidate>, String> {
    let clean_reg = reg_content.trim_start_matches('\u{feff}');
    let mut candidates: Vec<SshConfigHostCandidate> = Vec::new();
    let mut current_session: Option<PuttySessionDraft> = None;

    for line in clean_reg.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with(';') || trimmed.starts_with('#') {
            continue;
        }

        // Section header e.g. [HKEY_CURRENT_USER\Software\SimonTatham\PuTTY\Sessions\Production%20Web]
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            if let Some(prev) = current_session.take()
                && let Some(candidate) = prev.to_candidate(existing_hosts)
            {
                candidates.push(candidate);
            }

            let header = &trimmed[1..trimmed.len() - 1];
            if let Some((_, session_part)) = header.split_once("PuTTY\\Sessions\\") {
                let decoded_name = decode_percent_encoded(session_part);
                current_session = Some(PuttySessionDraft {
                    session_name: decoded_name,
                    hostname: None,
                    port: None,
                    username: None,
                    key_file: None,
                    protocol: None,
                });
            }
            continue;
        }

        // Inside a session section, parse key-value pairs
        if let Some(ref mut session) = current_session {
            session.parse_line(trimmed);
        }
    }

    if let Some(last) = current_session.take()
        && let Some(candidate) = last.to_candidate(existing_hosts)
    {
        candidates.push(candidate);
    }

    Ok(candidates)
}

/// Automatically detects and parses PuTTY sessions saved on Unix / macOS (~/.putty/sessions).
pub fn detect_putty_sessions(
    existing_hosts: &[Host],
) -> Result<PuttyDetectResult, String> {
    let home = get_user_home();
    let sessions_dir = PathBuf::from(home).join(".putty").join("sessions");
    let display_path = sessions_dir.to_string_lossy().to_string();

    if !sessions_dir.exists() || !sessions_dir.is_dir() {
        return Ok(PuttyDetectResult {
            sessions_dir: display_path,
            found: false,
            candidates: Vec::new(),
        });
    }

    let entries = match fs::read_dir(&sessions_dir) {
        Ok(e) => e,
        Err(_) => {
            return Ok(PuttyDetectResult {
                sessions_dir: display_path,
                found: false,
                candidates: Vec::new(),
            });
        }
    };

    let mut candidates: Vec<SshConfigHostCandidate> = Vec::new();

    for entry in entries.flatten() {
        let file_type = match entry.file_type() {
            Ok(ft) => ft,
            Err(_) => continue,
        };
        if !file_type.is_file() {
            continue;
        }

        let file_name = entry.file_name();
        let name_str = file_name.to_string_lossy();
        if name_str.starts_with('.') {
            continue;
        }

        let session_name = decode_percent_encoded(&name_str);
        if session_name.eq_ignore_ascii_case("Default Settings") || session_name.trim().is_empty() {
            continue;
        }

        let content = match fs::read_to_string(entry.path()) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let mut draft = PuttySessionDraft {
            session_name,
            hostname: None,
            port: None,
            username: None,
            key_file: None,
            protocol: None,
        };

        for line in content.lines() {
            draft.parse_line(line);
        }

        if let Some(candidate) = draft.to_candidate(existing_hosts) {
            candidates.push(candidate);
        }
    }

    let found = !candidates.is_empty();

    Ok(PuttyDetectResult {
        sessions_dir: display_path,
        found,
        candidates,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_decode_percent_encoded() {
        assert_eq!(decode_percent_encoded("My%20Linux%20Box"), "My Linux Box");
        assert_eq!(
            decode_percent_encoded("Bastion%2FInternal%20Gateway"),
            "Bastion/Internal Gateway"
        );
        assert_eq!(decode_percent_encoded("StandardHost"), "StandardHost");
    }

    #[test]
    fn test_parse_putty_reg() {
        let putty_reg_content = r#"Windows Registry Editor Version 5.00

[HKEY_CURRENT_USER\Software\SimonTatham\PuTTY\Sessions\Production%20Web]
"HostName"="web.prod.internal"
"PortNumber"=dword:00000016
"UserName"="deployer"
"PublicKeyFile"="C:\\Users\\Admin\\.ssh\\id_rsa.ppk"
"Protocol"="ssh"

[HKEY_CURRENT_USER\Software\SimonTatham\PuTTY\Sessions\Default%20Settings]
"HostName"=""
"#;

        let candidates = parse_putty_reg(putty_reg_content, &[]).expect("putty parsing");
        assert_eq!(candidates.len(), 1);

        let c = &candidates[0];
        assert_eq!(c.label, "Production Web");
        assert_eq!(c.hostname, "web.prod.internal");
        assert_eq!(c.port, 22);
        assert_eq!(c.username.as_deref(), Some("deployer"));
        assert_eq!(
            c.identity_file.as_deref(),
            Some("C:\\Users\\Admin\\.ssh\\id_rsa.ppk")
        );
    }

    #[test]
    fn test_parse_termius_json() {
        let termius_json = r#"{
            "groups": [
                {
                    "id": "grp-1",
                    "label": "Staging Environment"
                }
            ],
            "hosts": [
                {
                    "label": "Staging API",
                    "address": "api.staging.internal",
                    "port": 2222,
                    "username": "tester",
                    "group_id": "grp-1"
                }
            ],
            "snippets": [
                {
                    "name": "Docker Cleanup",
                    "script": "docker system prune -af"
                }
            ]
        }"#;

        let result = parse_termius_json(termius_json, &[]).expect("termius parsing");
        assert_eq!(result.candidates.len(), 1);
        assert_eq!(result.snippets.len(), 1);

        let h = &result.candidates[0];
        assert_eq!(h.label, "Staging API");
        assert_eq!(h.hostname, "api.staging.internal");
        assert_eq!(h.port, 2222);
        assert_eq!(h.username.as_deref(), Some("tester"));
        assert_eq!(h.group_name.as_deref(), Some("Staging Environment"));

        let s = &result.snippets[0];
        assert_eq!(s.title, "Docker Cleanup");
        assert_eq!(s.script, "docker system prune -af");
    }

    #[test]
    fn test_parse_termius_string_port_and_bom() {
        let termius_json_with_bom = "\u{feff}{\"hosts\": [{\"label\": \"String Port Host\", \"address\": \"srv.test\", \"port\": \"8022\"}]}";
        let result = parse_termius_json(termius_json_with_bom, &[]).expect("termius parsing with string port");
        assert_eq!(result.candidates.len(), 1);
        assert_eq!(result.candidates[0].port, 8022);
    }

    #[test]
    fn test_putty_strict_ssh_filter() {
        let putty_reg_content = r#"Windows Registry Editor Version 5.00

[HKEY_CURRENT_USER\Software\SimonTatham\PuTTY\Sessions\SSH%20Server]
"HostName"="ssh.example.com"
"PortNumber"=dword:00000016
"Protocol"="ssh"

[HKEY_CURRENT_USER\Software\SimonTatham\PuTTY\Sessions\Serial%20Switch]
"HostName"="COM3"
"Protocol"="serial"

[HKEY_CURRENT_USER\Software\SimonTatham\PuTTY\Sessions\Telnet%20Router]
"HostName"="router.local"
"Protocol"="telnet"
"#;
        let candidates = parse_putty_reg(putty_reg_content, &[]).expect("putty parsing");
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].label, "SSH Server");
    }
}
