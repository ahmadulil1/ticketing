import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Minus, MessageSquare, X } from "lucide-react";
import TicketDetail from "../pages/TicketDetail";
import { useQuery } from "@tanstack/react-query";
import api from "../lib/api";

const ChatContext = createContext<(id: string) => void>(() => {});
export const useTicketChat = () => useContext(ChatContext);

export default function TicketChat({ children }: { children: ReactNode }) {
  const [id, setId] = useState<string | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [acknowledged, setAcknowledged] = useState("");
  const { data: messages = [] } = useQuery<Array<{ id: string; sender_role: string; read_at: string | null }>>({
    queryKey: ["messages", id],
    queryFn: async () => (await api.get(`/messages/ticket/${id}`)).data,
    enabled: !!id,
    refetchInterval: 3000,
  });
  const incoming = messages.filter(message => message.sender_role === "user");
  const latest = `${id}:${incoming.at(-1)?.id || ""}`;
  const unreadCount = incoming.filter(message => !message.read_at).length;
  const needsAttention = unreadCount > 0 && acknowledged !== latest;
  const { data: ticket } = useQuery({
    queryKey: ["ticket", id],
    queryFn: async () => (await api.get("/tickets/" + id)).data,
    enabled: !!id,
  });
  return <ChatContext.Provider value={(ticketId) => { setId(ticketId); setMinimized(false); setAcknowledged(""); }}>
    {children}
    {id && <section className={"ticket-chat" + (minimized ? " minimized" : "") + (needsAttention ? " has-new-messages" : "")} role="region" aria-label="Chat tiket"
      onClick={() => { if (!minimized && document.hasFocus()) setAcknowledged(latest); }}>
      <div className="ticket-chat-toolbar">
        {ticket?.device_id ? <Link className="ticket-chat-title" style={{ textDecoration: "none" }} to={`/devices/${encodeURIComponent(ticket.device_id)}`} onClick={() => setMinimized(true)} title="Buka detail perangkat"><MessageSquare size={17} /> {ticket.device_name || ticket.device_id}</Link>
          : <span className="ticket-chat-title"><MessageSquare size={17} /> {ticket?.ticket_number || "Memuat…"}</span>}
        {needsAttention && <button className="chat-new-messages" aria-live="polite" onClick={() => { setMinimized(false); setAcknowledged(latest); }}>{unreadCount} pesan baru</button>}
        <button className="icon-btn" aria-label={minimized ? "Buka chat" : "Perkecil chat"} onClick={(event) => { event.stopPropagation(); setMinimized(!minimized); if (minimized) setAcknowledged(latest); }}><Minus size={16} /></button>
        <button className="icon-btn" aria-label="Tutup chat" onClick={(event) => { event.stopPropagation(); setId(null); }}><X size={16} /></button>
      </div>
      <div hidden={minimized} className="ticket-chat-body"><TicketDetail key={id} ticketId={id} embedded readEnabled={!minimized && acknowledged === latest} /></div>
    </section>}
  </ChatContext.Provider>;
}
