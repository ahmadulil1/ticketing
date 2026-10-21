import { useState, useEffect, useRef } from "react";
import {
  EyeOff,
  ExternalLink,
  X,
  GraduationCap,
  Pause,
  Video,
  AlertCircle,
} from "lucide-react";
import { useUnread } from "../hooks/useUnread";
import { useRealtime } from "../hooks/useRealtime";
import { getDeviceId, getDeviceSecret, registerDeviceSecret } from "../services/device";
import api from "../services/api";
import petGif from "../assets/pet.gif";

// Tauri event listener wrapper
async function tauriListen(event: string, handler: (payload: any) => void) {
  if (isTauri()) {
    try {
      const { listen } = await import("@tauri-apps/api/event");
      const unlisten = await listen(event, (event: any) => handler(event.payload));
      return unlisten;
    } catch (e) {
      console.error(`[listen ${event}] error:`, e);
    }
  }
}

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

type RemoteState = "idle" | "pending" | "active";

export default function PetOverlay({ onClick }: Props) {
  const [showMenu, setShowMenu] = useState(false);
  const [petHidden, setPetHidden] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const { unread } = useUnread();
  useRealtime("__list__", []);
  const unreadCount = Object.values(unread).reduce((a, b) => a + b, 0);

  // Remote desktop state
  const [remoteState, setRemoteState] = useState<RemoteState>("idle");
  const [remoteSessionId, setRemoteSessionId] = useState<string>("");
  const [remoteAgentName, setRemoteAgentName] = useState<string>("");
  const [remotePending, setRemotePending] = useState(false);

  const deviceId = getDeviceId();
  const wsRef = useRef<WebSocket | null>(null);
  const captureLoopRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Jam
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Monitoring CPU/RAM/disk/internet
  const [usage, setUsage] = useState<any>(null);
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
    const poll = () =>
      tauriInvoke("get_usage").then((d) => {
        if (alive && d) setUsage(d);
      }).catch(() => {});
    poll();
    const id = setInterval(poll, 2000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // -------------------------------------------------------------------
  // Izin sistem untuk remote desktop (macOS): Accessibility + Screen Recording
  // -------------------------------------------------------------------
  const [permMissing, setPermMissing] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      const p = await tauriInvoke("remote_check_permissions");
      if (!alive || !p) return;
      const missing: string[] = [];
      if (!p.accessibility) missing.push("accessibility");
      if (!p.screen_recording) missing.push("screen_recording");
      setPermMissing(missing);
    };
    check();
    const id = setInterval(check, 30000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const handleFixPermissions = async () => {
    const p = await tauriInvoke("remote_check_permissions");
    if (p && !p.screen_recording) {
      await tauriInvoke("remote_request_screen_recording");
    }
    if (p && !p.accessibility) {
      await tauriInvoke("remote_open_accessibility_settings");
    }
  };

  // -------------------------------------------------------------------
  // Daftarkan device secret ke server (sekali, idempotent)
  // -------------------------------------------------------------------
  useEffect(() => {
    registerDeviceSecret();
  }, []);

  // -------------------------------------------------------------------
  // WebSocket signaling untuk remote desktop (channel remote:{deviceId})
  // -------------------------------------------------------------------
  useEffect(() => {
    let ws: WebSocket | null = null;
    let alive = true;

    const connect = async () => {
      const wsUrl =
        (import.meta.env.VITE_WS_URL as string | undefined) ||
        (import.meta.env.VITE_API_URL as string | undefined)
          ?.replace(/^http/, "ws")
          .replace(/\/api$/, "") ||
        "ws://localhost";
      const url = `${wsUrl}/ws`;
      try {
        ws = new WebSocket(url);
        ws.binaryType = "arraybuffer";

        ws.onopen = () => {
          console.log("[pet-remote] WS connected");
          wsRef.current = ws;
          // Subscribe ke channel remote untuk device ini (agent mode).
          // deviceSecret wajib cocok dengan yang terdaftar di server.
          ws?.send(
            JSON.stringify({
              type: "subscribe-remote",
              deviceId,
              deviceSecret: getDeviceSecret(),
              isAgent: false,
            })
          );
        };

        ws.onmessage = (ev) => {
          if (!alive) return;
          try {
            const data = JSON.parse(new TextDecoder().decode(ev.data as ArrayBuffer));
            switch (data.type) {
              case "remote_request":
                if (data.device_id === deviceId) {
                  setRemoteAgentName(data.agent_name || "Agent");
                  setRemoteSessionId(data.sessionId);
                  setRemoteState("pending");
                  setRemotePending(true);
                }
                break;
              case "remote_ended":
                if (data.sessionId === remoteSessionId) {
                  setRemoteState("idle");
                  setRemoteSessionId("");
                  setRemoteAgentName("");
                  setRemotePending(false);
                  if (captureLoopRef.current) {
                    clearInterval(captureLoopRef.current);
                    captureLoopRef.current = null;
                  }
                }
                break;
              case "remote_input":
                // Input dari web viewer: injeksi ke OS
                if (data.session_id === remoteSessionId && remoteState === "active") {
                  tauriInvoke("remote_inject_input", {
                    session_id: remoteSessionId,
                    input: data.input,
                  });
                }
                break;
              default:
                break;
            }
          } catch {}
        };

        ws.onclose = () => {
          if (alive) {
            setTimeout(connect, 3000);
          }
        };
      } catch {
        if (alive) setTimeout(connect, 3000);
      }
    };

    connect();
    return () => {
      alive = false;
      if (ws) ws.close();
    };
  }, [deviceId, remoteSessionId]);

  // -------------------------------------------------------------------
  // Capture loop: saat remote aktif, tangkap layar terus menerus
  // -------------------------------------------------------------------
  useEffect(() => {
    if (remoteState === "active" && remoteSessionId) {
      captureLoopRef.current = setInterval(async () => {
        try {
          await tauriInvoke("remote_capture_and_send", {
            session_id: remoteSessionId,
          });
        } catch (e) {
          console.error("[pet] capture error:", e);
        }
      }, 500); // ~2 FPS
      return () => {
        if (captureLoopRef.current) {
          clearInterval(captureLoopRef.current);
          captureLoopRef.current = null;
        }
      };
    } else {
      if (captureLoopRef.current) {
        clearInterval(captureLoopRef.current);
        captureLoopRef.current = null;
      }
    }
  }, [remoteState, remoteSessionId]);

  // -------------------------------------------------------------------
  // Listener Tauri event `remote-frame`: terima frame dari Rust, kirim via WS
  // -------------------------------------------------------------------
  useEffect(() => {
    let unlisten: (() => void) | undefined = undefined;
    const start = async () => {
      unlisten = await tauriListen("remote-frame", (payload: any) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: "remote_frame",
              session_id: payload.session_id,
              data: payload.data,
              format: payload.format,
            })
          );
        }
      });
    };
    start();
    return () => {
      if (unlisten) unlisten();
    };
  }, [remoteSessionId]);

  const handleAcceptRemote = async () => {
    try {
      await tauriInvoke("remote_respond", {
        session_id: remoteSessionId,
        device_id: deviceId,
        agent_name: remoteAgentName || "Agent",
        accept: true,
      });
      // Kabari server status sesi jadi accepted
      try {
        await api.patch(`/remote/${remoteSessionId}`, {
          status: "accepted",
          device_id: deviceId,
          device_secret: getDeviceSecret(),
        });
      } catch (e) {
        console.error("[pet] patch session accepted gagal:", e);
      }
      setRemoteState("active");
      setRemotePending(false);
    } catch (e) {
      console.error("[pet] remote_accept error:", e);
      setRemoteState("idle");
      setRemotePending(false);
    }
  };

  const handleRejectRemote = async () => {
    try {
      await tauriInvoke("remote_respond", {
        session_id: remoteSessionId,
        device_id: deviceId,
        agent_name: remoteAgentName || "Agent",
        accept: false,
      });
    } catch {}
    // Kabari server sesi ditolak
    try {
      await api.patch(`/remote/${remoteSessionId}`, {
        status: "rejected",
        device_id: deviceId,
        device_secret: getDeviceSecret(),
      });
    } catch {}
    setRemoteState("idle");
    setRemoteSessionId("");
    setRemoteAgentName("");
    setRemotePending(false);
  };

  const handleEndRemote = async () => {
    try {
      await tauriInvoke("remote_end_session", {
        session_id: remoteSessionId,
      });
    } catch {}
    // Kabari server sesi diakhiri user
    try {
      await api.patch(`/remote/${remoteSessionId}`, {
        status: "ended",
        device_id: deviceId,
        device_secret: getDeviceSecret(),
      });
    } catch {}
    setRemoteState("idle");
    setRemoteSessionId("");
    setRemoteAgentName("");
    setRemotePending(false);
  };

  const fmt = (bs: number) =>
    bs >= 1_000_000
      ? `${(bs / 1_000_000).toFixed(1)}Mb`
      : bs >= 1000
      ? `${(bs / 1000).toFixed(0)}kb`
      : `${bs}b`;
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
          getCurrentWindow().startDragging().catch((err) =>
            console.error("[pet] startDragging gagal:", err)
          );
        });
      }
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const wasDown = downInfo.current.isDown;
    const didDrag = hasDragged.current;
    downInfo.current.isDown = false;

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

  // ================================================================
  // Remote consent dialog (muncul saat admin meminta remote)
  // ================================================================
  const consentDialog =
    remoteState === "pending" && remotePending ? (
      <div className="pet-remote-consent">
        <div className="pet-remote-consent-card">
          <AlertCircle size={24} className="pet-remote-icon" />
          <div className="pet-remote-title">Akses Remote</div>
          <div className="pet-remote-subtitle">
            {remoteAgentName} meminta mengontrol komputer Anda
          </div>
          <div className="pet-remote-actions">
            <button className="pet-remote-btn reject" onClick={handleRejectRemote}>
              Tolak
            </button>
            <button className="pet-remote-btn accept" onClick={handleAcceptRemote}>
              Izinkan
            </button>
          </div>
        </div>
      </div>
    ) : null;

  // ================================================================
  // Remote active indicator (di pet overlay saat remote aktif)
  // ================================================================
  const remoteIndicator =
    remoteState === "active" ? (
      <div className="pet-remote-indicator">
        <span className="pet-remote-dot" />
        <span className="pet-remote-label">Sedang di-remote oleh {remoteAgentName}</span>
        <button className="pet-remote-stop" onClick={handleEndRemote}>
          <Pause size={12} /> Hentikan
        </button>
      </div>
    ) : null;

  return (
    <div
      ref={overlayRef}
      className={
        "pet-overlay" +
        (bgLight ? " pet-light" : " pet-dark") +
        (remoteState === "active" ? " pet-remote-active" : "")
      }
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      title="Klik untuk buka, drag untuk pindah, klik kanan untuk menu"
    >
      {consentDialog}
      {remoteIndicator}
      <img
        src={petGif}
        alt="Pet"
        className="pet-image"
        draggable={false}
      />
      <div className="pet-clock">
        <span className="pet-time">
          {now.toLocaleTimeString("id-ID", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
          })}
        </span>
        <span className="pet-date">
          {now
            .toLocaleDateString("id-ID", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })
            .toLowerCase()}
        </span>
        {usage && (
          <span className="pet-stats">
            CPU {usage.cpu}% · RAM {usage.ram}% · SSD {usage.disks?.[0]?.pct ?? 0}% ·
            ↓{fmt(usage.net_down)} ↑{fmt(usage.net_up)}
          </span>
        )}
      </div>
      {unreadCount > 0 && <div className="pet-badge">{unreadCount}</div>}
      {permMissing.length > 0 && (
        <button
          className="pet-perm-warning"
          onClick={handleFixPermissions}
          title="Remote desktop butuh izin Accessibility & Screen Recording. Klik untuk memperbaiki."
        >
          <AlertCircle size={13} /> Izin
        </button>
      )}
      {showMenu && (
        <div className="pet-context-menu">
          <button onClick={() => { onClick(); tauriShowMini(); setShowMenu(false); }}>
            <ExternalLink size={16} /> Buka Ticketing
          </button>
          <button onClick={() => {
            localStorage.setItem("tutorial:show", String(Date.now()));
            onClick(); tauriShowMini(); setShowMenu(false);
          }}>
            <GraduationCap size={16} /> Lihat Tutorial
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
