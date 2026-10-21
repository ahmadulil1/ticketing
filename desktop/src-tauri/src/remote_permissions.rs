use serde::Serialize;
use tauri::AppHandle;

#[cfg(target_os = "macos")]
#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn AXIsProcessTrusted() -> bool;
}

#[cfg(target_os = "macos")]
#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGPreflightScreenCaptureAccess() -> bool;
    fn CGRequestScreenCaptureAccess() -> bool;
}

#[derive(Debug, Serialize)]
pub struct PermissionStatus {
    pub accessibility: bool,
    pub screen_recording: bool,
    pub platform: String,
}

/// Cek izin sistem yang dibutuhkan remote desktop:
/// - Accessibility: untuk gerakkan mouse & ketik keyboard
/// - Screen Recording: untuk tangkap layar
#[tauri::command]
pub async fn remote_check_permissions() -> Result<PermissionStatus, String> {
    #[cfg(target_os = "macos")]
    {
        Ok(PermissionStatus {
            accessibility: unsafe { AXIsProcessTrusted() },
            screen_recording: unsafe { CGPreflightScreenCaptureAccess() },
            platform: "macos".to_string(),
        })
    }
    #[cfg(target_os = "windows")]
    {
        // Windows tidak butuh izin terpisah untuk SendInput/GDI
        Ok(PermissionStatus {
            accessibility: true,
            screen_recording: true,
            platform: "windows".to_string(),
        })
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Ok(PermissionStatus {
            accessibility: false,
            screen_recording: false,
            platform: "unknown".to_string(),
        })
    }
}

/// Minta izin Screen Recording (macOS). Accessibility tidak bisa diminta via API —
/// user harus buka System Settings > Privacy & Security > Accessibility.
#[tauri::command]
pub async fn remote_request_screen_recording(_app: AppHandle) -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        Ok(unsafe { CGRequestScreenCaptureAccess() })
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(true)
    }
}

/// Buka System Settings ke halaman Accessibility supaya user bisa grant izin.
#[tauri::command]
pub async fn remote_open_accessibility_settings(_app: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let url = "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility";
        std::process::Command::new("open")
            .arg(url)
            .spawn()
            .map_err(|e| format!("gagal buka System Settings: {}", e))?;
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(())
    }
}
