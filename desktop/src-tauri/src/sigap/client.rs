use std::time::Duration;

use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};

use super::consts::{BASE_URL, CLIENT_ID};

/// Kesalahan API SIGAP yang perlu ditangani berbeda di lapisan atas.
#[derive(Debug, Clone)]
pub enum ApiError {
    /// 401 -> sesi tidak valid / kedaluwarsa / dicabut.
    Unauthorized(String),
    /// 202 authorization_pending -> pairing masih menunggu persetujuan.
    Pending,
    /// 429 slow_down -> tunggu sebentar lalu ulangi.
    RateLimited { retry_after: u64 },
    /// 4xx/5xx lain.
    Http(u16, String),
    /// Gagal jaringan / timeout. Untuk refresh: hasil tidak pasti.
    Network(String),
    /// Respons tak bisa dibaca atau tidak sesuai kontrak.
    Invalid(String),
}

impl ApiError {
    pub fn message(&self) -> String {
        match self {
            ApiError::Unauthorized(m) => m.clone(),
            ApiError::Pending => "Persetujuan perangkat masih pending".into(),
            ApiError::RateLimited { retry_after } => {
                format!("Terlalu banyak permintaan, coba lagi dalam {} detik", retry_after)
            }
            ApiError::Http(code, m) => format!("HTTP {}: {}", code, m),
            ApiError::Network(m) => format!("Koneksi gagal: {}", m),
            ApiError::Invalid(m) => m.clone(),
        }
    }

    /// Refresh token yang gagal karena jaringan berarti hasilnya tidak pasti:
    /// token lama tak boleh dicoba ulang (reuse mencabut sesi).
    pub fn is_uncertain(&self) -> bool {
        matches!(self, ApiError::Network(_))
    }
}

/// Klien HTTP SIGAP.
///
/// Base URL dikunci saat pembuatan: produksi hanya bisa ke origin staging,
/// tes bisa memakai mock server lokal.
pub struct SigapHttp {
    client: Client,
    base: String,
}

impl SigapHttp {
    /// Klien produksi: origin staging, tanpa mengikuti redirect, tanpa cookie.
    pub fn new() -> Result<Self, String> {
        Ok(Self {
            client: build_client()?,
            base: BASE_URL.to_string(),
        })
    }

    #[cfg(test)]
    pub fn with_base(base: &str) -> Result<Self, String> {
        Ok(Self {
            client: build_client()?,
            base: base.trim_end_matches('/').to_string(),
        })
    }

    fn url(&self, path: &str) -> String {
        format!("{}{}", self.base, path)
    }

    /// Cek apakah server hidup: respons HTTP apa pun (mis. 401) berarti hidup,
    /// error jaringan berarti offline.
    pub async fn reachable(&self) -> bool {
        self.client
            .get(self.url("/api/desktop/me"))
            .timeout(Duration::from_secs(8))
            .send()
            .await
            .is_ok()
    }

    pub async fn create_pairing(
        &self,
        installation_id: &str,
        device_name: &str,
        platform: &'static str,
        code_challenge: &str,
    ) -> Result<PairingCreated, ApiError> {
        let payload = PairingRequest {
            client_id: CLIENT_ID,
            installation_id: installation_id.to_string(),
            device_name: device_name.to_string(),
            platform,
            code_challenge: code_challenge.to_string(),
            code_challenge_method: "S256",
        };
        let resp = self
            .client
            .post(self.url("/api/desktop/pairings"))
            .header("Cache-Control", "no-store")
            .json(&payload)
            .send()
            .await
            .map_err(|e| ApiError::Network(e.to_string()))?;
        let status = resp.status();
        if !status.is_success() {
            return Err(map_status(status, body_text(resp).await, None));
        }
        resp.json::<PairingCreated>()
            .await
            .map_err(|e| ApiError::Invalid(format!("Respons pairing tidak valid: {}", e)))
    }

    pub async fn poll_token(
        &self,
        device_code: &str,
        code_verifier: &str,
    ) -> Result<TokenResponse, ApiError> {
        let resp = self
            .client
            .post(self.url("/api/desktop/token"))
            .header("Cache-Control", "no-store")
            .json(&TokenRequest {
                client_id: CLIENT_ID,
                device_code,
                code_verifier,
            })
            .send()
            .await
            .map_err(|e| ApiError::Network(e.to_string()))?;
        let status = resp.status();
        if status == StatusCode::ACCEPTED {
            return Err(ApiError::Pending);
        }
        if status == StatusCode::TOO_MANY_REQUESTS {
            return Err(ApiError::RateLimited {
                retry_after: read_retry_after(&resp).unwrap_or(5),
            });
        }
        if !status.is_success() {
            return Err(map_status(status, body_text(resp).await, None));
        }
        resp.json::<TokenResponse>()
            .await
            .map_err(|e| ApiError::Invalid(format!("Respons token tidak valid: {}", e)))
    }

    pub async fn refresh_token(&self, refresh: &str) -> Result<TokenResponse, ApiError> {
        let resp = self
            .client
            .post(self.url("/api/desktop/refresh"))
            .header("Cache-Control", "no-store")
            .json(&RefreshRequest {
                client_id: CLIENT_ID,
                refresh_token: refresh,
            })
            .send()
            .await
            .map_err(|e| ApiError::Network(e.to_string()))?;
        let status = resp.status();
        if !status.is_success() {
            return Err(map_status(status, body_text(resp).await, None));
        }
        resp.json::<TokenResponse>()
            .await
            .map_err(|e| ApiError::Invalid(format!("Respons refresh tidak valid: {}", e)))
    }

    pub async fn get_me(&self, access_token: &str) -> Result<MeResponse, ApiError> {
        let resp = self
            .client
            .get(self.url("/api/desktop/me"))
            .header("Cache-Control", "no-store")
            .bearer_auth(access_token)
            .send()
            .await
            .map_err(|e| ApiError::Network(e.to_string()))?;
        let status = resp.status();
        if !status.is_success() {
            return Err(map_status(status, body_text(resp).await, None));
        }
        resp.json::<MeResponse>()
            .await
            .map_err(|e| ApiError::Invalid(format!("Respons profil tidak valid: {}", e)))
    }

    pub async fn get_notifications(
        &self,
        access_token: &str,
        before: Option<&str>,
    ) -> Result<NotificationsPage, ApiError> {
        let mut req = self
            .client
            .get(self.url("/api/desktop/notifications"))
            .header("Cache-Control", "no-store")
            .bearer_auth(access_token);
        if let Some(cursor) = before.filter(|c| !c.is_empty()) {
            req = req.query(&[("before", cursor)]);
        }
        let resp = req.send().await.map_err(|e| ApiError::Network(e.to_string()))?;
        let status = resp.status();
        if !status.is_success() {
            return Err(map_status(status, body_text(resp).await, None));
        }
        resp.json::<NotificationsPage>()
            .await
            .map_err(|e| ApiError::Invalid(format!("Respons notifikasi tidak valid: {}", e)))
    }

    pub async fn mark_read(&self, access_token: &str, id: &str) -> Result<(), ApiError> {
        let resp = self
            .client
            .post(self.url(&format!("/api/desktop/notifications/{}/read", id)))
            .header("Cache-Control", "no-store")
            .bearer_auth(access_token)
            .send()
            .await
            .map_err(|e| ApiError::Network(e.to_string()))?;
        let status = resp.status();
        if !status.is_success() {
            return Err(map_status(status, body_text(resp).await, None));
        }
        Ok(())
    }

    pub async fn logout(&self, access_token: &str) -> Result<(), ApiError> {
        let resp = self
            .client
            .post(self.url("/api/desktop/logout"))
            .header("Cache-Control", "no-store")
            .bearer_auth(access_token)
            .send()
            .await
            .map_err(|e| ApiError::Network(e.to_string()))?;
        let status = resp.status();
        if !status.is_success() {
            return Err(map_status(status, body_text(resp).await, None));
        }
        Ok(())
    }
}

fn build_client() -> Result<Client, String> {
    // reqwest dibangun dengan "rustls-no-provider" -> provider crypto wajib
    // di-install sebelum Client dibuat (idempotent).
    let _ = rustls::crypto::ring::default_provider().install_default();
    Client::builder()
        // Kontrak: jangan ikuti redirect lintas origin yang membawa kredensial.
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(20))
        .connect_timeout(Duration::from_secs(10))
        .user_agent(concat!("TicketingDesktop/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| e.to_string())
}

async fn body_text(resp: reqwest::Response) -> String {
    resp.text().await.unwrap_or_default()
}

fn map_status(status: StatusCode, body: String, retry_after: Option<u64>) -> ApiError {
    match status {
        StatusCode::UNAUTHORIZED => ApiError::Unauthorized(truncate(&body, 200)),
        StatusCode::TOO_MANY_REQUESTS => {
            ApiError::RateLimited { retry_after: retry_after.unwrap_or(5) }
        }
        s => ApiError::Http(s.as_u16(), truncate(&body, 200)),
    }
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        return s.to_string();
    }
    let mut end = max;
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}...", &s[..end])
}

fn read_retry_after(resp: &reqwest::Response) -> Option<u64> {
    resp.headers()
        .get(reqwest::header::RETRY_AFTER)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<u64>().ok())
}

// ---------- Pairing ----------

#[derive(Debug, Serialize)]
pub struct PairingRequest {
    pub client_id: &'static str,
    pub installation_id: String,
    pub device_name: String,
    pub platform: &'static str,
    pub code_challenge: String,
    pub code_challenge_method: &'static str,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PairingCreated {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    #[serde(default)]
    pub expires_in: i64,
    #[serde(default)]
    pub interval: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct TokenRequest<'a> {
    pub client_id: &'static str,
    pub device_code: &'a str,
    pub code_verifier: &'a str,
}

#[derive(Debug, Serialize)]
pub struct RefreshRequest<'a> {
    pub client_id: &'static str,
    pub refresh_token: &'a str,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TokenResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: i64,
    #[serde(default)]
    pub user_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MeResponse {
    #[serde(default)]
    pub user: Option<MeUser>,
    #[serde(default)]
    pub device: Option<MeDevice>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MeUser {
    pub id: String,
    #[serde(default)]
    pub full_name: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MeDevice {
    #[serde(default)]
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotificationItem {
    pub id: String,
    #[serde(rename = "type", default)]
    pub kind: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub message: Option<String>,
    #[serde(default)]
    pub is_read: Option<bool>,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub read_at: Option<String>,
    #[serde(default)]
    pub path: Option<String>,
}

impl NotificationItem {
    pub fn unread(&self) -> bool {
        !self.is_read.unwrap_or(false)
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct NotificationsPage {
    #[serde(default)]
    pub items: Vec<NotificationItem>,
    #[serde(default)]
    pub next_cursor: Option<String>,
    #[serde(default)]
    pub poll_interval: Option<i64>,
}
