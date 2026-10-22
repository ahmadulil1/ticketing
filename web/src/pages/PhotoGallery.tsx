import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

type Photo = { id: string; original_name: string };
export default function PhotoGallery() {
  const { ticketId } = useParams();
  const [access] = useState(() => new URLSearchParams(location.hash.slice(1)).get("access") || "");
  const [selected] = useState(() => new URLSearchParams(location.hash.slice(1)).get("photo"));
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    history.replaceState(null, "", location.pathname);
    document.title = "Galeri foto — Ticketing";
    let alive = true;
    fetch(`/api/attachments/ticket/${ticketId}?gallery_token=${encodeURIComponent(access)}`, { cache: "no-store", referrerPolicy: "no-referrer" })
      .then(async response => {
        if (!response.ok) throw new Error("Tautan tidak valid atau sudah kedaluwarsa. Buka foto lagi dari aplikasi.");
        return response.json() as Promise<Photo[]>;
      }).then(items => {
        if (!alive) return;
        setPhotos(items); setIndex(Math.max(0, items.findIndex(photo => photo.id === selected)));
        if (!items.length) setError("Belum ada foto yang bisa ditampilkan.");
      }).catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [ticketId, access, selected]);
  const photo = photos[index];
  const move = (offset: number) => { setIndex(i => (i + offset + photos.length) % photos.length); setZoom(0); };
  return <main className="photo-page">
    <header className="photo-toolbar">
      <strong>Galeri foto</strong>
      <span>{photo?.original_name}</span>
      <button disabled={!photos.length} onClick={() => move(-1)}>Sebelumnya</button>
      <span>{photos.length ? index + 1 : 0} / {photos.length}</span>
      <button disabled={!photos.length} onClick={() => move(1)}>Berikutnya</button>
      <button onClick={() => setZoom(0)}>Pas layar</button>
      <button onClick={() => setZoom(100)}>1:1</button>
      <button onClick={() => setZoom(z => Math.max(25, (z || 100) - 25))} aria-label="Perkecil">−</button>
      <button onClick={() => setZoom(z => Math.min(300, (z || 100) + 25))} aria-label="Perbesar">+</button>
      {zoom > 0 && <span>{zoom}%</span>}
    </header>
    {error ? <p role="alert" className="photo-error">{error}</p> : photo ?
      <div className={`photo-stage${zoom ? " zoomed" : ""}`}>
        <img key={photo.id} src={`/api/attachments/${photo.id}?gallery_token=${encodeURIComponent(access)}`} alt={photo.original_name}
          referrerPolicy="no-referrer" onError={() => setError("Foto gagal dimuat atau tautan kedaluwarsa. Buka ulang dari aplikasi.")}
          style={zoom ? { maxWidth: "none", maxHeight: "none", zoom: zoom / 100 } : undefined} />
      </div> : <p>Memuat foto...</p>}
  </main>;
}
