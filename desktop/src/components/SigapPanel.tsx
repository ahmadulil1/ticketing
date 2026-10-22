import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Bell, BellOff, ExternalLink, LogOut, RefreshCw, ShieldCheck } from "lucide-react";
import {
  SigapNotification,
  SigapState,
  cancelSigapPairing,
  fetchSigapNotifications,
  getSigapState,
  logoutSigap,
  onSigapNotification,
  onSigapState,
  openSigapAuthorize,
  openSigapNotification,
  requestSigapPermission,
  setSigapDetail,
  startSigapPairing,
  timeAgo,
} from "../services/sigap";

interface Props {
  onBack: () => void;
  /** Badge jumlah notifikasi belum dibaca (untuk tombol di header). */
  onUnreadChange?: (n: number) => void;
}

export default function SigapPanel({ onBack, onUnreadChange }: Props) {
  const [state, setState] = useState<SigapState | null>(null);
  const [items, setItems] = useState<SigapNotification[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await getSigapState();
      if (s) {
        setState(s);
        onUnreadChange?.(s.unread);
        if (s.status === "connected") {
          const list = await fetchSigapNotifications();
          if (list) setItems(list);
        }
      }
    } catch (e: any) {
      setError(e?.message || "Gagal membaca status SIGAP");
    }
  }, [onUnreadChange]);

  useEffect(() => {
    refresh();
    const offState = onSigapState((s) => {
      setState(s);
      onUnreadChange?.(s.unread);
    });
    const offNotif = onSigapNotification(() => {
      fetchSigapNotifications().then((l) => l && setItems(l));
    });
    // Jaring pengaman: Rust yang jadi sumber kebenaran, ini hanya sinkronisasi tampilan.
    const timer = setInterval(refresh, 15000);
    return () => {
      offState();
      offNotif();
      clearInterval(timer);
    };
  }, [refresh, onUnreadChange]);

  // Hitung mundur kode persetujuan.
  useEffect(() => {
    if (state?.status !== "pairing") {
      setCountdown(null);
      return;
    }
    setCountdown(state.expires_in ?? null);
    const t = setInterval(() => {
      setCountdown((c) => (c === null ? null : Math.max(0, c - 1)));
    }, 1000);
    return () => clearInterval(t);
  }, [state?.status, state?.expires_in]);

  const handleConnect = async () => {
    setBusy(true);
    setError(null);
    try {
      const s = await startSigapPairing();
      if (s) setState(s);
    } catch (e: any) {
      setError(e?.message || "Gagal memulai pairing");
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    setBusy(true);
    try {
      const s = await logoutSigap();
      if (s) setState(s);
      setItems([]);
    } catch (e: any) {
      setError(e?.message || "Gagal putuskan koneksi");
    } finally {
      setBusy(false);
    }
  };

  const handleOpenItem = async (id: string) => {
    try {
      await openSigapNotification(id);
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, is_read: true } : i)));
    } catch (e: any) {
      setError(e?.message || "Gagal membuka notifikasi");
    }
  };

  const status = state?.status ?? "disconnected";
  const connected = status === "connected";
  const offline = connected && !state?.online;
  const statusLabel = connected
    ? offline
      ? "Offline"
      : "Terhubung"
    : status === "pairing"
      ? "Menunggu persetujuan"
      : status === "expired"
        ? "Sesi berakhir"
        : "Tak terhubung";
  const statusClass = connected ? (offline ? "wait" : "on") : status === "pairing" ? "wait" : "off";

  return (
    <div className="sigap-panel">
      <header className="sigap-header">
        <button onClick={onBack} title="Kembali" aria-label="Kembali">
          <ArrowLeft size={18} />
        </button>
        <div className="sigap-title">
          <span>SIGAP</span>
          <span className={`sigap-dot ${statusClass}`}>{statusLabel}</span>
        </div>
        <button onClick={refresh} title="Refresh" aria-label="Refresh">
          <RefreshCw size={16} />
        </button>
      </header>

      {error && <div className="sigap-error">{error}</div>}

      {status === "disconnected" && (
        <div className="sigap-connect">
          <ShieldCheck size={34} />
          <h2>Hubungkan akun SIGAP</h2>
          <p>
            Notifikasi SIGAP (surat, kalender, dashboard) muncul langsung di aplikasi ini. Password
            SIGAP tidak pernah disimpan di aplikasi.
          </p>
          <p className="sigap-device">Perangkat: {state?.device_name_host || "-"}</p>
          <button className="sigap-primary" onClick={handleConnect} disabled={busy}>
            {busy ? "Menyiapkan..." : "Hubungkan SIGAP"}
          </button>
        </div>
      )}

      {status === "pairing" && (
        <div className="sigap-connect">
          <h2>Masukkan kode di browser</h2>
          <p>Login ke SIGAP di browser, lalu masukkan kode ini untuk menyetujui perangkat.</p>
          <div className="sigap-code">{state?.user_code ?? "········"}</div>
          {countdown !== null && (
            <p className="sigap-device">
              Berlaku {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, "0")}
            </p>
          )}
          <button className="sigap-primary" onClick={() => openSigapAuthorize().catch(() => {})}>
            <ExternalLink size={14} /> Buka halaman persetujuan
          </button>
          <button
            className="sigap-ghost"
            onClick={async () => {
              const s = await cancelSigapPairing();
              if (s) setState(s);
            }}
          >
            Batalkan
          </button>
        </div>
      )}

      {status === "expired" && (
        <div className="sigap-connect">
          <BellOff size={34} />
          <h2>Sesi SIGAP berakhir</h2>
          <p>
            {state?.last_error ||
              "Sesi dicabut atau kedaluwarsa. Hubungkan ulang untuk melanjutkan notifikasi."}
          </p>
          <button className="sigap-primary" onClick={handleConnect} disabled={busy}>
            Hubungkan ulang
          </button>
        </div>
      )}

      {connected && (
        <>
          <div className="sigap-account">
            <div>
              <div className="sigap-name">{state?.user_name || "Akun SIGAP"}</div>
              <div className="sigap-sub">
                {state?.device_name || state?.device_name_host}
                {state?.last_sync
                  ? ` • sinkron ${timeAgo(new Date(state.last_sync * 1000).toISOString())}`
                  : ""}
              </div>
            </div>
            <button
              className="sigap-icon"
              onClick={handleLogout}
              title="Putuskan koneksi"
              aria-label="Putuskan koneksi"
            >
              <LogOut size={16} />
            </button>
          </div>

          {!state?.permission_granted && (
            <div className="sigap-hint">
              <Bell size={14} />
              <span>Izin notifikasi belum diberikan — popup tidak akan muncul.</span>
              <button
                onClick={async () => {
                  await requestSigapPermission();
                  refresh();
                }}
              >
                Izinkan
              </button>
            </div>
          )}

          <label className="sigap-toggle">
            <input
              type="checkbox"
              checked={!!state?.detail_enabled}
              onChange={async (e) => {
                const s = await setSigapDetail(e.target.checked);
                if (s) setState(s);
              }}
            />
            <span>Tampilkan isi notifikasi di layar terkunci</span>
          </label>

          <div className="sigap-list">
            {items.length === 0 ? (
              <div className="sigap-empty">Belum ada notifikasi.</div>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  className={`sigap-item ${n.is_read ? "" : "unread"}`}
                  onClick={() => handleOpenItem(n.id)}
                >
                  <Bell size={14} className="sigap-item-icon" />
                  <div className="sigap-item-body">
                    <div className="sigap-item-title">{n.title || "Notifikasi"}</div>
                    {n.message && <div className="sigap-item-msg">{n.message}</div>}
                    <div className="sigap-item-time">{timeAgo(n.created_at)}</div>
                  </div>
                </button>
              ))
            )}
          </div>
        </>
      )}

      <footer className="sigap-footer">
        Aplikasi yang benar-benar ditutup tidak menerima popup — notifikasi diambil selama proses
        aplikasi berjalan.
      </footer>
    </div>
  );
}
