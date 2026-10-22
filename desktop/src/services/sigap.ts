import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/**
 * Integrasi SIGAP — semua pekerjaan berat (pairing, token, polling notifikasi)
 * dilakukan di Rust. Frontend hanya menampilkan status; TIDAK PERNAH
 * memegang access/refresh token.
 */

export type SigapStatus = "disconnected" | "pairing" | "connected" | "expired";

export interface SigapState {
  status: SigapStatus;
  user_name: string | null;
  device_name: string | null;
  user_code: string | null;
  verification_uri: string | null;
  expires_in: number | null;
  permission_granted: boolean;
  detail_enabled: boolean;
  unread: number;
  last_sync: number | null;
  last_error: string | null;
  online: boolean;
  device_name_host: string;
}

export interface SigapNotification {
  id: string;
  kind: string | null;
  title: string | null;
  message: string | null;
  is_read: boolean | null;
  created_at: string | null;
  read_at: string | null;
  path: string | null;
}

export const isTauri = () =>
  typeof window !== "undefined" &&
  ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    console.error(`[sigap] ${cmd} gagal:`, e);
    throw e;
  }
}

export const getSigapState = () => call<SigapState>("sigap_get_state");
export const startSigapPairing = () => call<SigapState>("sigap_start_pairing");
export const cancelSigapPairing = () => call<SigapState>("sigap_cancel_pairing");
export const logoutSigap = () => call<SigapState>("sigap_logout");
export const fetchSigapNotifications = () => call<SigapNotification[]>("sigap_fetch_notifications");
export const openSigapNotification = (id: string) => call<void>("sigap_open_notification", { id });
export const markSigapRead = (id: string) => call<void>("sigap_mark_read", { id });
export const setSigapDetail = (enabled: boolean) => call<SigapState>("sigap_set_detail", { enabled });
export const requestSigapPermission = () => call<boolean>("sigap_request_permission");
export const openSigapAuthorize = () => call<void>("sigap_open_authorize");

/** Event dari Rust: perubahan status & notifikasi baru. */
export function onSigapState(cb: (s: SigapState) => void) {
  if (!isTauri()) return () => {};
  const un = listen<SigapState>("sigap-state", (e) => cb(e.payload));
  return () => {
    un.then((f) => f()).catch(() => {});
  };
}

export function onSigapNotification(cb: (n: SigapNotification) => void) {
  if (!isTauri()) return () => {};
  const un = listen<SigapNotification>("sigap-notification", (e) => cb(e.payload));
  return () => {
    un.then((f) => f()).catch(() => {});
  };
}

/** Format waktu notifikasi (relatif, Bahasa Indonesia). */
export function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Math.floor((Date.now() - t) / 1000);
  if (diff < 60) return "baru saja";
  if (diff < 3600) return `${Math.floor(diff / 60)} menit lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} hari lalu`;
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}
