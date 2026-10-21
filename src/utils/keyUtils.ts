/**
 * SSH Key format inspection and metadata extraction utilities.
 */

export interface KeyInspectionResult {
  readonly isValid: boolean;
  readonly isPublicKey: boolean;
  readonly isEncrypted: boolean;
  readonly format: "openssh" | "rsa" | "ec" | "pkcs8" | "putty" | "unknown";
  readonly formatLabel: string;
  readonly suggestedLabel: string;
  readonly error?: string;
  readonly warning?: string;
}

/**
 * Derives a human-friendly identity label from a filename by stripping common extensions.
 */
export function suggestLabelFromFilename(filename: string): string {
  if (!filename) return "";
  // Strip known extensions like .pem, .key, .priv, .private, .ppk, .txt, .pub
  const cleaned = filename.replace(/\.(pem|key|priv|private|ppk|txt|pub)$/i, "");
  return cleaned.trim();
}

/**
 * Inspects private/public key contents to determine validity, encryption status, and format.
 */
export function inspectKeyFormat(rawContent: string, filename?: string): KeyInspectionResult {
  const content = rawContent.trim();
  const suggestedLabel = filename ? suggestLabelFromFilename(filename) : "";

  if (!content) {
    return {
      isValid: false,
      isPublicKey: false,
      isEncrypted: false,
      format: "unknown",
      formatLabel: "Unknown",
      suggestedLabel,
      error: "The key content is empty. Please provide a valid private key.",
    };
  }

  // 1. Detect public key files accidentally provided
  const isPublicKey =
    /^(ssh-rsa|ssh-ed25519|ssh-dss|ecdsa-sha2-[a-z0-9-]+)\s+/i.test(content) ||
    content.includes("BEGIN SSH2 PUBLIC KEY") ||
    content.includes("BEGIN PUBLIC KEY");

  if (isPublicKey) {
    return {
      isValid: false,
      isPublicKey: true,
      isEncrypted: false,
      format: "unknown",
      formatLabel: "Public Key",
      suggestedLabel,
      error:
        "The selected file is an SSH Public Key. Haze SSH identities require the Private Key (usually without .pub extension).",
    };
  }

  // 2. Detect PuTTY PPK files (Option A: guide user to convert or use PuTTY importer)
  if (content.startsWith("PuTTY-User-Key-File-2:") || content.startsWith("PuTTY-User-Key-File-3:")) {
    return {
      isValid: false,
      isPublicKey: false,
      isEncrypted: !content.includes("Encryption: none"),
      format: "putty",
      formatLabel: "PuTTY PPK",
      suggestedLabel,
      error:
        "PuTTY .ppk files are not directly supported here. Please export it to OpenSSH format using PuTTYgen, or use the PuTTY Importer in Settings.",
    };
  }

  // 3. Inspect OpenSSH / PEM / PKCS#8 formats
  if (content.includes("-----BEGIN OPENSSH PRIVATE KEY-----")) {
    // OpenSSH keys with bcrypt or non-none cipher
    const isEncrypted = content.includes("bcrypt") || /Proc-Type:\s*4,ENCRYPTED/i.test(content);
    return {
      isValid: true,
      isPublicKey: false,
      isEncrypted,
      format: "openssh",
      formatLabel: "OpenSSH Private Key",
      suggestedLabel,
    };
  }

  if (content.includes("-----BEGIN RSA PRIVATE KEY-----")) {
    const isEncrypted =
      /Proc-Type:\s*4,ENCRYPTED/i.test(content) || /DEK-Info:/i.test(content);
    return {
      isValid: true,
      isPublicKey: false,
      isEncrypted,
      format: "rsa",
      formatLabel: "RSA Private Key (PEM)",
      suggestedLabel,
    };
  }

  if (content.includes("-----BEGIN EC PRIVATE KEY-----")) {
    const isEncrypted =
      /Proc-Type:\s*4,ENCRYPTED/i.test(content) || /DEK-Info:/i.test(content);
    return {
      isValid: true,
      isPublicKey: false,
      isEncrypted,
      format: "ec",
      formatLabel: "EC Private Key (PEM)",
      suggestedLabel,
    };
  }

  if (content.includes("-----BEGIN ENCRYPTED PRIVATE KEY-----")) {
    return {
      isValid: true,
      isPublicKey: false,
      isEncrypted: true,
      format: "pkcs8",
      formatLabel: "Encrypted PKCS#8 Private Key",
      suggestedLabel,
    };
  }

  if (content.includes("-----BEGIN PRIVATE KEY-----")) {
    return {
      isValid: true,
      isPublicKey: false,
      isEncrypted: false,
      format: "pkcs8",
      formatLabel: "PKCS#8 Private Key",
      suggestedLabel,
    };
  }

  // 4. Fallback if format is not recognized
  return {
    isValid: false,
    isPublicKey: false,
    isEncrypted: false,
    format: "unknown",
    formatLabel: "Unknown",
    suggestedLabel,
    error:
      "Unrecognized key format. Please provide a standard OpenSSH or PEM private key (beginning with '-----BEGIN ... PRIVATE KEY-----').",
  };
}
