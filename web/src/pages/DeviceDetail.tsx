import { useQuery } from "@tanstack/react-query";
import api from "../lib/api";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import Pagination from "../components/Pagination";

const STATUS_LABEL: Record<string, string> = {
  baru: "Diterima", sedang_ditangani: "Sedang Dikerjakan", menunggu_pengguna: "Menunggu",
  selesai: "Selesai", ditutup: "Ditutup", dibuka_kembali: "Dibuka Kembali",
};
const PRIO_LABEL: Record<string, string> = { rendah: "Rendah", normal: "Sedang", tinggi: "Tinggi", urgent: "Urgent" };

export default function DeviceDetail() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();
  // Pagination list tiket device: 10/halaman
  const [page, setPage] = useState(1);

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
      </div>

      {device.spec && (
        <div className="stat-cards">
          <div className="stat-card"><span className="count" style={{ fontSize: "0.8125rem", wordBreak: "break-word" }}>{device.spec.cpu_model || "-"}</span><span className="label">CPU</span></div>
          <div className="stat-card"><span className="count" style={{ fontSize: "0.8125rem" }}>{device.spec.ram_gb ? `${device.spec.ram_gb} GB` : "-"}</span><span className="label">RAM</span></div>
          <div className="stat-card"><span className="count" style={{ fontSize: "0.8125rem" }}>{device.spec.os_name || "-"}</span><span className="label">OS</span></div>
          <div className="stat-card"><span className="count" style={{ fontSize: "0.8125rem" }}>
            {(device.spec.disks || []).map((d: any) => `${(d.tipe || "disk").toUpperCase()} ${d.total_gb ?? "?"}GB`).join(" · ") || "-"}
          </span><span className="label">Disk</span></div>
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
    </div>
  );
}
