use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use thiserror::Error;
use tokio::sync::mpsc;

fn get_home_dir() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        std::env::var_os("USERPROFILE").map(PathBuf::from)
    }
    #[cfg(not(windows))]
    {
        std::env::var_os("HOME").map(PathBuf::from)
    }
}

#[derive(Error, Debug)]
pub enum PtyError {
    #[error("PTY creation error: {0}")]
    Pty(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("PTY session '{0}' not found")]
    NotFound(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum PtyEvent {
    Data(Vec<u8>),
    StatusChange { status: String, message: Option<String> },
    Exit { code: u32 },
    Error(String),
}

pub struct ActivePtySession {
    pub stdin_tx: mpsc::Sender<Vec<u8>>,
    pub resize_tx: mpsc::Sender<(u16, u16)>,
    pub kill_tx: mpsc::Sender<()>,
}

pub struct PtyManager {
    sessions: Arc<Mutex<HashMap<String, ActivePtySession>>>,
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn start_session(
        &self,
        session_id: String,
        cols: u16,
        rows: u16,
        working_dir: Option<String>,
        on_event: Channel<PtyEvent>,
    ) -> Result<(), PtyError> {
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: rows.max(1),
                cols: cols.max(1),
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| PtyError::Pty(e.to_string()))?;

        // Determine default shell across platforms
        #[cfg(target_os = "windows")]
        let default_shell = std::env::var("COMSPEC").unwrap_or_else(|_| "powershell.exe".into());

        #[cfg(not(target_os = "windows"))]
        let default_shell = std::env::var("SHELL").unwrap_or_else(|_| {
            if std::path::Path::new("/bin/zsh").exists() {
                "/bin/zsh".into()
            } else {
                "/bin/bash".into()
            }
        });

        let mut cmd = CommandBuilder::new(&default_shell);
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");

        // Working directory (default to user home dir)
        let cwd = working_dir
            .map(PathBuf::from)
            .or_else(get_home_dir);
        if let Some(ref dir) = cwd {
            cmd.cwd(dir);
        }

        let mut child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| PtyError::Pty(e.to_string()))?;

        // Master reader and writer
        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| PtyError::Pty(e.to_string()))?;
        let mut writer = pair
            .master
            .take_writer()
            .map_err(|e| PtyError::Pty(e.to_string()))?;

        let (stdin_tx, mut stdin_rx) = mpsc::channel::<Vec<u8>>(1024);
        let (resize_tx, mut resize_rx) = mpsc::channel::<(u16, u16)>(32);
        let (kill_tx, mut kill_rx) = mpsc::channel::<()>(1);

        {
            let mut guard = self.sessions.lock().unwrap();
            guard.insert(
                session_id.clone(),
                ActivePtySession {
                    stdin_tx,
                    resize_tx,
                    kill_tx,
                },
            );
        }

        let sessions_map = self.sessions.clone();
        let sid = session_id.clone();
        let master = pair.master;

        // Background reader thread (blocking I/O in thread pool)
        let on_event_reader = on_event.clone();
        std::thread::spawn(move || {
            let mut buf = [0u8; 8192];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => {
                        // EOF
                        break;
                    }
                    Ok(n) => {
                        if on_event_reader.send(PtyEvent::Data(buf[..n].to_vec())).is_err() {
                            break;
                        }
                    }
                    Err(e) => {
                        let _ = on_event_reader.send(PtyEvent::Error(format!("Local shell read error: {}", e)));
                        break;
                    }
                }
            }
        });

        // Background manager task (handles stdin, resize, and process exit)
        tauri::async_runtime::spawn(async move {
            let _ = on_event.send(PtyEvent::StatusChange {
                status: "connected".into(),
                message: Some(format!("Local terminal started ({})", default_shell)),
            });

            loop {
                tokio::select! {
                    Some(stdin_chunk) = stdin_rx.recv() => {
                        if writer.write_all(&stdin_chunk).is_err() {
                            break;
                        }
                        let _ = writer.flush();
                    }
                    Some((new_cols, new_rows)) = resize_rx.recv() => {
                        let _ = master.resize(PtySize {
                            rows: new_rows.max(1),
                            cols: new_cols.max(1),
                            pixel_width: 0,
                            pixel_height: 0,
                        });
                    }
                    _ = kill_rx.recv() => {
                        let _ = child.kill();
                        break;
                    }
                    // Poll child process exit
                    _ = tokio::time::sleep(std::time::Duration::from_millis(200)) => {
                        match child.try_wait() {
                            Ok(Some(status)) => {
                                let exit_code = if status.success() { 0 } else { 1 };
                                let _ = on_event.send(PtyEvent::Exit { code: exit_code });
                                break;
                            }
                            Ok(None) => {}
                            Err(_) => break,
                        }
                    }
                }
            }

            let mut guard = sessions_map.lock().unwrap();
            guard.remove(&sid);
        });

        Ok(())
    }

    pub fn write_data(&self, session_id: &str, data: Vec<u8>) -> Result<(), PtyError> {
        let guard = self.sessions.lock().unwrap();
        if let Some(session) = guard.get(session_id) {
            let _ = session.stdin_tx.try_send(data);
            Ok(())
        } else {
            Err(PtyError::NotFound(session_id.into()))
        }
    }

    pub fn resize_pty(&self, session_id: &str, cols: u16, rows: u16) -> Result<(), PtyError> {
        let guard = self.sessions.lock().unwrap();
        if let Some(session) = guard.get(session_id) {
            let _ = session.resize_tx.try_send((cols, rows));
            Ok(())
        } else {
            Err(PtyError::NotFound(session_id.into()))
        }
    }

    pub fn kill_session(&self, session_id: &str) -> Result<(), PtyError> {
        let guard = self.sessions.lock().unwrap();
        if let Some(session) = guard.get(session_id) {
            let _ = session.kill_tx.try_send(());
        }
        Ok(())
    }
}

impl Default for PtyManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_home_dir_resolution() {
        let home = get_home_dir();
        assert!(home.is_some(), "Home directory should resolve on active OS");
    }

    #[test]
    fn test_pty_manager_not_found_errors() {
        let manager = PtyManager::new();
        assert!(manager.write_data("non_existent", vec![1, 2, 3]).is_err());
        assert!(manager.resize_pty("non_existent", 80, 24).is_err());
        assert!(manager.kill_session("non_existent").is_ok());
    }
}
