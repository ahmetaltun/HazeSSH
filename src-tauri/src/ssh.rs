use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use async_trait::async_trait;
use russh::client;
use russh::{ChannelMsg, Disconnect};
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

struct ClientHandler;

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
            let _ = on_event.send(SshEvent::StatusChange {
                status: "connecting".into(),
                message: Some(format!("Connecting to {}:{}...", hostname, port)),
            });

            let mut config = client::Config::default();
            config.keepalive_interval = Some(Duration::from_secs(30));
            let config = Arc::new(config);

            let connect_future = client::connect(config, (hostname.as_str(), port), ClientHandler);
            let mut session = match tokio::time::timeout(Duration::from_secs(15), connect_future).await {
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
            };

            let _ = on_event.send(SshEvent::StatusChange {
                status: "authenticating".into(),
                message: Some(format!("Authenticating as '{}'...", username)),
            });

            // Authentication flow
            let mut auth_success = false;

            if let Some(ref priv_key_str) = private_key {
                match russh_keys::decode_secret_key(priv_key_str, passphrase.as_deref()) {
                    Ok(key_pair) => {
                        let key_arc = Arc::new(key_pair);
                        match session.authenticate_publickey(&username, key_arc).await {
                            Ok(success) if success => {
                                auth_success = true;
                            }
                            Ok(_) => {}
                            Err(e) => {
                                println!("Public key auth failed: {:?}", e);
                            }
                        }
                    }
                    Err(e) => {
                        println!("Failed to parse private key: {:?}", e);
                    }
                }
            }

            if !auth_success && password.is_some()
                && let Some(ref pwd) = password {
                    match session.authenticate_password(&username, pwd).await {
                        Ok(success) if success => {
                            auth_success = true;
                        }
                        Ok(_) => {}
                        Err(e) => {
                            println!("Password auth failed: {:?}", e);
                        }
                    }
                }

            if !auth_success {
                let _ = on_event.send(SshEvent::Error(format!(
                    "Authentication failed for user '{}'. Please verify credentials.",
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
