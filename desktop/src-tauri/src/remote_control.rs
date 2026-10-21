use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

macro_rules! log_info {
    ($($arg:tt)*) => { eprintln!("[remote] {}", format!($($arg)*)) };
}

// ---------------------------------------------------------------------------
// Signaling message (dikirim melalui WebSocket /ws channel `remote:{deviceId}`)
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

// ---------------------------------------------------------------------------
// State: manajemen sesi remote yang sedang berjalan di agent
// ---------------------------------------------------------------------------

pub struct RemoteSession {
    pub session_id: String,
    pub device_id: String,
    pub agent_name: String,
}

pub struct RemoteControlState {
    sessions: Mutex<HashMap<String, RemoteSession>>,
}

impl RemoteControlState {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }
}

// ---------------------------------------------------------------------------
// Tauri Commands
// ---------------------------------------------------------------------------

/// Dipanggil oleh frontend saat menerima permintaan remote dari admin.
/// Menerima atau menolak.
#[tauri::command]
pub async fn remote_respond(
    app: AppHandle,
    state: State<'_, RemoteControlState>,
    session_id: String,
    accept: bool,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    if let Some(_session) = sessions.get_mut(&session_id) {
        if accept {
            log_info!("session {} diterima oleh user", session_id);
        } else {
            log_info!("session {} ditolak oleh user", session_id);
            sessions.remove(&session_id);
        }
        let _ = app.emit("remote-session-changed", json!({
            "session_id": session_id,
            "status": if accept { "active" } else { "rejected" },
        }));
        Ok(())
    } else {
        Err(format!("Session {} tidak ditemukan", session_id))
    }
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
        let _ = app.emit("remote-session-changed", json!({
            "session_id": session_id,
            "status": "ended",
        }));
        Ok(())
    } else {
        Err(format!("Session {} tidak ditemukan", session_id))
    }
}

/// Dipanggil oleh listener WS saat menerima sinyal remote untuk device ini
pub fn handle_remote_signal(
    _state: State<'_, RemoteControlState>,
    _device_id: String,
    _signal: RemoteSignal,
) -> Result<(), String> {
    // WebRTC signaling akan diimplementasikan saat crate WebRTC tersedia
    Ok(())
}
