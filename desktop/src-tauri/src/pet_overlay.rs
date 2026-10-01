use tauri::{Manager, PhysicalPosition, WebviewWindow};
use serde::{Deserialize, Serialize};
use tauri_plugin_store::StoreExt;

#[derive(Debug, Serialize, Deserialize)]
pub struct PetPosition {
    pub x: f64,
    pub y: f64,
}

const PET_SIZE: f64 = 60.0;

pub fn position_pet_window(window: &WebviewWindow) -> Result<(), Box<dyn std::error::Error>> {
    let app_handle = window.app_handle();
    if let Ok(store) = app_handle.store("store.bin") {
        if let Some(pos) = store.get("pet_position") {
            if let Ok(pos) = serde_json::from_value::<PetPosition>(pos) {
                let monitor = window.current_monitor()?;
                if let Some(monitor) = monitor {
                    let monitor_size = monitor.size();
                    let x = pos.x.min(monitor_size.width as f64 - PET_SIZE).max(0.0) as i32;
                    let y = pos.y.min(monitor_size.height as f64 - PET_SIZE).max(0.0) as i32;
                    window.set_position(tauri::Position::Physical(PhysicalPosition { x, y }))?;
                }
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn save_pet_position(app: tauri::AppHandle, x: f64, y: f64) -> Result<(), String> {
    let store = app.store("store.bin").map_err(|e| e.to_string())?;
    store.set("pet_position", serde_json::json!({ "x": x, "y": y }));
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_pet_position(app: tauri::AppHandle) -> Result<PetPosition, String> {
    let store = app.store("store.bin").map_err(|e| e.to_string())?;
    if let Some(pos) = store.get("pet_position") {
        serde_json::from_value(pos).map_err(|e| e.to_string())
    } else {
        // Default position: bottom right
        if let Some(window) = app.get_webview_window("pet-overlay") {
            if let Ok(Some(monitor)) = window.current_monitor() {
                let size = monitor.size();
                return Ok(PetPosition {
                    x: size.width as f64 - 100.0,
                    y: size.height as f64 - 100.0,
                });
            }
        }
        Ok(PetPosition { x: 100.0, y: 100.0 })
    }
}
