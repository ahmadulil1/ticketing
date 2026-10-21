use serde_json::json;
use std::process::Command;
use tauri::{AppHandle, Emitter, State};
use crate::remote_control::RemoteControlState;

/// Lebar maksimum frame (px). Layar 1920px di-downscale ke 1280px supaya
/// payload base64 turun dari ~1.2MB (PNG) jadi ~120KB (JPEG q50).
const FRAME_MAX_WIDTH: u32 = 1280;
/// Kualitas JPEG 0-100. 50 masih terbaca jelas untuk keperluan remote.
const FRAME_JPEG_QUALITY: u32 = 50;

/// Tangkap layar penuh, kompres ke JPEG, kirim ke frontend lewat Tauri event
/// `remote-frame`. Frontend meneruskannya via WebSocket ke web viewer.
///
/// Alur: screencapture (PNG native) -> sips (resize + JPEG q50) -> base64.
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

    let raw_path = format!("/tmp/remote_raw_{}.png", std::process::id());
    let out_path = format!("/tmp/remote_frame_{}.jpg", std::process::id());

    // 1. Tangkap layar (format PNG native, kualitas lossless)
    let output = Command::new("screencapture")
        .args(["-x", "-o", "-t", "png", &raw_path])
        .output()
        .map_err(|e| format!("screencapture gagal: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "screencapture error: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    // 2. Downscale + kompres ke JPEG
    let scaled = Command::new("sips")
        .args([
            "-Z",
            &FRAME_MAX_WIDTH.to_string(),
            "-s",
            "formatOptions",
            &FRAME_JPEG_QUALITY.to_string(),
            &raw_path,
            "--out",
            &out_path,
        ])
        .output()
        .map_err(|e| format!("sips gagal: {}", e))?;

    let final_path = if scaled.status.success() && std::path::Path::new(&out_path).exists() {
        out_path
    } else {
        // sips gagal -> pakai PNG mentah (lebih besar tapi tetap berfungsi)
        raw_path.clone()
    };

    let data = std::fs::read(&final_path).map_err(|e| format!("baca frame gagal: {}", e))?;
    let format = if final_path == raw_path { "png" } else { "jpeg" };

    // Ukuran layar asli dari header PNG (IHDR: width/height big-endian u32
    // pada byte 16..24). Dipakai untuk memetakan koordinat input viewer.
    let (screen_w, screen_h) = read_png_size(&raw_path).unwrap_or((0.0, 0.0));
    if screen_w > 0.0 {
        state.set_screen_size(&session_id, screen_w, screen_h);
    }

    // Bersihkan file sementara
    let _ = std::fs::remove_file(&raw_path);
    if final_path != raw_path {
        let _ = std::fs::remove_file(&final_path);
    }

    // 3. Kirim ke frontend
    app.emit(
        "remote-frame",
        json!({
            "session_id": session_id,
            "data": base64::encode(&data),
            "format": format,
            "screen_w": screen_w,
            "screen_h": screen_h,
        }),
    )
    .map_err(|e| format!("emit frame gagal: {}", e))?;

    Ok(())
}

/// Baca dimensi PNG dari header file (tanpa library gambar).
fn read_png_size(path: &str) -> Option<(f64, f64)> {
    use std::io::Read;
    let mut f = std::fs::File::open(path).ok()?;
    let mut header = [0u8; 24];
    f.read_exact(&mut header).ok()?;
    // Signature PNG 8 byte + IHDR chunk (4 len + 4 type) = offset 16
    if &header[1..4] != b"PNG" {
        return None;
    }
    let w = u32::from_be_bytes([header[16], header[17], header[18], header[19]]);
    let h = u32::from_be_bytes([header[20], header[21], header[22], header[23]]);
    if w == 0 || h == 0 {
        return None;
    }
    Some((w as f64, h as f64))
}
