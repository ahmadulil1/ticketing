import { useState, useEffect, useRef } from "react";
import { EyeOff, ExternalLink, X } from "lucide-react";
import { useUnread } from "../hooks/useUnread";
import { useRealtime } from "../hooks/useRealtime";

// Tauri invoke wrapper — graceful fallback di browser
async function tauriInvoke(cmd: string, args?: object): Promise<any> {
  if (typeof window.__TAURI__ !== "undefined") {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke(cmd, args as Record<string, unknown>);
  }
}

// Buka mini window langsung via invoke (lebih reliable daripada event cross-window)
async function tauriShowMini() {
  if (typeof window.__TAURI__ !== "undefined") {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke("show_mini_window");
  }
}

interface Props {
  onClick: () => void;
}

export default function PetOverlay({ onClick }: Props) {
  const [showMenu, setShowMenu] = useState(false);
  const [petHidden, setPetHidden] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const { unread } = useUnread();
  // WS push instan ke badge pet (window terpisah butuh subscribe sendiri)
  useRealtime("__list__", []);
  const unreadCount = Object.values(unread).reduce((a, b) => a + b, 0);

  // Jam mengikuti waktu komputer, update tiap detik
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Monitoring CPU/RAM/disk/internet tiap 2 detik (invoke Rust get_usage)
  const [usage, setUsage] = useState<any>(null);
  useEffect(() => {
    let alive = true;
    const poll = () => tauriInvoke("get_usage").then(d => { if (alive && d) setUsage(d); }).catch(() => {});
    poll();
    const id = setInterval(poll, 2000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  // ponytail: net format — kecil ekstra, cuma tampilan
  const fmt = (bs: number) => bs >= 1_000_000 ? `${(bs / 1_000_000).toFixed(1)}Mb` : bs >= 1000 ? `${(bs / 1000).toFixed(0)}kb` : `${bs}b`;
  const dragStart = useRef({ x: 0, y: 0 });
  const overlayRef = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  const dragging = useRef(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    moved.current = false;
    dragging.current = true;
    dragStart.current = { x: e.screenX, y: e.screenY };
    // Tauri native drag — window pet 80x80, drag DOM tak efektif
    if (typeof window.__TAURI__ !== "undefined") {
      import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
        getCurrentWindow().startDragging().catch((err) => console.error("[pet] startDragging gagal:", err));
      });
    }
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (dragging.current) {
        const dx = Math.abs(e.screenX - dragStart.current.x);
        const dy = Math.abs(e.screenY - dragStart.current.y);
        if (dx + dy > 4) moved.current = true;
      }
    };
    const onUp = () => {
      if (dragging.current) {
        dragging.current = false;
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (overlayRef.current && !overlayRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("click", onOutside);
    return () => document.removeEventListener("click", onOutside);
  }, []);

  const handleClick = (e: React.MouseEvent) => {
    if (!moved.current) {
      onClick();
      tauriShowMini();
      setShowMenu(false);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setShowMenu(!showMenu);
  };

  const handleHide = () => {
    setPetHidden(true);
    setShowMenu(false);
    tauriInvoke("hide_pet_window");
  };

  const handleQuit = () => {
    tauriInvoke("quit_app");
  };

  if (petHidden) return null;

  return (
    <div
      ref={overlayRef}
      className="pet-overlay"
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      title="Klik untuk buka, drag untuk pindah, klik kanan untuk menu"
    >
      <img
        src="/pet.gif"
        alt="Pet"
        className="pet-image"
        draggable={false}
      />
      <div className="pet-clock">
        <span className="pet-time">
          {now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
        </span>
        <span className="pet-date">
          {now.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).toLowerCase()}
        </span>
        {usage && (
          <span className="pet-stats">
            CPU {usage.cpu} RAM {usage.ram} DSK {usage.disks?.[0]?.pct ?? 0} · ↓{fmt(usage.net_down)} ↑{fmt(usage.net_up)}
          </span>
        )}
      </div>
      {unreadCount > 0 && <div className="pet-badge">{unreadCount}</div>}
      {showMenu && (
        <div className="pet-context-menu">
          <button onClick={() => { onClick(); setShowMenu(false); }}>
            <ExternalLink size={16} /> Buka Ticketing
          </button>
          <button onClick={handleHide}>
            <EyeOff size={16} /> Sembunyikan Pet
          </button>
          <hr />
          <button className="danger" onClick={handleQuit}>
            <X size={16} /> Keluar
          </button>
        </div>
      )}
    </div>
  );
}
