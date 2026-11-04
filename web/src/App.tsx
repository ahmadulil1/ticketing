import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, NavLink, useLocation, Link } from "react-router-dom";
import { LayoutDashboard, Monitor, Users, BarChart3, LogOut, Menu, X, Sun, Moon, Bell, Ticket } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import api from "./lib/api";
import { useTheme } from "./hooks/useTheme";
import DownloadMenu from "./components/DownloadMenu";
import InstallGuide from "./pages/InstallGuide";
import PhotoGallery from "./pages/PhotoGallery";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import TicketDetail from "./pages/TicketDetail";
import DeviceDetail from "./pages/DeviceDetail";
import DeviceList from "./pages/DeviceList";
import InventoryDetail from "./pages/InventoryDetail";
import Agents from "./pages/Agents";
import Stats from "./pages/Stats";
import "./index.css";

const queryClient = new QueryClient();

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/devices", label: "Perangkat", icon: Monitor },
  { to: "/agents", label: "Agent", icon: Users },
  { to: "/stats", label: "Statistik", icon: BarChart3 },
];

/** Token tema gelap/terang: simpan pilihan user, default ikut OS. */
function TopBarTheme() {
  const { theme, toggle } = useTheme();
  return (
    <button
      className={"icon-btn" + (theme === "dark" ? " active" : "")}
      onClick={toggle}
      aria-label={theme === "dark" ? "Mode terang" : "Mode gelap"}
      title={theme === "dark" ? "Mode terang" : "Mode gelap"}
    >
      {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}

/**
 * Dialog notifikasi, disamakan dengan production (ticketing.marisoncloud.com):
 * modal <dialog> berisi riwayat notifikasi, lonceng selalu tampil dan bisa
 * diklik. Production mengambil riwayat dari GET /messages/notifications,
 * yang tidak dimiliki server lokal — di sini riwayat disusun dari dua
 * endpoint lokal yang sudah ada: /messages/unread (peta tiket -> jumlah
 * pesan belum dibaca, dipakai badge juga) digabung /tickets (detail tiket,
 * urut aktivitas terbaru; pesan baru memperbarui updated_at tiket, jadi
 * tiket yang punya pesan belum dibaca selalu berada di urutan atas).
 * Item belum dibaca tampil di depan ("Pesan baru"), dilanjutkan tiket
 * terbaru ("Dibaca"), maks 20 item. Dua perbedaan yang tidak bisa
 * direproduksi lokal: label "Tiket baru" production (jenis notifikasi hanya
 * diketahui server production) dan waktu last_message_at (di sini dipakai
 * updated_at tiket sebagai waktu aktivitas terakhir).
 */
function NotificationDialog({ open, setOpen, unread }: {
  open: boolean;
  setOpen: (v: boolean) => void;
  unread: Record<string, number>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
    return () => { if (d.open) d.close(); };
  }, [open ]);

  const { data: tickets, isLoading, isError, refetch } = useQuery({
    queryKey: ["notification-history"],
    queryFn: async () => {
      const res = await api.get("/tickets?limit=100");
      return res.data as Array<any>;
    },
    enabled: open,
    refetchInterval: 30000,
  });

  const list = tickets || [];
  const unreadIds = Object.keys(unread);
  const byId = new Map(list.map((t) => [String(t.id), t]));
  const unreadItems = unreadIds
    .map((id) => byId.get(id))
    .filter((t) => t != null)
    .sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at));
  const readItems = list
    .filter((t) => !unreadIds.includes(String(t.id)))
    .slice(0, Math.max(0, 20 - unreadItems.length));
  const items = [...unreadItems, ...readItems];

  return (
    <dialog
      ref={dialogRef}
      className="notification-dialog"
      aria-labelledby="notification-title"
      onCancel={() => setOpen(false)}
      onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
    >
      <div className="notification-panel">
        <div className="notification-head">
          <h3 id="notification-title"><Bell size={16} /> Notifikasi</h3>
          <button
            className="icon-btn"
            autoFocus
            aria-label="Tutup notifikasi"
            onClick={() => setOpen(false)}
          >
            <X size={17} />
          </button>
        </div>
        <div className="notification-list">
          {isLoading ? (
            <div className="notification-empty" role="status">Memuat notifikasi…</div>
          ) : isError ? (
            <div className="notification-empty">
              Gagal memuat riwayat. <button className="nav-item" onClick={() => refetch()}>Coba lagi</button>
            </div>
          ) : items.length === 0 ? (
            <div className="notification-empty">Belum ada riwayat notifikasi</div>
          ) : (
            items.map((t) => {
              const n = unread[String(t.id)] || 0;
              return (
                <Link
                  key={t.id}
                  to={`/ticket/${t.id}`}
                  className="notification-item"
                  onClick={(e) => {
                    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
                    setOpen(false);
                  }}
                >
                  <div><Ticket size={20} /></div>
                  <div className="notification-copy">
                    <div className="notification-row">
                      <span className="notification-title">{t.ticket_number} — {t.title}</span>
                      <span className="notification-count">{n > 0 ? "Pesan baru" : "Dibaca"}</span>
                    </div>
                    <div className="notification-meta">
                      <time dateTime={t.updated_at}>{new Date(t.updated_at).toLocaleString("id-ID")}</time>
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </dialog>
  );
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem("token");
  return token ? <>{children}</> : <Navigate to="/login" />;
}

function TopBar() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const loc = useLocation();

  // Tutup drawer saat pindah halaman
  useEffect(() => { setDrawerOpen(false); }, [loc.pathname]);

  const { data: unread } = useQuery({
    queryKey: ["unread"],
    queryFn: async () => {
      const res = await api.get("/messages/unread");
      return res.data as Record<string, number>;
    },
    // ponytail: polling 60s jaring pengaman; badge utama dipush WS (__list__) via Dashboard.
    refetchInterval: 60000,
  });
  const totalUnread = unread ? Object.values(unread).reduce((a, b) => a + b, 0) : 0;

  const navItems = NAV.map((n) => (
    <NavLink
      key={n.to}
      to={n.to}
      end={n.to === "/"}
      className={({ isActive }) => "nav-item" + (isActive ? " active" : "")}
    >
      <n.icon size={17} />
      <span>{n.label}</span>
      {n.to === "/" && totalUnread > 0 && (
        <span className="badge">{totalUnread > 99 ? "99+" : totalUnread}</span>
      )}
    </NavLink>
  ));

  return (
    <>
      <header className="topbar">
        <button
          className="icon-btn drawer-btn"
          onClick={() => setDrawerOpen(true)}
          aria-label="Buka menu"
        >
          <Menu size={18} />
        </button>
        <NavLink to="/" className="brand">
          <span className="brand-dot" />
          <span>Ticketing</span>
        </NavLink>
        <nav>{navItems}</nav>
        <span className="spacer" />
        <div className="tb-actions">
          <button
            className="icon-btn notification-trigger"
            onClick={() => setNotifOpen((o) => !o)}
            aria-label="Notifikasi"
            title="Notifikasi"
          >
            <Bell size={16} />
            {totalUnread > 0 && (
              <span className="notification-badge">{totalUnread > 99 ? "99+" : totalUnread}</span>
            )}
          </button>
          <TopBarTheme />
          <DownloadMenu />
          <button
            className="icon-btn"
            onClick={() => {
              localStorage.removeItem("token");
              localStorage.removeItem("user");
              window.location.href = "/login";
            }}
            aria-label="Keluar"
            title="Keluar"
          >
            <LogOut size={17} />
          </button>
        </div>
      </header>

      {notifOpen && (
        <NotificationDialog open={notifOpen} setOpen={setNotifOpen} unread={unread || {}} />
      )}

      {drawerOpen && (
        <>
          <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} />
          <div className="drawer">
            <div className="drawer-head">
              <span className="brand">
                <span className="brand-dot" />
                <span>Ticketing</span>
              </span>
              <button className="icon-btn" onClick={() => setDrawerOpen(false)} aria-label="Tutup menu"><X size={17} /></button>
            </div>
            {navItems}
            <span className="spacer" />
            <button
              className="nav-item"
              onClick={() => {
                localStorage.removeItem("token");
                localStorage.removeItem("user");
                window.location.href = "/login";
              }}
            >
              <LogOut size={17} /> <span>Keluar</span>
            </button>
          </div>
        </>
      )}
    </>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const loc = useLocation();
  // Detail tiket full-page (chat), tanpa topbar
  if (loc.pathname.startsWith("/ticket/")) return <>{children}</>;
  return (
    <div className="shell">
      <TopBar />
      <main className="main">{children}</main>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/install" element={<InstallGuide />} />
          <Route path="/gallery/:ticketId" element={<PhotoGallery />} />
          <Route path="/" element={<PrivateRoute><Shell><Dashboard /></Shell></PrivateRoute>} />
          <Route path="/ticket/:id" element={<PrivateRoute><TicketDetail /></PrivateRoute>} />
          <Route path="/devices" element={<PrivateRoute><Shell><DeviceList /></Shell></PrivateRoute>} />
          <Route path="/devices/:deviceId" element={<PrivateRoute><Shell><DeviceDetail /></Shell></PrivateRoute>} />
          <Route path="/inventories" element={<PrivateRoute><Navigate to="/devices" replace /></PrivateRoute>} />
          <Route path="/inventories/:id" element={<PrivateRoute><Shell><InventoryDetail /></Shell></PrivateRoute>} />
          <Route path="/agents" element={<PrivateRoute><Shell><Agents /></Shell></PrivateRoute>} />
          <Route path="/stats" element={<PrivateRoute><Shell><Stats /></Shell></PrivateRoute>} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
