use serde_json::json;
use tauri::{AppHandle, Emitter, State};
use crate::remote_control::RemoteControlState;

/// Lebar maksimum frame (px). Layar 4K di-downscale ke 1920px supaya
/// frame tetap tajam saat di-display besar di panel web admin.
#[cfg(target_os = "macos")]
const FRAME_MAX_WIDTH: u32 = 1920;
/// Kualitas JPEG 0-100. 65 -> ~300KB per frame (1920px).
#[cfg(target_os = "macos")]
const FRAME_JPEG_QUALITY: u32 = 65;

/// Tangkap layar penuh, kompres ke JPEG, kirim ke frontend lewat Tauri event
/// `remote-frame`. Frontend meneruskannya via WebSocket ke web viewer.
///
/// Alur: screencapture (PNG native) -> sips (resize + JPEG q50) -> base64.
///
/// CATATAN: implementasi ini untuk macOS (screencapture + sips) dan Windows
/// (GDI + JPEG encoder). Di platform lain fungsi ini mengembalikan error yang
/// jelas supaya UI menampilkan "Remote hanya tersedia di macOS/Windows"
/// alih-alih gagal diam-diam.
#[tauri::command]
pub async fn remote_capture_and_send(
    app: AppHandle,
    state: State<'_, RemoteControlState>,
    session_id: String,
) -> Result<(), String> {
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = (&app, &state, &session_id);
        return Err("Remote desktop baru tersedia di macOS dan Windows".to_string());
    }

    #[cfg(target_os = "windows")]
    {
    if !state.has_session(&session_id) {
        return Err(format!("Session {} tidak aktif", session_id));
    }

    let (data, screen_w, screen_h) = match crate::remote_windows::capture_frame() {
        Ok(v) => v,
        Err(e) => {
            crate::logging::log(&format!("[remote] capture gagal: {}", e));
            return Err(e);
        }
    };
    state.set_screen_size(&session_id, screen_w, screen_h);

    let payload = json!({
        "session_id": session_id,
        "data": base64::encode(&data),
        "format": "jpeg",
        "screen_w": screen_w,
        "screen_h": screen_h,
    });
    app.emit_to("pet-overlay", "remote-frame", payload.clone())
        .map_err(|e| format!("emit frame gagal: {}", e))?;
    let _ = app.emit("remote-frame", payload);

    Ok(())
    }

    #[cfg(target_os = "macos")]
    {
    use std::process::Command;

    // Cek apakah session masih aktif
    if !state.has_session(&session_id) {
        return Err(format!("Session {} tidak aktif", session_id));
    }

    let raw_path = format!("/tmp/remote_raw_{}.png", std::process::id());
    let out_path = format!("/tmp/remote_frame_{}.jpg", std::process::id());

    // 1. Tangkap layar (format PNG native, kualitas lossless)
    // Tanpa -C: kursor mouse tak ikut tertangkap. Kursor remote digambar
    // sendiri di panel web (viewer), jadi konsisten di macOS & Windows
    // dan tak perlu nunggu frame baru (kursor OS cuma update 2x/detik).
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
    // PENTING: `-s format jpeg` wajib ada. Tanpa itu sips tetap nulis PNG
    // (meski file-nya .jpg) -> payload 460KB dan.web nganggapnya JPEG
    // padahal bukan. `-s formatOptions` sendiri cuma berlaku kalau format
    // sudah diganti ke jpeg.
    let scaled = Command::new("sips")
        .args([
            "-Z",
            &FRAME_MAX_WIDTH.to_string(),
            "-s",
            "format",
            "jpeg",
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

    // Tanpa izin Screen Recording, macOS hasilkan PNG kosong (0x0 / 1x1).
    if screen_w < 2.0 || screen_h < 2.0 {
        return Err(
            "Izin Screen Recording belum diberikan (hasil tangkapan kosong)".to_string(),
        );
    }

    // Bersihkan file sementara
    let _ = std::fs::remove_file(&raw_path);
    if final_path != raw_path {
        let _ = std::fs::remove_file(&final_path);
    }

    // 3. Kirim ke frontend
    // ponytail: emit ke window spesifik "pet-overlay" — pet window yang memanggil
    // command ini. emit() global kadang tak sampai ke webview transparent.
    let payload = json!({
        "session_id": session_id,
        "data": base64::encode(&data),
        "format": format,
        "screen_w": screen_w,
        "screen_h": screen_h,
    });
    app.emit_to("pet-overlay", "remote-frame", payload.clone())
        .map_err(|e| format!("emit frame gagal: {}", e))?;
    // fallback: broadcast ke semua window
    let _ = app.emit("remote-frame", payload);

    Ok(())
    }
}

/// Baca dimensi PNG dari header file (tanpa library gambar).
#[cfg(target_os = "macos")]
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
