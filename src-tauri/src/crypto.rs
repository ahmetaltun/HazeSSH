use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2, Params,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use chacha20poly1305::{
    aead::{Aead, KeyInit},
    ChaCha20Poly1305, Nonce,
};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use ssh_key::{Algorithm, LineEnding, PrivateKey};
use thiserror::Error;
use zeroize::Zeroize;

use crate::models::BackupEnvelope;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeneratedKeyPair {
    pub algorithm: String,
    pub public_key: String,
    pub private_key: String,
    pub fingerprint: String,
}

#[derive(Error, Debug)]
pub enum CryptoError {
    #[error("Failed to hash password: {0}")]
    HashingFailed(String),

    #[error("Invalid master password or password verification failed")]
    InvalidPassword,

    #[error("Failed to derive encryption key: {0}")]
    KeyDerivationFailed(String),

    #[error("Encryption failed: {0}")]
    EncryptionFailed(String),

    #[error("Decryption failed (corrupted data or wrong key): {0}")]
    DecryptionFailed(String),

    #[error("Invalid base64 payload: {0}")]
    Base64Error(#[from] base64::DecodeError),
}

/// Hashes a master password using Argon2id with a secure random salt.
pub fn hash_password(password: &str) -> Result<String, CryptoError> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();

    argon2
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| CryptoError::HashingFailed(e.to_string()))
}

/// Verifies whether the provided candidate password matches the stored Argon2 hash.
pub fn verify_password(password: &str, hash_str: &str) -> Result<bool, CryptoError> {
    let parsed_hash = PasswordHash::new(hash_str)
        .map_err(|_e| CryptoError::InvalidPassword)?;

    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok())
}

/// Derives a 32-byte (256-bit) encryption key from a passphrase and a salt using Argon2id.
pub fn derive_key(passphrase: &str, salt: &[u8]) -> Result<[u8; 32], CryptoError> {
    let mut key = [0u8; 32];
    let params = Params::new(65536, 3, 4, Some(32))
        .map_err(|e| CryptoError::KeyDerivationFailed(e.to_string()))?;

    let argon2 = Argon2::new(argon2::Algorithm::Argon2id, argon2::Version::V0x13, params);

    argon2
        .hash_password_into(passphrase.as_bytes(), salt, &mut key)
        .map_err(|e| CryptoError::KeyDerivationFailed(e.to_string()))?;

    Ok(key)
}

/// Encrypts plaintext using ChaCha20-Poly1305 with a 96-bit random nonce.
/// Output format: base64(nonce [12 bytes] + ciphertext + poly1305 tag [16 bytes]).
pub fn encrypt_secret(plaintext: &str, key: &[u8; 32]) -> Result<String, CryptoError> {
    let cipher = ChaCha20Poly1305::new_from_slice(key)
        .map_err(|e| CryptoError::EncryptionFailed(e.to_string()))?;

    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| CryptoError::EncryptionFailed(e.to_string()))?;

    let mut combined = Vec::with_capacity(nonce_bytes.len() + ciphertext.len());
    combined.extend_from_slice(&nonce_bytes);
    combined.extend_from_slice(&ciphertext);

    Ok(BASE64.encode(combined))
}

/// Decrypts a base64-encoded payload produced by `encrypt_secret`.
pub fn decrypt_secret(encoded: &str, key: &[u8; 32]) -> Result<String, CryptoError> {
    let combined = BASE64.decode(encoded)?;
    if combined.len() < 12 {
        return Err(CryptoError::DecryptionFailed(
            "Payload too short for nonce".into(),
        ));
    }

    let (nonce_bytes, ciphertext) = combined.split_at(12);
    let cipher = ChaCha20Poly1305::new_from_slice(key)
        .map_err(|e| CryptoError::DecryptionFailed(e.to_string()))?;

    let nonce = Nonce::from_slice(nonce_bytes);
    let mut decrypted_bytes = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| CryptoError::DecryptionFailed(e.to_string()))?;

    let result = String::from_utf8(decrypted_bytes.clone())
        .map_err(|e| CryptoError::DecryptionFailed(e.to_string()));

    decrypted_bytes.zeroize();
    result
}

/// Generates an OpenSSH formatted keypair (Ed25519 or RSA).
pub fn generate_ssh_key(
    algorithm: &str,
    comment: Option<&str>,
) -> Result<GeneratedKeyPair, CryptoError> {
    let mut rng = rand::rngs::OsRng;
    let priv_key = match algorithm.to_lowercase().as_str() {
        "ed25519" => PrivateKey::random(&mut rng, Algorithm::Ed25519)
            .map_err(|e| CryptoError::KeyDerivationFailed(e.to_string()))?,
        "rsa" => PrivateKey::random(&mut rng, Algorithm::Rsa { hash: None })
            .map_err(|e| CryptoError::KeyDerivationFailed(e.to_string()))?,
        other => {
            return Err(CryptoError::KeyDerivationFailed(format!(
                "Unsupported key algorithm: {}. Supported algorithms are 'ed25519' and 'rsa'",
                other
            )))
        }
    };

    let comment_str = comment.unwrap_or("haze-ssh");
    let pub_key = priv_key.public_key();
    let pub_str = pub_key
        .to_openssh()
        .map_err(|e| CryptoError::KeyDerivationFailed(e.to_string()))?;
    let pub_with_comment = format!("{} {}", pub_str, comment_str);
    let fingerprint = pub_key.fingerprint(Default::default()).to_string();
    let priv_openssh = priv_key
        .to_openssh(LineEnding::LF)
        .map_err(|e| CryptoError::KeyDerivationFailed(e.to_string()))?;

    Ok(GeneratedKeyPair {
        algorithm: algorithm.to_string(),
        public_key: pub_with_comment,
        private_key: (*priv_openssh).to_string(),
        fingerprint,
    })
}

/// Encrypts a full backup payload using ChaCha20-Poly1305 with a key derived from an export passphrase.
pub fn export_backup_envelope(payload: &str, passphrase: &str) -> Result<BackupEnvelope, CryptoError> {
    let mut salt = [0u8; 16];
    OsRng.fill_bytes(&mut salt);

    let key = derive_key(passphrase, &salt)?;

    let cipher = ChaCha20Poly1305::new_from_slice(&key)
        .map_err(|e| CryptoError::EncryptionFailed(e.to_string()))?;

    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, payload.as_bytes())
        .map_err(|e| CryptoError::EncryptionFailed(e.to_string()))?;

    Ok(BackupEnvelope {
        format: "HAZE_BACKUP".to_string(),
        version: 1,
        salt: BASE64.encode(salt),
        nonce: BASE64.encode(nonce_bytes),
        ciphertext: BASE64.encode(ciphertext),
    })
}

/// Decrypts a BackupEnvelope with the user-provided passphrase.
pub fn decrypt_backup_envelope(
    envelope: &BackupEnvelope,
    passphrase: &str,
) -> Result<String, CryptoError> {
    if envelope.format != "HAZE_BACKUP" {
        return Err(CryptoError::DecryptionFailed(
            "Invalid backup format: expected HAZE_BACKUP header".to_string(),
        ));
    }

    let salt = BASE64.decode(&envelope.salt)?;
    let nonce_bytes = BASE64.decode(&envelope.nonce)?;
    let ciphertext = BASE64.decode(&envelope.ciphertext)?;

    if nonce_bytes.len() != 12 {
        return Err(CryptoError::DecryptionFailed(
            "Invalid nonce length in backup archive".to_string(),
        ));
    }

    let key = derive_key(passphrase, &salt)?;
    let cipher = ChaCha20Poly1305::new_from_slice(&key)
        .map_err(|e| CryptoError::DecryptionFailed(e.to_string()))?;

    let nonce = Nonce::from_slice(&nonce_bytes);
    let mut decrypted_bytes = cipher
        .decrypt(nonce, ciphertext.as_ref())
        .map_err(|_| {
            CryptoError::DecryptionFailed(
                "Incorrect passphrase or corrupted backup file (authentication tag mismatch)"
                    .to_string(),
            )
        })?;

    let result = String::from_utf8(decrypted_bytes.clone())
        .map_err(|e| CryptoError::DecryptionFailed(format!("Invalid UTF-8 payload: {}", e)));

    decrypted_bytes.zeroize();
    result
}
