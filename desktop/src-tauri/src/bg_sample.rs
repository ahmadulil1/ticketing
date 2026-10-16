use tauri::Manager;

/// Sample warna layar di sekitar window pet untuk deteksi tema background.
/// Return rata-rata luminance (0..255). Windows pakai GDI GetPixel;
/// platform lain kembalikan None (frontend pakai prefers-color-scheme).
#[tauri::command]
pub fn sample_bg_luminance(app: tauri::AppHandle) -> Result<Option<f64>, String> {
    let window = app.get_webview_window("pet-overlay").ok_or("pet-overlay not found")?;
    let pos = window.outer_position().map_err(|e| e.to_string())?;
    let size = window.outer_size().map_err(|e| e.to_string())?;

    #[cfg(windows)]
    {
        use windows::Win32::Graphics::Gdi::{GetDC, GetPixel, ReleaseDC};
        use windows::Win32::Foundation::HWND;

        let hdc = unsafe { GetDC(HWND(std::ptr::null_mut())) };
        if hdc.is_invalid() {
            return Ok(None);
        }
        // Titik sample: di luar window pet (kiri, kanan, atas, bawah)
        let x0 = pos.x;
        let y0 = pos.y;
        let x1 = pos.x + size.width as i32;
        let y1 = pos.y + size.height as i32;
        let pts = [
            (x0 - 6, (y0 + y1) / 2),
            (x1 + 6, (y0 + y1) / 2),
            ((x0 + x1) / 2, y0 - 6),
            ((x0 + x1) / 2, y1 + 6),
            (x0 - 6, y0 - 6),
            (x1 + 6, y1 + 6),
        ];
        let mut lum_sum = 0u64;
        let mut n = 0u64;
        for (x, y) in pts {
            if x < 0 || y < 0 {
                continue;
            }
            let pixel = unsafe { GetPixel(hdc, x, y) };
            let v = pixel.0;
            let r = (v & 0xFF) as u64;
            let g = ((v >> 8) & 0xFF) as u64;
            let b = ((v >> 16) & 0xFF) as u64;
            // Luminance standar
            lum_sum += (r * 2126 + g * 7152 + b * 722) / 10000;
            n += 1;
        }
        unsafe { ReleaseDC(HWND(std::ptr::null_mut()), hdc) };
        if n == 0 {
            return Ok(None);
        }
        Ok(Some(lum_sum as f64 / n as f64))
    }

    #[cfg(not(windows))]
    {
        let _ = (pos, size);
        Ok(None)
    }
}
