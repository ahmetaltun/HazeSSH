use serde_json::Value;
use std::collections::HashMap;

use crate::models::{CreateSnippetInput, Host, SshConfigHostCandidate, TermiusParseResult};

/// Decodes standard URL percent-encoding (e.g., %20 -> space).
pub fn decode_percent_encoded(input: &str) -> String {
    let mut result = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();

    while let Some(ch) = chars.next() {
        if ch == '%' {
            let hex: String = chars.by_ref().take(2).collect();
            if hex.len() == 2 {
                if let Ok(byte) = u8::from_str_radix(&hex, 16) {
                    result.push(byte as char);
                    continue;
                }
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
    let root: Value = serde_json::from_str(json_content)
        .map_err(|e| format!("Invalid JSON file: {}", e))?;

    let mut candidates: Vec<SshConfigHostCandidate> = Vec::new();
    let mut snippets: Vec<CreateSnippetInput> = Vec::new();

    // Map group IDs to group labels/names if present
    let mut group_id_map: HashMap<String, String> = HashMap::new();

    // Helper to extract string from multiple possible field keys
    let get_first_str = |obj: &serde_json::Map<String, Value>, keys: &[&str]| -> Option<String> {
        for &k in keys {
            if let Some(v) = obj.get(k) {
                if let Some(s) = v.as_str() {
                    let trimmed = s.trim();
                    if !trimmed.is_empty() {
                        return Some(trimmed.to_string());
                    }
                }
            }
        }
        None
    };

    // Helper to process a group JSON object
    let mut process_group = |obj: &serde_json::Map<String, Value>| {
        let label = get_first_str(obj, &["label", "name", "title"]);
        let id = get_first_str(obj, &["id", "_id", "uuid"]);
        if let (Some(l), Some(i)) = (label, id) {
            group_id_map.insert(i, l);
        }
    };

    // Helper to process a host JSON object
    let mut process_host = |obj: &serde_json::Map<String, Value>,
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
            .and_then(|p| p.as_u64())
            .map(|p| p as u16)
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
    let mut process_snippet = |obj: &serde_json::Map<String, Value>,
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
                    process_group(obj);
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
                        "group" | "folder" => process_group(obj),
                        "snippet" => process_snippet(obj, &mut snippets),
                        "host" | _ => {
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
                    "group" | "folder" => process_group(obj),
                    "snippet" => process_snippet(obj, &mut snippets),
                    "host" | _ => {
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

#[derive(Default)]
struct PuttySessionDraft {
    session_name: String,
    hostname: Option<String>,
    port: Option<u16>,
    username: Option<String>,
    key_file: Option<String>,
    protocol: Option<String>,
}

/// Parses a Windows Registry PuTTY .reg file containing saved sessions.
pub fn parse_putty_reg(
    reg_content: &str,
    existing_hosts: &[Host],
) -> Result<Vec<SshConfigHostCandidate>, String> {
    let mut candidates: Vec<SshConfigHostCandidate> = Vec::new();
    let mut current_session: Option<PuttySessionDraft> = None;

    let flush_session = |session: PuttySessionDraft,
                         existing: &[Host],
                         candidates: &mut Vec<SshConfigHostCandidate>| {
        let raw_name = session.session_name.trim();
        // Skip default or empty settings
        if raw_name.eq_ignore_ascii_case("Default Settings") || raw_name.is_empty() {
            return;
        }

        let hostname = match session.hostname {
            Some(h) if !h.trim().is_empty() => h.trim().to_string(),
            _ => return, // No hostname configured
        };

        // Filter out purely serial or telnet sessions if protocol is explicitly non-ssh
        if let Some(ref proto) = session.protocol {
            if proto.eq_ignore_ascii_case("serial") {
                return;
            }
        }

        let port = session.port.unwrap_or(22);
        let label = raw_name.to_string();

        let is_duplicate = existing.iter().any(|h| {
            let same_host = h.hostname.eq_ignore_ascii_case(&hostname)
                || h.label.eq_ignore_ascii_case(&label);
            let same_port = h.port == port;
            same_host && same_port
        });

        // Group hint: if name contains " / " or " - ", use prefix as group
        let group_name = if let Some((grp, _)) = label.split_once('/') {
            Some(grp.trim().to_string())
        } else if let Some((grp, _)) = label.split_once(" - ") {
            Some(grp.trim().to_string())
        } else {
            Some("PuTTY Sessions".to_string())
        };

        candidates.push(SshConfigHostCandidate {
            label,
            hostname,
            port,
            username: session.username,
            identity_file: session.key_file,
            proxy_jump: None,
            group_name,
            is_duplicate,
            is_known_host: false,
        });
    };

    for line in reg_content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with(';') || trimmed.starts_with('#') {
            continue;
        }

        // Section header e.g. [HKEY_CURRENT_USER\Software\SimonTatham\PuTTY\Sessions\Production%20Web]
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            if let Some(prev) = current_session.take() {
                flush_session(prev, existing_hosts, &mut candidates);
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
            if let Some((key_part, val_part)) = trimmed.split_once('=') {
                let key = key_part.trim().trim_matches('"');
                let raw_val = val_part.trim();

                match key {
                    "HostName" => {
                        let clean = raw_val.trim_matches('"').replace("\\\\", "\\");
                        if !clean.is_empty() {
                            session.hostname = Some(clean);
                        }
                    }
                    "PortNumber" => {
                        if let Some(hex_part) = raw_val.strip_prefix("dword:") {
                            if let Ok(parsed_hex) = u32::from_str_radix(hex_part, 16) {
                                session.port = Some(parsed_hex as u16);
                            }
                        } else if let Ok(parsed_dec) = raw_val.trim_matches('"').parse::<u16>() {
                            session.port = Some(parsed_dec);
                        }
                    }
                    "UserName" => {
                        let clean = raw_val.trim_matches('"').trim();
                        if !clean.is_empty() {
                            session.username = Some(clean.to_string());
                        }
                    }
                    "PublicKeyFile" => {
                        let clean = raw_val.trim_matches('"').replace("\\\\", "\\");
                        if !clean.is_empty() {
                            session.key_file = Some(clean);
                        }
                    }
                    "Protocol" => {
                        let clean = raw_val.trim_matches('"').trim();
                        if !clean.is_empty() {
                            session.protocol = Some(clean.to_string());
                        }
                    }
                    _ => {}
                }
            }
        }
    }

    if let Some(last) = current_session.take() {
        flush_session(last, existing_hosts, &mut candidates);
    }

    Ok(candidates)
}
