import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight, Images } from "lucide-react";
import { attachmentUrl, formatSize } from "../lib/attachments";
import type { AttachmentMeta } from "../lib/attachments";

/**
 * Galeri gambar lampiran.
 *
 * - Grid thumbnail (klik buat buka)
 * - Lightbox: layar penuh, panah kiri/kanan buat navigasi, Esc buat tutup
 */
export default function Gallery({
  items,
  compact = false,
}: {
  items: AttachmentMeta[];
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "ArrowRight") setIdx((i) => (i + 1) % items.length);
      if (e.key === "ArrowLeft")
        setIdx((i) => (i - 1 + items.length) % items.length);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, items.length]);

  if (!items.length) return null;

  const openAt = (i: number) => {
    setIdx(i);
    setOpen(true);
  };

  return (
    <>
      <div className={"gallery" + (compact ? " gallery-compact" : "")}>
        {items.map((a, i) => (
          <button
            key={a.id}
            className="gallery-item"
            onClick={() => openAt(i)}
            title={a.original_name || "Lampiran"}
          >
            <img src={attachmentUrl(a.id)} alt={a.original_name || "Lampiran"} loading="lazy" />
          </button>
        ))}
      </div>

      {open &&
        createPortal(
          <div className="lightbox" onClick={() => setOpen(false)}>
          <button className="lightbox-close" onClick={() => setOpen(false)} aria-label="Tutup">
            <X size={20} />
          </button>
          {items.length > 1 && (
            <button
              className="lightbox-nav left"
              onClick={(e) => {
                e.stopPropagation();
                setIdx((i) => (i - 1 + items.length) % items.length);
              }}
              aria-label="Sebelumnya"
            >
              <ChevronLeft size={24} />
            </button>
          )}
          <div className="lightbox-body" onClick={(e) => e.stopPropagation()}>
            <img src={attachmentUrl(items[idx].id)} alt={items[idx].original_name || "Lampiran"} />
            <div className="lightbox-info">
              <span>{items[idx].original_name}</span>
              <span className="muted">
                {idx + 1} / {items.length}
                {items[idx].size ? " · " + formatSize(items[idx].size) : ""}
              </span>
            </div>
          </div>
          {items.length > 1 && (
            <button
              className="lightbox-nav right"
              onClick={(e) => {
                e.stopPropagation();
                setIdx((i) => (i + 1) % items.length);
              }}
              aria-label="Berikutnya"
            >
              <ChevronRight size={24} />
            </button>
          )}
        </div>,
          document.body
        )}
    </>
  );
}

export function GalleryLabel({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="gallery-label">
      <Images size={13} /> {count} gambar
    </span>
  );
}
