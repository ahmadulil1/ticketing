import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider } from "@/components/auth/auth-provider";
import { AppShell } from "@/components/layout/app-shell";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import TicketDetail from "./pages/TicketDetail";
import DeviceDetail from "./pages/DeviceDetail";
import DeviceList from "./pages/DeviceList";
import Inventory from "./pages/Inventory";
import InventoryDetail from "./pages/InventoryDetail";
import Agents from "./pages/Agents";
import Stats from "./pages/Stats";
// maintenance pages
import { IndexPage } from "./pages/maintenance/index-page";
import { MaintenancePage } from "./pages/maintenance/maintenance-page";
import { AssetsPage } from "./pages/maintenance/assets-page";
import { AssetDetailPage } from "./pages/maintenance/asset-detail-page";
import { DashboardPage as MaintenanceDashboardPage } from "./pages/maintenance/dashboard-page";
import { WorkPage } from "./pages/maintenance/work-page";
import { VisitMaintenanceDetailPage } from "./pages/maintenance/visit-maintenance-detail-page";
import "./index.css";

const queryClient = new QueryClient();

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem("token");
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

function Shell({ children }: { children: React.ReactNode }) {
  const loc = useLocation();
  if (loc.pathname.startsWith("/ticket/")) return <>{children}</>;
  return <AppShell>{children}</AppShell>;
}

function PublicLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen"><main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">{children}</main></div>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            {/* Public maintenance */}
            <Route path="/publik" element={<PublicLayout><IndexPage /></PublicLayout>} />
            <Route path="/publik/kunjungan" element={<PublicLayout><VisitMaintenanceDetailPage /></PublicLayout>} />
            <Route path="/monitoring/kunjungan" element={<PublicLayout><VisitMaintenanceDetailPage /></PublicLayout>} />

            {/* Ticketing */}
            <Route path="/" element={<PrivateRoute><Shell><Dashboard /></Shell></PrivateRoute>} />
            <Route path="/ticket/:id" element={<PrivateRoute><TicketDetail /></PrivateRoute>} />
            <Route path="/devices" element={<PrivateRoute><Shell><DeviceList /></Shell></PrivateRoute>} />
            <Route path="/devices/:id" element={<PrivateRoute><Shell><DeviceDetail /></Shell></PrivateRoute>} />
            <Route path="/inventories" element={<PrivateRoute><Shell><Inventory /></Shell></PrivateRoute>} />
            <Route path="/inventories/:id" element={<PrivateRoute><Shell><InventoryDetail /></Shell></PrivateRoute>} />
            <Route path="/agents" element={<PrivateRoute><Shell><Agents /></Shell></PrivateRoute>} />
            <Route path="/stats" element={<PrivateRoute><Shell><Stats /></Shell></PrivateRoute>} />

            {/* Maintenance */}
            <Route path="/maintenance" element={<PrivateRoute><Shell><MaintenancePage /></Shell></PrivateRoute>} />
            <Route path="/maintenance/dashboard" element={<PrivateRoute><Shell><MaintenanceDashboardPage /></Shell></PrivateRoute>} />
            <Route path="/assets" element={<PrivateRoute><Shell><AssetsPage /></Shell></PrivateRoute>} />
            <Route path="/assets/:assetId" element={<PrivateRoute><Shell><AssetDetailPage /></Shell></PrivateRoute>} />
            <Route path="/work" element={<PrivateRoute><Shell><WorkPage /></Shell></PrivateRoute>} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
