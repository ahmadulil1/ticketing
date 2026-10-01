import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import api from "../services/api";
import { useRealtime } from "../hooks/useRealtime";
import { useDragRegion } from "../hooks/useDragRegion";
import dayjs from "dayjs";
import { ArrowLeft, Send } from "lucide-react";
import { getCurrentUser, isAgent as isAgentRole, getDeviceId } from "../services/device";

const statusColors: Record<string, string> = {
  baru: "status-baru",
  sedang_ditangani: "status-proses",
  menunggu_pengguna: "status-tunggu",
  selesai: "status-selesai",
  ditutup: "status-tutup",
};

const statusLabels: Record<string, string> = {
  baru: "Diterima",
  sedang_ditangani: "Sedang Dikerjakan",
  menunggu_pengguna: "Menunggu",
  selesai: "Selesai",
  ditutup: "Ditutup",
  dibuka_kembali: "Dibuka Kembali",
};

interface Props {
  ticketId: string;
  onBack: () => void;
}

export default function ChatView({ ticketId, onBack }: Props) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useRealtime(ticketId);

  const currentUser = getCurrentUser();
  const isAgent = isAgentRole();
  const myId = currentUser?.id;
  const onDrag = useDragRegion();
  // Guest: lampirkan device_id di query
  const guestQ = isAgent ? "" : `?device_id=${encodeURIComponent(getDeviceId())}`;

  const { data: ticket } = useQuery({
    queryKey: ["ticket", ticketId],
    queryFn: async () => {
      const res = await api.get(`/tickets/${ticketId}${guestQ}`);
      return res.data;
    },
  });

  const { data: messages, isLoading } = useQuery({
    queryKey: ["messages", ticketId],
    queryFn: async () => {
      const res = await api.get(`/messages/ticket/${ticketId}${guestQ}`);
      return res.data;
    },
    refetchInterval: 3000,
  });

  // Siapa yang sedang mengetik
  const { data: typing } = useQuery({
    queryKey: ["typing", ticketId],
    queryFn: async () => {
      const res = await api.get(`/messages/ticket/${ticketId}/typing${guestQ}`);
      return res.data as Array<{ userId: string; username: string; role: string }>;
    },
    refetchInterval: 2000,
  });

  const setTyping = useMutation({
    mutationFn: async (isTyping: boolean) => {
      await api.post(`/messages/ticket/${ticketId}/typing${guestQ}`, { isTyping });
    },
  });

  // Read receipts: tandai pesan lawan sudah dibuka
  const markRead = useMutation({
    mutationFn: async () => {
      await api.post(`/messages/ticket/${ticketId}/read${guestQ}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", ticketId] });
    },
  });

  useEffect(() => {
    if (messages && messages.length > 0) markRead.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages?.length]);

  const sendMessage = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/messages/ticket/${ticketId}${guestQ}`, {
        body: message.trim(),
        message_type: isAgent && isInternal ? "internal" : "public",
        clientRequestId: crypto.randomUUID(),
      });
      return res.data;
    },
    onSuccess: () => {
      setMessage("");
      setIsInternal(false);
      setTyping.mutate(false);
      queryClient.invalidateQueries({ queryKey: ["messages", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const doSend = () => {
    if (message.trim() && !sendMessage.isPending) sendMessage.mutate();
  };

  if (!ticket) return <div className="loading"><span className="spinner" />Memuat...</div>;

  return (
    <div className="chat-view">
      <header className="chat-header" onMouseDown={onDrag}>
        <button onClick={onBack} className="back-btn">
          <ArrowLeft size={18} /> Kembali
        </button>
        <div className="info">
          <span className="ticket-number">{ticket.ticket_number}</span>
          <span className={`status ${statusColors[ticket.status] || ""}`}>
            {statusLabels[ticket.status] || ticket.status}
          </span>
        </div>
      </header>

      <div className="ticket-header-info">
        <h3>{ticket.title}</h3>
        <p>{ticket.description}</p>
        <div className="meta">
          <span>Pelapor: {ticket.requester_full_name || ticket.requester_name}</span>
          <span>•</span>
          <span>Dibuat: {dayjs(ticket.created_at).format("DD MMM YYYY HH:mm")}</span>
        </div>
        {isAgent && ticket.status !== "ditutup" && (
          <div className="actions">
            <label>Status: </label>
            <select
              value={ticket.status}
              onChange={async (e) => {
                await api.patch(`/tickets/${ticketId}/status`, { status: e.target.value });
                queryClient.invalidateQueries({ queryKey: ["ticket", ticketId] });
                queryClient.invalidateQueries({ queryKey: ["tickets"] });
              }}
            >
              <option value="baru">Diterima</option>
              <option value="sedang_ditangani">Sedang Dikerjakan</option>
              <option value="menunggu_pengguna">Menunggu</option>
              <option value="selesai">Selesai</option>
              <option value="ditutup">Ditutup</option>
            </select>
          </div>
        )}
      </div>

      <div className="messages">
        {isLoading ? (
          <div className="loading" style={{flex: 1}}><span className="spinner" /></div>
        ) : messages?.length === 0 ? (
          <div className="empty" style={{flex: 1}}>Belum ada pesan. Mulai percakapan!</div>
        ) : (
          messages?.filter((msg: any) => msg.message_type !== "internal" || isAgent)
            .map((msg: any) => {
              const mine = msg.sender_id ? msg.sender_id === myId : isAgent
                ? msg.sender_role === "agent"
                : msg.sender_role === "user";
              return (
                <div key={msg.id} className={`message ${mine ? "mine" : "theirs"} ${msg.message_type}`}>
                  <div className="message-header">
                    <span className="sender">{msg.sender_full_name || msg.sender_name || "System"}</span>
                    <span className="time">{dayjs(msg.created_at).format("HH:mm")}</span>
                    {mine && msg.read_at && <span className="read-tick" title="Dibaca">✓✓</span>}
                  </div>
                  <div className="message-body">{msg.body}</div>
                  {msg.message_type === "internal" && <div className="internal-label">Catatan Internal</div>}
                </div>
              );
            })
        )}
        {typing && typing.length > 0 && (
          <div className="typing-indicator">
            <span className="dots"><i /><i /><i /></span>
            {typing.map(t => t.username).join(", ")} sedang mengetik...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {ticket.status !== "ditutup" && (
        <div className="message-input">
          <div className="input-row">
            <textarea
              placeholder={isInternal ? "Catatan internal (hanya agent)..." : "Ketik pesan... (Enter kirim, Shift+Enter baris baru)"}
              value={message}
              onChange={e => {
                setMessage(e.target.value);
                setTyping.mutate(true);
              }}
              onBlur={() => setTyping.mutate(false)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); doSend(); }
              }}
              style={isInternal ? { background: "#fff8e1", borderColor: "#f59e0b" } : undefined}
            />
            <button onClick={doSend} disabled={!message.trim() || sendMessage.isPending}>
              <Send size={18} />
            </button>
          </div>
          {isAgent && (
            <label className="internal-toggle">
              <input
                type="checkbox"
                checked={isInternal}
                onChange={e => setIsInternal(e.target.checked)}
              />
              {" "}Catatan Internal (tidak terlihat pengguna)
            </label>
          )}
        </div>
      )}
    </div>
  );
}
