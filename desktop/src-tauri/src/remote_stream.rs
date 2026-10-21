use serde_json::json;
use std::process::Command;
use tauri::{AppHandle, Emitter, State};
use crate::remote_control::RemoteControlState;

/// Tangkap layar penuh via `screencapture` (macOS built-in), encode base64 PNG,
/// kirim ke frontend lewat Tauri event `remote-frame`. Frontend teruji teruskan
/// via WebSocket channel `remote:{deviceId}` ke web viewer.
#[tauri::command]
pub async fn remote_capture_and_send(
    app: AppHandle,
    state: State<'_, RemoteControlState>,
    session_id: String,
) -> Result<(), String> {
    // Cek apakah session masih aktif
    if !state.has_session(&session_id) {
        return Err(format!("Session {} tidak aktif", session_id));
    }

    // Capture layar
    let output = Command::new("screencapture")
        .args(["-x", "-o", "-t", "png", "/tmp/remote_frame.png"])
        .output()
        .map_err(|e| format!("screencapture gagal: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "screencapture error: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let data = std::fs::read("/tmp/remote_frame.png")
        .map_err(|e| format!("baca frame gagal: {}", e))?;

    // Kirim ke frontend
    app.emit(
        "remote-frame",
        json!({
            "session_id": session_id,
            "data": base64::encode(&data),
            "format": "png",
        }),
    )
    .map_err(|e| format!("emit frame gagal: {}", e))?;

    Ok(())
}
