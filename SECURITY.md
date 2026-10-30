# Security Policy

The Haze SSH project takes security, confidentiality, and data privacy seriously. Haze SSH handles critical infrastructure credentials, private keys, and terminal sessions, and our architecture is designed to enforce strict local-first security and defense-in-depth guarantees.

---

## Supported Versions

Security patches and vulnerability updates are actively released for the following versions:

| Version | Supported |
| :--- | :--- |
| 0.4.x | Yes |
| 0.3.x | Yes |
| < 0.3.0 | No (End of Life) |

Users are strongly encouraged to upgrade to the latest official release to receive security enhancements and dependency fixes.

---

## Security Model & Cryptographic Guarantees

Haze SSH is built around a zero-cloud, client-side cryptographic security model:

### 1. Local-First Credential Vault & Cryptography
- **Zero Cloud Storage**: Connection profiles, identities, passwords, and private keys reside exclusively in a local SQLite database (`haze_ssh.db`) within the user's OS application data directory.
- **Authenticated Field-Level AEAD**: Sensitive credentials (passwords, private key passphrases, tokens) are encrypted at rest with **ChaCha20-Poly1305** authenticated encryption.
- **Key Derivation via Argon2id**: Cryptographic vault keys are derived using **Argon2id** with memory-hard hashing parameters and distinct random salts (`OsRng`).
- **Memory Hygiene & Zeroize**: Decrypted secrets, master passphrases, and raw key buffers implement Rust's `zeroize::Zeroize` trait, securely scrubbing sensitive bytes from RAM immediately upon deallocation or vault lock.
- **Master Passphrase & Auto-Lock**: Users can configure a master passphrase with automated idle timeout lock controls and on-demand authentication prompts before exposing credentials.

### 2. Decentralized End-to-End Encrypted (E2EE) Sync
- **Zero-Knowledge Remote Storage**: When using decentralized synchronization via Git (GitHub, GitLab, Gitea) or WebDAV, vault packages are exported as encrypted `.haze` payloads using Argon2id and ChaCha20-Poly1305 before transmission.
- **No Plaintext Leaks**: Third-party storage servers and intermediate networks only process ciphertext. Sync passphrases never leave the local device.

### 3. AI Copilot Safety & Destructive Command Interception
- **Privacy-First Inference**: AI shell prompts are strictly user-initiated. Local LLM engines (Ollama, LM Studio) execute entirely on `localhost` with zero external network egress. Hosted BYOK providers (OpenAI, Anthropic, OpenRouter, Nvidia NIM, DeepSeek) communicate directly with the chosen API endpoint without intermediate proxies.
- **Destructive Command Guard**: AI-suggested commands are parsed and inspected against dangerous shell patterns (such as recursive root deletions `rm -rf /`, raw disk formatting `mkfs`, block device overwrites `dd of=/dev/sd*`, fork bombs, and device wipes) before execution, presenting high-visibility safety warnings.

### 4. Terminal Stream Isolation & Transfer Integrity
- **In-Stream Protocol Isolation (ZMODEM & trzsz)**: Stream transfers intercept `rz`/`sz`/`trz`/`tsz` headers before reaching the terminal canvas, validating CCITT CRC-16/CRC-32 checksums and preventing terminal escape sequence injection or scrollback corruption.
- **Audit Logging**: Continuous session audit logs written to `~/.haze/logs` feature microsecond timestamp prefixes and optional ANSI escape sequence stripping to ensure tamper-evident logs for security auditing.

### 5. Application Sandboxing & IPC Capabilities
- **Tauri v2 Capability Isolation**: Frontend JavaScript contexts operate under Tauri v2's permission isolation (`src-tauri/capabilities/default.json`), with restricted access exclusively to vetted Rust backend commands.
- **No Remote Code Execution**: Dynamic code evaluation (`eval`, unsafe innerHTML) is prohibited, and external links are routed through verified system openers.

### 6. Build Security & Release Integrity
- **Source-Controlled CI/CD**: Official releases are built from verified source code in public GitHub Actions workflows with strict supply-chain provenance.
- **Release Verification**: Releases publish cryptographic checksums (`SHA256SUMS.txt`), GPG signatures for Linux packages, and authenticated digital signatures.
- **Windows Code Signing**: Official Windows binaries are intended to be digitally signed through SignPath Foundation using certificates issued by SignPath.io.
- **Cryptographic Auto-Updater**: Native application updates verify release payloads against pinned minisign public keys prior to extraction and execution.

---

## Reporting a Vulnerability

If you discover a security vulnerability in Haze SSH, please do not open a public GitHub issue.

Please report vulnerabilities through one of the following private channels:

1. **GitHub Security Advisory (Preferred)**:
   Submit a confidential advisory directly at [https://github.com/ahmetaltun/HazeSSH/security/advisories/new](https://github.com/ahmetaltun/HazeSSH/security/advisories/new).

2. **Direct Email**:
   Send details to [github@ahmetaltun.dev](mailto:github@ahmetaltun.dev).

### What to Include in Your Report
To help us triage and resolve the issue efficiently, please provide:
- A description of the vulnerability and its potential impact.
- Affected operating system(s) and Haze SSH version(s).
- Detailed, step-by-step reproduction instructions or a minimal Proof of Concept (PoC).
- Any proposed remediation or patches, if available.

### Vulnerability Response Process
- **Initial Response**: We will acknowledge receipt of your report within 48 hours.
- **Assessment**: We will verify the vulnerability, evaluate its severity, and determine affected components.
- **Resolution & Patching**: A fix will be developed, tested, and included in a subsequent release.
- **Coordinated Disclosure**: We adhere to coordinated disclosure principles and will coordinate publication timing with the reporter.
