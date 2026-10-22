import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import api from "../lib/api";
import { Video, StopCircle, X, Maximize, Shrink } from "lucide-react";

/**
 * Remote desktop: tombol mulai sesi + dialog viewer live.
 *
 * dipakai di DeviceList (ikon kecil di tiap kartu) dan DeviceDetail (tombol besar).
 * Kontrol mouse/keyboard dikirim balik ke agent lewat WebSocket.
 */

interface Props {
  deviceId: string;
  deviceName: string;
  osName?: string;
  /** "icon" = ikon kecil di kartu device, "button" = tombol penuh */
  variant?: "icon" | "button";
  label?: string;
}

export default function RemoteControl({
  deviceId,
  deviceName,
  osName,
  variant = "button",
  label,
}: Props) {
  const [session, setSession] = useState<{ id: string; status: string } | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [frameData, setFrameData] = useState<string | null>(null);
  const [viewerConnected, setViewerConnected] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  // Posisi kursor remote terakhir (ternormalisasi 0..1). Dipakai buat
  // menggambar marker kursor, karena frame tak memuat kursor OS.
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  // true = tampilkan layar pada ukuran asli (1:1) + scrollable
  const [actualSize, setActualSize] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  // Remote desktop (capture + kontrol) diimplementasi untuk macOS + Windows.
  const os = (osName || "").toLowerCase();
  const supported =
    !os ||
    os.includes("darwin") ||
    os.includes("mac") ||
    os.includes("windows") ||
    os.includes("win32") ||
    os.includes("win64");

  // -------------------------------------------------------------------
  // WebSocket viewer: terima frame + kirim input ke desktop
  // -------------------------------------------------------------------
  useEffect(() => {
    if (!viewerOpen || !session) return;
    let ws: WebSocket | null = null;
    let alive = true;

    const connect = async () => {
      const wsUrl =
        (import.meta.env.VITE_WS_URL as string | undefined) ||
        (import.meta.env.VITE_API_URL as string | undefined)
          ?.replace(/^http/, "ws")
          .replace(/\/api$/, "") ||
        "ws://localhost";
      try {
        ws = new WebSocket(`${wsUrl}/ws`);
        ws.binaryType = "arraybuffer";

        ws.onopen = () => {
          if (!ws) return;
          setViewerConnected(true);
          wsRef.current = ws;
          ws.send(
            JSON.stringify({
              type: "subscribe-remote",
              deviceId,
              token: localStorage.getItem("token"),
              isAgent: true,
            })
          );
        };

        ws.onmessage = (ev) => {
          if (!alive) return;
          try {
            // Frame TEXT = string, BINARY = ArrayBuffer. Jangan paksa decode.
            const raw =
              typeof ev.data === "string"
                ? ev.data
                : new TextDecoder().decode(ev.data as ArrayBuffer);
            const data = JSON.parse(raw);
            if (data.type === "remote_frame" && data.session_id === session.id) {
              const mime = data.format === "jpeg" ? "image/jpeg" : "image/png";
              setFrameData(`data:${mime};base64,${data.data}`);
              setSessionEnded(false);
            }
            // Sesi diakhiri (admin/klien/timeout) — jangan tampilkan frame beku
            if (data.type === "remote_ended" && data.sessionId === session.id) {
              setSessionEnded(true);
              setSession((s) => (s ? { ...s, status: "ended" } : s));
            }
          } catch {}
        };

        ws.onclose = () => {
          setViewerConnected(false);
          wsRef.current = null;
          if (alive) setTimeout(connect, 3000);
        };
      } catch {
        setViewerConnected(false);
        if (alive) setTimeout(connect, 3000);
      }
    };

    connect();
    return () => {
      alive = false;
      if (ws) ws.close();
      wsRef.current = null;
    };
  }, [viewerOpen, session, deviceId]);

  // Kirim input ke desktop via WS
  const sendInput = useCallback(
    (input: any) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && session) {
        wsRef.current.send(
          JSON.stringify({
            type: "remote_input",
            session_id: session.id,
            input,
          })
        );
      }
    },
    [session]
  );

  // Koordinat ternormalisasi (0..1) relatif area gambar, supaya viewer
  // tak perlu tahu ukuran layar asli (frame yg dikirim sudah di-downscale).
  const toNorm = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0,
      y: rect.height > 0 ? (e.clientY - rect.top) / rect.height : 0,
    };
  };

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const { x, y } = toNorm(e);
      // Kursor remote digambar sendiri di viewer (position terakhir).
      // Capture layar tak pernah menyertakan kursor OS (GDI di Windows,
      // screencapture tanpa -C di macOS), jadi tanpa ini yang kelihatan
      // cuma panah browser.
      setCursor({ x, y });
      sendInput({ type: "MouseMove", x, y, norm: true });
    },
    [sendInput]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const { x, y } = toNorm(e);
      sendInput({
        type: "MouseDown",
        button: e.button === 2 ? "right" : "left",
        x,
        y,
        norm: true,
      });
      e.preventDefault();
    },
    [sendInput]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      const { x, y } = toNorm(e);
      sendInput({
        type: "MouseUp",
        button: e.button === 2 ? "right" : "left",
        x,
        y,
        norm: true,
      });
    },
    [sendInput]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Cegah shortcut browser (Cmd+W, Cmd+T, ...) supaya tak buka tab baru
      e.preventDefault();
      e.stopPropagation();
      sendInput({
        type: "KeyDown",
        key: e.key,
        shift: e.shiftKey,
        ctrl: e.ctrlKey,
        alt: e.altKey,
        meta: e.metaKey,
      });
    },
    [sendInput]
  );

  const handleKeyUp = useCallback(
    (e: React.KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      sendInput({
        type: "KeyUp",
        key: e.key,
        shift: e.shiftKey,
        ctrl: e.ctrlKey,
        alt: e.altKey,
        meta: e.metaKey,
      });
    },
    [sendInput]
  );

  // Mulai sesi remote (atau pakai sesi yang sudah ada)
  const startRemote = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await api.post("/remote/", {
        device_id: deviceId,
        agent_name: "Admin",
      });
      setSession({ id: res.data.id, status: res.data.status });
      setSessionEnded(false);
      setFrameData(null);
      setViewerOpen(true);
    } catch (e: any) {
      // 409 = ada sesi aktif/pending -> pakai sesi itu
      if (e.response?.status === 409 && e.response?.data?.session?.id) {
        setSession({ id: e.response.data.session.id, status: e.response.data.session.status });
        setSessionEnded(false);
        setFrameData(null);
        setViewerOpen(true);
      } else {
        alert(e.response?.data?.error || "Gagal membuat sesi remote");
      }
    } finally {
      setLoading(false);
    }
  };

  const endSession = async () => {
    if (!session) return;
    try {
      await api.delete(`/remote/${session.id}`);
    } catch {}
    setViewerOpen(false);
    setSession(null);
    setFrameData(null);
    setSessionEnded(false);
  };

  const btnTitle = supported
    ? "Kontrol layar PC ini dari web admin"
    : "Remote desktop baru tersedia untuk PC macOS dan Windows";

  return (
    <>
      {variant === "icon" ? (
        <button
          className="device-remote-btn"
          onClick={(e) => {
            e.stopPropagation();
            startRemote();
          }}
          disabled={loading || !supported}
          title={btnTitle}
          aria-label={`Remote ${deviceName}`}
        >
          <Video size={14} />
        </button>
      ) : (
        <button
          className="btn btn-primary btn-sm btn-action"
          onClick={startRemote}
          disabled={loading || !supported}
          title={btnTitle}
        >
          {loading ? (
            "Membuat sesi..."
          ) : (
            <>
              <Video size={16} /> {label || "Remote"}
            </>
          )}
        </button>
      )}

      {viewerOpen && session &&
        createPortal(
          <div className="remote-viewer-overlay" onClick={(e) => e.stopPropagation()}>
          <div className="remote-viewer-panel">
            <div className="remote-viewer-head">
              <h2>Remote: {deviceName}</h2>
              <div className="remote-viewer-status">
                {viewerConnected ? "● Terhubung" : "○ Menyambung..."}
              </div>
              <button
                className="btn btn-tinted btn-sm remote-zoom-btn"
                onClick={() => setActualSize((v) => !v)}
                title={
                  actualSize
                    ? "Tampilkan layar sesuai ukuran panel"
                    : "Tampilkan layar 1:1 (ukuran asli, bisa di-scroll)"
                }
              >
                {actualSize ? <Shrink size={15} /> : <Maximize size={15} />}
                {actualSize ? "Pas" : "1:1"}
              </button>
              <button
                className="btn btn-quiet btn-sm"
                onClick={() => {
                  setViewerOpen(false);
                  setSession(null);
                  setFrameData(null);
                }}
              >
                <X size={16} /> Tutup
              </button>
            </div>
            <div className="remote-viewer-body">
              {sessionEnded ? (
                <div className="remote-screen-placeholder">
                  <StopCircle size={56} className="remote-screen-icon" />
                  <p>Sesi remote sudah berakhir</p>
                  <p className="muted" style={{ fontSize: "0.8125rem" }}>
                    Diakhiri oleh admin, pengguna, atau kedaluwarsa (30 menit idle).
                  </p>
                </div>
              ) : frameData ? (
                <div className={actualSize ? "remote-screen-wrap actual" : "remote-screen-wrap"}>
                  <img
                    src={frameData}
                    alt="Remote screen"
                    className={actualSize ? "remote-screen actual" : "remote-screen"}
                    onMouseMove={handleMouseMove}
                    onMouseDown={handleMouseDown}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={() => setCursor(null)}
                    onKeyDown={handleKeyDown}
                    onKeyUp={handleKeyUp}
                    onContextMenu={(e) => e.preventDefault()}
                    tabIndex={0}
                    autoFocus
                  />
                  {cursor && (
                    <span
                      className="remote-cursor"
                      style={{ left: `${cursor.x * 100}%`, top: `${cursor.y * 100}%` }}
                    />
                  )}
                </div>
              ) : (
                <div className="remote-screen-placeholder">
                  <Video size={64} className="remote-screen-icon" />
                  <p>Menunggu layar klien...</p>
                  <p className="muted" style={{ fontSize: "0.8125rem" }}>
                    Klik layar untuk fokus, lalu gerakkan mouse / ketik.
                  </p>
                  <p className="muted" style={{ fontSize: "0.8125rem" }}>
                    Sesi ID: {session.id} · Status: {session.status}
                  </p>
                </div>
              )}
            </div>
            <div className="remote-viewer-controls">
              <button className="btn btn-danger" onClick={endSession}>
                <StopCircle size={16} /> Akhiri Sesi Remote
              </button>
            </div>
          </div>
        </div>,
          document.body
        )}
    </>
  );
}
