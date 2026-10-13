import { useState, useEffect, useRef } from "react";
import { EyeOff, ExternalLink, X } from "lucide-react";
import { useUnread } from "../hooks/useUnread";
import { useRealtime } from "../hooks/useRealtime";
import petGif from "../assets/pet.gif";

const isTauri = () =>
  typeof window !== "undefined" &&
  (typeof (window as any).__TAURI_INTERNALS__ !== "undefined" ||
   typeof (window as any).__TAURI__ !== "undefined");

// Tauri invoke wrapper — graceful fallback di browser
async function tauriInvoke(cmd: string, args?: object): Promise<any> {
  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      return await invoke(cmd, args as Record<string, unknown>);
    } catch (e) {
      console.error(`[invoke ${cmd}] error:`, e);
    }
  }
}

// Buka mini window langsung via invoke & event
async function tauriShowMini() {
  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("show_mini_window");
    } catch (e) {
      console.error("[pet] show_mini_window gagal:", e);
    }
    try {
      const { emit } = await import("@tauri-apps/api/event");
      await emit("show-mini");
    } catch {}
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
  // Tema adaptif: terang/gelap sesuai warna layar di sekitar pet
  const [bgLight, setBgLight] = useState<boolean>(() =>
    typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: light)").matches
  );

  useEffect(() => {
    let alive = true;
    const sample = async () => {
      try {
        const lum = await tauriInvoke("sample_bg_luminance");
        if (alive && typeof lum === "number") setBgLight(lum > 128);
      } catch {}
    };
    sample();
    const id = setInterval(sample, 3000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  useEffect(() => {
    let alive = true;
    const poll = () => tauriInvoke("get_usage").then(d => { if (alive && d) setUsage(d); }).catch(() => {});
    poll();
    const id = setInterval(poll, 2000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  // ponytail: net format — kecil ekstra, cuma tampilan
  const fmt = (bs: number) => bs >= 1_000_000 ? `${(bs / 1_000_000).toFixed(1)}Mb` : bs >= 1000 ? `${(bs / 1000).toFixed(0)}kb` : `${bs}b`;
  const overlayRef = useRef<HTMLDivElement>(null);
  const downInfo = useRef({ x: 0, y: 0, time: 0, isDown: false });
  const hasDragged = useRef(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    downInfo.current = { x: e.screenX, y: e.screenY, time: Date.now(), isDown: true };
    hasDragged.current = false;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!downInfo.current.isDown || hasDragged.current) return;
    if (e.buttons !== 1) {
      downInfo.current.isDown = false;
      return;
    }
    const dx = Math.abs(e.screenX - downInfo.current.x);
    const dy = Math.abs(e.screenY - downInfo.current.y);
    if (dx > 5 || dy > 5) {
      hasDragged.current = true;
      if (isTauri()) {
        import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
          getCurrentWindow().startDragging().catch((err) => console.error("[pet] startDragging gagal:", err));
        });
      }
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const wasDown = downInfo.current.isDown;
    const didDrag = hasDragged.current;
    downInfo.current.isDown = false;

    // Jika mouse dilepas tanpa drag dalam waktu wajar -> anggap klik
    if (wasDown && !didDrag && Date.now() - downInfo.current.time < 500) {
      onClick();
      tauriShowMini();
      setShowMenu(false);
    }
  };

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
    if (!hasDragged.current) {
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
      className={"pet-overlay" + (bgLight ? " pet-light" : " pet-dark")}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      title="Klik untuk buka, drag untuk pindah, klik kanan untuk menu"
    >
      <img
        src={petGif}
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
            CPU {usage.cpu}% · RAM {usage.ram}% · SSD {usage.disks?.[0]?.pct ?? 0}% · ↓{fmt(usage.net_down)} ↑{fmt(usage.net_up)}
          </span>
        )}
      </div>
      {unreadCount > 0 && <div className="pet-badge">{unreadCount}</div>}
      {showMenu && (
        <div className="pet-context-menu">
          <button onClick={() => { onClick(); tauriShowMini(); setShowMenu(false); }}>
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
