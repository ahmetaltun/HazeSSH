use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use serialport::{DataBits, FlowControl, Parity, SerialPortType, StopBits};
use tauri::ipc::Channel;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::mpsc;
use tokio_serial::SerialPortBuilderExt;

use crate::models::{SerialConnectOptions, SerialPortInfo};
use crate::ssh::SshEvent;

/// Enumerates all available physical and virtual serial ports on the host system
pub fn list_serial_ports() -> Result<Vec<SerialPortInfo>, String> {
    let raw_ports = serialport::available_ports()
        .map_err(|e| format!("Failed to enumerate hardware serial ports: {}", e))?;

    let mut ports: Vec<SerialPortInfo> = raw_ports
        .into_iter()
        .map(|p| {
            let (port_type, manufacturer, product, serial_number, vid, pid) = match p.port_type {
                SerialPortType::UsbPort(usb) => (
                    "usb".to_string(),
                    usb.manufacturer,
                    usb.product,
                    usb.serial_number,
                    Some(usb.vid),
                    Some(usb.pid),
                ),
                SerialPortType::PciPort => ("pci".to_string(), None, None, None, None, None),
                SerialPortType::BluetoothPort => ("bluetooth".to_string(), None, None, None, None, None),
                SerialPortType::Unknown => ("unknown".to_string(), None, None, None, None, None),
            };

            SerialPortInfo {
                port_name: p.port_name,
                port_type,
                manufacturer,
                product,
                serial_number,
                vid,
                pid,
            }
        })
        .collect();

    // Sort: USB ports first, then alphabetically by name
    ports.sort_by(|a, b| {
        if a.port_type == "usb" && b.port_type != "usb" {
            std::cmp::Ordering::Less
        } else if a.port_type != "usb" && b.port_type == "usb" {
            std::cmp::Ordering::Greater
        } else {
            a.port_name.cmp(&b.port_name)
        }
    });

    Ok(ports)
}

pub struct ActiveSerialSession {
    pub stdin_tx: mpsc::Sender<Vec<u8>>,
    pub disconnect_tx: mpsc::Sender<()>,
}

pub struct SerialSessionManager {
    sessions: Arc<Mutex<HashMap<String, ActiveSerialSession>>>,
}

impl SerialSessionManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn start_session(
        &self,
        session_id: String,
        options: SerialConnectOptions,
        on_event: Channel<SshEvent>,
    ) -> Result<(), String> {
        let data_bits = match options.data_bits.unwrap_or(8) {
            5 => DataBits::Five,
            6 => DataBits::Six,
            7 => DataBits::Seven,
            _ => DataBits::Eight,
        };

        let parity = match options.parity.as_deref().unwrap_or("none").to_lowercase().as_str() {
            "odd" => Parity::Odd,
            "even" => Parity::Even,
            _ => Parity::None,
        };

        let stop_bits = match options.stop_bits.unwrap_or(1) {
            2 => StopBits::Two,
            _ => StopBits::One,
        };

        let flow_control = match options.flow_control.as_deref().unwrap_or("none").to_lowercase().as_str() {
            "software" | "xonxoff" => FlowControl::Software,
            "hardware" | "rtscts" => FlowControl::Hardware,
            _ => FlowControl::None,
        };

        let port_builder = tokio_serial::new(&options.port_name, options.baud_rate)
            .data_bits(data_bits)
            .parity(parity)
            .stop_bits(stop_bits)
            .flow_control(flow_control)
            .timeout(Duration::from_millis(50));

        let port_stream = port_builder.open_native_async().map_err(|e| {
            format!(
                "Failed to open serial port '{}' ({} baud): {}. Ensure device is connected and permissions allow access.",
                options.port_name, options.baud_rate, e
            )
        })?;

        let (stdin_tx, mut stdin_rx) = mpsc::channel::<Vec<u8>>(128);
        let (disconnect_tx, mut disconnect_rx) = mpsc::channel::<()>(1);

        {
            let mut guard = self.sessions.lock().unwrap();
            guard.insert(
                session_id.clone(),
                ActiveSerialSession {
                    stdin_tx,
                    disconnect_tx,
                },
            );
        }

        // Notify frontend that serial link is open
        let _ = on_event.send(SshEvent::StatusChange {
            status: "connected".to_string(),
            message: Some(format!(
                "Connected to {} at {} baud (8N1)",
                options.port_name, options.baud_rate
            )),
        });

        let sessions_clone = self.sessions.clone();
        let sid = session_id.clone();
        let port_name = options.port_name.clone();

        // Spawn Tokio task managing bidirectional serial streaming
        tokio::spawn(async move {
            let (mut reader, mut writer) = tokio::io::split(port_stream);
            let mut read_buf = vec![0u8; 4096];

            loop {
                tokio::select! {
                    // 1. Data received from Serial hardware
                    read_res = reader.read(&mut read_buf) => {
                        match read_res {
                            Ok(0) => {
                                // Device disconnected or EOF
                                break;
                            }
                            Ok(n) => {
                                let data = read_buf[..n].to_vec();
                                if on_event.send(SshEvent::Data(data)).is_err() {
                                    // Terminal frontend closed
                                    break;
                                }
                            }
                            Err(e) => {
                                let _ = on_event.send(SshEvent::Error(format!(
                                    "Serial read error on {}: {}",
                                    port_name, e
                                )));
                                break;
                            }
                        }
                    }

                    // 2. User typed keystrokes forwarded to Serial hardware
                    Some(user_input) = stdin_rx.recv() => {
                        if let Err(e) = writer.write_all(&user_input).await {
                            let _ = on_event.send(SshEvent::Error(format!(
                                "Serial write error on {}: {}",
                                port_name, e
                            )));
                            break;
                        }
                        let _ = writer.flush().await;
                    }

                    // 3. Explicit disconnect requested
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
                status: "disconnected".to_string(),
                message: Some(format!("Serial port {} closed", port_name)),
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
                .ok_or_else(|| format!("Active serial session '{}' not found", session_id))?
        };

        sender
            .send(data)
            .await
            .map_err(|e| format!("Failed to send data to serial session: {}", e))
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
