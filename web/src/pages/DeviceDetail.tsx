import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, useCallback } from "react";
import api from "../lib/api";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Video, StopCircle, X } from "lucide-react";
import Pagination from "../components/Pagination";
import DiskBars from "../components/DiskBars";

const STATUS_LABEL: Record<string, string> = {
  baru: "Diterima", sedang_ditangani: "Sedang Dikerjakan", menunggu_pengguna: "Menunggu",
  selesai: "Selesai", ditutup: "Ditutup", dibuka_kembali: "Dibuka Kembali",
};
const PRIO_LABEL: Record<string, string> = { rendah: "Rendah", normal: "Sedang", tinggi: "Tinggi", urgent: "Urgent" };

export default function DeviceDetail() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [remoteSession, setRemoteSession] = useState<{ id: string; status: string } | null>(null);
  const [remoteViewerOpen, setRemoteViewerOpen] = useState(false);
  const [remoteLoading, setRemoteLoading] = useState(false);
  // Viewer state
  const [frameData, setFrameData] = useState<string | null>(null);
  const [viewerConnected, setViewerConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const { data: device, isLoading } = useQuery({
    queryKey: ["device", deviceId],
    queryFn: async () => {
      const res = await api.get(`/devices/${deviceId}`);
      return res.data;
    },
  });

  if (isLoading) return <div className="loading">Memuat...</div>;
  if (!device) return <div className="loading">Device tidak ditemukan</div>;

  const PER = 10;
  const all = device.tickets || [];
  const totalPages = Math.max(1, Math.ceil(all.length / PER));
  const cur = Math.min(page, totalPages);
  const tickets = all.slice((cur - 1) * PER, cur * PER);

  // -------------------------------------------------------------------
  // WebSocket viewer: terima frame + kirim input ke desktop
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
          console.log("[remote-viewer] WS connected");
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
            if (data.type === "remote_frame" && data.session_id === remoteSession?.id) {
              const mime = data.format === "jpeg" ? "image/jpeg" : "image/png";
              setFrameData(`data:${mime};base64,${data.data}`);
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

    if (remoteViewerOpen && remoteSession) {
      connect();
    }
    return () => {
      alive = false;
      if (ws) ws.close();
    };
  }, [remoteViewerOpen, remoteSession, deviceId]);

  // Kirim input ke desktop via WS
  const sendInput = useCallback(
    (input: any) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && remoteSession) {
        wsRef.current.send(
          JSON.stringify({
            type: "remote_input",
            session_id: remoteSession.id,
            input,
          })
        );
      }
    },
    [remoteSession]
  );

  // Koordinat ternormalisasi (0..1) relatif area gambar, supaya viewer
  // tak perlu tahu ukuran layar asli (frame yg dikirim sudah di-downscale).
  const toNorm = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0;
    const y = rect.height > 0 ? (e.clientY - rect.top) / rect.height : 0;
    return { x, y };
  };

  // Mouse move handler
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const { x, y } = toNorm(e);
      sendInput({ type: "MouseMove", x, y, norm: true });
    },
    [sendInput]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const { x, y } = toNorm(e);
      sendInput({ type: "MouseDown", button: e.button === 2 ? "right" : "left", x, y, norm: true });
      e.preventDefault();
    },
    [sendInput]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      const { x, y } = toNorm(e);
      sendInput({ type: "MouseUp", button: e.button === 2 ? "right" : "left", x, y, norm: true });
    },
    [sendInput]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      sendInput({ type: "KeyDown", key: e.key });
    },
    [sendInput]
  );

  const handleKeyUp = useCallback(
    (e: React.KeyboardEvent) => {
      sendInput({ type: "KeyUp", key: e.key });
    },
    [sendInput]
  );

  const createRemoteSession = async () => {
    setRemoteLoading(true);
    try {
      const res = await api.post("/remote/", {
        device_id: deviceId,
        agent_name: "Admin",
      });
      setRemoteSession({ id: res.data.id, status: res.data.status });
    } catch (e: any) {
      alert(e.response?.data?.error || "Gagal membuat sesi remote");
    } finally {
      setRemoteLoading(false);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <button onClick={() => navigate("/devices")} className="btn btn-outline">
          <ArrowLeft size={16} /> Kembali
        </button>
        <h1>{device.device_name || device.device_id}</h1>
        {device.inventory && (
          <button className="btn btn-outline" onClick={() => navigate(`/inventories/${device.inventory.id}`)}>
            Inv. {device.inventory.no_inventaris}
          </button>
        )}
        {!remoteSession && (
          <button
            className="btn btn-outline"
            onClick={createRemoteSession}
            disabled={remoteLoading}
          >
            {remoteLoading ? "Membuat sesi..." : <><Video size={16} /> Remote Desktop</>}
          </button>
        )}
        {remoteSession && remoteSession.status !== "ended" && (
          <button
            className="btn btn-outline"
            onClick={() => setRemoteViewerOpen(true)}
          >
            <Video size={16} /> Buka Viewer
          </button>
        )}
      </div>

      {device.spec && (
        <div className="stat-cards">
          <div className="stat-card"><span className="count" style={{ fontSize: "0.8125rem", wordBreak: "break-word" }}>{device.spec.cpu_model || "-"}</span><span className="label">CPU</span></div>
          <div className="stat-card"><span className="count" style={{ fontSize: "0.8125rem" }}>{device.spec.ram_gb ? `${device.spec.ram_gb} GB` : "-"}</span><span className="label">RAM</span></div>
          <div className="stat-card"><span className="count" style={{ fontSize: "0.8125rem" }}>{device.spec.os_name || "-"}</span><span className="label">OS</span></div>
          <div className="stat-card"><span className="count" style={{ fontSize: "0.8125rem" }}>{device.spec.gpu_model || "-"}</span><span className="label">GPU</span></div>
        </div>
      )}

      <div className="stat-cards">
        <div className="stat-card baru">
          <span className="count">{device.ticket_count}</span>
          <span className="label">Total Tiket</span>
        </div>
        <div className="stat-card proses">
          <span className="count">{device.active_count}</span>
          <span className="label">Tiket Aktif</span>
        </div>
        <div className="stat-card selesai">
          <span className="count" style={{ fontSize: "0.8125rem", wordBreak: "break-all" }}>
            {device.device_id}
          </span>
          <span className="label">Device ID</span>
        </div>
        <div className="stat-card tunggu">
          <span className="count" style={{ fontSize: "0.8125rem" }}>
            {device.last_activity ? new Date(device.last_activity).toLocaleString("id-ID") : "-"}
          </span>
          <span className="label">Aktivitas Terakhir</span>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><h2>Penyimpanan</h2></div>
        <DiskBars disks={device.spec?.disks} />
      </div>

      <div className="panel">
        <div className="panel-head"><h2>Tiket Device Ini</h2></div>
        <div className="device-tickets">
          {(tickets).map((t: any) => (
            <button key={t.id} className="ticket-row" onClick={() => navigate(`/ticket/${t.id}`)}>
              <span className="t-num">{t.ticket_number}</span>
              <span className="t-title">{t.title}</span>
              <span className="t-status">{STATUS_LABEL[t.status] || t.status}</span>
              <span className="t-prio">{PRIO_LABEL[t.priority] || t.priority}</span>
              <span className="t-date">{new Date(t.created_at).toLocaleDateString("id-ID")}</span>
            </button>
          ))}
          {device.tickets?.length === 0 && <span className="muted">Belum ada tiket</span>}
        </div>
        <Pagination
          page={cur}
          totalPages={totalPages}
          total={all.length}
          onChange={setPage}
        />
      </div>

      {/* Remote Desktop Viewer Dialog */}
      {remoteViewerOpen && remoteSession && (
        <div className="remote-viewer-overlay">
          <div className="remote-viewer-panel">
            <div className="remote-viewer-head">
              <h2>Remote: {device.device_name || device.device_id}</h2>
              <div className="remote-viewer-status">
                {viewerConnected ? "● Terhubung" : "○ Menyambung..."}
              </div>
              <button className="btn btn-outline" onClick={() => setRemoteViewerOpen(false)}>
                <X size={16} /> Tutup
              </button>
            </div>
            <div className="remote-viewer-body">
              {frameData ? (
                <img
                  src={frameData}
                  alt="Remote screen"
                  className="remote-screen"
                  onMouseMove={handleMouseMove}
                  onMouseDown={handleMouseDown}
                  onMouseUp={handleMouseUp}
                  onKeyDown={handleKeyDown}
                  onKeyUp={handleKeyUp}
                  tabIndex={0}
                />
              ) : (
                <div className="remote-screen-placeholder">
                  <Video size={64} className="remote-screen-icon" />
                  <p>Menunggu layar klien...</p>
                  <p className="muted" style={{ fontSize: "0.8125rem" }}>
                    Klik layar untuk fokus, lalu gerakkan mouse / ketik.
                  </p>
                  <p className="muted" style={{ fontSize: "0.8125rem" }}>
                    Sesi ID: {remoteSession.id} · Status: {remoteSession.status}
                  </p>
                </div>
              )}
            </div>
            <div className="remote-viewer-controls">
              <button
                className="btn btn-destructive"
                onClick={async () => {
                  try {
                    await api.delete(`/remote/${remoteSession.id}`);
                    setRemoteViewerOpen(false);
                    setRemoteSession(null);
                    setFrameData(null);
                  } catch {}
                }}
              >
                <StopCircle size={16} /> Akhiri Sesi Remote
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
