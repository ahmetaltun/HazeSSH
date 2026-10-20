use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;
use chrono::Utc;
use rusqlite::{params, Connection};
use thiserror::Error;
use uuid::Uuid;

use crate::crypto;
use crate::models::{
    BackupData, BackupIdentity, BackupSummary, CreateGroupInput, CreateHostInput,
    CreateIdentityInput, CreateSnippetInput, CreateTunnelInput, Host, HostGroup, Identity,
    ImportResultSummary, Snippet, SshConfigHostCandidate, Tunnel, UpdateHostInput,
    UpdateSnippetInput, VaultStatus,
};

#[derive(Error, Debug)]
pub enum DbError {
    #[error("Database error: {0}")]
    Sqlite(#[from] rusqlite::Error),

    #[error("Entity not found: {0}")]
    NotFound(String),

    #[error("Serialization error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Crypto error: {0}")]
    Crypto(String),
}

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn new<P: AsRef<Path>>(path: P) -> Result<Self, DbError> {
        let conn = Connection::open(path)?;
        conn.execute_batch("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;")?;

        let db = Database {
            conn: Mutex::new(conn),
        };
        db.init_schema()?;
        Ok(db)
    }

    fn init_schema(&self) -> Result<(), DbError> {
        let conn = self.conn.lock().unwrap();
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS vault_settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                is_password_enabled INTEGER NOT NULL DEFAULT 0,
                master_password_hash TEXT,
                salt TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS groups (
                id TEXT PRIMARY KEY,
                parent_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
                name TEXT NOT NULL,
                color TEXT,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS identities (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                identity_type TEXT NOT NULL,
                username TEXT,
                encrypted_secret TEXT NOT NULL,
                encrypted_passphrase TEXT,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS hosts (
                id TEXT PRIMARY KEY,
                group_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
                label TEXT NOT NULL,
                hostname TEXT NOT NULL,
                port INTEGER NOT NULL DEFAULT 22,
                username TEXT,
                auth_type TEXT NOT NULL DEFAULT 'identity',
                identity_id TEXT REFERENCES identities(id) ON DELETE SET NULL,
                jump_host_id TEXT REFERENCES hosts(id) ON DELETE SET NULL,
                tags_json TEXT NOT NULL DEFAULT '[]',
                color TEXT,
                terminal_theme TEXT,
                startup_snippet_id TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS snippets (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                script TEXT NOT NULL,
                description TEXT,
                tags_json TEXT NOT NULL DEFAULT '[]',
                run_on_connect INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS tunnels (
                id TEXT PRIMARY KEY,
                host_id TEXT NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                tunnel_type TEXT NOT NULL DEFAULT 'local',
                local_host TEXT NOT NULL DEFAULT '127.0.0.1',
                local_port INTEGER NOT NULL,
                remote_host TEXT,
                remote_port INTEGER,
                auto_start INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL
            );
            ",
        )?;

        // Ensure default vault_settings row exists with a unique random machine salt
        let count: i64 = conn.query_row(
            "SELECT count(*) FROM vault_settings WHERE id = 1",
            [],
            |row| row.get(0),
        )?;

        if count == 0 {
            let now = Utc::now().timestamp();
            let random_salt = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO vault_settings (id, is_password_enabled, master_password_hash, salt, created_at, updated_at)
                 VALUES (1, 0, NULL, ?1, ?2, ?3)",
                params![random_salt, now, now],
            )?;
        }

        Ok(())
    }

    // --- Vault Operations ---

    pub fn get_vault_status(&self, is_unlocked: bool) -> Result<VaultStatus, DbError> {
        let conn = self.conn.lock().unwrap();
        let (is_enabled, has_hash): (bool, bool) = conn.query_row(
            "SELECT is_password_enabled, master_password_hash IS NOT NULL FROM vault_settings WHERE id = 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;

        Ok(VaultStatus {
            is_locked: is_enabled && !is_unlocked,
            has_master_password: is_enabled && has_hash,
        })
    }

    pub fn get_vault_salt_and_hash(&self) -> Result<(String, Option<String>, bool), DbError> {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            "SELECT salt, master_password_hash, is_password_enabled FROM vault_settings WHERE id = 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(DbError::from)
    }

    pub fn set_master_password(
        &self,
        hash: Option<&str>,
        is_enabled: bool,
    ) -> Result<(), DbError> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().timestamp();
        conn.execute(
            "UPDATE vault_settings SET is_password_enabled = ?1, master_password_hash = ?2, updated_at = ?3 WHERE id = 1",
            params![is_enabled as i32, hash, now],
        )?;
        Ok(())
    }

    // --- Host Operations ---

    pub fn list_hosts(&self) -> Result<Vec<Host>, DbError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, group_id, label, hostname, port, username, auth_type, identity_id,
                    jump_host_id, tags_json, color, terminal_theme, startup_snippet_id,
                    created_at, updated_at
             FROM hosts ORDER BY label ASC",
        )?;

        let host_iter = stmt.query_map([], |row| {
            let tags_json: String = row.get(9)?;
            let tags: Vec<String> = serde_json::from_str(&tags_json).unwrap_or_default();

            Ok(Host {
                id: row.get(0)?,
                group_id: row.get(1)?,
                label: row.get(2)?,
                hostname: row.get(3)?,
                port: row.get::<_, u32>(4)? as u16,
                username: row.get(5)?,
                auth_type: row.get(6)?,
                identity_id: row.get(7)?,
                jump_host_id: row.get(8)?,
                tags,
                color: row.get(10)?,
                terminal_theme: row.get(11)?,
                startup_snippet_id: row.get(12)?,
                created_at: row.get(13)?,
                updated_at: row.get(14)?,
            })
        })?;

        let mut hosts = Vec::new();
        for h in host_iter {
            hosts.push(h?);
        }
        Ok(hosts)
    }

    pub fn create_host(&self, input: CreateHostInput) -> Result<Host, DbError> {
        let conn = self.conn.lock().unwrap();
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().timestamp();
        let port = input.port.unwrap_or(22);
        let auth_type = input.auth_type.unwrap_or_else(|| "identity".into());
        let tags = input.tags.unwrap_or_default();
        let tags_json = serde_json::to_string(&tags)?;

        conn.execute(
            "INSERT INTO hosts (
                id, group_id, label, hostname, port, username, auth_type, identity_id,
                jump_host_id, tags_json, color, terminal_theme, startup_snippet_id,
                created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            params![
                id,
                input.group_id,
                input.label,
                input.hostname,
                port as u32,
                input.username,
                auth_type,
                input.identity_id,
                input.jump_host_id,
                tags_json,
                input.color,
                input.terminal_theme,
                input.startup_snippet_id,
                now,
                now,
            ],
        )?;

        Ok(Host {
            id,
            group_id: input.group_id,
            label: input.label,
            hostname: input.hostname,
            port,
            username: input.username,
            auth_type,
            identity_id: input.identity_id,
            jump_host_id: input.jump_host_id,
            tags,
            color: input.color,
            terminal_theme: input.terminal_theme,
            startup_snippet_id: input.startup_snippet_id,
            created_at: now,
            updated_at: now,
        })
    }

    pub fn update_host(&self, input: UpdateHostInput) -> Result<Host, DbError> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().timestamp();
        let tags_json = serde_json::to_string(&input.tags)?;

        let rows_affected = conn.execute(
            "UPDATE hosts SET
                group_id = ?1, label = ?2, hostname = ?3, port = ?4, username = ?5,
                auth_type = ?6, identity_id = ?7, jump_host_id = ?8, tags_json = ?9,
                color = ?10, terminal_theme = ?11, startup_snippet_id = ?12, updated_at = ?13
             WHERE id = ?14",
            params![
                input.group_id,
                input.label,
                input.hostname,
                input.port as u32,
                input.username,
                input.auth_type,
                input.identity_id,
                input.jump_host_id,
                tags_json,
                input.color,
                input.terminal_theme,
                input.startup_snippet_id,
                now,
                input.id,
            ],
        )?;

        if rows_affected == 0 {
            return Err(DbError::NotFound(format!("Host '{}' not found", input.id)));
        }

        let created_at: i64 = conn.query_row(
            "SELECT created_at FROM hosts WHERE id = ?1",
            params![input.id],
            |row| row.get(0),
        )?;

        Ok(Host {
            id: input.id,
            group_id: input.group_id,
            label: input.label,
            hostname: input.hostname,
            port: input.port,
            username: input.username,
            auth_type: input.auth_type,
            identity_id: input.identity_id,
            jump_host_id: input.jump_host_id,
            tags: input.tags,
            color: input.color,
            terminal_theme: input.terminal_theme,
            startup_snippet_id: input.startup_snippet_id,
            created_at,
            updated_at: now,
        })
    }

    pub fn delete_host(&self, id: &str) -> Result<bool, DbError> {
        let conn = self.conn.lock().unwrap();
        let rows = conn.execute("DELETE FROM hosts WHERE id = ?1", params![id])?;
        Ok(rows > 0)
    }

    // --- Groups Operations ---

    pub fn list_groups(&self) -> Result<Vec<HostGroup>, DbError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, parent_id, name, color, created_at FROM groups ORDER BY name ASC",
        )?;

        let iter = stmt.query_map([], |row| {
            Ok(HostGroup {
                id: row.get(0)?,
                parent_id: row.get(1)?,
                name: row.get(2)?,
                color: row.get(3)?,
                created_at: row.get(4)?,
            })
        })?;

        let mut groups = Vec::new();
        for g in iter {
            groups.push(g?);
        }
        Ok(groups)
    }

    pub fn create_group(&self, input: CreateGroupInput) -> Result<HostGroup, DbError> {
        let conn = self.conn.lock().unwrap();
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().timestamp();

        conn.execute(
            "INSERT INTO groups (id, parent_id, name, color, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, input.parent_id, input.name, input.color, now],
        )?;

        Ok(HostGroup {
            id,
            parent_id: input.parent_id,
            name: input.name,
            color: input.color,
            created_at: now,
        })
    }

    pub fn delete_group(&self, id: &str) -> Result<bool, DbError> {
        let conn = self.conn.lock().unwrap();
        let rows = conn.execute("DELETE FROM groups WHERE id = ?1", params![id])?;
        Ok(rows > 0)
    }

    // --- Identities Operations ---

    pub fn list_identities(&self) -> Result<Vec<Identity>, DbError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, identity_type, username, created_at FROM identities ORDER BY name ASC",
        )?;

        let iter = stmt.query_map([], |row| {
            Ok(Identity {
                id: row.get(0)?,
                name: row.get(1)?,
                identity_type: row.get(2)?,
                username: row.get(3)?,
                has_secret: true,
                created_at: row.get(4)?,
            })
        })?;

        let mut identities = Vec::new();
        for i in iter {
            identities.push(i?);
        }
        Ok(identities)
    }

    pub fn create_identity(
        &self,
        input: CreateIdentityInput,
        encrypted_secret: String,
        encrypted_passphrase: Option<String>,
    ) -> Result<Identity, DbError> {
        let conn = self.conn.lock().unwrap();
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().timestamp();

        conn.execute(
            "INSERT INTO identities (
                id, name, identity_type, username, encrypted_secret, encrypted_passphrase, created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                id,
                input.name,
                input.identity_type,
                input.username,
                encrypted_secret,
                encrypted_passphrase,
                now,
            ],
        )?;

        Ok(Identity {
            id,
            name: input.name,
            identity_type: input.identity_type,
            username: input.username,
            has_secret: true,
            created_at: now,
        })
    }

    pub fn get_identity_secret(&self, id: &str) -> Result<(String, Option<String>), DbError> {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            "SELECT encrypted_secret, encrypted_passphrase FROM identities WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                DbError::NotFound(format!("Identity '{}' not found", id))
            }
            other => DbError::from(other),
        })
    }

    pub fn delete_identity(&self, id: &str) -> Result<bool, DbError> {
        let conn = self.conn.lock().unwrap();
        let rows = conn.execute("DELETE FROM identities WHERE id = ?1", params![id])?;
        Ok(rows > 0)
    }

    // --- Snippets Operations ---

    pub fn list_snippets(&self) -> Result<Vec<Snippet>, DbError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, title, script, description, tags_json, run_on_connect, created_at
             FROM snippets ORDER BY title ASC",
        )?;

        let iter = stmt.query_map([], |row| {
            let tags_json: String = row.get(4)?;
            let tags: Vec<String> = serde_json::from_str(&tags_json).unwrap_or_default();

            Ok(Snippet {
                id: row.get(0)?,
                title: row.get(1)?,
                script: row.get(2)?,
                description: row.get(3)?,
                tags,
                run_on_connect: row.get::<_, i32>(5)? == 1,
                created_at: row.get(6)?,
            })
        })?;

        let mut snippets = Vec::new();
        for s in iter {
            snippets.push(s?);
        }
        Ok(snippets)
    }

    pub fn create_snippet(&self, input: CreateSnippetInput) -> Result<Snippet, DbError> {
        let conn = self.conn.lock().unwrap();
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().timestamp();
        let tags = input.tags.unwrap_or_default();
        let tags_json = serde_json::to_string(&tags)?;
        let run_on_connect = input.run_on_connect.unwrap_or(false);

        conn.execute(
            "INSERT INTO snippets (id, title, script, description, tags_json, run_on_connect, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                id,
                input.title,
                input.script,
                input.description,
                tags_json,
                run_on_connect as i32,
                now,
            ],
        )?;

        Ok(Snippet {
            id,
            title: input.title,
            script: input.script,
            description: input.description,
            tags,
            run_on_connect,
            created_at: now,
        })
    }

    pub fn update_snippet(&self, input: UpdateSnippetInput) -> Result<Snippet, DbError> {
        let conn = self.conn.lock().unwrap();
        let tags = input.tags.unwrap_or_default();
        let tags_json = serde_json::to_string(&tags)?;
        let run_on_connect = input.run_on_connect.unwrap_or(false);

        let rows_affected = conn.execute(
            "UPDATE snippets SET
                title = ?1,
                script = ?2,
                description = ?3,
                tags_json = ?4,
                run_on_connect = ?5
             WHERE id = ?6",
            params![
                input.title,
                input.script,
                input.description,
                tags_json,
                run_on_connect as i32,
                input.id,
            ],
        )?;

        if rows_affected == 0 {
            return Err(DbError::NotFound(format!(
                "Snippet with ID '{}' was not found in database",
                input.id
            )));
        }

        let created_at: i64 = conn.query_row(
            "SELECT created_at FROM snippets WHERE id = ?1",
            params![input.id],
            |row| row.get(0),
        )?;

        Ok(Snippet {
            id: input.id,
            title: input.title,
            script: input.script,
            description: input.description,
            tags,
            run_on_connect,
            created_at,
        })
    }

    pub fn delete_snippet(&self, id: &str) -> Result<bool, DbError> {
        let conn = self.conn.lock().unwrap();
        // Nullify any dangling references in hosts
        let _ = conn.execute(
            "UPDATE hosts SET startup_snippet_id = NULL WHERE startup_snippet_id = ?1",
            params![id],
        );

        let rows = conn.execute("DELETE FROM snippets WHERE id = ?1", params![id])?;
        Ok(rows > 0)
    }

    // --- Tunnels Operations ---

    pub fn list_tunnels(&self) -> Result<Vec<Tunnel>, DbError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, host_id, name, tunnel_type, local_host, local_port, remote_host, remote_port, auto_start, created_at
             FROM tunnels ORDER BY name ASC",
        )?;

        let iter = stmt.query_map([], |row| {
            Ok(Tunnel {
                id: row.get(0)?,
                host_id: row.get(1)?,
                name: row.get(2)?,
                tunnel_type: row.get(3)?,
                local_host: row.get(4)?,
                local_port: row.get::<_, u32>(5)? as u16,
                remote_host: row.get(6)?,
                remote_port: row.get::<_, Option<u32>>(7)?.map(|p| p as u16),
                auto_start: row.get::<_, i32>(8)? == 1,
                created_at: row.get(9)?,
            })
        })?;

        let mut tunnels = Vec::new();
        for t in iter {
            tunnels.push(t?);
        }
        Ok(tunnels)
    }

    pub fn create_tunnel(&self, input: CreateTunnelInput) -> Result<Tunnel, DbError> {
        let conn = self.conn.lock().unwrap();
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().timestamp();
        let local_host = input.local_host.unwrap_or_else(|| "127.0.0.1".into());
        let auto_start = input.auto_start.unwrap_or(false);

        conn.execute(
            "INSERT INTO tunnels (
                id, host_id, name, tunnel_type, local_host, local_port, remote_host, remote_port, auto_start, created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                id,
                input.host_id,
                input.name,
                input.tunnel_type,
                local_host,
                input.local_port as u32,
                input.remote_host,
                input.remote_port.map(|p| p as u32),
                auto_start as i32,
                now,
            ],
        )?;

        Ok(Tunnel {
            id,
            host_id: input.host_id,
            name: input.name,
            tunnel_type: input.tunnel_type,
            local_host,
            local_port: input.local_port,
            remote_host: input.remote_host,
            remote_port: input.remote_port,
            auto_start,
            created_at: now,
        })
    }

    pub fn delete_tunnel(&self, id: &str) -> Result<bool, DbError> {
        let conn = self.conn.lock().unwrap();
        let rows = conn.execute("DELETE FROM tunnels WHERE id = ?1", params![id])?;
        Ok(rows > 0)
    }

    // --- Backup & Restore Operations ---

    pub fn export_backup_data(&self, active_key: &[u8; 32]) -> Result<BackupData, DbError> {
        let groups = self.list_groups()?;
        let hosts = self.list_hosts()?;
        let snippets = self.list_snippets()?;
        let tunnels = self.list_tunnels()?;

        // Retrieve identities and decrypt their secrets with active_key
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, identity_type, username, encrypted_secret, encrypted_passphrase, created_at FROM identities ORDER BY name ASC"
        )?;

        let id_iter = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, Option<String>>(5)?,
                row.get::<_, i64>(6)?,
            ))
        })?;

        let mut identities = Vec::new();
        for item in id_iter {
            let (id, name, identity_type, username, enc_secret, enc_pass, created_at) = item?;
            let decrypted_secret = crypto::decrypt_secret(&enc_secret, active_key).map_err(|e| {
                DbError::Crypto(format!("Failed to decrypt secret for identity '{}': {}", name, e))
            })?;
            let decrypted_passphrase = match enc_pass {
                Some(ref p) => Some(crypto::decrypt_secret(p, active_key).map_err(|e| {
                    DbError::Crypto(format!("Failed to decrypt passphrase for identity '{}': {}", name, e))
                })?),
                None => None,
            };

            identities.push(BackupIdentity {
                id,
                name,
                identity_type,
                username,
                secret: decrypted_secret,
                passphrase: decrypted_passphrase,
                created_at,
            });
        }

        Ok(BackupData {
            version: 1,
            exported_at: Utc::now().timestamp(),
            groups,
            identities,
            hosts,
            snippets,
            tunnels,
        })
    }

    pub fn restore_backup_data(
        &self,
        data: BackupData,
        active_key: &[u8; 32],
        overwrite: bool,
    ) -> Result<BackupSummary, DbError> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;

        let mut id_map: HashMap<String, String> = HashMap::new();

        if overwrite {
            tx.execute("DELETE FROM tunnels", [])?;
            tx.execute("DELETE FROM hosts", [])?;
            tx.execute("DELETE FROM snippets", [])?;
            tx.execute("DELETE FROM identities", [])?;
            tx.execute("DELETE FROM groups", [])?;
        }

        // 1. Restore Groups (Pass 1: Insert without parent_id to avoid ordering issues)
        for group in &data.groups {
            let mut final_id = group.id.clone();
            if !overwrite {
                let exists: bool = tx.query_row(
                    "SELECT EXISTS(SELECT 1 FROM groups WHERE id = ?1)",
                    params![group.id],
                    |row| row.get(0),
                )?;
                if exists {
                    final_id = Uuid::new_v4().to_string();
                    id_map.insert(group.id.clone(), final_id.clone());
                }
            }

            tx.execute(
                "INSERT INTO groups (id, parent_id, name, color, created_at)
                 VALUES (?1, NULL, ?2, ?3, ?4)",
                params![final_id, group.name, group.color, group.created_at],
            )?;
        }

        // Pass 2: Connect parent_ids for groups
        for group in &data.groups {
            if let Some(ref pid) = group.parent_id {
                let mapped_pid = id_map.get(pid).unwrap_or(pid);
                let final_id = id_map.get(&group.id).unwrap_or(&group.id);
                let parent_exists: bool = tx.query_row(
                    "SELECT EXISTS(SELECT 1 FROM groups WHERE id = ?1)",
                    params![mapped_pid],
                    |row| row.get(0),
                )?;
                if parent_exists {
                    tx.execute(
                        "UPDATE groups SET parent_id = ?1 WHERE id = ?2",
                        params![mapped_pid, final_id],
                    )?;
                }
            }
        }

        // 2. Restore Identities (encrypt secret with current active key)
        for ident in &data.identities {
            let mut final_id = ident.id.clone();
            if !overwrite {
                let exists: bool = tx.query_row(
                    "SELECT EXISTS(SELECT 1 FROM identities WHERE id = ?1)",
                    params![ident.id],
                    |row| row.get(0),
                )?;
                if exists {
                    final_id = Uuid::new_v4().to_string();
                    id_map.insert(ident.id.clone(), final_id.clone());
                }
            }

            let enc_secret = crypto::encrypt_secret(&ident.secret, active_key).map_err(|e| {
                DbError::Crypto(format!("Failed to encrypt secret for identity '{}': {}", ident.name, e))
            })?;
            let enc_pass = match ident.passphrase {
                Some(ref p) => Some(crypto::encrypt_secret(p, active_key).map_err(|e| {
                    DbError::Crypto(format!("Failed to encrypt passphrase for identity '{}': {}", ident.name, e))
                })?),
                None => None,
            };

            tx.execute(
                "INSERT INTO identities (
                    id, name, identity_type, username, encrypted_secret, encrypted_passphrase, created_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    final_id,
                    ident.name,
                    ident.identity_type,
                    ident.username,
                    enc_secret,
                    enc_pass,
                    ident.created_at,
                ],
            )?;
        }

        // 3. Restore Snippets
        for snippet in &data.snippets {
            let mut final_id = snippet.id.clone();
            if !overwrite {
                let exists: bool = tx.query_row(
                    "SELECT EXISTS(SELECT 1 FROM snippets WHERE id = ?1)",
                    params![snippet.id],
                    |row| row.get(0),
                )?;
                if exists {
                    final_id = Uuid::new_v4().to_string();
                    id_map.insert(snippet.id.clone(), final_id.clone());
                }
            }

            let tags_json = serde_json::to_string(&snippet.tags)?;
            tx.execute(
                "INSERT INTO snippets (
                    id, title, script, description, tags_json, run_on_connect, created_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    final_id,
                    snippet.title,
                    snippet.script,
                    snippet.description,
                    tags_json,
                    snippet.run_on_connect as i32,
                    snippet.created_at,
                ],
            )?;
        }

        // 4. Restore Hosts (Pass 1: Insert without jump_host_id to avoid ordering issues)
        for host in &data.hosts {
            let mut final_id = host.id.clone();
            if !overwrite {
                let exists: bool = tx.query_row(
                    "SELECT EXISTS(SELECT 1 FROM hosts WHERE id = ?1)",
                    params![host.id],
                    |row| row.get(0),
                )?;
                if exists {
                    final_id = Uuid::new_v4().to_string();
                    id_map.insert(host.id.clone(), final_id.clone());
                }
            }

            let mapped_group = host.group_id.as_ref().map(|gid| {
                id_map.get(gid).cloned().unwrap_or_else(|| gid.clone())
            });
            let mapped_identity = host.identity_id.as_ref().map(|iid| {
                id_map.get(iid).cloned().unwrap_or_else(|| iid.clone())
            });
            let mapped_startup_snippet = host.startup_snippet_id.as_ref().map(|sid| {
                id_map.get(sid).cloned().unwrap_or_else(|| sid.clone())
            });

            // Foreign key validity checks
            let valid_group = if let Some(ref gid) = mapped_group {
                let exists: bool = tx.query_row(
                    "SELECT EXISTS(SELECT 1 FROM groups WHERE id = ?1)",
                    params![gid],
                    |r| r.get(0),
                )?;
                if exists { Some(gid.clone()) } else { None }
            } else {
                None
            };

            let valid_identity = if let Some(ref iid) = mapped_identity {
                let exists: bool = tx.query_row(
                    "SELECT EXISTS(SELECT 1 FROM identities WHERE id = ?1)",
                    params![iid],
                    |r| r.get(0),
                )?;
                if exists { Some(iid.clone()) } else { None }
            } else {
                None
            };

            let tags_json = serde_json::to_string(&host.tags)?;
            tx.execute(
                "INSERT INTO hosts (
                    id, group_id, label, hostname, port, username, auth_type, identity_id,
                    jump_host_id, tags_json, color, terminal_theme, startup_snippet_id,
                    created_at, updated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, NULL, ?9, ?10, ?11, ?12, ?13, ?14)",
                params![
                    final_id,
                    valid_group,
                    host.label,
                    host.hostname,
                    host.port as u32,
                    host.username,
                    host.auth_type,
                    valid_identity,
                    tags_json,
                    host.color,
                    host.terminal_theme,
                    mapped_startup_snippet,
                    host.created_at,
                    host.updated_at,
                ],
            )?;
        }

        // Pass 2: Connect jump_host_id for hosts
        for host in &data.hosts {
            if let Some(ref jid) = host.jump_host_id {
                let mapped_jid = id_map.get(jid).unwrap_or(jid);
                let final_host_id = id_map.get(&host.id).unwrap_or(&host.id);
                let jump_exists: bool = tx.query_row(
                    "SELECT EXISTS(SELECT 1 FROM hosts WHERE id = ?1)",
                    params![mapped_jid],
                    |r| r.get(0),
                )?;
                if jump_exists {
                    tx.execute(
                        "UPDATE hosts SET jump_host_id = ?1 WHERE id = ?2",
                        params![mapped_jid, final_host_id],
                    )?;
                }
            }
        }

        // 5. Restore Tunnels
        for tunnel in &data.tunnels {
            let mapped_host_id = id_map
                .get(&tunnel.host_id)
                .cloned()
                .unwrap_or_else(|| tunnel.host_id.clone());

            let host_exists: bool = tx.query_row(
                "SELECT EXISTS(SELECT 1 FROM hosts WHERE id = ?1)",
                params![mapped_host_id],
                |r| r.get(0),
            )?;

            if host_exists {
                let mut final_tunnel_id = tunnel.id.clone();
                if !overwrite {
                    let exists: bool = tx.query_row(
                        "SELECT EXISTS(SELECT 1 FROM tunnels WHERE id = ?1)",
                        params![tunnel.id],
                        |r| r.get(0),
                    )?;
                    if exists {
                        final_tunnel_id = Uuid::new_v4().to_string();
                    }
                }

                tx.execute(
                    "INSERT INTO tunnels (
                        id, host_id, name, tunnel_type, local_host, local_port, remote_host, remote_port, auto_start, created_at
                    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                    params![
                        final_tunnel_id,
                        mapped_host_id,
                        tunnel.name,
                        tunnel.tunnel_type,
                        tunnel.local_host,
                        tunnel.local_port as u32,
                        tunnel.remote_host,
                        tunnel.remote_port.map(|p| p as u32),
                        tunnel.auto_start as i32,
                        tunnel.created_at,
                    ],
                )?;
            }
        }

        tx.commit()?;

        Ok(BackupSummary {
            version: data.version,
            exported_at: data.exported_at,
            groups_count: data.groups.len(),
            identities_count: data.identities.len(),
            hosts_count: data.hosts.len(),
            snippets_count: data.snippets.len(),
            tunnels_count: data.tunnels.len(),
        })
    }

    // --- OpenSSH Selective Importer ---

    pub fn import_ssh_config_hosts(
        &self,
        candidates: Vec<SshConfigHostCandidate>,
        import_keys_as_identities: bool,
        active_key: &[u8; 32],
    ) -> Result<ImportResultSummary, DbError> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;

        let now = Utc::now().timestamp();
        let mut imported_hosts_count = 0;
        let mut imported_groups_count = 0;
        let mut imported_identities_count = 0;

        // 1. Preload existing groups to avoid duplicates
        let mut group_map: HashMap<String, String> = HashMap::new();
        {
            let mut stmt = tx.prepare("SELECT id, name FROM groups")?;
            let mut rows = stmt.query([])?;
            while let Some(row) = rows.next()? {
                let id: String = row.get(0)?;
                let name: String = row.get(1)?;
                group_map.insert(name.to_lowercase(), id);
            }
        }

        // 2. Preload existing identities
        let mut key_file_to_identity: HashMap<String, String> = HashMap::new();
        let mut identity_name_map: HashMap<String, String> = HashMap::new();
        {
            let mut stmt = tx.prepare("SELECT id, name FROM identities")?;
            let mut rows = stmt.query([])?;
            while let Some(row) = rows.next()? {
                let id: String = row.get(0)?;
                let name: String = row.get(1)?;
                identity_name_map.insert(name.to_lowercase(), id);
            }
        }

        // 3. Create missing groups on demand
        for candidate in &candidates {
            if let Some(ref group_name) = candidate.group_name {
                let lower_name = group_name.to_lowercase();
                if !group_map.contains_key(&lower_name) {
                    let group_id = Uuid::new_v4().to_string();
                    tx.execute(
                        "INSERT INTO groups (id, parent_id, name, color, created_at)
                         VALUES (?1, NULL, ?2, NULL, ?3)",
                        params![group_id, group_name, now],
                    )?;
                    group_map.insert(lower_name, group_id);
                    imported_groups_count += 1;
                }
            }
        }

        // 4. Create missing identities for discovered key paths
        if import_keys_as_identities {
            for candidate in &candidates {
                if let Some(ref key_path) = candidate.identity_file {
                    if !key_file_to_identity.contains_key(key_path) {
                        let path_obj = Path::new(key_path);
                        if path_obj.exists() && path_obj.is_file() {
                            if let Ok(key_content) = std::fs::read_to_string(path_obj) {
                                let file_name = path_obj
                                    .file_name()
                                    .and_then(|n| n.to_str())
                                    .unwrap_or("ssh_key");
                                let id_label = format!("OpenSSH ({})", file_name);
                                let lower_label = id_label.to_lowercase();

                                let identity_id = if let Some(existing_id) = identity_name_map.get(&lower_label) {
                                    existing_id.clone()
                                } else {
                                    let new_id = Uuid::new_v4().to_string();
                                    let enc_secret = crypto::encrypt_secret(&key_content, active_key)
                                        .map_err(|e| DbError::Crypto(format!("Failed to encrypt imported key '{}': {}", file_name, e)))?;

                                    tx.execute(
                                        "INSERT INTO identities (
                                            id, name, identity_type, username, encrypted_secret, encrypted_passphrase, created_at
                                        ) VALUES (?1, ?2, 'key', ?3, ?4, NULL, ?5)",
                                        params![new_id, id_label, candidate.username, enc_secret, now],
                                    )?;
                                    identity_name_map.insert(lower_label, new_id.clone());
                                    imported_identities_count += 1;
                                    new_id
                                };

                                key_file_to_identity.insert(key_path.clone(), identity_id);
                            }
                        }
                    }
                }
            }
        }

        // 5. Insert hosts (Pass 1: Insert without jump_host_id)
        let mut host_alias_map: HashMap<String, String> = HashMap::new();
        {
            let mut stmt = tx.prepare("SELECT id, label FROM hosts")?;
            let mut rows = stmt.query([])?;
            while let Some(row) = rows.next()? {
                let id: String = row.get(0)?;
                let label: String = row.get(1)?;
                host_alias_map.insert(label.to_lowercase(), id);
            }
        }

        let mut inserted_candidates: Vec<(String, SshConfigHostCandidate)> = Vec::new();

        for candidate in candidates {
            let host_id = Uuid::new_v4().to_string();
            let group_id = candidate
                .group_name
                .as_ref()
                .and_then(|g| group_map.get(&g.to_lowercase()).cloned());

            let identity_id = candidate
                .identity_file
                .as_ref()
                .and_then(|f| key_file_to_identity.get(f).cloned());

            let auth_type = if identity_id.is_some() {
                "identity"
            } else {
                "interactive"
            };

            let tags = vec!["openssh-import".to_string()];
            let tags_json = serde_json::to_string(&tags)?;

            tx.execute(
                "INSERT INTO hosts (
                    id, group_id, label, hostname, port, username, auth_type, identity_id,
                    jump_host_id, tags_json, color, terminal_theme, startup_snippet_id,
                    created_at, updated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, NULL, ?9, NULL, NULL, NULL, ?10, ?11)",
                params![
                    host_id,
                    group_id,
                    candidate.label,
                    candidate.hostname,
                    candidate.port as u32,
                    candidate.username,
                    auth_type,
                    identity_id,
                    tags_json,
                    now,
                    now,
                ],
            )?;

            host_alias_map.insert(candidate.label.to_lowercase(), host_id.clone());
            inserted_candidates.push((host_id, candidate));
            imported_hosts_count += 1;
        }

        // Pass 2: Connect proxy_jump references to existing or imported jump hosts
        for (host_id, candidate) in inserted_candidates {
            if let Some(ref jump_alias) = candidate.proxy_jump {
                // If user specified ProxyJump bastion1 or ProxyJump user@bastion1:port
                let target_alias = if let Some((_, rest)) = jump_alias.split_once('@') {
                    rest
                } else {
                    jump_alias.as_str()
                };
                let target_clean = if let Some((h, _)) = target_alias.split_once(':') {
                    h
                } else {
                    target_alias
                };

                if let Some(target_host_id) = host_alias_map.get(&target_clean.to_lowercase()) {
                    tx.execute(
                        "UPDATE hosts SET jump_host_id = ?1 WHERE id = ?2",
                        params![target_host_id, host_id],
                    )?;
                }
            }
        }

        tx.commit()?;

        Ok(ImportResultSummary {
            imported_hosts_count,
            imported_groups_count,
            imported_identities_count,
        })
    }

    pub fn import_termius_data(
        &self,
        candidates: Vec<SshConfigHostCandidate>,
        snippets: Vec<CreateSnippetInput>,
        import_keys_as_identities: bool,
        active_key: &[u8; 32],
    ) -> Result<ImportResultSummary, DbError> {
        let summary = self.import_ssh_config_hosts(candidates, import_keys_as_identities, active_key)?;

        for snippet in snippets {
            let _ = self.create_snippet(snippet);
        }

        Ok(summary)
    }
}
