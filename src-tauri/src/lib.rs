mod data_files;
mod images;
mod power;

use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

/// Optional Mica backdrop (SPEC 11, off by default — Sky is the v1 theme).
#[tauri::command]
fn set_mica(window: tauri::WebviewWindow, enabled: bool) -> Result<(), String> {
    if enabled {
        window_vibrancy::apply_mica(&window, None)
            .map_err(|e| format!("mica unavailable: {e}"))
    } else {
        window_vibrancy::clear_mica(&window).map_err(|e| e.to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "init",
            sql: include_str!("../migrations/001_init.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "active_session_pomodoro",
            sql: include_str!("../migrations/002_active_session_pomodoro.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Focus the existing window instead of launching a second app (SPEC 11).
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_focus();
            }
        }))
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:atom.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Set the window icon explicitly so the titlebar and taskbar icon do
            // not depend on the icon resource embedded in the .exe.
            if let (Some(icon), Some(window)) = (
                app.default_window_icon().cloned(),
                app.get_webview_window("main"),
            ) {
                window.set_icon(icon)?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            power::prevent_sleep,
            images::standby_add_images,
            images::standby_remove_image,
            images::standby_user_dir,
            data_files::write_text_file,
            data_files::write_bytes_file,
            data_files::read_text_file,
            data_files::db_path,
            data_files::write_backup,
            data_files::latest_backup,
            data_files::apply_import,
            data_files::save_active_session,
            data_files::delete_category_reassign,
            data_files::clear_all_data,
            set_mica
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
