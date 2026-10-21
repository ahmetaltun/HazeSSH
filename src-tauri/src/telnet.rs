use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::ipc::Channel;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::sync::mpsc;

use crate::models::TelnetConnectOptions;
use crate::ssh::SshEvent;

// RFC 854 Protocol Constants
pub const IAC: u8 = 255;
pub const DONT: u8 = 254;
pub const DO: u8 = 253;
pub const WONT: u8 = 252;
pub const WILL: u8 = 251;
pub const SB: u8 = 250;
pub const GA: u8 = 249;
pub const EL: u8 = 248;
pub const EC: u8 = 247;
pub const AYT: u8 = 246;
pub const AO: u8 = 245;
pub const IP: u8 = 244;
pub const BREAK: u8 = 243;
pub const NOP: u8 = 241;
pub const SE: u8 = 240;

// Standard Options
pub const OPT_TRANSMIT_BINARY: u8 = 0;
pub const OPT_ECHO: u8 = 1;
pub const OPT_SUPPRESS_GO_AHEAD: u8 = 3;
pub const OPT_TERMINAL_TYPE: u8 = 24;
pub const OPT_NAWS: u8 = 31; // Negotiate About Window Size (RFC 1073)

// Terminal Type subnegotiation constants
pub const TELQUAL_IS: u8 = 0;
pub const TELQUAL_SEND: u8 = 1;

#[derive(Debug, PartialEq, Eq)]
enum ParserState {
    Normal,
    Iac,
    Negotiate(u8),
    Subnegotiation { option: u8, buffer: Vec<u8> },
    SubnegotiationIac { option: u8, buffer: Vec<u8> },
}

pub struct TelnetParser {
    state: ParserState,
    terminal_type: String,
    cols: u16,
    rows: u16,
}

impl TelnetParser {
    pub fn new(terminal_type: Option<String>, cols: Option<u16>, rows: Option<u16>) -> Self {
        Self {
            state: ParserState::Normal,
            terminal_type: terminal_type.unwrap_or_else(|| "xterm-256color".into()),
            cols: cols.unwrap_or(80),
            rows: rows.unwrap_or(24),
        }
    }

    /// Feeds incoming raw TCP bytes through the Telnet negotiation state machine
    /// Returns: (clean_terminal_data, negotiation_replies_to_send)
    pub fn process_incoming(&mut self, chunk: &[u8]) -> (Vec<u8>, Vec<u8>) {
        let mut clean_data = Vec::with_capacity(chunk.len());
        let mut replies = Vec::new();

        for &b in chunk {
            match &mut self.state {
                ParserState::Normal => {
                    if b == IAC {
                        self.state = ParserState::Iac;
                    } else {
                        clean_data.push(b);
                    }
                }
                ParserState::Iac => {
                    match b {
                        IAC => {
                            // Escaped literal 255
                            clean_data.push(IAC);
                            self.state = ParserState::Normal;
                        }
                        DO | DONT | WILL | WONT => {
                            self.state = ParserState::Negotiate(b);
                        }
                        SB => {
                            self.state = ParserState::Subnegotiation {
                                option: 0,
                                buffer: Vec::new(),
                            };
                        }
                        _ => {
                            // Single-byte commands (NOP, GA, etc.)
                            self.state = ParserState::Normal;
                        }
                    }
                }
                ParserState::Negotiate(verb) => {
                    let v = *verb;
                    let opt = b;
                    let mut resp = self.handle_negotiation(v, opt);
                    replies.append(&mut resp);
                    self.state = ParserState::Normal;
                }
                ParserState::Subnegotiation { option, buffer } => {
                    if *option == 0 {
                        // First byte of SB is the option code
                        *option = b;
                    } else if b == IAC {
                        let opt = *option;
                        let buf = std::mem::take(buffer);
                        self.state = ParserState::SubnegotiationIac {
                            option: opt,
                            buffer: buf,
                        };
                    } else {
                        buffer.push(b);
                    }
                }
                ParserState::SubnegotiationIac { .. } => {
                    let old_state = std::mem::replace(&mut self.state, ParserState::Normal);
                    if let ParserState::SubnegotiationIac { option, mut buffer } = old_state {
                        if b == SE {
                            // End of subnegotiation
                            let mut resp = self.handle_subnegotiation(option, &buffer);
                            replies.append(&mut resp);
                        } else if b == IAC {
                            // Escaped 255 inside subnegotiation
                            buffer.push(IAC);
                            self.state = ParserState::Subnegotiation { option, buffer };
                        }
                    }
                }
            }
        }

        (clean_data, replies)
    }

    fn handle_negotiation(&self, verb: u8, opt: u8) -> Vec<u8> {
        let mut reply = Vec::new();
        match (verb, opt) {
            // Server asks: DO SUPPRESS_GO_AHEAD -> We reply: WILL SUPPRESS_GO_AHEAD
            (DO, OPT_SUPPRESS_GO_AHEAD) => {
                reply.extend_from_slice(&[IAC, WILL, OPT_SUPPRESS_GO_AHEAD]);
            }
            // Server says: WILL SUPPRESS_GO_AHEAD -> We reply: DO SUPPRESS_GO_AHEAD
            (WILL, OPT_SUPPRESS_GO_AHEAD) => {
                reply.extend_from_slice(&[IAC, DO, OPT_SUPPRESS_GO_AHEAD]);
            }
            // Server asks: DO TRANSMIT_BINARY -> We reply: WILL TRANSMIT_BINARY
            (DO, OPT_TRANSMIT_BINARY) => {
                reply.extend_from_slice(&[IAC, WILL, OPT_TRANSMIT_BINARY]);
            }
            // Server says: WILL TRANSMIT_BINARY -> We reply: DO TRANSMIT_BINARY
            (WILL, OPT_TRANSMIT_BINARY) => {
                reply.extend_from_slice(&[IAC, DO, OPT_TRANSMIT_BINARY]);
            }
            // Server says: WILL ECHO -> We reply: DO ECHO (server will echo our input)
            (WILL, OPT_ECHO) => {
                reply.extend_from_slice(&[IAC, DO, OPT_ECHO]);
            }
            // Server asks: DO ECHO -> We reply: WONT ECHO (we do not echo server output)
            (DO, OPT_ECHO) => {
                reply.extend_from_slice(&[IAC, WONT, OPT_ECHO]);
            }
            // Server asks: DO TERMINAL_TYPE -> We reply: WILL TERMINAL_TYPE
            (DO, OPT_TERMINAL_TYPE) => {
                reply.extend_from_slice(&[IAC, WILL, OPT_TERMINAL_TYPE]);
            }
            // Server asks: DO NAWS -> We reply: WILL NAWS + send window size subnegotiation
            (DO, OPT_NAWS) => {
                reply.extend_from_slice(&[IAC, WILL, OPT_NAWS]);
                reply.extend_from_slice(&self.build_naws_subnegotiation());
            }
            // Any other DO -> We decline with WONT
            (DO, other) => {
                reply.extend_from_slice(&[IAC, WONT, other]);
            }
            // Any other WILL -> We decline with DONT
            (WILL, other) => {
                reply.extend_from_slice(&[IAC, DONT, other]);
            }
            // Acknowledge DONT -> WONT
            (DONT, other) => {
                reply.extend_from_slice(&[IAC, WONT, other]);
            }
            // Acknowledge WONT -> DONT
            (WONT, other) => {
                reply.extend_from_slice(&[IAC, DONT, other]);
            }
            _ => {}
        }
        reply
    }

    fn handle_subnegotiation(&self, option: u8, data: &[u8]) -> Vec<u8> {
        let mut reply = Vec::new();
        if option == OPT_TERMINAL_TYPE && !data.is_empty() && data[0] == TELQUAL_SEND {
            // Server asks for terminal type: IAC SB TERMINAL_TYPE IS <term_name> IAC SE
            reply.extend_from_slice(&[IAC, SB, OPT_TERMINAL_TYPE, TELQUAL_IS]);
            reply.extend_from_slice(self.terminal_type.as_bytes());
            reply.extend_from_slice(&[IAC, SE]);
        }
        reply
    }

    pub fn build_naws_subnegotiation(&self) -> Vec<u8> {
        let cols_hi = ((self.cols >> 8) & 0xFF) as u8;
        let cols_lo = (self.cols & 0xFF) as u8;
        let rows_hi = ((self.rows >> 8) & 0xFF) as u8;
        let rows_lo = (self.rows & 0xFF) as u8;

        vec![IAC, SB, OPT_NAWS, cols_hi, cols_lo, rows_hi, rows_lo, IAC, SE]
    }
}

pub struct ActiveTelnetSession {
    pub stdin_tx: mpsc::Sender<Vec<u8>>,
    pub disconnect_tx: mpsc::Sender<()>,
}

pub struct TelnetSessionManager {
    sessions: Arc<Mutex<HashMap<String, ActiveTelnetSession>>>,
}

impl TelnetSessionManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn start_session(
        &self,
        session_id: String,
        options: TelnetConnectOptions,
        on_event: Channel<SshEvent>,
    ) -> Result<(), String> {
        let addr = format!("{}:{}", options.host, options.port);

        // 1. Establish TCP connection with timeout
        let connect_future = TcpStream::connect(&addr);
        let stream = tokio::time::timeout(Duration::from_secs(10), connect_future)
            .await
            .map_err(|_| format!("Telnet connection to {} timed out after 10 seconds", addr))?
            .map_err(|e| format!("Failed to connect to Telnet host {}: {}", addr, e))?;

        if let Err(e) = stream.set_nodelay(true) {
            eprintln!("Failed to set TCP_NODELAY on Telnet stream: {}", e);
        }

        let (stdin_tx, mut stdin_rx) = mpsc::channel::<Vec<u8>>(128);
        let (disconnect_tx, mut disconnect_rx) = mpsc::channel::<()>(1);

        {
            let mut guard = self.sessions.lock().unwrap();
            guard.insert(
                session_id.clone(),
                ActiveTelnetSession {
                    stdin_tx,
                    disconnect_tx,
                },
            );
        }

        let _ = on_event.send(SshEvent::StatusChange {
            status: "connected".into(),
            message: Some(format!("Connected to {} via Telnet", addr)),
        });

        let sessions_clone = self.sessions.clone();
        let sid = session_id.clone();
        let terminal_type = options.terminal_type.clone();
        let cols = options.cols;
        let rows = options.rows;

        // 2. Spawn bidirectional streaming task
        tokio::spawn(async move {
            let (mut reader, mut writer) = stream.into_split();
            let mut parser = TelnetParser::new(terminal_type, cols, rows);
            let mut read_buf = vec![0u8; 4096];

            loop {
                tokio::select! {
                    // Incoming data from remote Telnet server
                    read_res = reader.read(&mut read_buf) => {
                        match read_res {
                            Ok(0) => {
                                // Connection closed by server
                                break;
                            }
                            Ok(n) => {
                                let (clean_data, replies) = parser.process_incoming(&read_buf[..n]);

                                // Send option negotiation replies if required
                                if !replies.is_empty()
                                    && let Err(e) = writer.write_all(&replies).await {
                                        let _ = on_event.send(SshEvent::Error(format!("Telnet negotiation write error: {}", e)));
                                        break;
                                    }

                                // Forward clean terminal output to xterm.js
                                if !clean_data.is_empty()
                                    && on_event.send(SshEvent::Data(clean_data)).is_err() {
                                        break;
                                    }
                            }
                            Err(e) => {
                                let _ = on_event.send(SshEvent::Error(format!("Telnet read error from {}: {}", addr, e)));
                                break;
                            }
                        }
                    }

                    // User input from terminal
                    Some(user_input) = stdin_rx.recv() => {
                        // Telnet protocol: escape 255 (IAC) as IAC IAC
                        let mut sanitized = Vec::with_capacity(user_input.len());
                        for &b in &user_input {
                            if b == IAC {
                                sanitized.push(IAC);
                                sanitized.push(IAC);
                            } else {
                                sanitized.push(b);
                            }
                        }

                        if let Err(e) = writer.write_all(&sanitized).await {
                            let _ = on_event.send(SshEvent::Error(format!("Telnet write error: {}", e)));
                            break;
                        }
                        let _ = writer.flush().await;
                    }

                    // Explicit disconnect
                    _ = disconnect_rx.recv() => {
                        break;
                    }
                }
            }

            // Cleanup session
            {
                let mut guard = sessions_clone.lock().unwrap();
                guard.remove(&sid);
            }

            let _ = on_event.send(SshEvent::StatusChange {
                status: "disconnected".into(),
                message: Some(format!("Telnet session to {} closed", addr)),
            });
            let _ = on_event.send(SshEvent::Exit { code: 0 });
        });

        Ok(())
    }

    pub async fn write(&self, session_id: &str, data: Vec<u8>) -> Result<(), String> {
        let sender = {
            let guard = self.sessions.lock().unwrap();
            guard
                .get(session_id)
                .map(|s| s.stdin_tx.clone())
                .ok_or_else(|| format!("Active Telnet session '{}' not found", session_id))?
        };

        sender
            .send(data)
            .await
            .map_err(|e| format!("Failed to send data to Telnet session: {}", e))
    }

    pub async fn disconnect(&self, session_id: &str) -> Result<(), String> {
        let sender = {
            let guard = self.sessions.lock().unwrap();
            guard.get(session_id).map(|s| s.disconnect_tx.clone())
        };

        if let Some(tx) = sender {
            let _ = tx.send(()).await;
        }

        let mut guard = self.sessions.lock().unwrap();
        guard.remove(session_id);
        Ok(())
    }
}

impl Default for TelnetSessionManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_plain_data_passthrough() {
        let mut parser = TelnetParser::new(None, None, None);
        let input = b"Hello, world!\r\n";
        let (clean, replies) = parser.process_incoming(input);
        assert_eq!(clean, input);
        assert!(replies.is_empty());
    }

    #[test]
    fn test_iac_escape() {
        let mut parser = TelnetParser::new(None, None, None);
        // IAC IAC should produce a single literal 255
        let input = &[IAC, IAC];
        let (clean, replies) = parser.process_incoming(input);
        assert_eq!(clean, vec![255]);
        assert!(replies.is_empty());
    }

    #[test]
    fn test_suppress_go_ahead_negotiation() {
        let mut parser = TelnetParser::new(None, None, None);
        // Server sends: IAC DO SUPPRESS_GO_AHEAD
        let input = &[IAC, DO, OPT_SUPPRESS_GO_AHEAD];
        let (clean, replies) = parser.process_incoming(input);
        assert!(clean.is_empty());
        // Client should reply: IAC WILL SUPPRESS_GO_AHEAD
        assert_eq!(replies, vec![IAC, WILL, OPT_SUPPRESS_GO_AHEAD]);
    }

    #[test]
    fn test_terminal_type_subnegotiation() {
        let mut parser = TelnetParser::new(Some("vt100".into()), None, None);
        // Step 1: Server asks: IAC DO TERMINAL_TYPE
        let (clean1, reply1) = parser.process_incoming(&[IAC, DO, OPT_TERMINAL_TYPE]);
        assert!(clean1.is_empty());
        assert_eq!(reply1, vec![IAC, WILL, OPT_TERMINAL_TYPE]);

        // Step 2: Server requests subnegotiation: IAC SB TERMINAL_TYPE 1 IAC SE
        let (clean2, reply2) = parser.process_incoming(&[IAC, SB, OPT_TERMINAL_TYPE, TELQUAL_SEND, IAC, SE]);
        assert!(clean2.is_empty());
        // Client responds: IAC SB TERMINAL_TYPE 0 "vt100" IAC SE
        let mut expected = vec![IAC, SB, OPT_TERMINAL_TYPE, TELQUAL_IS];
        expected.extend_from_slice(b"vt100");
        expected.extend_from_slice(&[IAC, SE]);
        assert_eq!(reply2, expected);
    }
}
