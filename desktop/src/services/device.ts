import api from "./api";

const DEVICE_KEY = "ticketing_device_id";
const DEVICE_NAME_KEY = "ticketing_device_name";

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
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
