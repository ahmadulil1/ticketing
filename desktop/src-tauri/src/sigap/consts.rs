/// Konstanta kontrak "SIGAP Desktop Staging Contract" (2026-10-22, AUTH-09).
///
/// ponytail: hanya staging. Kontrak menyatakan route production dinonaktifkan,
/// jadi base URL tidak dibuat configurable lewat UI/env runtime.
pub const BASE_URL: &str = "https://sigap.marison-testing.biz.id";
pub const ORIGIN_HOST: &str = "sigap.marison-testing.biz.id";
pub const CLIENT_ID: &str = "sigap-desktop-staging";

/// Keyring service untuk refresh token (Credential Manager / Keychain).
pub const KEYRING_SERVICE: &str = "com.ticketing.desktop.sigap";
/// Username di dalam keyring = installation id, jadi satu entri per instalasi.
pub const KEYRING_USER: &str = "refresh-token";

/// Interval default polling notifikasi (detik) + jitter maksimum (detik).
pub const DEFAULT_POLL_INTERVAL: u64 = 30;
pub const MAX_JITTER: u64 = 5;
/// Batas bawah interval polling token pairing (kontrak: minimal 5 detik).
pub const MIN_TOKEN_POLL_INTERVAL: u64 = 5;
/// Refresh access token bila umur < ini (detik).
pub const REFRESH_MARGIN_SECS: i64 = 90;
/// Maksimum item notifikasi yang dipaginasi saat establish baseline.
pub const MAX_BASELINE_PAGES: usize = 50;
/// Batas item popup OS per siklus (anti-banjir saat catch-up offline).
pub const MAX_POPUPS_PER_CYCLE: usize = 5;
