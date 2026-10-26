import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import api from "../lib/api";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Pagination from "../components/Pagination";
import DiskBars from "../components/DiskBars";
import RemoteControl from "../components/RemoteControl";
import { useTicketChat } from "../components/TicketChat";
import DeviceHardwareHistory from "../components/DeviceHardwareHistory";

const STATUS_LABEL: Record<string, string> = {
  baru: "Diterima", sedang_ditangani: "Sedang Dikerjakan", menunggu_pengguna: "Menunggu",
  selesai: "Selesai", ditutup: "Ditutup", dibuka_kembali: "Dibuka Kembali",
};
const PRIO_LABEL: Record<string, string> = { rendah: "Rendah", normal: "Sedang", tinggi: "Tinggi", urgent: "Urgent" };
const REMOTE_STATUS_LABEL: Record<string, string> = {
  pending: "Menunggu persetujuan",
  accepted: "Disetujui",
  active: "Aktif",
  rejected: "Ditolak",
  ended: "Selesai",
  timeout: "Kedaluwarsa",
};

export default function DeviceDetail() {
  const openTicket = useTicketChat();
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);

  const { data: device, isLoading } = useQuery({
    queryKey: ["device", deviceId],
    queryFn: async () => {
      const res = await api.get(`/devices/${deviceId}`);
      return res.data;
    },
  });

  // Riwayat sesi remote untuk device ini (audit)
  const { data: remoteHistory } = useQuery({
    queryKey: ["remote-history", deviceId],
    queryFn: async () => {
      const res = await api.get(`/remote/?device_id=${encodeURIComponent(deviceId || "")}`);
      return res.data as Array<{
        id: string;
        status: string;
        agent_name?: string;
        started_at: string;
        ended_at?: string;
        note?: string;
      }>;
    },
    refetchInterval: 15000,
  });

  if (isLoading) return <div className="loading">Memuat...</div>;
  if (!device) return <div className="loading">Device tidak ditemukan</div>;

  const PER = 10;
  const all = device.tickets || [];
  const totalPages = Math.max(1, Math.ceil(all.length / PER));
  const cur = Math.min(page, totalPages);
  const tickets = all.slice((cur - 1) * PER, cur * PER);

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
        <RemoteControl
          deviceId={device.device_id}
          deviceName={device.device_name || device.device_id}
          osName={device.spec?.os_name}
        />
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

      <DeviceHardwareHistory deviceId={deviceId} events={device.hardware_events || []} />

      {/* Riwayat sesi remote (audit) */}
      <div className="panel">
        <div className="panel-head">
          <h2>Riwayat Remote</h2>
          {remoteHistory && remoteHistory.length > 0 && (
            <span className="muted" style={{ fontSize: "0.8125rem" }}>
              {remoteHistory.length} sesi
            </span>
          )}
        </div>
        {!remoteHistory || remoteHistory.length === 0 ? (
          <span className="muted">Belum ada sesi remote untuk device ini</span>
        ) : (
          <div className="remote-history">
            {remoteHistory.slice(0, 10).map((s) => (
              <div key={s.id} className="remote-history-row">
                <span className={`remote-status remote-status-${s.status}`}>
                  {REMOTE_STATUS_LABEL[s.status] || s.status}
                </span>
                <span className="remote-agent">
                  {s.agent_name || "—"}
                </span>
                <span className="remote-date">
                  {new Date(s.started_at).toLocaleString("id-ID")}
                </span>
                {s.ended_at && (
                  <span className="remote-date muted">
                    s/d {new Date(s.ended_at).toLocaleTimeString("id-ID")}
                  </span>
                )}
                {s.note && <span className="remote-note">{s.note}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-head"><h2>Tiket Device Ini</h2></div>
        <div className="device-tickets">
          {(tickets).map((t: any) => (
            <button key={t.id} className="ticket-row" onClick={() => openTicket(t.id)}>
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
    </div>
  );
}
