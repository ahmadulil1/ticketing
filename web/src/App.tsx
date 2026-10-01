import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, Monitor, Users, BarChart3, LogOut, Menu, X, Sun, Moon, Bell, Package } from "lucide-react";
import { useEffect, useState } from "react";
import api from "./lib/api";
import { useTheme } from "./hooks/useTheme";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import TicketDetail from "./pages/TicketDetail";
import DeviceDetail from "./pages/DeviceDetail";
import DeviceList from "./pages/DeviceList";
import Inventory from "./pages/Inventory";
import InventoryDetail from "./pages/InventoryDetail";
import Agents from "./pages/Agents";
import Stats from "./pages/Stats";
import "./index.css";

const queryClient = new QueryClient();

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/devices", label: "Device", icon: Monitor },
  { to: "/inventories", label: "Inventaris", icon: Package },
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

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem("token");
  return token ? <>{children}</> : <Navigate to="/login" />;
}

function TopBar() {
  const [drawerOpen, setDrawerOpen] = useState(false);
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
          {totalUnread > 0 && (
            <span className="nav-item" style={{ cursor: "default", pointerEvents: "none" }}>
              <Bell size={16} />
              <span className="badge">{totalUnread > 99 ? "99+" : totalUnread}</span>
            </span>
          )}
          <TopBarTheme />
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

      {drawerOpen && (
        <>
          <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} />
          <div className="drawer">
            <div className="drawer-head">
              <span className="brand">
                <span className="brand-dot" />
                <span>Ticketing</span>
              </span>
              <button className="icon-btn" onClick={() => setDrawerOpen(false)} aria-label="Tutup menu">
                <X size={17} />
              </button>
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
          <Route path="/" element={<PrivateRoute><Shell><Dashboard /></Shell></PrivateRoute>} />
          <Route path="/ticket/:id" element={<PrivateRoute><TicketDetail /></PrivateRoute>} />
          <Route path="/devices" element={<PrivateRoute><Shell><DeviceList /></Shell></PrivateRoute>} />
          <Route path="/devices/:deviceId" element={<PrivateRoute><Shell><DeviceDetail /></Shell></PrivateRoute>} />
          <Route path="/inventories" element={<PrivateRoute><Shell><Inventory /></Shell></PrivateRoute>} />
          <Route path="/inventories/:id" element={<PrivateRoute><Shell><InventoryDetail /></Shell></PrivateRoute>} />
          <Route path="/agents" element={<PrivateRoute><Shell><Agents /></Shell></PrivateRoute>} />
          <Route path="/stats" element={<PrivateRoute><Shell><Stats /></Shell></PrivateRoute>} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
