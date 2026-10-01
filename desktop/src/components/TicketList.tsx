import dayjs from "dayjs";

interface Ticket {
  id: string;
  ticket_number: string;
  title: string;
  status: string;
  requester_name?: string;
  created_at: string;
  unread_count?: number;
}

interface Props {
  tickets: Ticket[];
  onSelect: (id: string) => void;
}

const statusColors: Record<string, string> = {
  baru: "status-baru",
  sedang_ditangani: "status-proses",
  menunggu_pengguna: "status-tunggu",
  selesai: "status-selesai",
  ditutup: "status-tutup",
  dibuka_kembali: "status-baru",
};

const statusLabels: Record<string, string> = {
  baru: "Diterima",
  sedang_ditangani: "Sedang Dikerjakan",
  menunggu_pengguna: "Menunggu",
  selesai: "Selesai",
  ditutup: "Ditutup",
  dibuka_kembali: "Dibuka Kembali",
};

export default function TicketList({ tickets, onSelect }: Props) {
  return (
    <div className="ticket-list">
      {tickets.map(ticket => (
        <div
          key={ticket.id}
          className="ticket-item"
          onClick={() => onSelect(ticket.id)}
        >
          <div className="ticket-avatar">🎫</div>
          <div className="ticket-info">
            <div className="ticket-header">
              <span className="ticket-number">{ticket.ticket_number}</span>
              <span className={`ticket-status ${statusColors[ticket.status] || ""}`}>
                {statusLabels[ticket.status] || ticket.status.replace("_", " ")}
              </span>
            </div>
            <div className="ticket-title">{ticket.title}</div>
            <div className="ticket-meta">
              <span>{ticket.requester_name || "Unknown"}</span>
              <span>•</span>
              <span>{dayjs(ticket.created_at).format("DD MMM HH:mm")}</span>
            </div>
          </div>
          {ticket.unread_count != null && ticket.unread_count > 0 && (
            <div className="ticket-badge">{ticket.unread_count}</div>
          )}
        </div>
      ))}
    </div>
  );
}
