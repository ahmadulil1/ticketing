import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRealtime } from "../hooks/useRealtime";
import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import Pagination from "../components/Pagination";
import api from "../lib/api";
import { useTheme } from "../hooks/useTheme";
import dayjs from "dayjs";
import { ArrowLeft, Send, Sun, Moon } from "lucide-react";

const statusColors: Record<string, string> = {
  baru: "status-baru",
  sedang_ditangani: "status-proses",
  menunggu_pengguna: "status-tunggu",
  selesai: "status-selesai",
  ditutup: "status-tutup",
};

export default function TicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [msgPage, setMsgPage] = useState<number | null>(null); // null = ikut halaman terakhir
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: ticket } = useQuery({
    queryKey: ["ticket", id],
    queryFn: async () => {
      const res = await api.get("/tickets/" + id);
      return res.data;
    },
  });

  const { theme, toggle } = useTheme();

  useRealtime(id);

  const { data: messages } = useQuery({
    queryKey: ["messages", id],
    queryFn: async () => {
      const res = await api.get("/messages/ticket/" + id);
      return res.data;
    },
    refetchInterval: 3000,
  });

  const { data: typing } = useQuery({
    queryKey: ["typing", id],
    queryFn: async () => {
      const res = await api.get("/messages/ticket/" + id + "/typing");
      return res.data as Array<{ userId: string; username: string }>;
    },
    refetchInterval: 2000,
  });

  const setTyping = useMutation({
    mutationFn: async (isTyping: boolean) => {
      await api.post("/messages/ticket/" + id + "/typing", { isTyping });
    },
  });

  const markRead = useMutation({
    mutationFn: async () => {
      await api.post("/messages/ticket/" + id + "/read");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", id] });
      queryClient.invalidateQueries({ queryKey: ["unread"] });
    },
  });

  useEffect(() => {
    if (messages && messages.length > 0) markRead.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages?.length]);

  const { data: agents } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await api.get("/users");
      return (res.data as Array<any>).filter((u) => u.role !== "user" && u.is_active);
    },
  });

  const assignTicket = useMutation({
    mutationFn: async (assigneeId: string | null) => {
      await api.patch("/tickets/" + id + "/assign", { assigneeId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket", id] });
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });

  const sendMessage = useMutation({
    mutationFn: async () => {
      // ponytail: crypto.randomUUID butuh secure context (HTTPS); http://IP pakai fallback
      const reqId = typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : Date.now().toString(36) + Math.random().toString(36).slice(2);
      const res = await api.post("/messages/ticket/" + id, {
        body: message,
        message_type: isInternal ? "internal" : "public",
        clientRequestId: reqId,
      });
      return res.data;
    },
    onSuccess: () => {
      setMessage("");
      setMsgPage(null);
      setTyping.mutate(false);
      queryClient.invalidateQueries({ queryKey: ["messages", id] });
    },
  });

  const updateStatus = useMutation({
    mutationFn: async (status: string) => {
      const res = await api.patch("/tickets/" + id + "/status", { status });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket", id] });
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });

  useEffect(() => {
    // Halaman pesan terakhir: ikut bawah; halaman riwayat: ke atas daftar
    const totalMsgPages = Math.max(1, Math.ceil((messages?.length ?? 0) / 10));
    const lastPage = msgPage ?? totalMsgPages;
    if (lastPage >= totalMsgPages) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    } else {
      document.querySelector(".chat-pagination")?.scrollIntoView({ behavior: "smooth" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages?.length, msgPage]);

  if (!ticket) return <div className="loading">Memuat...</div>;

  // Pagination pesan: 10/halaman, default halaman terakhir
  const PER = 10;
  const all = messages || [];
  const totalMsgPages = Math.max(1, Math.ceil(all.length / PER));
  const curMsgPage = Math.min(msgPage ?? totalMsgPages, totalMsgPages);
  const shown = all.slice((curMsgPage - 1) * PER, curMsgPage * PER);

  const user = JSON.parse(localStorage.getItem("user") || "{}");

  return (
    <div className="ticket-detail">
      <header>
        <button onClick={() => navigate("/")} className="back-btn">
          <ArrowLeft size={20} /> Kembali
        </button>
        <div className="ticket-info">
          <h2>{ticket.ticket_number}</h2>
          <span className={"status " + (statusColors[ticket.status] || "")}>{ticket.status.replace(/_/g, " ")}</span>
        </div>
        <button
          className={"icon-btn" + (theme === "dark" ? " active" : "")}
          onClick={toggle}
          aria-label={theme === "dark" ? "Mode terang" : "Mode gelap"}
          title={theme === "dark" ? "Mode terang" : "Mode gelap"}
          style={{ marginLeft: "auto" }}
        >
          {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
        </button>
      </header>

      <div className="ticket-header-info">
        <h3>{ticket.title}</h3>
        <p>{ticket.description}</p>
        <div className="meta">
          <span>Pelapor: {ticket.requester_full_name || ticket.requester_name || "Karyawan"}</span>
          {ticket.device_name && <span>Device: {ticket.device_name}</span>}
          {ticket.lokasi && <span>Lokasi: {ticket.lokasi}</span>}
          <span>Dibuat: {dayjs(ticket.created_at).format("DD MMM YYYY HH:mm")}</span>
        </div>
        {(user.role === "agent" || user.role === "admin") && (
          <div className="actions">
            <label>Ubah Status: </label>
            <select value={ticket.status} onChange={(e) => updateStatus.mutate(e.target.value)}>
              <option value="baru">Diterima</option>
              <option value="sedang_ditangani">Sedang Dikerjakan</option>
              <option value="menunggu_pengguna">Menunggu</option>
              <option value="selesai">Selesai</option>
              <option value="ditutup">Ditutup</option>
            </select>
            <label>Tugaskan: </label>
            <select
              value={ticket.assignee_id || ""}
              onChange={(e) => assignTicket.mutate(e.target.value || null)}
            >
              <option value="">Belum ditugaskan</option>
              {agents?.map((a: any) => (
                <option key={a.id} value={a.id}>{a.full_name || a.username}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="messages">
        {shown.map((msg: any) => {
          const mine = msg.sender_role === "agent" || msg.sender_role === "admin"
            ? user.role !== "user"
            : user.role === "user";
          return (
            <div key={msg.id} className={"message " + (mine ? "mine" : "theirs") + " " + msg.message_type}>
              <div className="message-header">
                <span className="sender">{msg.sender_full_name || msg.sender_name || "System"}</span>
                <span className="time">{dayjs(msg.created_at).format("HH:mm")}</span>
                {mine && msg.read_at && <span className="read-tick" title="Dibaca">✓✓</span>}
              </div>
              <div className="message-body">{msg.body}</div>
              {msg.message_type === "internal" && (
                <div className="internal-label">Catatan Internal</div>
              )}
            </div>
          );
        })}
        {all.length > PER && (
          <div className="chat-pagination">
            <Pagination
              page={curMsgPage}
              totalPages={totalMsgPages}
              total={all.length}
              onChange={(p) => { if (p !== curMsgPage) setMsgPage(p); }}
            />
          </div>
        )}
        {typing && typing.length > 0 && (
          <div className="typing-indicator">
            <span className="dots"><i /><i /><i /></span>
            {typing.map((t) => t.username).join(", ")} sedang mengetik...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {ticket.status !== "ditutup" && (
        <div className="message-input">
          <div className="input-row">
            <textarea
              placeholder="Ketik pesan... (Enter untuk kirim)"
              value={message}
              onChange={(e) => { setMessage(e.target.value); setTyping.mutate(true); }}
              onBlur={() => setTyping.mutate(false)}
              enterKeyHint="send"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  const v = message.trim();
                  if (v && !sendMessage.isPending) sendMessage.mutate();
                }
              }}
            />
            <button
              type="button"
              onClick={() => {
                const v = message.trim();
                if (v && !sendMessage.isPending) sendMessage.mutate();
              }}
              disabled={!message.trim() || sendMessage.isPending}
            >
              <Send size={20} />
            </button>
          </div>
          {(user.role === "agent" || user.role === "admin") && (
            <label className="internal-toggle">
              <input type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} />
              Catatan Internal (tidak terlihat pengguna)
            </label>
          )}
        </div>
      )}
    </div>
  );
}
