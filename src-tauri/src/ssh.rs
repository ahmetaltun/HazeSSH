use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use async_trait::async_trait;
use russh::client;
use russh::{ChannelMsg, Disconnect};
use russh_keys::agent::client::AgentClient;
use russh_keys::key;
use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use thiserror::Error;
use tokio::sync::mpsc;

#[derive(Error, Debug)]
pub enum SshError {
    #[error("SSH network/protocol error: {0}")]
    Russh(#[from] russh::Error),

    #[error("Key parsing error: {0}")]
    RusshKey(#[from] russh_keys::Error),

    #[error("Authentication failed for user '{0}'")]
    AuthFailed(String),

    #[error("Connection timed out after {0} seconds")]
    Timeout(u64),

    #[error("Session not found: {0}")]
    SessionNotFound(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("{0}")]
    Custom(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum SshEvent {
    Data(Vec<u8>),
    StatusChange { status: String, message: Option<String> },
    Exit { code: u32 },
    Error(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JumpHostConfig {
    pub hostname: String,
    pub port: u16,
    pub username: String,
    pub password: Option<String>,
    pub private_key: Option<String>,
    pub passphrase: Option<String>,
    pub auth_type: Option<String>,
}

pub struct ClientHandler;

#[async_trait]
impl client::Handler for ClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &key::PublicKey,
    ) -> Result<bool, Self::Error> {
        // Accept host key (in future milestone: match against known_hosts DB)
        Ok(true)
    }
}

pub struct ActiveSession {
    pub stdin_tx: mpsc::Sender<Vec<u8>>,
    pub resize_tx: mpsc::Sender<(u32, u32)>,
    pub disconnect_tx: mpsc::Sender<()>,
}

pub struct SshManager {
    sessions: Arc<Mutex<HashMap<String, ActiveSession>>>,
}

async fn authenticate_client(
    session: &mut client::Handle<ClientHandler>,
    username: &str,
    password: Option<&str>,
    private_key: Option<&str>,
    passphrase: Option<&str>,
    auth_type: Option<&str>,
) -> bool {
    // 1. Try SSH Agent if requested
    if auth_type == Some("agent")
        && let Ok(mut agent) = AgentClient::connect_env().await
        && let Ok(keys) = agent.request_identities().await
    {
        let mut current_agent = agent;
        for k in keys {
            let (next_agent, auth_res) = session.authenticate_future(username, k, current_agent).await;
            current_agent = next_agent;
            if let Ok(true) = auth_res {
                return true;
            }
        }
    }

    // 2. Try Public Key Authentication
    if let Some(priv_key_str) = private_key {
        match russh_keys::decode_secret_key(priv_key_str, passphrase) {
            Ok(key_pair) => {
                let key_arc = Arc::new(key_pair);
                if let Ok(true) = session.authenticate_publickey(username, key_arc).await {
                    return true;
                }
            }
            Err(e) => {
                eprintln!("Failed to parse private key: {:?}", e);
            }
        }
    }

    // 3. Try Password Authentication
    if let Some(pwd) = password
        && let Ok(true) = session.authenticate_password(username, pwd).await
    {
        return true;
    }

    // 4. Automatic Agent Fallback if no credentials were provided
    if auth_type != Some("password")
        && private_key.is_none()
        && password.is_none()
        && let Ok(mut agent) = AgentClient::connect_env().await
        && let Ok(keys) = agent.request_identities().await
    {
        let mut current_agent = agent;
        for k in keys {
            let (next_agent, auth_res) = session.authenticate_future(username, k, current_agent).await;
            current_agent = next_agent;
            if let Ok(true) = auth_res {
                return true;
            }
        }
    }

    false
}

impl SshManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn start_session(
        &self,
        session_id: String,
        hostname: String,
        port: u16,
        username: String,
        password: Option<String>,
        private_key: Option<String>,
        passphrase: Option<String>,
        auth_type: Option<String>,
        jump_host: Option<JumpHostConfig>,
        cols: u32,
        rows: u32,
        on_event: Channel<SshEvent>,
    ) -> Result<(), SshError> {
        let (stdin_tx, mut stdin_rx) = mpsc::channel::<Vec<u8>>(1024);
        let (resize_tx, mut resize_rx) = mpsc::channel::<(u32, u32)>(32);
        let (disconnect_tx, mut disconnect_rx) = mpsc::channel::<()>(1);

        {
            let mut guard = self.sessions.lock().unwrap();
            guard.insert(
                session_id.clone(),
                ActiveSession {
                    stdin_tx,
                    resize_tx,
                    disconnect_tx,
                },
            );
        }

        let sessions_map = self.sessions.clone();
        let sid = session_id.clone();

        tokio::spawn(async move {
            let mut config = client::Config::default();
            config.keepalive_interval = Some(Duration::from_secs(30));
            let config = Arc::new(config);

            let mut session = if let Some(jh) = jump_host {
                // Connect via Bastion Jump Host (ProxyJump)
                let _ = on_event.send(SshEvent::StatusChange {
                    status: "connecting".into(),
                    message: Some(format!("Connecting to Bastion Jump Host {}:{}...", jh.hostname, jh.port)),
                });

                let bastion_connect_future = async {
                    let stream = tokio::net::TcpStream::connect((jh.hostname.as_str(), jh.port))
                        .await
                        .map_err(russh::Error::from)?;
                    let _ = stream.set_nodelay(true);
                    client::connect_stream(config.clone(), stream, ClientHandler).await
                };

                let mut bastion_session = match tokio::time::timeout(Duration::from_secs(15), bastion_connect_future).await {
                    Ok(Ok(s)) => s,
                    Ok(Err(e)) => {
                        let _ = on_event.send(SshEvent::Error(format!("Bastion jump host connection failed: {}", e)));
                        let mut guard = sessions_map.lock().unwrap();
                        guard.remove(&sid);
                        return;
                    }
                    Err(_) => {
                        let _ = on_event.send(SshEvent::Error("Bastion jump host timed out after 15 seconds".into()));
                        let mut guard = sessions_map.lock().unwrap();
                        guard.remove(&sid);
                        return;
                    }
                };

                let _ = on_event.send(SshEvent::StatusChange {
                    status: "authenticating".into(),
                    message: Some(format!("Authenticating jump host as '{}'...", jh.username)),
                });

                let bastion_auth = authenticate_client(
                    &mut bastion_session,
                    &jh.username,
                    jh.password.as_deref(),
                    jh.private_key.as_deref(),
                    jh.passphrase.as_deref(),
                    jh.auth_type.as_deref(),
                ).await;

                if !bastion_auth {
                    let _ = on_event.send(SshEvent::Error(format!(
                        "Authentication failed on Bastion jump host for user '{}'.",
                        jh.username
                    )));
                    let mut guard = sessions_map.lock().unwrap();
                    guard.remove(&sid);
                    return;
                }

                let _ = on_event.send(SshEvent::StatusChange {
                    status: "connecting".into(),
                    message: Some(format!("Opening ProxyJump direct tunnel through {} to {}:{}...", jh.hostname, hostname, port)),
                });

                let channel = match bastion_session
                    .channel_open_direct_tcpip(&hostname, port as u32, "127.0.0.1", 0)
                    .await
                {
                    Ok(ch) => ch,
                    Err(e) => {
                        let _ = on_event.send(SshEvent::Error(format!("Failed to open direct-tcpip channel through jump host: {}", e)));
                        let mut guard = sessions_map.lock().unwrap();
                        guard.remove(&sid);
                        return;
                    }
                };

                let proxied_stream = channel.into_stream();

                let target_connect_future = client::connect_stream(config.clone(), proxied_stream, ClientHandler);
                match tokio::time::timeout(Duration::from_secs(15), target_connect_future).await {
                    Ok(Ok(s)) => s,
                    Ok(Err(e)) => {
                        let _ = on_event.send(SshEvent::Error(format!("Target SSH connection failed through tunnel: {}", e)));
                        let mut guard = sessions_map.lock().unwrap();
                        guard.remove(&sid);
                        return;
                    }
                    Err(_) => {
                        let _ = on_event.send(SshEvent::Error("Target connection timed out after 15 seconds".into()));
                        let mut guard = sessions_map.lock().unwrap();
                        guard.remove(&sid);
                        return;
                    }
                }
            } else {
                // Direct connection
                let _ = on_event.send(SshEvent::StatusChange {
                    status: "connecting".into(),
                    message: Some(format!("Connecting to {}:{}...", hostname, port)),
                });

                let connect_future = async {
                    let stream = tokio::net::TcpStream::connect((hostname.as_str(), port))
                        .await
                        .map_err(russh::Error::from)?;
                    let _ = stream.set_nodelay(true);
                    client::connect_stream(config, stream, ClientHandler).await
                };

                match tokio::time::timeout(Duration::from_secs(15), connect_future).await {
                    Ok(Ok(s)) => s,
                    Ok(Err(e)) => {
                        let _ = on_event.send(SshEvent::Error(format!("Connection failed: {}", e)));
                        let mut guard = sessions_map.lock().unwrap();
                        guard.remove(&sid);
                        return;
                    }
                    Err(_) => {
                        let _ = on_event.send(SshEvent::Error("Connection timed out after 15 seconds".into()));
                        let mut guard = sessions_map.lock().unwrap();
                        guard.remove(&sid);
                        return;
                    }
                }
            };

            let _ = on_event.send(SshEvent::StatusChange {
                status: "authenticating".into(),
                message: Some(format!("Authenticating as '{}'...", username)),
            });

            // Target Authentication
            let auth_success = authenticate_client(
                &mut session,
                &username,
                password.as_deref(),
                private_key.as_deref(),
                passphrase.as_deref(),
                auth_type.as_deref(),
            ).await;

            if !auth_success {
                let _ = on_event.send(SshEvent::Error(format!(
                    "Authentication failed for user '{}'. Please verify credentials or SSH agent.",
                    username
                )));
                let mut guard = sessions_map.lock().unwrap();
                guard.remove(&sid);
                return;
            }

            let _ = on_event.send(SshEvent::StatusChange {
                status: "connected".into(),
                message: Some("Connected successfully. Opening shell...".into()),
            });

            // Open interactive session channel
            let mut channel = match session.channel_open_session().await {
                Ok(ch) => ch,
                Err(e) => {
                    let _ = on_event.send(SshEvent::Error(format!("Failed to open session channel: {}", e)));
                    let mut guard = sessions_map.lock().unwrap();
                    guard.remove(&sid);
                    return;
                }
            };

            // Request PTY
            if let Err(e) = channel
                .request_pty(
                    false,
                    "xterm-256color",
                    cols,
                    rows,
                    0,
                    0,
                    &[],
                )
                .await
            {
                let _ = on_event.send(SshEvent::Error(format!("Failed to request PTY: {}", e)));
                let mut guard = sessions_map.lock().unwrap();
                guard.remove(&sid);
                return;
            }

            // Start remote shell
            if let Err(e) = channel.request_shell(true).await {
                let _ = on_event.send(SshEvent::Error(format!("Failed to request shell: {}", e)));
                let mut guard = sessions_map.lock().unwrap();
                guard.remove(&sid);
                return;
            }

            // Main event loop for this active session
            loop {
                tokio::select! {
                    msg = channel.wait() => {
                        match msg {
                            Some(ChannelMsg::Data { ref data }) => {
                                let _ = on_event.send(SshEvent::Data(data.to_vec()));
                            }
                            Some(ChannelMsg::ExtendedData { ref data, .. }) => {
                                let _ = on_event.send(SshEvent::Data(data.to_vec()));
                            }
                            Some(ChannelMsg::ExitStatus { exit_status }) => {
                                let _ = on_event.send(SshEvent::Exit { code: exit_status });
                                break;
                            }
                            Some(ChannelMsg::Close) | None => {
                                let _ = on_event.send(SshEvent::StatusChange {
                                    status: "disconnected".into(),
                                    message: Some("Connection closed by remote host.".into()),
                                });
                                break;
                            }
                            _ => {}
                        }
                    }
                    Some(stdin_chunk) = stdin_rx.recv() => {
                        if let Err(e) = channel.data(&stdin_chunk[..]).await {
                            eprintln!("Error writing stdin to channel: {:?}", e);
                            break;
                        }
                    }
                    Some((new_cols, new_rows)) = resize_rx.recv() => {
                        let _ = channel.window_change(new_cols, new_rows, 0, 0).await;
                    }
                    _ = disconnect_rx.recv() => {
                        let _ = channel.close().await;
                        let _ = session.disconnect(Disconnect::ByApplication, "Closed by user", "").await;
                        break;
                    }
                }
            }

            let mut guard = sessions_map.lock().unwrap();
            guard.remove(&sid);
        });

        Ok(())
    }

    pub fn write_data(&self, session_id: &str, data: Vec<u8>) -> Result<(), SshError> {
        let guard = self.sessions.lock().unwrap();
        if let Some(session) = guard.get(session_id) {
            let _ = session.stdin_tx.try_send(data);
            Ok(())
        } else {
            Err(SshError::SessionNotFound(session_id.into()))
        }
    }

    pub fn resize_pty(&self, session_id: &str, cols: u32, rows: u32) -> Result<(), SshError> {
        let guard = self.sessions.lock().unwrap();
        if let Some(session) = guard.get(session_id) {
            let _ = session.resize_tx.try_send((cols, rows));
            Ok(())
        } else {
            Err(SshError::SessionNotFound(session_id.into()))
        }
    }

    pub fn disconnect_session(&self, session_id: &str) -> Result<(), SshError> {
        let guard = self.sessions.lock().unwrap();
        if let Some(session) = guard.get(session_id) {
            let _ = session.disconnect_tx.try_send(());
            Ok(())
        } else {
            Ok(())
        }
    }
}

impl Default for SshManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_jump_host_config_structure() {
        let jh = JumpHostConfig {
            hostname: "bastion.example.com".into(),
            port: 2222,
            username: "jumpuser".into(),
            password: Some("secret".into()),
            private_key: None,
            passphrase: None,
            auth_type: Some("identity".into()),
        };
        assert_eq!(jh.hostname, "bastion.example.com");
        assert_eq!(jh.port, 2222);
        assert_eq!(jh.username, "jumpuser");
        assert_eq!(jh.auth_type.as_deref(), Some("identity"));
    }

    #[test]
    fn test_ssh_manager_not_found_errors() {
        let manager = SshManager::new();
        assert!(manager.write_data("non_existent", vec![1, 2, 3]).is_err());
        assert!(manager.resize_pty("non_existent", 80, 24).is_err());
        assert!(manager.disconnect_session("non_existent").is_ok());
    }
}
