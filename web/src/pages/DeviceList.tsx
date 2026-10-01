import { useQuery } from "@tanstack/react-query";
import api from "../lib/api";
import { Monitor } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function DeviceList() {
  const navigate = useNavigate();

  const { data: devices, isLoading } = useQuery({
    queryKey: ["devices"],
    queryFn: async () => {
      const res = await api.get("/devices");
      return res.data as Array<any>;
    },
    refetchInterval: 10000,
  });

  return (
    <div className="page">
      <div className="page-head">
        <h1>Device</h1>
      </div>

      {isLoading ? (
        <div className="loading">Memuat...</div>
      ) : (
        <div className="device-grid wide">
          {(devices || []).map((d) => (
            <button
              key={d.device_id}
              className="device-card"
              onClick={() => navigate(`/devices/${d.device_id}`)}
            >
              <span className="device-icon"><Monitor size={18} /></span>
              <span className="device-name">{d.device_name || d.device_id}</span>
              <span className="device-sub">
                {parseInt(d.ticket_count)} tiket total
              </span>
              <span className="device-meta">
                {parseInt(d.active_count) > 0 ? (
                  <span className="badge-active">{d.active_count} tiket aktif</span>
                ) : (
                  <span className="badge-done">Semua selesai</span>
                )}
              </span>
              {d.last_activity && (
                <span className="device-date">
                  Aktif terakhir {new Date(d.last_activity).toLocaleDateString("id-ID")}
                </span>
              )}
            </button>
          ))}
          {devices?.length === 0 && (
            <div className="empty">Belum ada device mendaftar tiket.</div>
          )}
        </div>
      )}
    </div>
  );
}
