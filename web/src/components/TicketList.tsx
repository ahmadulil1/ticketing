import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";

interface Ticket {
  id: string;
  ticket_number: string;
  title: string;
  status: string;
  priority: string;
  requester_name?: string;
  device_name?: string;
  created_at: string;
  unread_count?: number;
}

interface Props {
  tickets: Ticket[];
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

const PRIO_LABEL: Record<string, string> = { rendah: "Rendah", normal: "Sedang", tinggi: "Tinggi", urgent: "Urgent" };
const PRIO_CLASS: Record<string, string> = {
  tinggi: "prio-tinggi", urgent: "prio-tinggi", normal: "prio-normal", rendah: "prio-rendah",
};

export default function TicketList({ tickets }: Props) {
  const navigate = useNavigate();

  if (tickets.length === 0) {
    return <div className="empty">Tidak ada tiket yang cocok dengan filter.</div>;
  }

  return (
    <div className="ticket-list">
      {tickets.map((ticket) => (
        <div key={ticket.id} className="ticket-item" onClick={() => navigate("/ticket/" + ticket.id)}>
          <div className="ticket-info">
            <div className="ticket-header">
              <span className="ticket-number">{ticket.ticket_number}</span>
              <span className={"ticket-status " + (statusColors[ticket.status] || "")}>
                {statusLabels[ticket.status] || ticket.status.replace(/_/g, " ")}
              </span>
              {ticket.priority && (
                <span className={"ticket-prio " + (PRIO_CLASS[ticket.priority] || "")}>
                  {PRIO_LABEL[ticket.priority] || ticket.priority}
                </span>
              )}
            </div>
            <div className="ticket-title">{ticket.title}</div>
            <div className="ticket-meta">
              <span>{ticket.device_name || ticket.requester_name || "Karyawan"}</span>
              <span> - </span>
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
