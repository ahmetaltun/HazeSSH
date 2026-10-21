# Contributing to Haze SSH

Thank you for your interest in contributing to **Haze SSH**! We welcome community contributions, bug reports, feature requests, and security improvements.

---

## 1. Code of Conduct & Core Philosophy

Haze SSH is built on three core pillars:
1. **Privacy-First & Zero-Cloud**: No analytics, no telemetry, no mandatory cloud sync. All credentials stay strictly encrypted on the user's local machine.
2. **High Performance**: Native Rust core (Tokio + `russh`), lightweight footprint (40–70MB RAM), and instant cold starts.
3. **Open Ecosystem**: Reusable modules, standard protocols (SSH, SFTP, Serial UART, Telnet), and zero paywalls.

All contributors and discussions must remain respectful, constructive, and welcoming.

---

## 2. Development Setup

### Prerequisites

1. **Rust**: Latest stable release (v1.80+)
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```
2. **Node.js**: v20 or higher & `npm`
3. **Platform Dependencies**:
   - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
   - **Linux (Ubuntu/Debian)**:
     ```bash
     sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev libudev-dev
     ```
   - **Windows**: Microsoft Visual Studio C++ Build Tools & WebView2.

### Getting the Code & Running Locally

1. Fork and clone the repository:
   ```bash
   git clone https://github.com/<your-username>/haze-ssh.git
   cd haze-ssh
   ```

2. Install frontend dependencies:
   ```bash
   npm install
   ```

3. Launch Haze SSH in development mode:
   ```bash
   npm run tauri dev
   ```

---

## 3. Code Quality & Testing

Before submitting a Pull Request, please ensure all automated checks pass locally:

### 1. Frontend Checks (TypeScript & Vite)
```bash
npm run build
```

### 2. Rust Unit Tests
```bash
cd src-tauri
cargo test
```

### 3. Rust Linting & Clippy
```bash
cd src-tauri
cargo clippy -- -D warnings
```

---

## 4. Architecture Overview

```
haze-ssh/
├── src/                          # React 19 + TypeScript Frontend
│   ├── components/
│   │   ├── hosts/                # Host cards, server health gauges, host editor modal
│   │   ├── layout/               # Topbar, sidebar, status bar, app shell
│   │   ├── multiplexer/          # Split pane tree and tab multiplexing
│   │   ├── terminal/             # xterm.js terminal, serial & telnet modals
│   │   ├── tunnels/              # Visual port forwarding manager & topology modal
│   │   └── views/                # Lazy-loaded views (Hosts, SFTP, Tunnels, Snippets, Settings)
│   ├── stores/                   # Modular Zustand state stores
│   ├── types/                    # TypeScript interfaces & Zod validation schemas
│   └── services/                 # Tauri IPC invocations
├── src-tauri/                    # Native Rust Engine (Tauri v2)
│   ├── src/
│   │   ├── commands.rs           # Tauri IPC command bridge handlers
│   │   ├── crypto.rs             # Argon2id derivation & ChaCha20-Poly1305 encryption
│   │   ├── db.rs                 # SQLite schema migrations & storage operations
│   │   ├── monitor.rs            # Non-intrusive agentless server health probes
│   │   ├── serial.rs             # Hardware serial port (UART) async driver
│   │   ├── sftp.rs               # SFTP client engine & file transfer channels
│   │   ├── ssh.rs                # Core russh Tokio client session manager
│   │   ├── ssh_config_parser.rs  # OpenSSH config & known_hosts selective parser
│   │   ├── telnet.rs             # RFC 854 Telnet option negotiation client
│   │   ├── third_party_importer.rs# Termius JSON and PuTTY .reg session importers
│   │   └── tunnels.rs            # Port forwarding engine (-L, -R, -D SOCKS5)
│   ├── Cargo.toml                # Rust dependencies & optimized release profiles
│   └── tauri.conf.json           # Tauri desktop security capabilities & window configuration
└── .github/workflows/            # GitHub Actions CI & Multi-platform release matrix
```

---

## 5. Submitting Pull Requests

1. Create a descriptive feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. Commit your changes with clear, explanatory messages.
3. Open a Pull Request pointing to `master` with a concise summary of the problem solved, design choices, and verification steps.
