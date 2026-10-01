import { useState, useRef, useEffect } from "react";
import { ArrowLeft, Paperclip, X } from "lucide-react";
import api from "../services/api";
import { getDeviceId, getDeviceName } from "../services/device";
import { useDragRegion } from "../hooks/useDragRegion";

const MAX_FILES = 10;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif", "image/bmp"];
const PRIORITIES = [
  { value: "rendah", label: "Rendah" },
  { value: "normal", label: "Sedang" },
  { value: "tinggi", label: "Tinggi" },
];

interface Props {
  onSubmit: (data: { description: string; priority: string; deviceId: string; deviceName: string; lokasi?: string }) => Promise<{ id: string }>;
  onCancel: () => void;
}

export default function TicketForm({ onSubmit, onCancel }: Props) {
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("normal");
  const [lokasi, setLokasi] = useState("");
  const [groups, setGroups] = useState<Array<{ id: string; nama: string }>>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ description?: string; files?: string }>({});
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const idempotencyRef = useRef<string>("");
  const onDrag = useDragRegion();

  // Daftar lokasi/group dari server (GET publik)
  useEffect(() => {
    api.get("/device-groups")
      .then(res => setGroups(res.data || []))
      .catch(() => {});
  }, []);

  const isImage = (f: File) => ALLOWED_MIME.includes(f.type.toLowerCase()) || /^image\//.test(f.type);

  const addFiles = (selected: FileList | File[] | null) => {
    if (!selected) return;
    const arr = Array.from(selected);
    let errMsg = "";
    const valid = arr.filter(f => {
      if (!isImage(f)) { errMsg = `Hanya gambar yang diizinkan: ${f.name}`; return false; }
      if (f.size > MAX_FILE_SIZE) { errMsg = `Ukuran melebihi 5MB: ${f.name}`; return false; }
      return true;
    });
    const combined = [...files, ...valid].slice(0, MAX_FILES);
    setFiles(combined);
    if (errMsg || arr.length > valid.length) setErrors(e => ({ ...e, files: errMsg }));
    else setErrors(e => ({ ...e, files: undefined }));
  };

  // Paste gambar (Ctrl+V)
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imgs: File[] = [];
      for (const it of items) {
        if (it.kind === "file" && it.type.startsWith("image/")) {
          const f = it.getAsFile();
          if (f) imgs.push(f);
        }
      }
      if (imgs.length) {
        e.preventDefault();
        addFiles(imgs);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [files]);

  const removeFile = (idx: number) => {
    setFiles(files.filter((_, i) => i !== idx));
    setErrors(e => ({ ...e, files: undefined }));
  };

  const validate = () => {
    const errs: { description?: string } = {};
    if (!description.trim() || description.length < 10 || description.length > 10000) {
      errs.description = "Detail 10-10000 karakter";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      // Idempotency key per submit attempt
      if (!idempotencyRef.current) idempotencyRef.current = crypto.randomUUID();
      const ticket = await onSubmit({
        description: description.trim(),
        priority,
        deviceId: getDeviceId(),
        deviceName: await getDeviceName(),
        lokasi,
      });
      if (files.length > 0 && ticket?.id) {
        const form = new FormData();
        files.forEach(f => form.append("files", f));
        await api.post(`/tickets/guest/${ticket.id}/attachments?device_id=${encodeURIComponent(getDeviceId())}`, form, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }
    } catch (err: any) {
      setErrors({ description: err.response?.data?.error || "Gagal membuat tiket" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mini-window">
      <header className="mini-header" onMouseDown={onDrag}>
        <button onClick={onCancel} className="back-btn">
          <ArrowLeft size={18} /> Kembali
        </button>
        <h1>Tiket Baru</h1>
        <div style={{ width: 40 }}></div>
      </header>

      <form onSubmit={handleSubmit} className="ticket-form">
        <div className="form-group">
          <label>Detail Permasalahan</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            maxLength={10000}
            placeholder="Jelaskan detail masalah yang Anda hadapi..."
            aria-invalid={!!errors.description}
            autoFocus
          />
          <div className={`char-count ${errors.description ? "error" : description.length > 9500 ? "warning" : ""}`}>
            {description.length}/10000
          </div>
          {errors.description && <div className="error" style={{ fontSize: "0.6875rem", color: "#e74c3c", marginTop: "0.25rem" }}>{errors.description}</div>}
        </div>

        <div className="form-group">
          <label>Prioritas</label>
          <div className="priority-group">
            {PRIORITIES.map(p => (
              <button
                key={p.value}
                type="button"
                className={`priority-btn ${priority === p.value ? "active" : ""}`}
                onClick={() => setPriority(p.value)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label>Lokasi (opsional)</label>
          <select
            value={lokasi}
            onChange={e => setLokasi(e.target.value)}
            className="lokasi-select"
          >
            <option value="">- Pilih lokasi -</option>
            {groups.map(g => (
              <option key={g.id} value={g.nama}>{g.nama}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Lampiran (opsional, gambar saja)</label>
          <div
            className={`file-drop ${dragOver ? "drag-over" : ""}`}
            onClick={() => inputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => {
              e.preventDefault();
              setDragOver(false);
              addFiles(e.dataTransfer.files);
            }}
          >
            <Paperclip size={16} />
            <span>Pilih file, drag &amp; drop, atau paste (Ctrl+V)</span>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="image/*"
              onChange={e => addFiles(e.target.files)}
              style={{ display: "none" }}
            />
          </div>
          <div style={{ fontSize: "0.6875rem", color: "#888", marginTop: "0.25rem" }}>
            Maks {MAX_FILES} gambar, masing-masing maks 5MB
          </div>
          {files.length > 0 && (
            <div className="file-list">
              {files.map((f, i) => (
                <div key={i} className="file-chip">
                  <span>{f.name}</span>
                  <span style={{ color: "#888", fontSize: "0.75rem" }}>
                    {(f.size / 1024 / 1024).toFixed(1)}MB
                  </span>
                  <button type="button" onClick={() => removeFile(i)} aria-label="Hapus file">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {errors.files && <div style={{ fontSize: "0.6875rem", color: "#e74c3c", marginTop: "0.25rem" }}>{errors.files}</div>}
        </div>

        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={submitting}>
            Batal
          </button>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? (
              <>
                <span className="spinner" style={{ width: 16, height: 16, marginRight: 8 }} />
                Mengirim...
              </>
            ) : (
              "Kirim Laporan"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
