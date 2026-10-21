#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod pet_overlay;
mod system_tray;
mod notifications;
mod auto_start;
mod bg_sample;
mod remote_control;
mod remote_stream;
mod remote_input;
mod remote_permissions;

use std::sync::{Mutex, OnceLock};
use tauri::{Listener, Manager};

use crate::remote_control::RemoteControlState;
use crate::system_tray::nudge_repaint;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Instance kedua: tunjukkan window mini yang ada, jangan buat app baru
            if let Some(window) = app.get_webview_window("mini") {
                let _ = window.show();
                let _ = window.set_focus();
                crate::system_tray::nudge_repaint(&window);
            }
        }))
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(RemoteControlState::new())
        .setup(|app| {
            // Window pet-overlay & mini didefinisikan di tauri.conf.json
            let pet_window = app.get_webview_window("pet-overlay")
                .ok_or("pet-overlay window not found")?;

            // Position pet window
            pet_overlay::position_pet_window(&pet_window)?;
            let _ = pet_window.set_shadow(false);

            // mini window dibuat oleh config, pastikan tersembunyi saat start
            if let Some(mini) = app.get_webview_window("mini") {
                let _ = mini.hide();
            }

            // Setup system tray
            system_tray::setup_system_tray(app)?;

            // Setup auto start
            auto_start::setup_autostart(app)?;

            // Commands dari frontend
            let app_handle = app.handle().clone();
            app.listen("show-mini", move |_| {
                if let Some(window) = app_handle.get_webview_window("mini") {
                    let _ = window.show();
                    let _ = window.set_focus();
                    nudge_repaint(&window);
                }
            });

            let app_handle = app.handle().clone();
            app.listen("hide-pet", move |_| {
                if let Some(window) = app_handle.get_webview_window("pet-overlay") {
                    let _ = window.hide();
                }
            });

            let app_handle = app.handle().clone();
            app.listen("show-pet", move |_| {
                if let Some(window) = app_handle.get_webview_window("pet-overlay") {
                    let _ = window.show();
                }
            });

            // Setup notifications
            notifications::setup_notifications(&app.handle())?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pet_overlay::save_pet_position,
            pet_overlay::get_pet_position,
            show_mini_window,
            hide_pet_window,
            show_pet_window,
            quit_app,
            get_device_name,
            get_specs,
            get_usage,
            notifications::show_notification,
            notifications::request_permission,
            bg_sample::sample_bg_luminance,
            log_update_error,
            remote_control::remote_respond,
            remote_control::remote_end_session,
            remote_control::remote_is_active,
            remote_stream::remote_capture_and_send,
            remote_input::remote_inject_input,
            remote_permissions::remote_check_permissions,
            remote_permissions::remote_request_screen_recording,
            remote_permissions::remote_open_accessibility_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn main() {
    run();
}

#[tauri::command]
fn log_update_error(msg: String) -> Result<(), String> {
    use std::io::Write;
    let path = std::env::temp_dir().join("ticketing-update-error.log");
    let mut f = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let line = format!("[{ts}] {msg}\n");
    f.write_all(line.as_bytes()).map_err(|e| e.to_string())
}

#[tauri::command]
fn show_mini_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("mini") {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        nudge_repaint(&window);
    }
    Ok(())
}

#[tauri::command]
fn hide_pet_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("pet-overlay") {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn show_pet_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("pet-overlay") {
        window.show().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn get_device_name(_app: tauri::AppHandle) -> Result<String, String> {
    let hostname = gethostname::gethostname()
        .into_string()
        .unwrap_or_else(|_| "Unknown".to_string());
    Ok(hostname)
}

// GPU dari registry (tanpa crate `wmi`): baca DriverDesc subkey class display.
// ponytail: Windows-only. Di Linux GPU bisa via sysinfo (Devices) — upgrade nanti.
#[cfg(windows)]
fn get_gpu_model() -> Option<String> {
    use windows::Win32::System::Registry::{HKEY_LOCAL_MACHINE, RegGetValueW, RRF_RT_REG_SZ};
    use windows::core::{PCWSTR, w};

    let base = r"SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}";
    let mut seen: Vec<String> = Vec::new();
    for sub in ["0000", "0001", "0002"] {
        let path = format!("{}\\{}", base, sub);
        let wide: Vec<u16> = path.encode_utf16().chain([0]).collect();
        let mut buf = [0u8; 512];
        let mut size = buf.len() as u32;
        unsafe {
            if RegGetValueW(
                HKEY_LOCAL_MACHINE,
                PCWSTR(wide.as_ptr()),
                w!("DriverDesc"),
                RRF_RT_REG_SZ,
                None,
                Some(buf.as_mut_ptr() as *mut _),
                Some(&mut size),
            ).is_err() {
                continue;
            }
            let chars: &[u16] = std::slice::from_raw_parts(buf.as_ptr() as *const u16, (size as usize) / 2);
            let desc = String::from_utf16_lossy(chars).trim_end_matches('\0').trim().to_string();
            let low = desc.to_lowercase();
            if !desc.is_empty() && !low.contains("basic display") && !seen.contains(&desc) {
                seen.push(desc);
            }
        }
    }
    seen.first().cloned()
}

#[cfg(not(windows))]
fn get_gpu_model() -> Option<String> {
    None
}

fn sys_state() -> &'static Mutex<sysinfo_probe::State> {
    static S: OnceLock<Mutex<sysinfo_probe::State>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(sysinfo_probe::State::new()))
}

mod sysinfo_probe {
    use std::time::Instant;
    use sysinfo::{Networks, System};

    pub struct State {
        pub sys: System,
        pub nets: Networks,
        pub last: Instant,
    }

    impl State {
        pub fn new() -> Self {
            let mut sys = System::new_all();
            sys.refresh_cpu_usage();
            sys.refresh_memory();
            let mut nets = Networks::new();
            nets.refresh(true); // baseline; delta pertama = 0
            Self { sys, nets, last: Instant::now() }
        }
    }
}

// Utilitas monitoring untuk pet: CPU/RAM/disk usage + kecepatan internet.
// Dipanggil frontend tiap ~2 detik; rate dikeluarkan dari delta antar refresh.
#[tauri::command]
fn get_usage() -> Result<serde_json::Value, String> {
    use sysinfo::Disks;
    let mut st = sys_state().lock().map_err(|e| e.to_string())?;
    let secs = st.last.elapsed().as_secs_f64().max(0.001);
    st.last = std::time::Instant::now();
    st.sys.refresh_cpu_usage();
    st.sys.refresh_memory();
    st.nets.refresh(true);

    let mut down = 0u64;
    let mut up = 0u64;
    for (_iface, data) in st.nets.list() {
        down += data.received();
        up += data.transmitted();
    }

    let total_ram = st.sys.total_memory();
    let used_ram = st.sys.used_memory();
    let cpu: f32 = st.sys.global_cpu_usage();
    let ram_pct = if total_ram > 0 { used_ram as f64 / total_ram as f64 * 100.0 } else { 0.0 };

    let disks = Disks::new_with_refreshed_list();
    let mut disk_pct: Vec<serde_json::Value> = disks
        .list()
        .iter()
        .filter_map(|d| {
            let name = d.mount_point().to_string_lossy().to_string();
            let name = name.trim_end_matches(['\\', '/']).to_string();
            let total = d.total_space();
            let free = d.available_space();
            if total == 0 || !name.starts_with('C') { return None; }
            Some(serde_json::json!({
                "name": name,
                "pct": ((total - free) as f64 / total as f64 * 100.0) as u32,
            }))
        })
        .collect();
    disk_pct.dedup_by_key(|d| d["name"].clone());

    Ok(serde_json::json!({
        "cpu": cpu as u32,
        "ram": ram_pct as u32,
        "disks": disk_pct,
        "net_down": (down as f64 / secs) as u64,
        "net_up": (up as f64 / secs) as u64,
    }))
}

// Kumpulkan spesifikasi PC untuk inventaris (report saat start app).
#[tauri::command]
fn get_specs() -> Result<serde_json::Value, String> {
    use sysinfo::{Disks, System};

    let mut sys = System::new_all();
    sys.refresh_cpu_usage();
    sys.refresh_memory();

    let cpu_model = sys
        .cpus()
        .first()
        .map(|c| c.brand().trim().to_string())
        .unwrap_or_default();

    let os_name = format!(
        "{} {} {}",
        System::name().unwrap_or_else(|| "Windows".into()),
        System::os_version().unwrap_or_default(),
        System::kernel_version().unwrap_or_default()
    );

    let disks = Disks::new_with_refreshed_list();
    // SMART health Windows: map drive letter -> PhysicalDisk via Get-Partition
    let smart = get_disk_smart();
    let disks_json: Vec<serde_json::Value> = disks
        .list()
        .iter()
        .map(|d| {
            let mp = d.mount_point().to_string_lossy().to_string();
            let name = mp.trim_end_matches(['\\', '/']).to_string();
            let letter = name.trim_start_matches("\\\\?\\").to_string();
            let tipe = match d.kind() {
                sysinfo::DiskKind::SSD => "ssd",
                sysinfo::DiskKind::HDD => "hdd",
                _ => "lainnya",
            };
            let total = d.total_space();
            let used = total.saturating_sub(d.available_space());
            serde_json::json!({
                "name": name,
                "tipe": tipe,
                "total_gb": (total / 1_073_741_824) as u64,
                "used_gb": (used / 1_073_741_824) as u64,
                "free_gb": (d.available_space() / 1_073_741_824) as u64,
                "smart": smart.get(&letter).cloned().unwrap_or_default(),
            })
        })
        // Buang drive virtual/wsl/recovery yang berulang
        .filter(|v| v["total_gb"].as_u64().unwrap_or(0) > 0 && !v["name"].as_str().unwrap_or("").starts_with("\\\\?\\"))
        .collect();

    let ram_gb = sys.total_memory() / (1024 * 1024 * 1024);

    Ok(serde_json::json!({
        "hostname": gethostname::gethostname().into_string().unwrap_or_default(),
        "cpu_model": cpu_model,
        "ram_gb": ram_gb,
        "gpu_model": get_gpu_model(),
        "os_name": os_name,
        "disks": disks_json,
    }))
}

/// SMART health per drive letter (Windows via wmic; Get-PhysicalDisk butuh admin).
/// Return map "C:" -> {health, operational}. Linux: kosong (frontend pakai usage %).
#[cfg(windows)]
fn get_disk_smart() -> std::collections::HashMap<String, serde_json::Value> {
    use std::process::Command;
    let mut map = std::collections::HashMap::new();

    // Status per disk index: "0" -> "OK"
    let mut disk_status: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    let out = Command::new("wmic")
        .args(["path", "Win32_DiskDrive", "get", "Index,Status", "/format:list"])
        .output();
    if let Ok(out) = out {
        let txt = String::from_utf8_lossy(&out.stdout);
        let mut cur_idx: Option<String> = None;
        for line in txt.lines() {
            let line = line.trim();
            if let Some(v) = line.strip_prefix("Index=") {
                cur_idx = Some(v.trim().to_string());
            } else if let Some(v) = line.strip_prefix("Status=") {
                if let Some(idx) = cur_idx.take() {
                    disk_status.insert(idx, v.trim().to_string());
                }
            }
        }
    }

    // Map drive letter -> disk index lewat LogicalDiskToPartition
    let out = Command::new("wmic")
        .args(["path", "Win32_LogicalDiskToPartition", "get", "Antecedent,Dependent", "/format:list"])
        .output();
    let Ok(out) = out else { return map; };
    let txt = String::from_utf8_lossy(&out.stdout);
    let mut cur_ant: Option<String> = None;
    for line in txt.lines() {
        let line = line.trim();
        if let Some(v) = line.strip_prefix("Antecedent=") {
            cur_ant = Some(v.to_string());
        } else if let Some(v) = line.strip_prefix("Dependent=") {
            if let Some(ant) = cur_ant.take() {
                // Antecedent: ...Win32_DiskPartition.DeviceID="Disk #0, Partition #1"
                // Dependent:  ...Win32_LogicalDisk.DeviceID="C:"
                let disk_idx = match ant.split("Disk #").nth(1) {
                    Some(s) => s.split(',').next().unwrap_or("").trim().to_string(),
                    None => continue,
                };
                let letter = match v.split("DeviceID=\"").nth(1) {
                    Some(s) => s.split('"').next().unwrap_or("").trim().to_string(),
                    None => continue,
                };
                if let Some(status) = disk_status.get(&disk_idx) {
                    let health = if status.eq_ignore_ascii_case("OK") {
                        "Healthy"
                    } else {
                        status.as_str()
                    };
                    map.insert(
                        letter,
                        serde_json::json!({ "health": health, "operational": status }),
                    );
                }
            }
        }
    }
    map
}

#[cfg(not(windows))]
fn get_disk_smart() -> std::collections::HashMap<String, serde_json::Value> {
    std::collections::HashMap::new()
}
