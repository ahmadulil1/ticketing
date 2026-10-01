use tauri::App;
use tauri_plugin_autostart::ManagerExt;

pub fn setup_autostart(app: &App) -> Result<(), Box<dyn std::error::Error>> {
    // Enable autostart by default
    app.autolaunch().enable()?;
    Ok(())
}
