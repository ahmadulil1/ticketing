use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

pub fn setup_notifications(_app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    Ok(())
}

#[tauri::command]
pub async fn request_permission(app: AppHandle) -> Result<bool, String> {
    app.notification()
        .request_permission()
        .map_err(|e| e.to_string())
        .map(|_| true)
}

#[tauri::command]
pub async fn show_notification(
    app: AppHandle,
    title: String,
    body: String,
) -> Result<(), String> {
    app.notification()
        .builder()
        .title(&title)
        .body(&body)
        .show()
        .map_err(|e| e.to_string())
}
