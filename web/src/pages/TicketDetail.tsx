import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRealtime } from "../hooks/useRealtime";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import Pagination from "../components/Pagination";
import Gallery, { GalleryLabel } from "../components/Gallery";
import api from "../lib/api";
import { useTheme } from "../hooks/useTheme";
import dayjs from "dayjs";
import { ArrowLeft, Sun, Moon, ChevronDown, ChevronUp, ArrowDown } from "lucide-react";
import ChatThread from "../components/chat/ChatThread";
import ChatComposer from "../components/chat/ChatComposer";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";

const statusMeta: Record<
  string,
  {
    variant: "statusBaru" | "statusProses" | "statusTunggu" | "statusSelesai" | "statusTutup" | "secondary";
    label: string;
  }
> = {
  baru: { variant: "statusBaru", label: "Diterima" },
  sedang_ditangani: { variant: "statusProses", label: "Sedang Dikerjakan" },
  menunggu_pengguna: { variant: "statusTunggu", label: "Menunggu" },
  selesai: { variant: "statusSelesai", label: "Selesai" },
  ditutup: { variant: "statusTutup", label: "Ditutup" },
};

export default function TicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  // Kembali ke halaman asal tempat tiket ini dilihat (mirip tombol back
  // browser). Kalau tiket dibuka langsung lewat URL, tak ada riwayat ->
  // jatuh ke daftar Perangkat.
  const location = useLocation();
  const backTo = (location.state as { from?: string } | null)?.from || "/devices";
  const goBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx;
    if (typeof idx === "number" && idx > 0) navigate(-1);
    else navigate(backTo);
  };
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [msgPage, setMsgPage] = useState<number | null>(null); // null = ikut halaman terakhir
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Gambar yang dipilih untuk dikirim (belum diupload)
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [infoCollapsed, setInfoCollapsed] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

      // 1. Upload gambar dulu (bila ada), dapat id lampiran
      let attachmentIds: string[] = [];
      if (pendingFiles.length) {
        const fd = new FormData();
        pendingFiles.forEach((f) => fd.append("files", f));
        const up = await api.post("/attachments/ticket/" + id, fd, { headers: { "Content-Type": "multipart/form-data" } });
        attachmentIds = (up.data || []).map((a: any) => a.id);
      }

      // 2. Kirim pesan + rujukan lampiran
      const res = await api.post("/messages/ticket/" + id, {
        body: message,
        message_type: isInternal ? "internal" : "public",
        clientRequestId: reqId,
        ...(attachmentIds.length ? { attachment_ids: attachmentIds } : {}),
      });
      return res.data;
    },
    onSuccess: () => {
      setMessage("");
      setPendingFiles([]);
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

  // Judul tab: bedakan tiap halaman (tiket, device, inventaris, ...)
  useEffect(() => {
    if (!ticket) return;
    document.title = `${ticket.ticket_number} · ${ticket.title}`.slice(0, 90) + " — Ticketing";
  }, [ticket]);

  // Pratinjau gambar terpilih
  useEffect(() => {
    if (!pendingFiles.length) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(pendingFiles[0]);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingFiles]);

  // Textarea tumbuh mengikuti isi (maks 144px), kembali mengecil saat dikosongkan
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 144) + "px";
  }, [message]);

  const pickFiles = (list: FileList | null) => {
    if (!list?.length) return;
    const imgs = Array.from(list).filter((f) => f.type.startsWith("image/"));
    if (!imgs.length) return;
    if (pendingFiles.length + imgs.length > 5 || imgs.some(f => f.size > 5 * 1024 * 1024)) {
      alert("Maksimal 5 gambar, masing-masing 5 MB"); return;
    }
    setPendingFiles((prev) => [...prev, ...imgs].slice(0, 5));
  };

  if (!ticket) {
    return (
      <div className="flex h-dvh items-center justify-center text-sm text-muted-foreground">
        Memuat...
      </div>
    );
  }

  // Pagination pesan: 10/halaman, default halaman terakhir
  const PER = 10;
  const all = messages || [];
  const totalMsgPages = Math.max(1, Math.ceil(all.length / PER));
  const curMsgPage = Math.min(msgPage ?? totalMsgPages, totalMsgPages);
  const shown = all.slice((curMsgPage - 1) * PER, curMsgPage * PER);

  const handleMessagesScroll = () => {
    const el = messagesRef.current;
    if (!el) return;
    setShowJump(el.scrollHeight - el.scrollTop - el.clientHeight > 200);
  };

  const jumpToLatest = () => {
    if (curMsgPage < totalMsgPages) setMsgPage(null);
    else messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const meta = statusMeta[ticket.status] || { variant: "secondary" as const, label: ticket.status };

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden">
      <header className="flex items-center gap-2 border-b border-border bg-card px-3 py-3 sm:px-4">
        <Button variant="ghost" className="gap-1.5 px-2" onClick={goBack}>
          <ArrowLeft size={20} /> Kembali
        </Button>
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <h2 className="truncate text-base font-bold tracking-tight sm:text-lg">
            {ticket.ticket_number}
          </h2>
          <Badge variant={meta.variant}>{meta.label}</Badge>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto shrink-0"
          onClick={toggle}
          aria-label={theme === "dark" ? "Mode terang" : "Mode gelap"}
          title={theme === "dark" ? "Mode terang" : "Mode gelap"}
        >
          {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <aside className={"shrink-0 border-b border-border bg-card lg:min-h-0 lg:border-b-0 lg:border-r lg:overflow-y-auto " + (infoCollapsed ? "lg:w-12" : "lg:w-[380px]")}>
        <div className={"flex items-center justify-between gap-2 px-4 py-3 sm:px-6 lg:px-4 " + (infoCollapsed ? "lg:justify-center lg:px-2" : "")}>
          <span className={"text-xs font-semibold uppercase tracking-wide text-muted-foreground " + (infoCollapsed ? "lg:hidden" : "")}>
            Detail tiket
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => setInfoCollapsed((c) => !c)}
            aria-label={infoCollapsed ? "Tampilkan detail tiket" : "Sembunyikan detail tiket"}
            title={infoCollapsed ? "Tampilkan detail tiket" : "Sembunyikan detail tiket"}
          >
            {infoCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </Button>
        </div>
        {infoCollapsed ? (
          <div className="truncate px-4 pb-3 text-sm font-medium sm:px-6 lg:hidden">{ticket.title}</div>
        ) : (
          <div className="space-y-4 px-4 pb-4 sm:px-6 lg:px-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Judul laporan
          </div>
          <h3 className="mt-1 text-lg font-bold [overflow-wrap:anywhere]">{ticket.title}</h3>
        </div>
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Detail masalah
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground [overflow-wrap:anywhere]">
            {ticket.description}
          </p>
        </div>
        {ticket.attachments?.length > 0 && (
          <div>
            <GalleryLabel count={ticket.attachments.length} />
            <Gallery items={ticket.attachments} />
          </div>
        )}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-4">
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">Pelapor</div>
            <div className="text-sm font-medium [overflow-wrap:anywhere]">
              {ticket.requester_full_name || ticket.requester_name || "Karyawan"}
            </div>
          </div>
          {ticket.device_name && (
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">Device</div>
              <div className="text-sm font-medium [overflow-wrap:anywhere]">{ticket.device_name}</div>
            </div>
          )}
          {ticket.lokasi && (
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">Lokasi</div>
              <div className="text-sm font-medium [overflow-wrap:anywhere]">{ticket.lokasi}</div>
            </div>
          )}
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">Dibuat</div>
            <div className="text-sm font-medium">{dayjs(ticket.created_at).format("DD MMM YYYY HH:mm")}</div>
          </div>
        </div>
        {(user.role === "agent" || user.role === "admin") && (
          <div className="grid gap-4 border-t border-border pt-4">
            <div className="grid gap-1.5">
              <Label htmlFor="ticket-status">Ubah Status</Label>
              <Select value={ticket.status} onValueChange={(v) => updateStatus.mutate(v)}>
                <SelectTrigger id="ticket-status" className="w-full dark:bg-input/30">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="baru">Diterima</SelectItem>
                  <SelectItem value="sedang_ditangani">Sedang Dikerjakan</SelectItem>
                  <SelectItem value="menunggu_pengguna">Menunggu</SelectItem>
                  <SelectItem value="selesai">Selesai</SelectItem>
                  <SelectItem value="ditutup">Ditutup</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ticket-assignee">Tugaskan</Label>
              <Select
                value={ticket.assignee_id ? String(ticket.assignee_id) : "unassigned"}
                onValueChange={(v) => assignTicket.mutate(v === "unassigned" ? null : v)}
              >
                <SelectTrigger id="ticket-assignee" className="w-full dark:bg-input/30">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Belum ditugaskan</SelectItem>
                  {agents?.map((a: any) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {a.full_name || a.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
          </div>
        )}
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-muted/30">
      <div className="relative min-h-0 flex-1">
        <div
          ref={messagesRef}
          onScroll={handleMessagesScroll}
          className="chat-scroll h-full overflow-y-auto"
        >
          <div className="w-full px-4 py-6">
          <ChatThread
            messages={shown}
            viewerRole={user.role}
            requesterName={ticket.requester_full_name || ticket.requester_name}
            ticketClosed={ticket.status === "ditutup"}
            typing={typing || []}
            pagination={
              all.length > PER ? (
                <Pagination
                  page={curMsgPage}
                  totalPages={totalMsgPages}
                  total={all.length}
                  onChange={(p) => { if (p !== curMsgPage) setMsgPage(p); }}
                />
              ) : undefined
            }
          />
            <div ref={messagesEndRef} />
          </div>
        </div>
        {showJump && (
          <Button
            className="absolute bottom-4 right-4 z-10 gap-1.5 rounded-full shadow-lg"
            onClick={jumpToLatest}
          >
            <ArrowDown size={16} /> Pesan terbaru
          </Button>
        )}
      </div>

      {ticket.status !== "ditutup" && (
        <ChatComposer
          message={message}
          onMessageChange={setMessage}
          textareaRef={textareaRef}
          onTypingChange={(t) => setTyping.mutate(t)}
          pendingFiles={pendingFiles}
          previewUrl={previewUrl}
          onPickFiles={pickFiles}
          onClearFiles={() => setPendingFiles([])}
          isInternal={isInternal}
          onToggleInternal={() => setIsInternal((v) => !v)}
          canMarkInternal={user.role === "agent" || user.role === "admin"}
          isPending={sendMessage.isPending}
          sendError={
            sendMessage.isError
              ? (sendMessage.error as any)?.response?.data?.error ||
                "Gagal mengirim. Pesan dan gambar tetap tersedia, coba lagi."
              : null
          }
          onSend={() => {
            const v = message.trim();
            if ((v || pendingFiles.length) && !sendMessage.isPending) sendMessage.mutate();
          }}
        />
      )}
      </div>
    </div>
    </div>
  );
}
