# HazeSSH Privacy Policy

**Effective Date:** October 30, 2026  
**Project Repository:** [https://github.com/ahmetaltun/HazeSSH](https://github.com/ahmetaltun/HazeSSH)  
**Maintainer:** Ahmet Altun ([@ahmetaltun](https://github.com/ahmetaltun))

---

## 1. Overview & Core Philosophy

HazeSSH is designed as a **local-first, zero-cloud desktop application**. The core principle of HazeSSH is that your credentials, private keys, connection profiles, and session activity belong exclusively to you and must remain on your local device.

- **Zero Telemetry:** HazeSSH contains **no analytics packages, tracking scripts, crash-reporting daemons, or telemetry beacons**.
- **Zero Cloud Subscriptions:** HazeSSH has no centralized user accounts, cloud databases, or proprietary backend servers.
- **No Data Harvesting:** The maintainers of HazeSSH do not collect, monitor, store, or sell any personal data, device identifiers, or network traffic.

---

## 2. Network Activity & Connection Disclosures

To comply with the SignPath Foundation code signing policy and ensure full transparency, this section details all network connections made by HazeSSH, distinguishing between user-initiated actions and automatic background operations.

### A. User-Initiated Network Connections

The vast majority of network activity in HazeSSH occurs strictly in direct response to explicit user actions:

| Action / Feature | Destination | Protocol / Data Transmitted |
| :--- | :--- | :--- |
| **SSH & Bastion Sessions** | User-configured remote servers / jump hosts | SSH2 over TCP (port 22 or custom). Authenticates via user's private key, agent, or password. |
| **SFTP & In-Terminal Transfers** | User-configured remote servers | SFTP protocol / ZMODEM (`rz`/`sz`) / `trzsz` over active SSH connection. Transfers user-selected files. |
| **Hardware Serial UART** | Local serial devices (`/dev/tty.*`, `COM*`) | Direct local serial I/O (no internet connection). |
| **Telnet Sessions** | User-configured targets | Raw TCP (port 23 or custom) using RFC 854 IAC state machine. |
| **Port Forwarding & SOCKS5** | User-configured local/remote targets | Encrypted SSH direct-tcpip / socks5 tunnels. |
| **Agentless Systems Hub (Toolbox)** | User's active SSH server | Standard POSIX commands executed over SSH to read container states, systemd units, listening ports, and processes. No server agent installed. |
| **AI Shell Copilot (On-Demand)** | User-configured LLM endpoint | **Local LLMs (Ollama / LM Studio):** `http://localhost:11434` or `http://localhost:1234` — zero external network communication.<br/>**Hosted BYOK Providers:** Anthropic, OpenAI, OpenRouter, Nvidia NIM, DeepSeek, or custom API endpoints. Transmits only the user's prompt text and contextual terminal snippet directly to the chosen provider using the user's provided API key. Invoked exclusively on user keystroke (`Cmd/Ctrl + I`) or when requesting error diagnosis. |
| **Decentralized Sync (Manual)** | User-configured Git repository or WebDAV server | Transmits an end-to-end encrypted `.haze` package protected by Argon2id and ChaCha20-Poly1305. Secrets are never transmitted in plaintext. |
| **Software Update Check (Manual)** | `https://github.com/ahmetaltun/HazeSSH` | Triggered when the user clicks "Check for Updates" in Settings -> About & Updates. Fetches the release manifest (`latest.json`). |

### B. Automatic Network Connections

HazeSSH minimizes automatic network operations. The application's default out-of-the-box configuration performs **zero background network calls**.

Automatic network operations occur only under specific, user-configured conditions:

1. **Automated Background Sync (Opt-In Only):**
   - **Default:** Disabled (`autoSyncEnabled: false`).
   - **Behavior when enabled:** If explicitly turned on by the user in Settings, HazeSSH will periodically (at a user-defined interval, defaulting to 30 minutes) or on app startup poll the user's configured Git remote (GitHub, GitLab, Gitea) or WebDAV endpoint to check for updated vault packages.
   - **Data transmitted:** Only the client's ChaCha20-Poly1305 encrypted `.haze` vault package and standard authentication tokens (e.g. user-provided personal access token) directly to the user's chosen remote host.

2. **Automated Server Health Polling (Opt-In Only):**
   - **Default:** Disabled.
   - **Behavior when enabled:** If the user clicks the "Auto-Probe" toggle in the Hosts view, HazeSSH executes lightweight non-intrusive POSIX commands over SSH every 30 seconds against the user's visible configured hosts to refresh CPU, RAM, and disk utilization gauges.
   - **Data transmitted:** Standard SSH commands directly to the user's servers. No data is sent to external parties.

3. **Application Updates:**
   - HazeSSH does **not** silently download or apply updates in the background without user intervention.
   - Update checks query GitHub Releases (`https://github.com/ahmetaltun/HazeSSH/releases/latest/download/latest.json`) to verify version numbers and cryptographic signatures.

---

## 3. Telemetry, Analytics, and Crash Reporting

- **Telemetry:** There is **no telemetry** in HazeSSH. No tracking pixels, Google Analytics, PostHog, Mixpanel, or custom usage beacons are incorporated into the source code.
- **Crash Reporting:** HazeSSH does not integrate automatic third-party crash reporting services (such as Sentry, Crashlytics, or Bugsnag). Crash details or stack traces are not sent to any remote server.
- **Personal Data:** The application does not collect names, email addresses, phone numbers, IP addresses, or device identifiers.

---

## 4. Local Credential Storage and Encryption

All persistent configuration and secrets are stored in a local SQLite database residing in your operating system's standard application data directory:

- **macOS:** `~/Library/Application Support/com.hazessh.app/haze_ssh.db`
- **Linux:** `~/.local/share/com.hazessh.app/haze_ssh.db`
- **Windows:** `%APPDATA%\com.hazessh.app\haze_ssh.db`

### Cryptographic Protections:
- **Field-Level AEAD Encryption:** Sensitive fields (passwords, private keys, passphrases) are encrypted with authenticated **ChaCha20-Poly1305**.
- **Key Derivation:** Encryption keys are derived using **Argon2id** with memory-hard hashing parameters.
- **In-Memory Memory Zeroization:** Passphrase and secret memory buffers implement Rust's `zeroize` trait, securely scrubbing sensitive bytes from RAM upon deallocation or vault auto-lock.
- **Optional Master Passphrase:** Users can enforce a master password that locks the local database and requires manual unlocking to access credentials.

---

## 5. Third-Party Services and External APIs

When you use optional integration features in HazeSSH, connections are made directly from your computer to the specified service:

- **GitHub Releases:** Used solely for checking official updates and downloading release bundles.
- **External AI Providers (BYOK):** If you provide an API key for OpenAI, Anthropic, OpenRouter, Nvidia NIM, or DeepSeek, API requests originate directly from your machine to that provider's official API endpoint under that provider's terms of service and privacy policy. HazeSSH acts solely as a direct client.
- **Git / WebDAV Hosts:** If you use decentralized sync, connections are made directly to your configured host (e.g., GitHub, GitLab, Nextcloud) using your own credentials.

---

## 6. User Control and Data Erasure

You retain complete control over your data:

- **Data Export:** You can export your entire connection profile inventory into an encrypted `.haze` file at any time.
- **Data Deletion:** Deleting a host, identity, or snippet immediately purges it from the local SQLite database.
- **Complete Application Removal:** Uninstalling HazeSSH and deleting the local application data directory permanently erases all stored data, private keys, and preferences from your system.

---

## 7. Compliance with Code Signing Policies

This Privacy Policy is maintained in accordance with the [SignPath Foundation Code Signing Policy](https://github.com/ahmetaltun/HazeSSH#code-signing-policy). HazeSSH certifies that:
1. It does not covertly transmit personal data or credentials.
2. All network communication serves user-configured features (SSH, SFTP, Telnet, tunnels, sync, and update verification).
3. Any optional automatic network activities (such as background sync or periodic health probing) are strictly opt-in and disclosed in this policy.

---

## 8. Contact & Questions

If you have questions about this privacy policy, security practices, or the HazeSSH codebase:

- **Maintainer:** Ahmet Altun ([@ahmetaltun](https://github.com/ahmetaltun))
- **Email:** [github@ahmetaltun.dev](mailto:github@ahmetaltun.dev)
- **Security Policy:** [SECURITY.md](SECURITY.md)
- **Issue Tracker:** [https://github.com/ahmetaltun/HazeSSH/issues](https://github.com/ahmetaltun/HazeSSH/issues)
