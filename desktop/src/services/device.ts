import api from "./api";

const DEVICE_KEY = "ticketing_device_id";
const DEVICE_NAME_KEY = "ticketing_device_name";
const DEVICE_SECRET_KEY = "ticketing_device_secret";

// Cache modul: diisi oleh initDeviceIdentity() sebelum render.
let deviceIdCache: string | null = null;
let deviceSecretCache: string | null = null;

/**
 * Ambil identitas device dari store.bin (Rust) — dipakai semua window.
 * WAJIB dipanggil sekali sebelum render (lihat main.tsx).
 *
 * ponytail: sebelumnya identitas hanya di localStorage. Tiap window WebView
 * punya localStorage sendiri (origin tauri:// vs http:// dev), jadi pet overlay
 * & window mini bisa punya device_id berbeda -> device yg terdaftar di server
 * tidak cocok saat WS subscribe. store.bin solve ini.
 */
export async function initDeviceIdentity(): Promise<void> {
  if (deviceIdCache) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const existing = localStorage.getItem(DEVICE_KEY) || null;
    const identity = await invoke<any>("get_device_identity", {
      existingDeviceId: existing,
    });
    deviceIdCache = identity.device_id;
    deviceSecretCache = identity.device_secret;
    // Sinkronkan ke localStorage supaya window non-Tauri & tooling konsisten
    localStorage.setItem(DEVICE_KEY, identity.device_id);
    localStorage.setItem(DEVICE_SECRET_KEY, identity.device_secret);
  } catch (e) {
    // Fallback browser (tanpa Tauri) — pakai localStorage
    console.error("[device] initDeviceIdentity fallback:", e);
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_KEY, id);
    }
    let secret = localStorage.getItem(DEVICE_SECRET_KEY);
    if (!secret) {
      const bytes = new Uint8Array(24);
      crypto.getRandomValues(bytes);
      secret = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      localStorage.setItem(DEVICE_SECRET_KEY, secret);
    }
    deviceIdCache = id;
    deviceSecretCache = secret;
  }
}

export function getDeviceId(): string {
  if (deviceIdCache) return deviceIdCache;
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  deviceIdCache = id;
  return id;
}

/**
 * Rahasia device untuk autentikasi remote desktop.
 * Dibuat sekali lalu disimpan permanen di store.bin.
 */
export function getDeviceSecret(): string {
  if (deviceSecretCache) return deviceSecretCache;
  let secret = localStorage.getItem(DEVICE_SECRET_KEY);
  if (!secret) {
    // 48 char hex = 24 byte entropy
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    secret = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(DEVICE_SECRET_KEY, secret);
  }
  deviceSecretCache = secret;
  return secret;
}

/** Daftarkan device secret ke server (idempotent, best-effort). */
export async function registerDeviceSecret(): Promise<boolean> {
  try {
    await api.post("/remote/register", {
      device_id: getDeviceId(),
      device_secret: getDeviceSecret(),
    });
    return true;
  } catch (e) {
    console.error("[device] register secret gagal:", e);
    return false;
  }
}

export async function getDeviceName(): Promise<string> {
  let name = localStorage.getItem(DEVICE_NAME_KEY);
  if (!name) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      name = await invoke<string>("get_device_name");
    } catch {
      name = "Unknown-Device";
    }
    localStorage.setItem(DEVICE_NAME_KEY, name);
  }
  return name;
}

// User terlogin (agent) atau guest (karyawan)
export function getCurrentUser(): { id: string; role: string } | null {
  const raw = localStorage.getItem("user");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function isAgent(): boolean {
  const u = getCurrentUser();
  return !!u && (u.role === "agent" || u.role === "admin");
}

// Kirim spesifikasi PC ke server untuk tab Inventaris (sekali per start app).
export async function reportSpec() {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const spec = await invoke<any>("get_specs");
    await api.post("/devices/report", { device_id: getDeviceId(), ...spec });
  } catch {
    // ponytail: report spec best-effort; gagal (server mati) dicoba lagi start berikutnya.
  }
}
