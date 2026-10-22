use super::consts::{KEYRING_SERVICE, KEYRING_USER};

/// Simpan refresh token di Credential Manager (Windows) / Keychain (macOS).
///
/// Refresh token tak pernah masuk plaintext, log, atau frontend.
/// Di Windows: `Windows.Security.Credentials` via keyring.
/// Di macOS: Keychain generic password via keyring.
pub fn save_refresh_token(token: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|e| e.to_string())?;
    entry.set_password(token).map_err(|e| e.to_string())
}

/// Baca refresh token. `None` kalau belum pernah disimpan / item hilang.
pub fn load_refresh_token() -> Option<String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).ok()?;
    entry.get_password().ok().filter(|s| !s.is_empty())
}

/// Hapus refresh token lokal (logout / sesi dicabut).
pub fn delete_refresh_token() {
    if let Ok(entry) = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER) {
        let _ = entry.delete_credential();
    }
}
