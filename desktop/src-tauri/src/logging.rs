//! Logging sederhana ke file.
//!
//! Di Windows build release, app jalan tanpa console (`windows_subsystem =
//! "windows"`), jadi `eprintln!` hilang begitu saja. Untuk troubleshooting
//! remote desktop, error harus tersimpan di file yang bisa dibuka user.
//!
//! Lokasi: app log dir Tauri (Windows: %LOCALAPPDATA%\\com.ticketing.desktop\\logs,
//! macOS: ~/Library/Logs/com.ticketing.desktop).

use std::io::Write;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use tauri::Manager;

static LOG_PATH: OnceLock<Mutex<Option<PathBuf>>> = OnceLock::new();

/// Siapkan lokasi file log. Panggil sekali di `setup`.
pub fn init(app: &tauri::App) {
    let dir = app
        .path()
        .app_log_dir()
        .unwrap_or_else(|_| std::env::temp_dir());
    let _ = std::fs::create_dir_all(&dir);
    let path = dir.join("ticketing-desktop.log");
    let slot = LOG_PATH.get_or_init(|| Mutex::new(None));
    if let Ok(mut g) = slot.lock() {
        *g = Some(path);
    }
}

/// Tulis satu baris ke log file (dan console untuk mode dev).
pub fn log(msg: &str) {
    eprintln!("{}", msg);
    let path = LOG_PATH
        .get()
        .and_then(|m| m.lock().ok().and_then(|g| g.clone()));
    let Some(path) = path else { return };
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
    {
        let _ = writeln!(f, "[{}] {}", now_iso(), msg);
    }
}

/// Waktu UTC sekarang format ISO-8601 singkat (YYYY-MM-DD HH:MM:SS).
fn now_iso() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let days = secs.div_euclid(86_400);
    let rem = secs.rem_euclid(86_400);
    let (h, mi, s) = (rem / 3600, (rem % 3600) / 60, rem % 60);

    // days sejak 1970-01-01 -> tanggal kalender (algoritma Howard Hinnant)
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let mo = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if mo <= 2 { y + 1 } else { y };

    format!(
        "{:04}-{:02}-{:02} {:02}:{:02}:{:02}",
        y, mo, d, h, mi, s
    )
}
