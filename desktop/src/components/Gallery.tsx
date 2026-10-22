import { useRef, useState } from "react";
import api from "../services/api";
import { getDeviceId, getDeviceSecret } from "../services/device";

export default function Gallery({ items, compact = false }: { items: Array<{ id: string; original_name?: string }>; compact?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(0);
  if (!items?.length) return null;
  const url = (id: string) => {
    const params = new URLSearchParams();
    const token = localStorage.getItem("token");
    if (token) params.set("token", token);
    else {
      params.set("device_id", getDeviceId());
      params.set("device_secret", getDeviceSecret());
    }
    return `${api.defaults.baseURL}/attachments/${id}?${params}`;
  };
  return <>
    <div className={`attachment-gallery${compact ? " compact" : ""}`}>{items.map((item, i) =>
      <button key={item.id} onClick={() => { setIndex(i); dialog.current?.showModal(); }} aria-label={`Lihat ${item.original_name || "gambar"}`}>
        <img src={url(item.id)} alt={item.original_name || "Lampiran"} loading="lazy" />
      </button>
    )}</div>
    <dialog ref={dialog} className="image-dialog">
      <button onClick={() => dialog.current?.close()}>Tutup</button>
      <img src={url(items[Math.min(index, items.length - 1)].id)} alt={items[index]?.original_name || "Lampiran"} />
      <div><button onClick={() => setIndex((index - 1 + items.length) % items.length)}>Sebelumnya</button>
        <span>{index + 1} / {items.length}</span>
        <button onClick={() => setIndex((index + 1) % items.length)}>Berikutnya</button></div>
    </dialog>
  </>;
}
