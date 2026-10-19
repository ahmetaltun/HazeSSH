# Haze SSH

<p align="center">
  <strong>Modern, Privacy-First, Open-Source SSH Client & Terminal Multiplexer</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Tauri-v2-blue" alt="Tauri v2" />
  <img src="https://img.shields.io/badge/React-19-61dafb" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-Ready-3178c6" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-v4-38bdf8" alt="Tailwind CSS v4" />
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License: MIT" />
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs Welcome" />
</p>

---

## Overview

**Haze SSH** is a fast, lightweight, and extensible desktop SSH client and terminal workspace manager built with **Tauri v2**, **Rust**, and **React 19**.

Designed with a **privacy-first, local-first** architecture, Haze SSH keeps your credentials, host configurations, and private keys strictly on your local machine without telemetry or cloud lock-in.

---

## Features

- **Terminal Multiplexer**:
  - Recursive tree-based split panes (split horizontally or vertically with custom ratios).
  - Multi-tab workspaces with independent session states and tab switching.
- **Host Catalog & Tag Groups**:
  - Organize servers by environment, client, or cluster tags.
  - Supports SSH key pairs, passwords, custom ports, and bastion/jump host chains.
- **Integrated SFTP File Explorer**:
  - Browse remote file systems directly alongside active terminal panes.
  - Upload, download, and manage file permissions securely.
- **SSH Tunnels & Port Forwarding**:
  - Configure Local, Remote (Reverse), and Dynamic (SOCKS5) port forwarding with live status indicators.
- **Snippet Library**:
  - Save, organize, and execute reusable shell commands or deployment scripts across sessions.
- **Command Palette & Hotkeys**:
  - Quick action launcher (`Cmd+K` / `Ctrl+K`) for rapid navigation, host connection, and theme toggling.
- **Customizable Interface**:
  - Built with DaisyUI v5 and Tailwind CSS v4 featuring light, dark, and specialized theme presets.
- **Privacy-First & Secure**:
  - Zero cloud dependencies, zero analytics tracking, and encrypted local storage.

---

## Tech Stack

- **Desktop Framework**: [Tauri v2](https://v2.tauri.app/) (Rust)
- **Frontend Core**: [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Vite](https://vitejs.dev/)
- **UI & Styling**: [Tailwind CSS v4](https://tailwindcss.com/), [DaisyUI v5](https://daisyui.com/), [Lucide React](https://lucide.dev/)
- **State Management**: [Zustand](https://github.com/pmndrs/zustand)
- **Schema Validation**: [Zod](https://zod.dev/)

---

## Getting Started

### Prerequisites

Ensure you have the following installed on your machine:

1. **Node.js** (v18 or higher) and `npm` (or `pnpm` / `yarn`)
2. **Rust & Cargo** (latest stable release):
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```
3. **Platform-specific Tauri dependencies**:
   - Refer to the official [Tauri Prerequisites Guide](https://v2.tauri.app/start/prerequisites/) for your operating system (macOS, Linux, or Windows).

### Installation & Development

1. **Clone the repository**:
   ```bash
   git clone https://github.com/<your-username>/haze-ssh.git
   cd haze-ssh
   ```

2. **Install frontend dependencies**:
   ```bash
   npm install
   ```

3. **Run the development application**:
   ```bash
   npm run tauri dev
   ```
   *This starts Vite's local dev server and compiles the Tauri native desktop wrapper.*

### Production Build

To package Haze SSH for your current operating system:

```bash
npm run tauri build
```

Compiled bundles (DMG, App, DEB, MSI, or EXE) will be generated in `src-tauri/target/release/bundle/`.

---

## Default Shortcuts

| Shortcut | Action |
| --- | --- |
| <kbd>⌘ K</kbd> / <kbd>Ctrl + K</kbd> | Open Command Palette |
| <kbd>⌘ T</kbd> / <kbd>Ctrl + T</kbd> | Open New Terminal Tab |
| <kbd>⌘ W</kbd> / <kbd>Ctrl + W</kbd> | Close Current Pane / Tab |

---

## Project Structure

```
haze-ssh/
├── src/                      # Frontend Application (React + TypeScript)
│   ├── components/
│   │   ├── layout/           # AppShell, Topbar, Sidebar, StatusBar
│   │   ├── multiplexer/      # TabBar, SplitPaneView, PaneContainer
│   │   └── views/            # Hosts, SFTP, Tunnels, Snippets, History, Settings
│   ├── stores/               # Zustand state stores (multiplexer, layout, theme)
│   ├── types/                # TypeScript interface and type definitions
│   ├── App.tsx               # Root component
│   └── main.tsx              # DOM entry point
├── src-tauri/                 # Native Tauri & Rust Application
│   ├── capabilities/         # Tauri application permissions & security boundaries
│   ├── icons/                # Multi-platform application icons
│   ├── src/                  # Rust source code (main.rs, lib.rs)
│   ├── Cargo.toml            # Rust dependencies and release profiles
│   └── tauri.conf.json       # Tauri desktop configuration
├── public/                   # Static public assets
├── package.json              # NPM scripts and dependencies
├── vite.config.ts            # Vite bundler configuration
└── tsconfig.json             # TypeScript compiler settings
```

---

## Contributing

Contributions are welcome! Please follow these steps:

1. **Fork** the repository.
2. Create a feature branch:
   ```bash
   git checkout -b feature/my-new-feature
   ```
3. Commit your changes with clear messages:
   ```bash
   git commit -m "feat: add support for ed25519 key passphrases"
   ```
4. Push to your branch:
   ```bash
   git push origin feature/my-new-feature
   ```
5. Open a **Pull Request**.

---

## License

This project is open-source and available under the [MIT License](LICENSE).
