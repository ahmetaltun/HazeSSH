use std::path::Path;
use std::sync::Mutex;
use chrono::Utc;
use rusqlite::{params, Connection};
use thiserror::Error;
use uuid::Uuid;

use crate::models::{
    CreateGroupInput, CreateHostInput, CreateIdentityInput, CreateSnippetInput, CreateTunnelInput,
    Host, HostGroup, Identity, Snippet, Tunnel, UpdateHostInput, UpdateSnippetInput, VaultStatus,
};

#[derive(Error, Debug)]
pub enum DbError {
    #[error("Database error: {0}")]
    Sqlite(#[from] rusqlite::Error),

    #[error("Entity not found: {0}")]
    NotFound(String),

    #[error("Serialization error: {0}")]
    Json(#[from] serde_json::Error),
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
}
