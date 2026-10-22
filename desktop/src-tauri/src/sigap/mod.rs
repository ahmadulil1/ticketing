pub mod client;
pub mod consts;
pub mod creds;
pub mod notify;
#[cfg(test)]
mod tests;

use std::collections::{HashSet, VecDeque};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_store::StoreExt;

use client::{ApiError, MeDevice, MeUser, NotificationItem, SigapHttp, TokenResponse};
use consts::*;

/// Status sesi SIGAP yang ditampilkan di UI.
#[derive(Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SigapStatus {
    /// Belum pernah terhubung.
    Disconnected,
    /// Menunggu persetujuan perangkat di browser.
    Pairing,
    /// Terhubung, access token hidup.
    Connected,
    /// Sesi dicabut / kedaluwarsa / perlu pairing ulang.
    Expired,
}

#[derive(Clone)]
pub struct Account {
    /// Hanya di memori Rust. Neverdis ke frontend.
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: i64,
    pub user_id: String,
}

pub struct PendingPairing {
    pub user_code: String,
    pub verification_uri: String,
    pub expires_at: i64,
}

#[derive(Serialize, Clone)]
pub struct SigapStateView {
    pub status: SigapStatus,
    pub user_name: Option<String>,
    pub device_name: Option<String>,
    pub user_code: Option<String>,
    pub verification_uri: Option<String>,
    pub expires_in: Option<i64>,
    pub permission_granted: bool,
    pub detail_enabled: bool,
    pub unread: usize,
    pub last_sync: Option<i64>,
    pub last_error: Option<String>,
    pub online: bool,
    pub device_name_host: String,
}

struct Inner {
    status: SigapStatus,
    account: Option<Account>,
    pending: Option<PendingPairing>,
    inbox: Vec<NotificationItem>,
    seen: HashSet<String>,
    seen_order: VecDeque<String>,
    baseline_done: bool,
    last_sync: Option<i64>,
    last_error: Option<String>,
    detail_enabled: bool,
    permission_granted: bool,
    /// Loop polling notifikasi sedang jalan.
    notify_running: bool,
    /// Server terakhir bisa dihubungi.
    online: bool,
    /// Interval polling notifikasi (detik), dari server atau default 30.
    poll_interval: u64,
    user: Option<MeUser>,
    device: Option<MeDevice>,
}

impl Inner {
    fn new() -> Self {
        Self {
            status: SigapStatus::Disconnected,
            account: None,
            pending: None,
            inbox: Vec::new(),
            seen: HashSet::new(),
            seen_order: VecDeque::new(),
            baseline_done: false,
            last_sync: None,
            last_error: None,
            detail_enabled: false,
            permission_granted: false,
            notify_running: false,
            online: false,
            poll_interval: DEFAULT_POLL_INTERVAL,
            user: None,
            device: None,
        }
    }
}

pub struct SigapState {
    inner: Mutex<Inner>,
    /// Single-flight: hanya satu refresh yang jalan pada satu waktu.
    refresh_lock: tokio::sync::Mutex<()>,
    /// Task polling notifikasi (satu per akun, bukan per window).
    notify_task: Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,
    /// Batalkan proses pairing yang sedang berjalan.
    pub pairing_cancel: AtomicBool,
}

impl SigapState {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(Inner::new()),
            refresh_lock: tokio::sync::Mutex::new(()),
            notify_task: Mutex::new(None),
            pairing_cancel: AtomicBool::new(false),
        }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }
}

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Verifier acak 43 karakter URL-safe (kontrak: 43-128 karakter).
fn random_verifier() -> String {
    let mut buf = [0u8; 32];
    getrandom::getrandom(&mut buf).expect("getrandom gagal");
    URL_SAFE_NO_PAD.encode(buf)
}

/// S256: BASE64URL_NO_PAD(SHA256(verifier)).
fn code_challenge(verifier: &str) -> String {
    let digest = Sha256::digest(verifier.as_bytes());
    URL_SAFE_NO_PAD.encode(digest)
}

/// Hostname sebagai nama tampilan; bukan identitas unik.
pub fn device_name() -> String {
    let raw = gethostname::gethostname().to_string_lossy().to_string();
    let clean: String = raw
        .chars()
        .filter(|c| !c.is_control())
        .take(100)
        .collect::<String>()
        .trim()
        .to_string();
    if clean.is_empty() {
        "Perangkat".to_string()
    } else {
        clean
    }
}

fn platform() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else {
        "macos"
    }
}

/// Installation UUID persisten per pengguna OS (identitas instalasi).
pub fn installation_id(app: &AppHandle) -> Result<String, String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    if let Some(v) = store
        .get(KEY_INSTALLATION_ID)
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .filter(|s| !s.is_empty())
    {
        return Ok(v);
    }
    let id = uuid::Uuid::new_v4().to_string();
    store.set(KEY_INSTALLATION_ID, serde_json::json!(id));
    store.save().map_err(|e| e.to_string())?;
    Ok(id)
}

/// Validasi `verification_uri` dari server: HTTPS, host staging persis,
/// path `/desktop/authorize`, dan query `request` berisi UUID.
pub fn validate_verification_uri(uri: &str) -> bool {
    let parsed = match reqwest::Url::parse(uri) {
        Ok(u) => u,
        Err(_) => return false,
    };
    if parsed.scheme() != "https" || parsed.host_str() != Some(ORIGIN_HOST) {
        return false;
    }
    if !parsed.path().starts_with("/desktop/authorize") {
        return false;
    }
    parsed
        .query_pairs()
        .any(|(k, v)| k == "request" && uuid::Uuid::parse_str(&v).is_ok())
}

/// Validasi `path` notifikasi: relatif, tanpa `..`, tanpa kontrol karakter.
pub fn validate_path(path: &str) -> Option<String> {
    let p = path.trim();
    if p.is_empty() || !p.starts_with('/') || p.starts_with("//") {
        return None;
    }
    if p.contains("..") || p.chars().any(|c| c.is_control()) {
        return None;
    }
    if p.len() > 512 {
        return None;
    }
    Some(p.to_string())
}

/// Cek apakah server staging terjangkau. Response HTTP apa pun (mis. 401)
/// berarti server hidup; error jaringan berarti offline.
pub async fn server_reachable() -> bool {
    match SigapHttp::new() {
        Ok(http) => http.reachable().await,
        Err(_) => false,
    }
}

// ---------------------------------------------------------------- state view

pub fn build_view(app: &AppHandle) -> SigapStateView {
    let st = app.state::<SigapState>();
    let inner = st.lock();
    let unread = inner.inbox.iter().filter(|i| i.unread()).count();
    SigapStateView {
        status: inner.status,
        user_name: inner
            .user
            .as_ref()
            .and_then(|u| u.full_name.clone())
            .or_else(|| inner.user.as_ref().map(|u| u.id.clone())),
        device_name: inner.device.as_ref().and_then(|d| d.name.clone()),
        user_code: inner.pending.as_ref().map(|p| p.user_code.clone()),
        verification_uri: inner.pending.as_ref().map(|p| p.verification_uri.clone()),
        expires_in: inner
            .pending
            .as_ref()
            .map(|p| (p.expires_at - now_secs()).max(0)),
        permission_granted: inner.permission_granted,
        detail_enabled: inner.detail_enabled,
        unread,
        last_sync: inner.last_sync,
        last_error: inner.last_error.clone(),
        online: inner.online,
        device_name_host: device_name(),
    }
}

pub fn emit_state(app: &AppHandle) {
    let view = build_view(app);
    let _ = app.emit("sigap-state", view);
}

// ------------------------------------------------------------------ storage

const STORE_FILE: &str = "store.bin";
const KEY_INSTALLATION_ID: &str = "sigap_installation_id";
const KEY_DETAIL: &str = "sigap_detail_enabled";
const KEY_SEEN_PREFIX: &str = "sigap_seen:";
const KEY_BASELINE_PREFIX: &str = "sigap_baseline:";

fn load_detail_pref(app: &AppHandle) -> bool {
    app.store(STORE_FILE)
        .ok()
        .and_then(|s| s.get(KEY_DETAIL).and_then(|v| v.as_bool()))
        .unwrap_or(false)
}

fn save_detail_pref(app: &AppHandle, value: bool) {
    if let Ok(store) = app.store(STORE_FILE) {
        store.set(KEY_DETAIL, serde_json::json!(value));
        let _ = store.save();
    }
}

/// Seen-ID per origin/user, urut lama -> baru (dipakai saat trim).
fn load_seen(app: &AppHandle, user_id: &str) -> VecDeque<String> {
    let key = format!("{}{}", KEY_SEEN_PREFIX, user_id);
    let arr = app
        .store(STORE_FILE)
        .ok()
        .and_then(|s| s.get(&key).and_then(|v| v.as_array().cloned()))
        .unwrap_or_default();
    arr.into_iter()
        .filter_map(|v| v.as_str().map(|s| s.to_string()))
        .collect()
}

fn save_seen(app: &AppHandle, user_id: &str, order: &VecDeque<String>) {
    let key = format!("{}{}", KEY_SEEN_PREFIX, user_id);
    let arr: Vec<serde_json::Value> = order
        .iter()
        .map(|s| serde_json::json!(s))
        .collect();
    if let Ok(store) = app.store(STORE_FILE) {
        store.set(&key, serde_json::json!(arr));
        let _ = store.save();
    }
}

fn baseline_done(app: &AppHandle, user_id: &str) -> bool {
    let key = format!("{}{}", KEY_BASELINE_PREFIX, user_id);
    app.store(STORE_FILE)
        .ok()
        .and_then(|s| s.get(&key).and_then(|v| v.as_bool()))
        .unwrap_or(false)
}

fn set_baseline_done(app: &AppHandle, user_id: &str) {
    let key = format!("{}{}", KEY_BASELINE_PREFIX, user_id);
    if let Ok(store) = app.store(STORE_FILE) {
        store.set(&key, serde_json::json!(true));
        let _ = store.save();
    }
}

// ------------------------------------------------------------------ session

/// Simpan hasil pairing: token hanya di memori, refresh token di keyring.
fn store_session(app: &AppHandle, token: TokenResponse) -> Result<Account, String> {
    // Refresh token wajib tersimpan dulu; kalau gagal, sesi tak bisa dilanjutkan
    // setelah restart dan tak aman untuk dicoba ulang.
    creds::save_refresh_token(&token.refresh_token)?;
    let account = Account {
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        expires_at: now_secs() + token.expires_in.max(60),
        user_id: token.user_id.clone().unwrap_or_default(),
    };
    let st = app.state::<SigapState>();
    {
        let mut inner = st.lock();
        inner.account = Some(account.clone());
        inner.status = SigapStatus::Connected;
        inner.last_error = None;
        inner.baseline_done = baseline_done(app, &account.user_id);
        let order = load_seen(app, &account.user_id);
        inner.seen = order.iter().cloned().collect();
        inner.seen_order = order;
    }
    Ok(account)
}

/// Hapus sesi lokal: token, keyring, cache akun.
fn clear_session(app: &AppHandle) {
    creds::delete_refresh_token();
    let st = app.state::<SigapState>();
    {
        let mut inner = st.lock();
        inner.account = None;
        inner.pending = None;
        inner.user = None;
        inner.device = None;
        inner.inbox.clear();
        inner.seen.clear();
        inner.seen_order.clear();
        inner.baseline_done = false;
        inner.status = SigapStatus::Disconnected;
        inner.last_error = None;
    }
}

/// Pastikan access token valid; refresh bila perlu (single-flight).
pub async fn ensure_access_token(app: &AppHandle) -> Result<String, ApiError> {
    let st = app.state::<SigapState>();
    {
        let inner = st.lock();
        match &inner.account {
            None => return Err(ApiError::Unauthorized("Belum terhubung ke SIGAP".into())),
            Some(acc) => {
                if acc.expires_at - now_secs() > REFRESH_MARGIN_SECS {
                    return Ok(acc.access_token.clone());
                }
            }
        }
    }

    // Single-flight: satu refresh pada satu waktu.
    let _guard = st.refresh_lock.lock().await;

    // Setelah dapat lock, mungkin task lain sudah me-refresh.
    {
        let inner = st.lock();
        if let Some(acc) = &inner.account {
            if acc.expires_at - now_secs() > REFRESH_MARGIN_SECS {
                return Ok(acc.access_token.clone());
            }
        } else {
            return Err(ApiError::Unauthorized("Belum terhubung ke SIGAP".into()));
        }
    }

    // Server tak terjangkau: jangan sentuh refresh token (hasil tak pasti).
    if !server_reachable().await {
        return Err(ApiError::Network("Server SIGAP tak terjangkau".into()));
    }

    let current_refresh = {
        let inner = st.lock();
        match &inner.account {
            Some(acc) => acc.refresh_token.clone(),
            None => return Err(ApiError::Unauthorized("Belum terhubung ke SIGAP".into())),
        }
    };

    let http = SigapHttp::new().map_err(ApiError::Network)?;
    let result = http.refresh_token(&current_refresh).await;

    match result {
        Ok(token) => {
            let account = match store_session(app, token) {
                Ok(a) => a,
                Err(e) => {
                    // Token tak bisa dipersist -> sesi tak bisa dilanjutkan.
                    clear_session(app);
                    let _ = e;
                    return Err(ApiError::Invalid(
                        "Refresh token gagal disimpan di penyimpanan aman".into(),
                    ));
                }
            };
            Ok(account.access_token)
        }
        Err(e) if e.is_uncertain() => {
            // Respons hilang: token lama tak boleh dicoba ulang (reuse mencabut sesi).
            clear_session(app);
            emit_state(app);
            Err(ApiError::Unauthorized(
                "Sesi tidak pasti, hubungkan ulang SIGAP".into(),
            ))
        }
        Err(e) => {
            clear_session(app);
            emit_state(app);
            Err(e)
        }
    }
}

/// Ambil profil dari `/api/desktop/me`.
pub async fn load_profile(app: &AppHandle, access_token: &str) {
    let http = match SigapHttp::new() {
        Ok(h) => h,
        Err(_) => return,
    };
    match http.get_me(access_token).await {
        Ok(me) => {
            let st = app.state::<SigapState>();
            let mut inner = st.lock();
            inner.user = me.user;
            inner.device = me.device;
        }
        Err(ApiError::Unauthorized(_)) => {
            clear_session(app);
        }
        Err(_) => {}
    }
}

// ------------------------------------------------------------------ commands

#[tauri::command]
pub async fn sigap_get_state(app: AppHandle) -> Result<SigapStateView, String> {
    Ok(build_view(&app))
}

/// Mulai pairing: buat verifier, challenge, panggil server, tampilkan kode 8 digit.
#[tauri::command]
pub async fn sigap_start_pairing(app: AppHandle) -> Result<SigapStateView, String> {
    let st = app.state::<SigapState>();
    st.pairing_cancel.store(false, Ordering::SeqCst);

    let installation = installation_id(&app)?;
    let name = device_name();
    let verifier = random_verifier();
    let challenge = code_challenge(&verifier);

    let http = SigapHttp::new()?;
    let created = http
        .create_pairing(&installation, &name, platform(), &challenge)
        .await
        .map_err(|e| e.message())?;

    // Verifikasi URI sebelum dibuka di browser sistem.
    if !validate_verification_uri(&created.verification_uri) {
        return Err("verification_uri dari server tidak valid".into());
    }
    let user_code = created.user_code.trim().to_string();
    if user_code.len() != 8 || !user_code.chars().all(|c| c.is_ascii_digit()) {
        return Err("kode persetujuan dari server tidak valid".into());
    }
    let interval = created
        .interval
        .unwrap_or(MIN_TOKEN_POLL_INTERVAL as i64)
        .max(MIN_TOKEN_POLL_INTERVAL as i64) as u64;
    let expires_at = now_secs() + created.expires_in.max(60);

    {
        let mut inner = st.lock();
        inner.status = SigapStatus::Pairing;
        inner.last_error = None;
        inner.pending = Some(PendingPairing {
            user_code: user_code.clone(),
            verification_uri: created.verification_uri.clone(),
            expires_at,
        });
    }
    emit_state(&app);

    // Buka browser sistem untuk persetujuan.
    let uri = created.verification_uri.clone();
    let app_open = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = app_open.opener().open_url(uri, None::<&str>) {
            crate::logging::log(&format!("[sigap] gagal buka browser: {}", e));
        }
    });

    // Poll token di background.
    let app_poll = app.clone();
    tauri::async_runtime::spawn(async move {
        poll_token_until_approved(app_poll, verifier, created.device_code, interval, expires_at)
            .await;
    });

    Ok(build_view(&app))
}

async fn poll_token_until_approved(
    app: AppHandle,
    verifier: String,
    device_code: String,
    interval: u64,
    expires_at: i64,
) {
    let st = app.state::<SigapState>();
    let http = match SigapHttp::new() {
        Ok(h) => h,
        Err(e) => {
            set_error(&app, format!("Klien HTTP gagal: {}", e));
            return;
        }
    };
    loop {
        if st.pairing_cancel.load(Ordering::SeqCst) {
            return;
        }
        tokio::time::sleep(Duration::from_secs(interval)).await;
        if st.pairing_cancel.load(Ordering::SeqCst) {
            return;
        }
        if now_secs() > expires_at {
            set_error(&app, "Kode persetujuan kedaluwarsa, coba lagi".into());
            let mut inner = st.lock();
            inner.status = SigapStatus::Disconnected;
            inner.pending = None;
            emit_state(&app);
            return;
        }
        match http.poll_token(&device_code, &verifier).await {
            Ok(token) => {
                if let Err(e) = store_session(&app, token) {
                    set_error(&app, e);
                    return;
                }
                {
                    let mut inner = st.lock();
                    inner.pending = None;
                }
                let token_now = {
                    let inner = st.lock();
                    inner.account.as_ref().map(|a| a.access_token.clone())
                };
                if let Some(t) = token_now {
                    load_profile(&app, &t).await;
                }
                notify::start(&app);
                emit_state(&app);
                return;
            }
            Err(ApiError::Pending) => continue,
            Err(ApiError::RateLimited { retry_after }) => {
                tokio::time::sleep(Duration::from_secs(retry_after.max(1))).await;
                continue;
            }
            Err(ApiError::Network(e)) => {
                // Server tak terjangkau: coba lagi, jangan habisi token.
                set_error(&app, format!("Menunggu server SIGAP: {}", e));
                continue;
            }
            Err(e) => {
                set_error(&app, e.message());
                let mut inner = st.lock();
                inner.status = SigapStatus::Expired;
                inner.pending = None;
                emit_state(&app);
                return;
            }
        }
    }
}

fn set_error(app: &AppHandle, message: String) {
    let st = app.state::<SigapState>();
    {
        let mut inner = st.lock();
        inner.last_error = Some(message);
    }
    emit_state(app);
}

/// Buka lagi halaman persetujuan di browser sistem (URI divalidasi ulang).
#[tauri::command]
pub async fn sigap_open_authorize(app: AppHandle) -> Result<(), String> {
    let uri = {
        let st = app.state::<SigapState>();
        let inner = st.lock();
        inner.pending.as_ref().map(|p| p.verification_uri.clone())
    };
    let uri = uri.ok_or("Tidak ada permintaan persetujuan yang aktif")?;
    if !validate_verification_uri(&uri) {
        return Err("URI persetujuan tidak valid".into());
    }
    app.opener()
        .open_url(uri, None::<&str>)
        .map_err(|e| e.to_string())
}

/// Batalkan pairing yang sedang berjalan.
#[tauri::command]
pub async fn sigap_cancel_pairing(app: AppHandle) -> Result<SigapStateView, String> {
    let st = app.state::<SigapState>();
    st.pairing_cancel.store(true, Ordering::SeqCst);
    {
        let mut inner = st.lock();
        inner.pending = None;
        inner.status = SigapStatus::Disconnected;
    }
    emit_state(&app);
    Ok(build_view(&app))
}

/// Logout: cabut sesi desktop di server, hapus credential lokal & cache akun.
#[tauri::command]
pub async fn sigap_logout(app: AppHandle) -> Result<SigapStateView, String> {
    notify::stop(&app);
    // Cabut di server dulu (kalau online); lokal tetap dibersihkan apa pun hasilnya.
    let token = {
        let st = app.state::<SigapState>();
        let inner = st.lock();
        inner.account.as_ref().map(|a| a.access_token.clone())
    };
    if let Some(token) = token {
        if let Ok(http) = SigapHttp::new() {
            let _ = http.logout(&token).await;
        }
    }
    clear_session(&app);
    emit_state(&app);
    Ok(build_view(&app))
}

/// Ambil inbox notifikasi terbaru (dari cache Rust, refresh dari server).
#[tauri::command]
pub async fn sigap_fetch_notifications(app: AppHandle) -> Result<Vec<NotificationItem>, String> {
    // Offline tetap menampilkan inbox cache; error disimpan di state.
    let _ = notify::refresh_now(&app).await;
    let st = app.state::<SigapState>();
    let inner = st.lock();
    Ok(inner.inbox.clone())
}

/// Tandai notifikasi dibaca (hanya setelah pengguna membuka/membacanya).
#[tauri::command]
pub async fn sigap_mark_read(app: AppHandle, id: String) -> Result<(), String> {
    notify::mark_read(&app, &id).await
}

/// Buka notifikasi di browser sistem: origin staging + path tervalidasi.
#[tauri::command]
pub async fn sigap_open_notification(app: AppHandle, id: String) -> Result<(), String> {
    let item = {
        let st = app.state::<SigapState>();
        let inner = st.lock();
        inner.inbox.iter().find(|i| i.id == id).cloned()
    };
    let item = match item {
        Some(i) => i,
        None => return Err("Notifikasi tidak ditemukan".into()),
    };
    let target = match item.path.as_deref().and_then(validate_path) {
        Some(p) => format!("{}{}", BASE_URL, p),
        None => BASE_URL.to_string(),
    };
    app.opener()
        .open_url(target, None::<&str>)
        .map_err(|e| e.to_string())?;
    notify::mark_read(&app, &id).await
}

/// Preferensi tampilan notifikasi di layar terkunci (default generik).
#[tauri::command]
pub async fn sigap_set_detail(app: AppHandle, enabled: bool) -> Result<SigapStateView, String> {
    save_detail_pref(&app, enabled);
    {
        let st = app.state::<SigapState>();
        let mut inner = st.lock();
        inner.detail_enabled = enabled;
    }
    emit_state(&app);
    Ok(build_view(&app))
}

/// Minta izin notifikasi OS.
#[tauri::command]
pub async fn sigap_request_permission(app: AppHandle) -> Result<bool, String> {
    let state = app
        .notification()
        .request_permission()
        .map_err(|e| e.to_string())?;
    let granted = matches!(state, tauri::plugin::PermissionState::Granted);
    {
        let st = app.state::<SigapState>();
        let mut inner = st.lock();
        inner.permission_granted = granted;
    }
    emit_state(&app);
    Ok(granted)
}

/// Inisialisasi state SIGAP saat aplikasi start: preferensi detail notifikasi
/// dan status izin notifikasi OS.
pub fn init(app: &AppHandle) {
    let detail = load_detail_pref(app);
    let permission = app
        .notification()
        .permission_state()
        .map(|s| matches!(s, tauri::plugin::PermissionState::Granted))
        .unwrap_or(false);
    let st = app.state::<SigapState>();
    {
        let mut inner = st.lock();
        inner.detail_enabled = detail;
        inner.permission_granted = permission;
    }
}

/// Coba pulihkan sesi dari keyring saat aplikasi start.
pub async fn restore_session(app: AppHandle) {
    let refresh = match creds::load_refresh_token() {
        Some(t) => t,
        None => return,
    };
    if !server_reachable().await {
        // Offline: jangan sentuh refresh token (hasil refresh tak pasti).
        set_error(&app, "Server SIGAP tak terjangkau, coba lagi nanti".into());
        return;
    }
    let http = match SigapHttp::new() {
        Ok(h) => h,
        Err(_) => return,
    };
    match http.refresh_token(&refresh).await {
        Ok(token) => {
            if store_session(&app, token).is_err() {
                clear_session(&app);
                return;
            }
            let token_now = {
                let st = app.state::<SigapState>();
                let inner = st.lock();
                inner.account.as_ref().map(|a| a.access_token.clone())
            };
            if let Some(t) = token_now {
                load_profile(&app, &t).await;
            }
            notify::start(&app);
            emit_state(&app);
        }
        Err(e) if e.is_uncertain() => {
            // Refresh dijawab server tapi respons hilang -> sesi dicabut, pairing ulang.
            clear_session(&app);
            set_error(&app, "Sesi SIGAP tidak pasti, hubungkan ulang".into());
        }
        Err(_) => {
            clear_session(&app);
            emit_state(&app);
        }
    }
}
