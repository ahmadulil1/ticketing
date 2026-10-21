use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

macro_rules! log_info {
    ($($arg:tt)*) => { eprintln!("[remote] {}", format!($($arg)*)) };
}

// ---------------------------------------------------------------------------
// State: manajemen sesi remote yang aktif di agent (desktop)
// ---------------------------------------------------------------------------

pub struct RemoteSession {
    pub session_id: String,
    pub device_id: String,
    pub agent_name: String,
    /// Ukuran layar asli (px) saat capture terakhir. Dipakai untuk
    /// memetakan koordinat ternormalisasi (0..1) dari viewer ke absolut.
    pub screen_w: f64,
    pub screen_h: f64,
}

pub struct RemoteControlState {
    pub(crate) sessions: Mutex<HashMap<String, RemoteSession>>,
}

impl RemoteControlState {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }

    pub fn has_session(&self, session_id: &str) -> bool {
        self.sessions.lock().unwrap().contains_key(session_id)
    }

    /// Simpan ukuran layar hasil capture terakhir (untuk pemetaan koordinat).
    pub fn set_screen_size(&self, session_id: &str, w: f64, h: f64) {
        if let Some(s) = self.sessions.lock().unwrap().get_mut(session_id) {
            s.screen_w = w;
            s.screen_h = h;
        }
    }

    /// Ambil ukuran layar aktif untuk session (fallback 1920x1080).
    pub fn screen_size(&self, session_id: &str) -> (f64, f64) {
        let sessions = self.sessions.lock().unwrap();
        match sessions.get(session_id) {
            Some(s) if s.screen_w > 0.0 && s.screen_h > 0.0 => (s.screen_w, s.screen_h),
            _ => (1920.0, 1080.0),
        }
    }
}

// ---------------------------------------------------------------------------
// Tauri Commands
// ---------------------------------------------------------------------------

/// Dipanggil oleh frontend saat menerima permintaan remote dari admin.
/// Menerima atau menolak. Saat diterima, session ditambahkan ke state lokal.
#[tauri::command]
pub async fn remote_respond(
    app: AppHandle,
    state: State<'_, RemoteControlState>,
    session_id: String,
    device_id: String,
    agent_name: String,
    accept: bool,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    if accept {
        sessions.insert(
            session_id.clone(),
            RemoteSession {
                session_id: session_id.clone(),
                device_id,
                agent_name,
                screen_w: 0.0,
                screen_h: 0.0,
            },
        );
        log_info!("session {} diterima dan diaktifkan", session_id);
    } else {
        sessions.remove(&session_id);
        log_info!("session {} ditolak", session_id);
    }
    drop(sessions);
    let _ = app.emit("remote-session-changed", json!({
        "session_id": session_id,
        "status": if accept { "active" } else { "rejected" },
    }));
    Ok(())
}

/// Agent mengakhiri sesi remote
#[tauri::command]
pub async fn remote_end_session(
    app: AppHandle,
    state: State<'_, RemoteControlState>,
    session_id: String,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    if sessions.remove(&session_id).is_some() {
        log_info!("session {} diakhiri", session_id);
        drop(sessions);
        let _ = app.emit("remote-session-changed", json!({
            "session_id": session_id,
            "status": "ended",
        }));
        Ok(())
    } else {
        Err(format!("Session {} tidak ditemukan", session_id))
    }
}

/// Cek apakah session masih aktif (digunakan sebelum capture/inject)
#[tauri::command]
pub async fn remote_is_active(
    state: State<'_, RemoteControlState>,
    session_id: String,
) -> Result<bool, String> {
    let sessions = state.sessions.lock().unwrap();
    Ok(sessions.contains_key(&session_id))
}

// ---------------------------------------------------------------------------
// Placeholder WebRTC signal handler (untuk keperluan P2P di masa depan)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum RemoteSignal {
    Offer { sdp: String },
    Answer { sdp: String },
    IceCandidate {
        candidate: String,
        sdp_mid: Option<String>,
        sdp_mline_index: Option<u32>,
    },
    End,
    Ping,
    Pong,
}

pub fn handle_remote_signal(
    _state: State<'_, RemoteControlState>,
    _device_id: String,
    _signal: RemoteSignal,
) -> Result<(), String> {
    Ok(())
}
