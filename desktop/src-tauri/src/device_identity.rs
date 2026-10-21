use serde::Serialize;
use serde_json::json;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

/// Identitas device: device_id + device_secret.
///
/// ponytail: DULU disimpan di localStorage — tapi tiap window WebView punya
/// localStorage sendiri (origin berbeda: tauri:// vs http:// dev server),
/// jadi pet overlay & window mini bisa punya device_id BERBEDA. Akibatnya
/// device terdaftar di server tidak cocok dengan yang dipakai WS subscribe.
/// Sekarang disimpan di store.bin (Rust) yang dipakai semua window.
#[derive(Debug, Serialize)]
pub struct DeviceIdentity {
    pub device_id: String,
    pub device_secret: String,
}

const STORE_FILE: &str = "store.bin";
const KEY_DEVICE_ID: &str = "device_id";
const KEY_DEVICE_SECRET: &str = "device_secret";

/// Ambil identitas device; buat bila belum ada.
///
/// `existing_device_id` dipakai untuk migrasi: nilai dari localStorage lama
/// (yang sudah punya riwayat tiket) dipertahankan, bukan diganti UUID baru.
#[tauri::command]
pub async fn get_device_identity(
    app: AppHandle,
    existing_device_id: Option<String>,
) -> Result<DeviceIdentity, String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;

    let stored_id = store
        .get(KEY_DEVICE_ID)
        .and_then(|v| v.as_str().map(|s| s.to_string()));
    let stored_secret = store
        .get(KEY_DEVICE_SECRET)
        .and_then(|v| v.as_str().map(|s| s.to_string()));

    let device_id = match stored_id.clone() {
        Some(id) if !id.is_empty() => id,
        _ => match existing_device_id.filter(|s| !s.is_empty()) {
            Some(id) => id,
            None => uuid::Uuid::new_v4().to_string(),
        },
    };

    let device_secret = match stored_secret.clone() {
        Some(s) if !s.is_empty() => s,
        _ => {
            let mut buf = [0u8; 32];
            getrandom::getrandom(&mut buf).map_err(|e| format!("gagal generate secret: {}", e))?;
            buf.iter().map(|b| format!("{:02x}", b)).collect()
        }
    };

    if stored_id.as_deref() != Some(device_id.as_str()) {
        store.set(KEY_DEVICE_ID, json!(device_id));
    }
    if stored_secret.as_deref() != Some(device_secret.as_str()) {
        store.set(KEY_DEVICE_SECRET, json!(device_secret));
    }
    store.save().map_err(|e| format!("gagal simpan store: {}", e))?;

    Ok(DeviceIdentity {
        device_id,
        device_secret,
    })
}
