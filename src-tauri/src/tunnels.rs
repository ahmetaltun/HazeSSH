use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use async_trait::async_trait;
use russh::client::{self, Handler, Msg};
use russh::Channel;
use russh_keys::key;
use serde::{Deserialize, Serialize};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::watch;

use crate::models::{Host, Tunnel};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TunnelRuntimeStatus {
    pub tunnel_id: String,
    pub status: String, // "running", "stopped", "error", "starting"
    pub bytes_in: u64,
    pub bytes_out: u64,
    pub active_connections: u32,
    pub error_message: Option<String>,
}

struct DirectClientHandler;

#[async_trait]
impl Handler for DirectClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &key::PublicKey,
    ) -> Result<bool, Self::Error> {
        Ok(true)
    }
}

struct RemoteForwardHandler {
    local_host: String,
    local_port: u16,
    bytes_in: Arc<AtomicU64>,
    bytes_out: Arc<AtomicU64>,
    active_connections: Arc<AtomicU32>,
}

#[async_trait]
impl Handler for RemoteForwardHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &key::PublicKey,
    ) -> Result<bool, Self::Error> {
        Ok(true)
    }

    async fn server_channel_open_forwarded_tcpip(
        &mut self,
        channel: Channel<Msg>,
        _connected_address: &str,
        _connected_port: u32,
        _originator_address: &str,
        _originator_port: u32,
        _session: &mut russh::client::Session,
    ) -> Result<(), Self::Error> {
        let local_addr = format!("{}:{}", self.local_host, self.local_port);
        let bytes_in = self.bytes_in.clone();
        let bytes_out = self.bytes_out.clone();
        let active_conn = self.active_connections.clone();

        tokio::spawn(async move {
            match TcpStream::connect(&local_addr).await {
                Ok(local_stream) => {
                    active_conn.fetch_add(1, Ordering::Relaxed);
                    let ssh_stream = channel.into_stream();
                    let _ = proxy_bidirectional(local_stream, ssh_stream, bytes_in, bytes_out).await;
                    active_conn.fetch_sub(1, Ordering::Relaxed);
                }
                Err(e) => {
                    eprintln!("Failed to connect to local target {}: {}", local_addr, e);
                }
            }
        });

        Ok(())
    }
}

pub struct ActiveTunnel {
    pub status: Arc<Mutex<TunnelRuntimeStatus>>,
    pub stop_tx: watch::Sender<bool>,
}

pub struct TunnelManager {
    tunnels: Arc<tokio::sync::Mutex<HashMap<String, ActiveTunnel>>>,
}

impl TunnelManager {
    pub fn new() -> Self {
        Self {
            tunnels: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
        }
    }

    pub async fn get_statuses(&self) -> Vec<TunnelRuntimeStatus> {
        let guard = self.tunnels.lock().await;
        guard
            .values()
            .map(|t| t.status.lock().unwrap().clone())
            .collect()
    }

    pub async fn stop_tunnel(&self, tunnel_id: &str) -> Result<(), String> {
        let mut guard = self.tunnels.lock().await;
        if let Some(active) = guard.remove(tunnel_id) {
            let _ = active.stop_tx.send(true);
            let mut st = active.status.lock().unwrap();
            st.status = "stopped".into();
            st.active_connections = 0;
            Ok(())
        } else {
            Err(format!("Tunnel '{}' is not running", tunnel_id))
        }
    }

    pub async fn start_tunnel(
        &self,
        tunnel: Tunnel,
        host: Host,
        secret: Option<String>,
        passphrase: Option<String>,
    ) -> Result<(), String> {
        let tunnel_id = tunnel.id.clone();

        {
            let guard = self.tunnels.lock().await;
            if guard.contains_key(&tunnel_id) {
                return Err("Tunnel is already running".into());
            }
        }

        let (stop_tx, stop_rx) = watch::channel(false);
        let runtime_status = Arc::new(Mutex::new(TunnelRuntimeStatus {
            tunnel_id: tunnel_id.clone(),
            status: "starting".into(),
            bytes_in: 0,
            bytes_out: 0,
            active_connections: 0,
            error_message: None,
        }));

        {
            let mut guard = self.tunnels.lock().await;
            guard.insert(
                tunnel_id.clone(),
                ActiveTunnel {
                    status: runtime_status.clone(),
                    stop_tx,
                },
            );
        }

        let tunnels_map = self.tunnels.clone();
        let tid = tunnel_id.clone();
        let status_clone = runtime_status.clone();

        tokio::spawn(async move {
            let res = match tunnel.tunnel_type.as_str() {
                "local" => run_local_tunnel(tunnel, host, secret, passphrase, status_clone.clone(), stop_rx).await,
                "remote" => run_remote_tunnel(tunnel, host, secret, passphrase, status_clone.clone(), stop_rx).await,
                "dynamic" => run_dynamic_tunnel(tunnel, host, secret, passphrase, status_clone.clone(), stop_rx).await,
                other => Err(format!("Unsupported tunnel type: {}", other)),
            };

            if let Err(err_msg) = res {
                let mut st = status_clone.lock().unwrap();
                st.status = "error".into();
                st.error_message = Some(err_msg);
                st.active_connections = 0;
            } else {
                let mut st = status_clone.lock().unwrap();
                st.status = "stopped".into();
                st.active_connections = 0;
            }

            let mut guard = tunnels_map.lock().await;
            guard.remove(&tid);
        });

        Ok(())
    }
}

/// Bidirectionally copy streams with real-time atomic byte counters
async fn proxy_bidirectional<A, B>(
    a: A,
    b: B,
    bytes_in: Arc<AtomicU64>,
    bytes_out: Arc<AtomicU64>,
) -> Result<(), std::io::Error>
where
    A: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin,
    B: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin,
{
    let (mut a_read, mut a_write) = tokio::io::split(a);
    let (mut b_read, mut b_write) = tokio::io::split(b);

    let bin = bytes_in.clone();
    let a_to_b = async move {
        let mut buf = [0u8; 8192];
        loop {
            let n = a_read.read(&mut buf).await?;
            if n == 0 {
                break;
            }
            b_write.write_all(&buf[..n]).await?;
            bin.fetch_add(n as u64, Ordering::Relaxed);
        }
        let _ = b_write.shutdown().await;
        Ok::<(), std::io::Error>(())
    };

    let bout = bytes_out.clone();
    let b_to_a = async move {
        let mut buf = [0u8; 8192];
        loop {
            let n = b_read.read(&mut buf).await?;
            if n == 0 {
                break;
            }
            a_write.write_all(&buf[..n]).await?;
            bout.fetch_add(n as u64, Ordering::Relaxed);
        }
        let _ = a_write.shutdown().await;
        Ok::<(), std::io::Error>(())
    };

    let _ = tokio::join!(a_to_b, b_to_a);
    Ok(())
}

/// Authenticate a russh client handle
async fn authenticate_client<H: Handler>(
    session: &mut client::Handle<H>,
    username: &str,
    secret: Option<String>,
    passphrase: Option<String>,
) -> Result<(), String> {
    let mut auth_success = false;

    if let Some(ref sec) = secret {
        if sec.contains("PRIVATE KEY") {
            match russh_keys::decode_secret_key(sec, passphrase.as_deref()) {
                Ok(key_pair) => {
                    let key_arc = Arc::new(key_pair);
                    if let Ok(success) = session.authenticate_publickey(username, key_arc).await {
                        auth_success = success;
                    }
                }
                Err(e) => return Err(format!("Failed to parse private key: {}", e)),
            }
        } else {
            if let Ok(success) = session.authenticate_password(username, sec).await {
                auth_success = success;
            }
        }
    }

    if auth_success {
        Ok(())
    } else {
        Err(format!("Authentication failed for user '{}'", username))
    }
}

/// Run Local Port Forwarding (-L local_port:remote_host:remote_port)
async fn run_local_tunnel(
    tunnel: Tunnel,
    host: Host,
    secret: Option<String>,
    passphrase: Option<String>,
    status: Arc<Mutex<TunnelRuntimeStatus>>,
    mut stop_rx: watch::Receiver<bool>,
) -> Result<(), String> {
    let remote_host = tunnel
        .remote_host
        .ok_or_else(|| "Remote host is required for local port forwarding".to_string())?;
    let remote_port = tunnel
        .remote_port
        .ok_or_else(|| "Remote port is required for local port forwarding".to_string())?;

    let bind_addr = format!("{}:{}", tunnel.local_host, tunnel.local_port);
    let listener = TcpListener::bind(&bind_addr)
        .await
        .map_err(|e| format!("Failed to bind local port {}: {}", bind_addr, e))?;

    let mut config = client::Config::default();
    config.keepalive_interval = Some(Duration::from_secs(30));
    let config = Arc::new(config);

    let connect_future = client::connect(
        config,
        (host.hostname.as_str(), host.port),
        DirectClientHandler,
    );

    let mut session = tokio::time::timeout(Duration::from_secs(12), connect_future)
        .await
        .map_err(|_| "Connection timed out after 12 seconds".to_string())?
        .map_err(|e| format!("SSH connection failed: {}", e))?;

    let username = host.username.unwrap_or_else(|| "root".into());
    authenticate_client(&mut session, &username, secret, passphrase).await?;

    let session = Arc::new(tokio::sync::Mutex::new(session));
    let bytes_in = Arc::new(AtomicU64::new(0));
    let bytes_out = Arc::new(AtomicU64::new(0));
    let active_connections = Arc::new(AtomicU32::new(0));

    {
        let mut st = status.lock().unwrap();
        st.status = "running".into();
    }

    let status_updater = status.clone();
    let bin_clone = bytes_in.clone();
    let bout_clone = bytes_out.clone();
    let act_clone = active_connections.clone();

    // Spawn a periodic status synchronization task
    let sync_task = tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_millis(500));
        loop {
            interval.tick().await;
            let mut st = status_updater.lock().unwrap();
            if st.status != "running" {
                break;
            }
            st.bytes_in = bin_clone.load(Ordering::Relaxed);
            st.bytes_out = bout_clone.load(Ordering::Relaxed);
            st.active_connections = act_clone.load(Ordering::Relaxed);
        }
    });

    loop {
        tokio::select! {
            _ = stop_rx.changed() => {
                if *stop_rx.borrow() {
                    break;
                }
            }
            accept_res = listener.accept() => {
                match accept_res {
                    Ok((local_stream, client_addr)) => {
                        let session_ref = session.clone();
                        let r_host = remote_host.clone();
                        let b_in = bytes_in.clone();
                        let b_out = bytes_out.clone();
                        let act = active_connections.clone();

                        tokio::spawn(async move {
                            act.fetch_add(1, Ordering::Relaxed);

                            let channel_res = {
                                let session_guard = session_ref.lock().await;
                                session_guard.channel_open_direct_tcpip(
                                    &r_host,
                                    remote_port as u32,
                                    client_addr.ip().to_string(),
                                    client_addr.port() as u32,
                                ).await
                            };

                            match channel_res {
                                Ok(channel) => {
                                    let ssh_stream = channel.into_stream();
                                    let _ = proxy_bidirectional(local_stream, ssh_stream, b_in, b_out).await;
                                }
                                Err(e) => {
                                    eprintln!("Failed to open direct-tcpip channel: {}", e);
                                }
                            }

                            act.fetch_sub(1, Ordering::Relaxed);
                        });
                    }
                    Err(e) => {
                        eprintln!("TCP accept error: {}", e);
                    }
                }
            }
        }
    }

    sync_task.abort();
    Ok(())
}

/// Run Remote Port Forwarding (-R remote_port:local_host:local_port)
async fn run_remote_tunnel(
    tunnel: Tunnel,
    host: Host,
    secret: Option<String>,
    passphrase: Option<String>,
    status: Arc<Mutex<TunnelRuntimeStatus>>,
    mut stop_rx: watch::Receiver<bool>,
) -> Result<(), String> {
    let remote_port = tunnel
        .remote_port
        .ok_or_else(|| "Remote port is required for remote port forwarding".to_string())?;

    let bytes_in = Arc::new(AtomicU64::new(0));
    let bytes_out = Arc::new(AtomicU64::new(0));
    let active_connections = Arc::new(AtomicU32::new(0));

    let handler = RemoteForwardHandler {
        local_host: tunnel.local_host.clone(),
        local_port: tunnel.local_port,
        bytes_in: bytes_in.clone(),
        bytes_out: bytes_out.clone(),
        active_connections: active_connections.clone(),
    };

    let mut config = client::Config::default();
    config.keepalive_interval = Some(Duration::from_secs(30));
    let config = Arc::new(config);

    let connect_future = client::connect(
        config,
        (host.hostname.as_str(), host.port),
        handler,
    );

    let mut session = tokio::time::timeout(Duration::from_secs(12), connect_future)
        .await
        .map_err(|_| "Connection timed out after 12 seconds".to_string())?
        .map_err(|e| format!("SSH connection failed: {}", e))?;

    let username = host.username.unwrap_or_else(|| "root".into());
    authenticate_client(&mut session, &username, secret, passphrase).await?;

    // Request remote server to listen on the requested port
    let bind_addr = tunnel.remote_host.as_deref().unwrap_or("0.0.0.0");
    session
        .tcpip_forward(bind_addr, remote_port as u32)
        .await
        .map_err(|e| format!("Remote tcpip_forward failed: {}", e))?;

    {
        let mut st = status.lock().unwrap();
        st.status = "running".into();
    }

    let status_updater = status.clone();
    let bin_clone = bytes_in.clone();
    let bout_clone = bytes_out.clone();
    let act_clone = active_connections.clone();

    let sync_task = tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_millis(500));
        loop {
            interval.tick().await;
            let mut st = status_updater.lock().unwrap();
            if st.status != "running" {
                break;
            }
            st.bytes_in = bin_clone.load(Ordering::Relaxed);
            st.bytes_out = bout_clone.load(Ordering::Relaxed);
            st.active_connections = act_clone.load(Ordering::Relaxed);
        }
    });

    loop {
        tokio::select! {
            _ = stop_rx.changed() => {
                if *stop_rx.borrow() {
                    break;
                }
            }
            _ = tokio::time::sleep(Duration::from_secs(1)) => {
                if session.is_closed() {
                    break;
                }
            }
        }
    }

    sync_task.abort();
    let _ = session.cancel_tcpip_forward(bind_addr, remote_port as u32).await;
    Ok(())
}

/// SOCKS5 Dynamic Port Forwarding (-D local_port)
async fn run_dynamic_tunnel(
    tunnel: Tunnel,
    host: Host,
    secret: Option<String>,
    passphrase: Option<String>,
    status: Arc<Mutex<TunnelRuntimeStatus>>,
    mut stop_rx: watch::Receiver<bool>,
) -> Result<(), String> {
    let bind_addr = format!("{}:{}", tunnel.local_host, tunnel.local_port);
    let listener = TcpListener::bind(&bind_addr)
        .await
        .map_err(|e| format!("Failed to bind SOCKS5 listener on {}: {}", bind_addr, e))?;

    let mut config = client::Config::default();
    config.keepalive_interval = Some(Duration::from_secs(30));
    let config = Arc::new(config);

    let connect_future = client::connect(
        config,
        (host.hostname.as_str(), host.port),
        DirectClientHandler,
    );

    let mut session = tokio::time::timeout(Duration::from_secs(12), connect_future)
        .await
        .map_err(|_| "Connection timed out after 12 seconds".to_string())?
        .map_err(|e| format!("SSH connection failed: {}", e))?;

    let username = host.username.unwrap_or_else(|| "root".into());
    authenticate_client(&mut session, &username, secret, passphrase).await?;

    let session = Arc::new(tokio::sync::Mutex::new(session));
    let bytes_in = Arc::new(AtomicU64::new(0));
    let bytes_out = Arc::new(AtomicU64::new(0));
    let active_connections = Arc::new(AtomicU32::new(0));

    {
        let mut st = status.lock().unwrap();
        st.status = "running".into();
    }

    let status_updater = status.clone();
    let bin_clone = bytes_in.clone();
    let bout_clone = bytes_out.clone();
    let act_clone = active_connections.clone();

    let sync_task = tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_millis(500));
        loop {
            interval.tick().await;
            let mut st = status_updater.lock().unwrap();
            if st.status != "running" {
                break;
            }
            st.bytes_in = bin_clone.load(Ordering::Relaxed);
            st.bytes_out = bout_clone.load(Ordering::Relaxed);
            st.active_connections = act_clone.load(Ordering::Relaxed);
        }
    });

    let local_port = tunnel.local_port;

    loop {
        tokio::select! {
            _ = stop_rx.changed() => {
                if *stop_rx.borrow() {
                    break;
                }
            }
            accept_res = listener.accept() => {
                match accept_res {
                    Ok((mut stream, _client_addr)) => {
                        let session_ref = session.clone();
                        let b_in = bytes_in.clone();
                        let b_out = bytes_out.clone();
                        let act = active_connections.clone();

                        tokio::spawn(async move {
                            act.fetch_add(1, Ordering::Relaxed);

                            if let Err(e) = handle_socks5_client(&mut stream, session_ref, local_port, b_in, b_out).await {
                                eprintln!("SOCKS5 client error: {}", e);
                            }

                            act.fetch_sub(1, Ordering::Relaxed);
                        });
                    }
                    Err(e) => {
                        eprintln!("SOCKS5 accept error: {}", e);
                    }
                }
            }
        }
    }

    sync_task.abort();
    Ok(())
}

/// SOCKS5 protocol handshake and stream forwarding
async fn handle_socks5_client(
    stream: &mut TcpStream,
    session: Arc<tokio::sync::Mutex<client::Handle<DirectClientHandler>>>,
    local_port: u16,
    bytes_in: Arc<AtomicU64>,
    bytes_out: Arc<AtomicU64>,
) -> Result<(), String> {
    // 1. Negotiation handshake
    let mut header = [0u8; 2];
    stream
        .read_exact(&mut header)
        .await
        .map_err(|e| format!("Failed to read SOCKS5 greeting header: {}", e))?;

    if header[0] != 0x05 {
        return Err(format!("Unsupported SOCKS version: {}", header[0]));
    }

    let nmethods = header[1] as usize;
    let mut methods = vec![0u8; nmethods];
    stream
        .read_exact(&mut methods)
        .await
        .map_err(|e| format!("Failed to read SOCKS5 methods: {}", e))?;

    // Respond with NO AUTH (0x00)
    stream
        .write_all(&[0x05, 0x00])
        .await
        .map_err(|e| format!("Failed to write SOCKS5 greeting response: {}", e))?;

    // 2. Request details
    let mut req_header = [0u8; 4];
    stream
        .read_exact(&mut req_header)
        .await
        .map_err(|e| format!("Failed to read SOCKS5 request header: {}", e))?;

    if req_header[0] != 0x05 {
        return Err("Invalid SOCKS request version".into());
    }

    let cmd = req_header[1];
    let atyp = req_header[3];

    // Only CONNECT command (0x01) is supported
    if cmd != 0x01 {
        let _ = stream.write_all(&[0x05, 0x07, 0x00, 0x01, 0, 0, 0, 0, 0, 0]).await;
        return Err(format!("Unsupported SOCKS5 command: {}", cmd));
    }

    let target_host = match atyp {
        0x01 => {
            // IPv4 (4 bytes)
            let mut ipv4 = [0u8; 4];
            stream
                .read_exact(&mut ipv4)
                .await
                .map_err(|e| format!("Failed to read SOCKS5 IPv4: {}", e))?;
            format!("{}.{}.{}.{}", ipv4[0], ipv4[1], ipv4[2], ipv4[3])
        }
        0x03 => {
            // Domain Name (1 byte length + string)
            let len = stream
                .read_u8()
                .await
                .map_err(|e| format!("Failed to read domain length: {}", e))? as usize;
            let mut domain_buf = vec![0u8; len];
            stream
                .read_exact(&mut domain_buf)
                .await
                .map_err(|e| format!("Failed to read domain: {}", e))?;
            String::from_utf8_lossy(&domain_buf).to_string()
        }
        0x04 => {
            // IPv6 (16 bytes)
            let mut ipv6 = [0u8; 16];
            stream
                .read_exact(&mut ipv6)
                .await
                .map_err(|e| format!("Failed to read SOCKS5 IPv6: {}", e))?;
            use std::net::Ipv6Addr;
            Ipv6Addr::from(ipv6).to_string()
        }
        _ => {
            let _ = stream.write_all(&[0x05, 0x08, 0x00, 0x01, 0, 0, 0, 0, 0, 0]).await;
            return Err(format!("Unsupported SOCKS5 address type: {}", atyp));
        }
    };

    let target_port = stream
        .read_u16()
        .await
        .map_err(|e| format!("Failed to read target port: {}", e))?;

    // Open direct-tcpip channel on the SSH session
    let channel_res = {
        let session_guard = session.lock().await;
        session_guard
            .channel_open_direct_tcpip(
                &target_host,
                target_port as u32,
                "127.0.0.1",
                local_port as u32,
            )
            .await
    };

    match channel_res {
        Ok(channel) => {
            // Send success response: [VER=5, REP=0 (success), RSV=0, ATYP=1, BND.ADDR=0,0,0,0, BND.PORT=0,0]
            stream
                .write_all(&[0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0])
                .await
                .map_err(|e| format!("Failed to send SOCKS5 success reply: {}", e))?;

            let ssh_stream = channel.into_stream();
            // Bidirectional proxying
            let _ = proxy_bidirectional(stream, ssh_stream, bytes_in, bytes_out).await;
            Ok(())
        }
        Err(e) => {
            // Connection refused / general failure
            let _ = stream.write_all(&[0x05, 0x05, 0x00, 0x01, 0, 0, 0, 0, 0, 0]).await;
            Err(format!("Failed to open direct-tcpip to {}:{}: {}", target_host, target_port, e))
        }
    }
}
