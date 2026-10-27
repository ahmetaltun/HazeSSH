use serde::{Deserialize, Serialize};
use std::time::Instant;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AiError {
    #[error("HTTP transport error: {0}")]
    Transport(String),

    #[error("API error ({status}): {message}")]
    Api { status: u16, message: String },

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("Timeout: request took longer than {0} seconds")]
    Timeout(u64),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiCompletionInput {
    pub provider: String,
    pub endpoint: String,
    pub api_key: Option<String>,
    pub model: String,
    pub messages: Vec<ChatMessage>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
    pub timeout_seconds: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiCompletionOutput {
    pub text: String,
    pub provider: String,
    pub model: String,
    pub latency_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiModelInfo {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiFetchModelsInput {
    pub provider: String,
    pub endpoint: String,
    pub api_key: Option<String>,
    pub timeout_seconds: Option<u64>,
}

/// Executes a curl HTTP request and returns (status_code, body_string)
async fn execute_curl_request(
    method: &str,
    url: &str,
    headers: &[(String, String)],
    body: Option<&str>,
    timeout_secs: u64,
) -> Result<(u16, String), AiError> {
    let mut cmd = tokio::process::Command::new("curl");
    cmd.arg("-sS")
        .arg("-L")
        .arg("-X")
        .arg(method)
        .arg("--max-time")
        .arg(timeout_secs.to_string())
        .arg("-H")
        .arg("Expect:")
        .arg("-w")
        .arg("\n%{http_code}")
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
        .map_err(|e| AiError::Transport(format!("Failed to execute curl: {}", e)))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        return Err(AiError::Transport(if !stderr.trim().is_empty() {
            stderr.trim().to_string()
        } else {
            format!("curl exited with code {:?}", output.status.code())
        }));
    }

    let mut lines: Vec<&str> = stdout.rsplitn(2, '\n').collect();
    let status_code: u16 = if lines.len() == 2 {
        lines[0].trim().parse().unwrap_or(200)
    } else {
        200
    };

    let body_response = if lines.len() == 2 {
        lines.swap(0, 1);
        lines[0].to_string()
    } else {
        stdout
    };

    Ok((status_code, body_response))
}

/// Dispatches completion request to OpenAI, Ollama, LM Studio, Anthropic, OpenRouter, Nvidia NIM, or DeepSeek
pub async fn chat_completion(input: AiCompletionInput) -> Result<AiCompletionOutput, String> {
    let start_time = Instant::now();
    let timeout = input.timeout_seconds.unwrap_or(45);
    let provider = input.provider.to_lowercase();

    let (status, body) = match provider.as_str() {
        "anthropic" => {
            let mut headers = vec![
                ("Content-Type".to_string(), "application/json".to_string()),
                ("anthropic-version".to_string(), "2023-06-01".to_string()),
            ];
            if let Some(key) = &input.api_key
                && !key.trim().is_empty() {
                headers.push(("x-api-key".to_string(), key.trim().to_string()));
            }

            let mut system_text = String::new();
            let mut anthropic_messages = Vec::new();

            for m in &input.messages {
                if m.role == "system" {
                    if !system_text.is_empty() {
                        system_text.push_str("\n\n");
                    }
                    system_text.push_str(&m.content);
                } else {
                    anthropic_messages.push(serde_json::json!({
                        "role": if m.role == "assistant" { "assistant" } else { "user" },
                        "content": m.content
                    }));
                }
            }

            let mut payload_map = serde_json::json!({
                "model": input.model,
                "messages": anthropic_messages,
                "max_tokens": input.max_tokens.unwrap_or(1024),
            });

            if !system_text.is_empty() {
                payload_map["system"] = serde_json::Value::String(system_text);
            }
            if let Some(t) = input.temperature {
                payload_map["temperature"] = serde_json::json!(t);
            }

            let endpoint = if input.endpoint.trim().is_empty() {
                "https://api.anthropic.com/v1/messages".to_string()
            } else if input.endpoint.ends_with("/v1/messages") {
                input.endpoint.clone()
            } else {
                format!("{}/v1/messages", input.endpoint.trim_end_matches('/'))
            };

            let payload_str = payload_map.to_string();
            execute_curl_request("POST", &endpoint, &headers, Some(&payload_str), timeout)
                .await
                .map_err(|e| e.to_string())?
        }
        "ollama" => {
            let mut headers = vec![("Content-Type".to_string(), "application/json".to_string())];
            if let Some(key) = &input.api_key
                && !key.trim().is_empty() {
                headers.push(("Authorization".to_string(), format!("Bearer {}", key.trim())));
            }

            let base_url = if input.endpoint.trim().is_empty() {
                "http://localhost:11434"
            } else {
                input.endpoint.trim_end_matches('/')
            };

            let target_url = if base_url.ends_with("/api/chat") || base_url.ends_with("/v1/chat/completions") {
                base_url.to_string()
            } else {
                format!("{}/api/chat", base_url)
            };

            let payload_map = serde_json::json!({
                "model": input.model,
                "messages": input.messages,
                "stream": false,
                "options": {
                    "temperature": input.temperature.unwrap_or(0.2),
                }
            });

            let payload_str = payload_map.to_string();
            execute_curl_request("POST", &target_url, &headers, Some(&payload_str), timeout)
                .await
                .map_err(|e| e.to_string())?
        }
        _ => {
            let mut headers = vec![("Content-Type".to_string(), "application/json".to_string())];
            if let Some(key) = &input.api_key
                && !key.trim().is_empty() {
                headers.push(("Authorization".to_string(), format!("Bearer {}", key.trim())));
            }

            let base_url = if input.endpoint.trim().is_empty() {
                match provider.as_str() {
                    "lmstudio" => "http://localhost:1234/v1",
                    "openrouter" => "https://openrouter.ai/api/v1",
                    "nvidia" => "https://integrate.api.nvidia.com/v1",
                    "deepseek" => "https://api.deepseek.com/v1",
                    _ => "https://api.openai.com/v1",
                }
            } else {
                input.endpoint.trim_end_matches('/')
            };

            let target_url = if base_url.ends_with("/chat/completions") {
                base_url.to_string()
            } else {
                format!("{}/chat/completions", base_url)
            };

            let mut payload_map = serde_json::json!({
                "model": input.model,
                "messages": input.messages,
                "stream": false,
            });

            if let Some(t) = input.temperature {
                payload_map["temperature"] = serde_json::json!(t);
            }
            if let Some(m) = input.max_tokens {
                payload_map["max_tokens"] = serde_json::json!(m);
            }

            let payload_str = payload_map.to_string();
            execute_curl_request("POST", &target_url, &headers, Some(&payload_str), timeout)
                .await
                .map_err(|e| e.to_string())?
        }
    };

    let latency_ms = start_time.elapsed().as_millis() as u64;

    if status < 200 || status >= 400 {
        return Err(format!(
            "AI Provider returned HTTP {}: {}",
            status,
            if body.trim().is_empty() {
                format!("(Empty response body, status code {})", status)
            } else {
                body.trim().to_string()
            }
        ));
    }

    if body.trim().is_empty() {
        return Err("AI Provider returned an empty completion response body.".to_string());
    }

    let extracted_text = match provider.as_str() {
        "anthropic" => {
            let json_val: serde_json::Value = serde_json::from_str(&body)
                .map_err(|e| format!("Failed to parse Anthropic JSON response: {}", e))?;

            json_val
                .get("content")
                .and_then(|c| c.as_array())
                .and_then(|arr| arr.first())
                .and_then(|item| item.get("text"))
                .and_then(|t| t.as_str())
                .unwrap_or("")
                .to_string()
        }
        "ollama" => {
            let json_val: serde_json::Value = serde_json::from_str(&body)
                .map_err(|e| format!("Failed to parse Ollama JSON response: {}", e))?;

            if let Some(msg) = json_val.get("message").and_then(|m| m.get("content")).and_then(|c| c.as_str()) {
                msg.to_string()
            } else if let Some(choices) = json_val.get("choices").and_then(|c| c.as_array()).and_then(|arr| arr.first()) {
                choices
                    .get("message")
                    .and_then(|m| m.get("content"))
                    .and_then(|c| c.as_str())
                    .unwrap_or("")
                    .to_string()
            } else {
                json_val.get("response").and_then(|r| r.as_str()).unwrap_or("").to_string()
            }
        }
        _ => {
            let json_val: serde_json::Value = serde_json::from_str(&body)
                .map_err(|e| format!("Failed to parse OpenAI JSON response: {}", e))?;

            json_val
                .get("choices")
                .and_then(|c| c.as_array())
                .and_then(|arr| arr.first())
                .and_then(|choice| choice.get("message"))
                .and_then(|m| m.get("content"))
                .and_then(|c| c.as_str())
                .unwrap_or("")
                .to_string()
        }
    };

    if extracted_text.trim().is_empty() {
        return Err("AI model returned an empty completion response.".into());
    }

    Ok(AiCompletionOutput {
        text: extracted_text,
        provider: input.provider,
        model: input.model,
        latency_ms,
    })
}

/// Dynamically queries model lists from Ollama, LM Studio, or OpenAI-compatible endpoints
pub async fn fetch_models(input: AiFetchModelsInput) -> Result<Vec<AiModelInfo>, String> {
    let timeout = input.timeout_seconds.unwrap_or(15);
    let provider = input.provider.to_lowercase();

    let mut headers = vec![("Accept".to_string(), "application/json".to_string())];
    if let Some(key) = &input.api_key
        && !key.trim().is_empty() {
        headers.push(("Authorization".to_string(), format!("Bearer {}", key.trim())));
    }

    if provider == "ollama" {
        let base_url = if input.endpoint.trim().is_empty() {
            "http://localhost:11434"
        } else {
            input.endpoint.trim_end_matches('/')
        };

        let target_url = format!("{}/api/tags", base_url);
        let (status, body) = execute_curl_request("GET", &target_url, &headers, None, timeout)
            .await
            .map_err(|e| format!("Failed to reach Ollama at {}: {}", target_url, e))?;

        if status >= 400 {
            return Err(format!("Ollama returned HTTP {}: {}", status, body));
        }

        let json_val: serde_json::Value = serde_json::from_str(&body)
            .map_err(|e| format!("Invalid JSON from Ollama /api/tags: {}", e))?;

        let mut models = Vec::new();
        if let Some(models_arr) = json_val.get("models").and_then(|m| m.as_array()) {
            for m in models_arr {
                if let Some(name) = m.get("name").and_then(|n| n.as_str()) {
                    let size_gb = m
                        .get("size")
                        .and_then(|s| s.as_u64())
                        .map(|b| format!("{:.1} GB", b as f64 / 1_073_741_824.0));

                    models.push(AiModelInfo {
                        id: name.to_string(),
                        name: name.to_string(),
                        description: size_gb,
                    });
                }
            }
        }
        models.sort_by_key(|m| m.name.to_lowercase());
        return Ok(models);
    }

    if provider == "anthropic" {
        let mut anthropic_headers = vec![
            ("Accept".to_string(), "application/json".to_string()),
            ("anthropic-version".to_string(), "2023-06-01".to_string()),
        ];
        if let Some(key) = &input.api_key
            && !key.trim().is_empty() {
            anthropic_headers.push(("x-api-key".to_string(), key.trim().to_string()));
        }

        let base_url = if input.endpoint.trim().is_empty() {
            "https://api.anthropic.com/v1"
        } else {
            input.endpoint.trim_end_matches('/')
        };

        let target_url = if base_url.ends_with("/models") {
            base_url.to_string()
        } else {
            format!("{}/models", base_url)
        };

        let (status, body) = execute_curl_request("GET", &target_url, &anthropic_headers, None, timeout)
            .await
            .map_err(|e| format!("Failed to reach Anthropic at {}: {}", target_url, e))?;

        if status < 200 || status >= 400 {
            return Err(format!(
                "Anthropic returned HTTP {}: {}",
                status,
                if body.trim().is_empty() {
                    format!("(Empty response body, status code {})", status)
                } else {
                    body.trim().to_string()
                }
            ));
        }

        let json_val: serde_json::Value = serde_json::from_str(&body)
            .map_err(|e| format!("Invalid JSON from Anthropic /v1/models: {}", e))?;

        let mut models = Vec::new();
        if let Some(data_arr) = json_val.get("data").and_then(|d| d.as_array()) {
            for item in data_arr {
                if let Some(id) = item.get("id").and_then(|s| s.as_str()) {
                    let name = item
                        .get("display_name")
                        .and_then(|n| n.as_str())
                        .unwrap_or(id)
                        .to_string();

                    models.push(AiModelInfo {
                        id: id.to_string(),
                        name,
                        description: None,
                    });
                }
            }
        }
        models.sort_by_key(|m| m.name.to_lowercase());
        return Ok(models);
    }

    let base_url = if input.endpoint.trim().is_empty() {
        match provider.as_str() {
            "lmstudio" => "http://localhost:1234/v1",
            "openrouter" => "https://openrouter.ai/api/v1",
            "nvidia" => "https://integrate.api.nvidia.com/v1",
            "deepseek" => "https://api.deepseek.com/v1",
            _ => "https://api.openai.com/v1",
        }
    } else {
        input.endpoint.trim_end_matches('/')
    };

    let target_url = if base_url.ends_with("/models") {
        base_url.to_string()
    } else {
        format!("{}/models", base_url)
    };

    let (status, body) = execute_curl_request("GET", &target_url, &headers, None, timeout)
        .await
        .map_err(|e| format!("Failed to fetch models from {}: {}", target_url, e))?;

    if status < 200 || status >= 400 {
        return Err(format!(
            "Provider returned HTTP {}: {}",
            status,
            if body.trim().is_empty() {
                format!("(Empty response body, status code {})", status)
            } else {
                body.trim().to_string()
            }
        ));
    }

    let json_val: serde_json::Value = serde_json::from_str(&body)
        .map_err(|e| format!("Invalid JSON from models endpoint: {}", e))?;

    let mut models = Vec::new();
    if let Some(data_arr) = json_val.get("data").and_then(|d| d.as_array()) {
        for item in data_arr {
            if let Some(id) = item.get("id").and_then(|s| s.as_str()) {
                let name = item
                    .get("name")
                    .and_then(|n| n.as_str())
                    .unwrap_or(id)
                    .to_string();

                models.push(AiModelInfo {
                    id: id.to_string(),
                    name,
                    description: None,
                });
            }
        }
    }

    models.sort_by_key(|m| m.name.to_lowercase());

    Ok(models)
}
