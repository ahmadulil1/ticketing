use tauri::App;
use tauri_plugin_autostart::ManagerExt;

/// Aktifkan autostart (Windows: registry Run key, macOS: LaunchAgent).
///
/// PENTING: error TIDAK boleh menggagalkan startup. Di Windows, policies
/// ketat atau profil bersama bisa menolak tulis registry — kalau error
/// dipropagasi, app tak mau start sama sekali, device tak pernah muncul
/// dan remote tak mungkin dipakai. Lebih baik app jalan tanpa autostart.
pub fn setup_autostart(app: &App) {
    if let Err(e) = app.autolaunch().enable() {
        crate::logging::log(&format!("[autostart] gagal aktifkan autostart: {}", e));
    } else {
        crate::logging::log("[autostart] aktif");
    }
}
