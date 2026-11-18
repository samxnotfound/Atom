//! File IO + backup commands (SPEC 3, 5.8). The frontend composes the payload;
//! Rust owns disk paths under %APPDATA%/Atom.

use std::fs;
use std::path::PathBuf;
use serde::Deserialize;
use tauri::Manager;

pub fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn backups_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = data_dir(app)?.join("backups");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// A dedicated SQLite connection for commands that need a real transaction
/// (the plugin's pool runs one connection per execute, so BEGIN/COMMIT from
/// JS is not atomic). One connect + close per call; the plugin pool stays idle.
async fn db_pool(app: &tauri::AppHandle) -> Result<sqlx::SqlitePool, String> {
    let path = data_dir(app)?.join("atom.db");
    let options = sqlx::sqlite::SqliteConnectOptions::new()
        .filename(&path)
        .create_if_missing(false);
    sqlx::SqlitePool::connect_with(options)
        .await
        .map_err(|e| e.to_string())
}

/// Writes a UTF-8 text file to an arbitrary path chosen by a native save dialog.
#[tauri::command]
pub fn write_text_file(path: String, contents: String) -> Result<(), String> {
    fs::write(&path, contents).map_err(|e| e.to_string())
}

/// Writes binary (base64) content — used for the PDF export.
#[tauri::command]
pub fn write_bytes_file(path: String, base64: String) -> Result<(), String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64.as_bytes())
        .map_err(|e| e.to_string())?;
    fs::write(&path, bytes).map_err(|e| e.to_string())
}

/// Reads a UTF-8 text file chosen by a native open dialog (JSON import).
#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;
    if metadata.len() > 64 * 1024 * 1024 {
        return Err("file too large".into());
    }
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// Exact DB path shown in Settings → Data, with an open-folder button.
#[tauri::command]
pub fn db_path(app: tauri::AppHandle) -> Result<String, String> {
    Ok(data_dir(&app)?.join("atom.db").to_string_lossy().into_owned())
}

/// Writes one rolling daily JSON backup and prunes to the newest 14.
/// Returns the written file name.
#[tauri::command]
pub fn write_backup(app: tauri::AppHandle, contents: String) -> Result<String, String> {
    let dir = backups_dir(&app)?;
    let name = format!(
        "atom-backup-{}.json",
        chrono::Local::now().format("%Y-%m-%d")
    );
    fs::write(dir.join(&name), contents).map_err(|e| e.to_string())?;

    let mut entries: Vec<(std::time::SystemTime, PathBuf)> = fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let meta = e.metadata().ok()?;
            Some((meta.modified().ok()?, e.path()))
        })
        .collect();
    entries.sort_by(|a, b| b.0.cmp(&a.0));
    for (_, path) in entries.iter().skip(14) {
        let _ = fs::remove_file(path);
    }
    Ok(name)
}

/// ISO date of the newest backup, or null. For the Settings → Data status line.
#[tauri::command]
pub fn latest_backup(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let dir = backups_dir(&app)?;
    let mut best: Option<(std::time::SystemTime, String)> = None;
    for e in fs::read_dir(&dir).map_err(|e| e.to_string())?.flatten() {
        let modified = match e.metadata().and_then(|m| m.modified()) {
            Ok(m) => m,
            Err(_) => continue,
        };
        let name = e.file_name().to_string_lossy().into_owned();
        if best.as_ref().is_none_or(|(t, _)| modified > *t) {
            best = Some((modified, name));
        }
    }
    Ok(best.map(|(_, name)| name))
}

/* ------------------------- transactional data ops ------------------------- */

#[derive(Deserialize)]
struct BackupCategory {
    id: String,
    name: String,
    color: String,
    icon: Option<String>,
    archived_at: Option<i64>,
    sort_order: i64,
    created_at: i64,
}

#[derive(Deserialize)]
struct BackupSession {
    id: String,
    category_id: Option<String>,
    title: Option<String>,
    note: Option<String>,
    mode: String,
    planned_ms: Option<i64>,
    actual_ms: i64,
    started_at: i64,
    ended_at: i64,
    completed: i64,
    source: String,
    created_at: i64,
}

#[derive(Deserialize)]
pub struct ActivePayload {
    id: String,
    category_id: Option<String>,
    title: Option<String>,
    mode: String,
    planned_ms: Option<i64>,
    started_at: i64,
    paused_total_ms: i64,
    paused_at: Option<i64>,
    last_heartbeat: i64,
    segment_index: i64,
    phase: String,
    break_kind: Option<String>,
}

#[derive(Deserialize)]
struct BackupFreeze {
    date: String,
    used_at: i64,
}

#[derive(Deserialize)]
struct BackupPayload {
    // The TypeScript exporter writes `schemaVersion`; every other field keeps
    // the DB row's snake_case name.
    #[serde(rename = "schemaVersion")]
    schema_version: i64,
    #[serde(default)]
    categories: Vec<BackupCategory>,
    #[serde(default)]
    sessions: Vec<BackupSession>,
    #[serde(default)]
    settings: std::collections::BTreeMap<String, String>,
    #[serde(default)]
    freezes: Vec<BackupFreeze>,
}

/// Stored data is untrusted input: shape, modes, ids and time sanity.
fn validate_payload(p: &BackupPayload) -> Result<(), String> {
    if p.schema_version != 1 {
        return Err(format!("unsupported schema version: {}", p.schema_version));
    }
    if p.categories.len() > 10_000 || p.sessions.len() > 500_000 {
        return Err("backup too large".into());
    }
    for c in &p.categories {
        if c.id.trim().is_empty() || c.name.trim().is_empty() || c.color.trim().is_empty() {
            return Err("invalid category row".into());
        }
    }
    for s in &p.sessions {
        if s.id.trim().is_empty() {
            return Err("invalid session row".into());
        }
        if !matches!(s.mode.as_str(), "countdown" | "stopwatch" | "pomodoro") {
            return Err(format!("unknown session mode: {}", s.mode));
        }
        if s.actual_ms < 0 || s.started_at < 0 || s.ended_at < s.started_at {
            return Err(format!("invalid session times for id {}", s.id));
        }
    }
    Ok(())
}

/// Applies a whole backup inside one SQLite transaction (SPEC 3 data safety):
/// a failed or interrupted import can never leave a half-wiped database.
#[tauri::command]
pub async fn apply_import(
    app: tauri::AppHandle,
    contents: String,
    replace: bool,
) -> Result<(), String> {
    let payload: BackupPayload =
        serde_json::from_str(&contents).map_err(|e| format!("bad backup JSON: {e}"))?;
    validate_payload(&payload)?;

    let pool = db_pool(&app).await?;
    let mut tx = pool
        .begin()
        .await
        .map_err(|e| format!("cannot open transaction: {e}"))?;

    if replace {
        // Stale recovery rows must go too, or the next launch offers a
        // session that no longer belongs to this data set.
        for stmt in [
            "DELETE FROM sessions",
            "DELETE FROM categories",
            "DELETE FROM streak_freezes",
            "DELETE FROM settings",
            "DELETE FROM active_session",
        ] {
            sqlx::query(stmt)
                .execute(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;
        }
    }

    for c in &payload.categories {
        sqlx::query(
            "INSERT INTO categories (id, name, color, icon, archived_at, sort_order, created_at)
             VALUES (?,?,?,?,?,?,?)
             ON CONFLICT(id) DO UPDATE SET
               name=excluded.name, color=excluded.color, icon=excluded.icon,
               archived_at=excluded.archived_at, sort_order=excluded.sort_order,
               created_at=excluded.created_at",
        )
        .bind(&c.id)
        .bind(&c.name)
        .bind(&c.color)
        .bind(&c.icon)
        .bind(c.archived_at)
        .bind(c.sort_order)
        .bind(c.created_at)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    for s in &payload.sessions {
        sqlx::query(
            "INSERT INTO sessions
               (id, category_id, title, note, mode, planned_ms, actual_ms,
                started_at, ended_at, completed, source, created_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
             ON CONFLICT(id) DO NOTHING",
        )
        .bind(&s.id)
        .bind(&s.category_id)
        .bind(&s.title)
        .bind(&s.note)
        .bind(&s.mode)
        .bind(s.planned_ms)
        .bind(s.actual_ms)
        .bind(s.started_at)
        .bind(s.ended_at)
        .bind(s.completed)
        .bind(&s.source)
        .bind(s.created_at)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    for f in &payload.freezes {
        sqlx::query("INSERT OR IGNORE INTO streak_freezes (date, used_at) VALUES (?, ?)")
            .bind(&f.date)
            .bind(f.used_at)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    }

    for (key, value) in &payload.settings {
        if replace {
            sqlx::query(
                "INSERT INTO settings (key, value) VALUES (?, ?)
                 ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            )
            .bind(key)
            .bind(value)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        } else {
            sqlx::query("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)")
                .bind(key)
                .bind(value)
                .execute(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;
        }
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    pool.close().await;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Shape emitted by `composeBackup()` in src/data/exportImport.ts.
    const EXPORTED_BACKUP: &str = r##"{
        "schemaVersion": 1,
        "exportedAt": 1700000000000,
        "categories": [{
            "id": "c1", "name": "Work", "color": "#2F7BFF", "icon": null,
            "archived_at": null, "sort_order": 0, "created_at": 1
        }],
        "sessions": [{
            "id": "s1", "category_id": "c1", "title": "Deep work", "note": null,
            "mode": "countdown", "planned_ms": 3600000, "actual_ms": 3500000,
            "started_at": 1, "ended_at": 2, "completed": 1, "source": "timer",
            "created_at": 1
        }],
        "settings": { "goalMs": "3600000" },
        "freezes": [{ "date": "2026-01-01", "used_at": 1 }]
    }"##;

    #[test]
    fn deserializes_the_exported_camel_case_schema_version() {
        let payload: BackupPayload = serde_json::from_str(EXPORTED_BACKUP).unwrap();
        assert_eq!(payload.schema_version, 1);
        assert_eq!(payload.sessions.len(), 1);
        assert_eq!(payload.sessions[0].planned_ms, Some(3_600_000));
        validate_payload(&payload).unwrap();
    }

    #[test]
    fn rejects_an_unknown_schema_version() {
        let raw = EXPORTED_BACKUP.replace("\"schemaVersion\": 1", "\"schemaVersion\": 2");
        let payload: BackupPayload = serde_json::from_str(&raw).unwrap();
        assert!(validate_payload(&payload).is_err());
    }
}

/// Persists the running session as the single active row. A delete+insert in
/// one transaction prevents the old segment (a break, or a crash-recovery row)
/// from surviving alongside the new one — `load_active` must never have to
/// choose between two sessions.
#[tauri::command]
pub async fn save_active_session(
    app: tauri::AppHandle,
    session: ActivePayload,
) -> Result<(), String> {
    if session.id.trim().is_empty() {
        return Err("invalid active session id".into());
    }
    if !matches!(session.mode.as_str(), "countdown" | "stopwatch" | "pomodoro") {
        return Err(format!("unknown session mode: {}", session.mode));
    }
    if !matches!(session.phase.as_str(), "focus" | "break") {
        return Err(format!("unknown session phase: {}", session.phase));
    }

    let pool = db_pool(&app).await?;
    let mut tx = pool
        .begin()
        .await
        .map_err(|e| format!("cannot open transaction: {e}"))?;

    sqlx::query("DELETE FROM active_session")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query(
        "INSERT INTO active_session
           (id, category_id, title, mode, planned_ms, started_at, paused_total_ms,
            paused_at, last_heartbeat, segment_index, phase, break_kind)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
    )
    .bind(&session.id)
    .bind(&session.category_id)
    .bind(&session.title)
    .bind(&session.mode)
    .bind(session.planned_ms)
    .bind(session.started_at)
    .bind(session.paused_total_ms)
    .bind(session.paused_at)
    .bind(session.last_heartbeat)
    .bind(session.segment_index)
    .bind(&session.phase)
    .bind(&session.break_kind)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    pool.close().await;
    Ok(())
}

/// Deletes a category and moves its sessions in one transaction, so a crash
/// can never leave sessions pointing at a category that no longer exists
/// (or the reverse). `target_id = None` means Uncategorized.
#[tauri::command]
pub async fn delete_category_reassign(
    app: tauri::AppHandle,
    category_id: String,
    target_id: Option<String>,
) -> Result<(), String> {
    if category_id.trim().is_empty() {
        return Err("invalid category id".into());
    }
    if target_id.as_deref() == Some(category_id.as_str()) {
        return Err("cannot reassign a category to itself".into());
    }

    let pool = db_pool(&app).await?;
    let mut tx = pool
        .begin()
        .await
        .map_err(|e| format!("cannot open transaction: {e}"))?;

    sqlx::query("UPDATE sessions SET category_id = ? WHERE category_id = ?")
        .bind(&target_id)
        .bind(&category_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM categories WHERE id = ?")
        .bind(&category_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    pool.close().await;
    Ok(())
}

/// Wipes every table in one transaction (SPEC 5.7). Default categories are
/// re-seeded by the caller afterwards.
#[tauri::command]
pub async fn clear_all_data(app: tauri::AppHandle) -> Result<(), String> {
    let pool = db_pool(&app).await?;
    let mut tx = pool
        .begin()
        .await
        .map_err(|e| format!("cannot open transaction: {e}"))?;
    for stmt in [
        "DELETE FROM sessions",
        "DELETE FROM categories",
        "DELETE FROM streak_freezes",
        "DELETE FROM settings",
        "DELETE FROM active_session",
    ] {
        sqlx::query(stmt)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    }
    tx.commit().await.map_err(|e| e.to_string())?;
    pool.close().await;

    // "Delete all data" also removes the copied Standby images and cache
    // (SPEC 5.7); originals outside the data dir are never touched.
    let dir = data_dir(&app)?;
    for sub in ["standby", "cache"] {
        let target = dir.join(sub);
        if let Ok(entries) = fs::read_dir(&target) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    let _ = fs::remove_file(path);
                }
            }
        }
    }
    Ok(())
}
