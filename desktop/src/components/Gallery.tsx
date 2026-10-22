import { useState } from "react";
import api from "../services/api";
import { getDeviceId, getDeviceSecret } from "../services/device";
import { invoke } from "@tauri-apps/api/core";

export default function Gallery({ items, compact = false }: { items: Array<{ id: string; ticket_id?: string; original_name?: string }>; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!items?.length) return null;
  const params = new URLSearchParams();
  const token = localStorage.getItem("token");
  if (token) params.set("token", token);
  else {
    params.set("device_id", getDeviceId());
    params.set("device_secret", getDeviceSecret());
  }
  const open = async (item: typeof items[number]) => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      if (!item.ticket_id) throw new Error("Muat ulang tiket untuk membuka galeri");
      const grant = await api.post(`/attachments/ticket/${item.ticket_id}/gallery-link?${params}`);
      const origin = new URL(api.defaults.baseURL!).origin;
      await invoke("plugin:opener|open_url", { url: `${origin}/gallery/${item.ticket_id}#${new URLSearchParams({ access: grant.data.token, photo: item.id })}` });
    } catch (e: any) { setError(e.response?.data?.error || e.message || "Gagal membuka browser"); }
    finally { setBusy(false); }
  };
  return <>
    <div className={`attachment-gallery${compact ? " compact" : ""}`}>{items.map(item =>
      <button key={item.id} disabled={busy} onClick={() => open(item)} title="Buka foto di browser" aria-label={`Buka ${item.original_name || "foto"} di browser`}>
        <img src={`${api.defaults.baseURL}/attachments/${item.id}?${params}`} alt={item.original_name || "Lampiran"} loading="lazy" />
      </button>
    )}</div>
    {error && <p role="alert">{error}</p>}
  </>;
}
