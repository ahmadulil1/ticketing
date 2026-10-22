/**
 * URL lampiran (gambar).
 *
 * <img src> tak bisa kirim header Authorization, jadi JWT dikirim lewat
 * query `token`. Endpoint server menerima token query sebagai fallback.
 */
export function attachmentUrl(id: string): string {
  const token = localStorage.getItem("token");
  return `/api/attachments/${id}${token ? `?token=${encodeURIComponent(token)}` : ""}`;
}

export interface AttachmentMeta {
  id: string;
  original_name?: string;
  mime_type?: string;
  size?: number;
  message_id?: string | null;
  uploaded_at?: string;
}

export function formatSize(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
}
