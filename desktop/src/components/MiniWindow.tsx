import { useState, useEffect } from "react";
import { X, Minimize, Search, Plus, RefreshCw, Pin, PinOff, Sun, Moon } from "lucide-react";
import TicketList from "./TicketList";
import ChatView from "./ChatView";
import TicketForm from "./TicketForm";
import AccountMenu from "./AccountMenu";
import { useTickets } from "../hooks/useTickets";
import { useUnread } from "../hooks/useUnread";
import { useRealtime } from "../hooks/useRealtime";
import { useDragRegion } from "../hooks/useDragRegion";
import { useTheme } from "../hooks/useTheme";

async function tauriEmit(event: string) {
  if (typeof window.__TAURI__ !== "undefined") {
    const { emit } = await import("@tauri-apps/api/event");
    return emit(event);
  }
}

async function minimizeWindow() {
  if (typeof window.__TAURI__ !== "undefined") {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    getCurrentWindow().minimize();
  }
}

async function hideWindow() {
  if (typeof window.__TAURI__ !== "undefined") {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    getCurrentWindow().hide();
  } else {
    window.close();
  }
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      title={theme === "dark" ? "Mode Terang" : "Mode Gelap"}
      className={theme === "dark" ? "active" : ""}
      aria-label={theme === "dark" ? "Mode Terang" : "Mode Gelap"}
    >
      {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

export default function MiniWindow() {
  const [view, setView] = useState<"list" | "chat" | "form">("list");
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [pinned, setPinned] = useState(false);
  const { tickets, isLoading, refetch, createTicket } = useTickets({ search, status });
  const { unread } = useUnread();
  const onDrag = useDragRegion();
  // Refresh list saat pesan baru masuk di tiket manapun
  useRealtime("__list__");

  // Always-on-top toggle
  useEffect(() => {
    if (typeof window.__TAURI__ === "undefined") return;
    import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
      getCurrentWindow().setAlwaysOnTop(pinned);
    });
  }, [pinned]);

  const stats = {
    baru: tickets.filter(t => t.status === "baru").length,
    sedang_ditangani: tickets.filter(t => t.status === "sedang_ditangani").length,
    menunggu: tickets.filter(t => t.status === "menunggu_pengguna").length,
    selesai: tickets.filter(t => t.status === "selesai").length,
  };

  const handleCreateTicket = async (data: {
    description: string;
    priority?: string;
    deviceId?: string;
    deviceName?: string;
    lokasi?: string;
  }) => {
    const ticket = await createTicket.mutateAsync(data);
    setView("list");
    return ticket;
  };

  const handleBack = () => {
    setView("list");
    setSelectedTicket(null);
  };

  if (view === "chat") {
    return selectedTicket ? (
      <ChatView ticketId={selectedTicket} onBack={handleBack} />
    ) : (
      <div className="loading"><span className="spinner" />Memuat...</div>
    );
  }

  if (view === "form") {
    return <TicketForm onSubmit={handleCreateTicket} onCancel={handleBack} />;
  }

  return (
    <div className="mini-window">
      <header className="mini-header" onMouseDown={onDrag}>
        <h1>Tiket Saya</h1>
        <div className="actions">
          <ThemeToggle />
          <button onClick={() => setPinned(p => !p)} title={pinned ? "Lepas Always-on-Top" : "Sematkan Always-on-Top"} className={pinned ? "active" : ""}>
            {pinned ? <PinOff size={18} /> : <Pin size={18} />}
          </button>
          <button onClick={() => refetch()} title="Refresh"><RefreshCw size={18} /></button>
          <button onClick={() => setView("form")} title="Tiket Baru"><Plus size={18} /></button>
          <AccountMenu />
          <button onClick={minimizeWindow} title="Minimize"><Minimize size={18} /></button>
          <button onClick={hideWindow} title="Tutup"><X size={18} /></button>
        </div>
      </header>

      <div className="stats">
        <div className="stat baru"><span className="count">{stats.baru}</span><span className="label">Baru</span></div>
        <div className="stat proses"><span className="count">{stats.sedang_ditangani}</span><span className="label">Ditangani</span></div>
        <div className="stat tunggu"><span className="count">{stats.menunggu}</span><span className="label">Menunggu</span></div>
        <div className="stat selesai"><span className="count">{stats.selesai}</span><span className="label">Selesai</span></div>
      </div>

      <div className="filters">
        <div className="search-box">
          <Search size={16} />
          <input type="text" placeholder="Cari tiket..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">Semua Status</option>
          <option value="baru">Diterima</option>
          <option value="sedang_ditangani">Sedang Dikerjakan</option>
          <option value="menunggu_pengguna">Menunggu</option>
          <option value="selesai">Selesai</option>
          <option value="ditutup">Ditutup</option>
        </select>
      </div>

      <div className="ticket-list">
        {isLoading ? (
          <div className="loading"><span className="spinner" />Memuat...</div>
        ) : tickets.length === 0 ? (
          <div className="empty">
            <div style={{fontSize: "2rem", marginBottom: "0.5rem"}}>📭</div>
            Tidak ada tiket. Klik + untuk buat tiket baru.
          </div>
        ) : (
          <TicketList
            tickets={tickets.map(t => ({ ...t, unread_count: unread[t.id] || 0 }))}
            onSelect={id => { setSelectedTicket(id); setView("chat"); }}
          />
        )}
      </div>
    </div>
  );
}
