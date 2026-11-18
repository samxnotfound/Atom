//! Standby image library management (SPEC 5.2 / 3).
//! User images are copied into %APPDATA%/Atom/standby/ and referenced by
//! file_name; originals are never touched. Removal deletes only the copy.

use std::fs;
use std::path::PathBuf;
use tauri::Manager;

const STANDBY_DIR: &str = "standby";
pub const MAX_IMAGES: usize = 40;
const ACCEPTED: [&str; 5] = ["jpg", "jpeg", "png", "webp", "avif"];

pub fn standby_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join(STANDBY_DIR);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn ext_of(path: &str) -> Option<String> {
    let ext = std::path::Path::new(path)
        .extension()?
        .to_string_lossy()
        .to_ascii_lowercase();
    if ACCEPTED.contains(&ext.as_str()) {
        Some(ext)
    } else {
        None
    }
}

#[tauri::command]
pub fn standby_add_images(app: tauri::AppHandle, paths: Vec<String>) -> Result<Vec<String>, String> {
    let dir = standby_dir(&app)?;
    let existing: usize = fs::read_dir(&dir)
        .map(|rd| rd.filter_map(|e| e.ok()).count())
        .unwrap_or(0);

    let mut copied: Vec<String> = Vec::new();
    for path in paths {
        if existing + copied.len() >= MAX_IMAGES {
            break;
        }
        let Some(ext) = ext_of(&path) else { continue };
        let dest_name = format!("{}.{}", uuid::Uuid::new_v4(), ext);
        let dest = dir.join(&dest_name);
        if let Err(e) = fs::copy(&path, &dest) {
            // Do not leave half an import on disk that no DB row references.
            for name in &copied {
                let _ = fs::remove_file(dir.join(name));
            }
            return Err(format!("copy failed: {e}"));
        }
        copied.push(dest_name);
    }
    Ok(copied)
}

#[tauri::command]
pub fn standby_remove_image(app: tauri::AppHandle, file_name: String) -> Result<(), String> {
    // Defense in depth: the name must be a plain file inside our dir.
    if file_name.contains('\\') || file_name.contains('/') || file_name.contains("..") {
        return Err("invalid file name".into());
    }
    let dir = standby_dir(&app)?;
    let target = dir.join(&file_name);
    if target.exists() {
        fs::remove_file(&target).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Absolute path of the stored user-image dir (for the asset-protocol URL).
#[tauri::command]
pub fn standby_user_dir(app: tauri::AppHandle) -> Result<String, String> {
    Ok(standby_dir(&app)?.to_string_lossy().into_owned())
}
