import { Link } from "react-router-dom";
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bell, MessageSquare, X } from "lucide-react";
import api from "../lib/api";
import { useTicketChat } from "./TicketChat";

interface NotificationItem {
  ticket_id: string;
  ticket_number: string;
  title: string;
  unread: number;
  last_message_at: string;
  kind: "message" | "ticket";
}

export default function NotificationDropdown({ open, setOpen, unread }: {
  open: boolean;
  setOpen: (value: boolean) => void;
  unread: Record<string, number>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openTicket = useTicketChat();
  useEffect(() => {
    const dialog = dialogRef.current;
    if (open) dialog?.showModal();
    else dialog?.close();
    return () => dialog?.close();
  }, [open]);

  const { data: items = [], isLoading, isError, refetch } = useQuery<NotificationItem[]>({
    queryKey: ["notification-history", unread],
    queryFn: async () => (await api.get<NotificationItem[]>("/messages/notifications")).data,
    enabled: open,
    refetchInterval: 30000,
  });

  if (!open) return null;
  return (
    <dialog ref={dialogRef} className="notification-dialog" aria-labelledby="notification-title"
      onCancel={() => setOpen(false)}
      onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div className="notification-panel">
        <div className="notification-head">
          <h3 id="notification-title"><Bell size={16} /> Notifikasi</h3>
          <button className="icon-btn" autoFocus aria-label="Tutup notifikasi" onClick={() => setOpen(false)}><X size={16} /></button>
        </div>
        <div className="notification-list">
          {isLoading ? <div className="notification-empty" role="status">Memuat notifikasi…</div>
            : isError ? <div className="notification-empty">Gagal memuat riwayat. <button className="nav-item" onClick={() => refetch()}>Coba lagi</button></div>
            : items.length === 0 ? <div className="notification-empty">Belum ada riwayat notifikasi</div>
            : items.map((item) => (
              <Link key={item.ticket_id} to={`/ticket/${item.ticket_id}`} className="notification-item" onClick={(event) => { if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return; event.preventDefault(); setOpen(false); openTicket(item.ticket_id); }}>
                <div><MessageSquare size={20} /></div>
                <div className="notification-copy">
                  <div className="notification-row">
                    <span className="notification-title">{item.ticket_number} — {item.title}</span>
                    <span className="notification-count">{item.unread > 0 ? (item.kind === "ticket" ? "Tiket baru" : "Pesan baru") : "Dibaca"}</span>
                  </div>
                  <div className="notification-meta"><time dateTime={item.last_message_at}>{new Date(item.last_message_at).toLocaleString("id-ID")}</time></div>
                </div>
              </Link>
            ))}
        </div>
      </div>
    </dialog>
  );
}
