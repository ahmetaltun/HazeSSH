# Security Policy

The Haze SSH team takes security and privacy very seriously. We recognize that SSH clients and credential managers handle critical infrastructure keys and secrets.

---

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

---

## Security Model & Cryptographic Guarantees

Haze SSH is built with a **Zero-Cloud, Defense-in-Depth** architecture:

1. **Local-First & Offline Storage**:
   - Zero telemetry, zero analytics, zero external network queries on boot.
   - All server profiles, identities, and settings are stored locally in an embedded SQLite database (`haze_ssh.db`).

2. **Authenticated Field-Level Cryptography**:
   - Sensitive credentials (private keys, passwords, passphrases) are encrypted at rest using **ChaCha20-Poly1305** authenticated AEAD encryption.
   - Vault and backup keys are derived using **Argon2id** with high-iteration parameters and unique cryptographic salts (`OsRng`).

3. **Memory Hygiene & Zeroize**:
   - Decrypted credentials, master keys, and backup payloads implement `zeroize::Zeroize` to overwrite memory buffers with zeroes immediately upon disposal, mitigating memory dumps and cold-boot vulnerabilities.

4. **Tauri v2 Capabilities & Isolation**:
   - The frontend JavaScript context is sandboxed via Tauri v2's strict capability isolation (`src-tauri/capabilities/default.json`), restricting access exclusively to safe internal IPC commands.

---

## Reporting a Vulnerability

If you discover a potential security vulnerability in Haze SSH, please **do not** disclose it via public GitHub issues.

Instead, please send a detailed vulnerability report via email to:
- **Email**: `security@hazessh.dev` (or open a confidential GitHub Security Advisory).

### What to Include
- A detailed description of the vulnerability.
- Proof of Concept (PoC) code or step-by-step reproduction instructions.
- Potential impact and affected platforms (macOS, Windows, Linux).

We will acknowledge receipt within 48 hours and coordinate a coordinated disclosure timeline.
