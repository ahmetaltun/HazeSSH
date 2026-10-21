#![allow(clippy::too_many_arguments)]
#![allow(clippy::field_reassign_with_default)]

use std::sync::{Arc, Mutex};
use tauri::Manager;

pub mod commands;
pub mod crypto;
pub mod db;
pub mod models;
pub mod monitor;
pub mod serial;
pub mod sftp;
pub mod ssh;
pub mod ssh_config_parser;
pub mod telnet;
pub mod third_party_importer;
pub mod tunnels;

use commands::AppState;
use db::Database;
use ssh::SshManager;
use tunnels::TunnelManager;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to locate local application data directory");

            if !app_data_dir.exists() {
                std::fs::create_dir_all(&app_data_dir)
                    .expect("Failed to create application data directory");
            }

            let db_path = app_data_dir.join("haze_ssh.db");
            let database = Database::new(&db_path)
                .expect("Failed to initialize local SQLite database");

            app.manage(AppState {
                db: Arc::new(database),
                active_key: Mutex::new(None),
                ssh_manager: Arc::new(SshManager::new()),
                tunnel_manager: Arc::new(TunnelManager::new()),
                serial_manager: Arc::new(serial::SerialSessionManager::new()),
                telnet_manager: Arc::new(telnet::TelnetSessionManager::new()),
                sftp_manager: Arc::new(sftp::SftpManager::new()),
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::vault_get_status,
            commands::vault_set_master_password,
            commands::vault_unlock,
            commands::vault_lock,
            commands::host_list,
            commands::host_create,
            commands::host_update,
            commands::host_delete,
            commands::group_list,
            commands::group_create,
            commands::group_delete,
            commands::identity_list,
            commands::identity_create,
            commands::identity_delete,
            commands::snippet_list,
            commands::snippet_create,
            commands::snippet_update,
            commands::snippet_delete,
            commands::tunnel_list,
            commands::tunnel_create,
            commands::tunnel_delete,
            commands::tunnel_start,
            commands::tunnel_stop,
            commands::tunnel_get_statuses,
            commands::key_generate,
            commands::ssh_connect,
            commands::ssh_write,
            commands::ssh_resize,
            commands::ssh_disconnect,
            commands::sftp_list_remote,
            commands::sftp_read_file,
            commands::sftp_read_binary,
            commands::sftp_write_file,
            commands::sftp_delete_file,
            commands::sftp_mkdir,
            commands::sftp_rename_file,
            commands::sftp_upload_file,
            commands::sftp_download_file,
            commands::sftp_canonicalize,
            commands::sftp_disconnect,
            commands::sftp_list_local,
            commands::sftp_get_local_home,
            commands::sftp_local_read_binary,
            commands::sftp_local_mkdir,
            commands::sftp_local_delete,
            commands::sftp_local_rename,
            commands::backup_export,
            commands::backup_inspect,
            commands::backup_restore,
            commands::ssh_config_parse,
            commands::ssh_config_import,
            commands::termius_parse,
            commands::termius_import,
            commands::putty_parse,
            commands::putty_import,
            commands::host_fetch_metrics,
            commands::serial_list_ports,
            commands::serial_connect,
            commands::serial_write,
            commands::serial_disconnect,
            commands::telnet_connect,
            commands::telnet_write,
            commands::telnet_disconnect,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
