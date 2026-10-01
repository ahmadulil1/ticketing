import { useState, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./components/Login";
import MiniWindow from "./components/MiniWindow";
import PetOverlay from "./components/PetOverlay";
import { useTheme } from "./hooks/useTheme";

async function getCurrentWindowLabel(): Promise<string | null> {
  // Sinkron dari internals Tauri (tersedia di kedua window)
  const syncLabel = window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label;
  if (syncLabel) return syncLabel;
  if (typeof window.__TAURI__ === "undefined") return "mini";
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    return getCurrentWindow().label;
  } catch {
    return "mini";
  }
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
  // Guest (karyawan tanpa login) langsung masuk; login hanya untuk agent
  const token = localStorage.getItem("token");
  const user = localStorage.getItem("user");
  if (token || !user) return <>{children}</>;
  return <Navigate to="/login" />;
}

function App() {
  const [label, setLabel] = useState<string | null>(null);
  // Tema diterapkan di semua window (token <html dataset.theme>)
  useTheme();

  useEffect(() => {
    // deteksi cepat dari hash (sinkron, mencegah flash PetOverlay di mini window)
    if (window.location.hash === "#pet-overlay") {
      setLabel("pet-overlay");
      return;
    }
    getCurrentWindowLabel().then(setLabel);
    if (window.location.hash !== "#pet-overlay") {
      import("./services/device").then(({ reportSpec }) => reportSpec());
    }
  }, []);

  if (label === null) return null; // loading sampai label diketahui
  if (label === "pet-overlay") return <PetOverlay onClick={() => {}} />;

  return (
    <Routes>
      <Route path="/login" element={<Login onLogin={() => {}} />} />
      <Route path="/" element={<PrivateRoute><MiniWindow /></PrivateRoute>} />
    </Routes>
  );
}

export default App;
