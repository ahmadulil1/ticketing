import { useQuery } from "@tanstack/react-query";
import { useRealtime } from "../hooks/useRealtime";
import { useTheme } from "../hooks/useTheme";
import api from "../lib/api";
import { Search, RefreshCw, FileDown, X } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import TicketList from "../components/TicketList";
import Pagination from "../components/Pagination";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const STATUS_LABEL: Record<string, string> = {
  baru: "Diterima", sedang_ditangani: "Sedang Dikerjakan", menunggu_pengguna: "Menunggu",
  selesai: "Selesai", ditutup: "Ditutup", dibuka_kembali: "Dibuka Kembali",
};
const PRIO_LABEL: Record<string, string> = { rendah: "Rendah", normal: "Sedang", tinggi: "Tinggi", urgent: "Urgent" };

export default function Dashboard() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const PER_PAGE = 10;
  const navigate = useNavigate();
  useRealtime("__list__");

  // Validasi: tanggal selesai tidak boleh sebelum tanggal mulai
  const dateInvalid = !!(from && to && to < from);

  const buildParams = () => {
    const p = new URLSearchParams();
    if (search) p.append("search", search);
    if (status) p.append("status", status);
    if (priority) p.append("priority", priority);
    if (deviceId) p.append("device_id", deviceId);
    if (from) p.append("from", from);
    if (to) p.append("to", to);
    p.append("page", String(page));
    p.append("limit", String(PER_PAGE));
    return p;
  };

  const { data: tickets, isLoading, refetch } = useQuery({
    queryKey: ["tickets", search, status, priority, deviceId, from, to, page],
    queryFn: async () => {
      const res = await api.get("/tickets?" + buildParams().toString());
      return res.data as Array<any>;
    },
    enabled: !dateInvalid,
    refetchInterval: 5000,
  });

  const { data: summary } = useQuery({
    queryKey: ["stats", "summary"],
    queryFn: async () => {
      const res = await api.get("/tickets/stats/summary");
      return res.data as { by_status: Array<{ status: string; count: string }> };
    },
    refetchInterval: 15000,
  });

  const { data: devices } = useQuery({
    queryKey: ["devices"],
    queryFn: async () => {
      const res = await api.get("/devices");
      return res.data as Array<any>;
    },
    refetchInterval: 10000,
  });

  const { data: trend } = useQuery({
    queryKey: ["trend"],
    queryFn: async () => {
      const res = await api.get("/tickets/stats/trend");
      return res.data as Array<{ date: string; created: number; resolved: number }>;
    },
    refetchInterval: 30000,
  });

  const exportPdf = async () => {
    const res = await api.get("/tickets/export/pdf?" + buildParams().toString(), {
      responseType: "blob",
    });
    const url = window.URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tickets-export.pdf";
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const hasFilter = !!(search || status || priority || deviceId || from || to);
  const clearFilters = () => {
    setSearch(""); setStatus(""); setPriority(""); setDeviceId(""); setFrom(""); setTo("");
  };

  // Reset ke halaman 1 saat filter berubah
  const resetPage = () => setPage(1);
  const onSearch = (v: string) => { setSearch(v); resetPage(); };
  const onStatus = (v: string) => { setStatus(v); resetPage(); };
  const onPriority = (v: string) => { setPriority(v); resetPage(); };
  const onFrom = (v: string) => { setFrom(v); resetPage(); };
  const onTo = (v: string) => { setTo(v); resetPage(); };

  const total = tickets?.length ? parseInt(tickets[0].total_count) || 0 : 0;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  const { colors } = useTheme();

  const c = (st: string) =>
    summary?.by_status?.find((s) => s.status === st)
      ? parseInt(summary.by_status.find((s) => s.status === st)!.count)
      : 0;
  const counts = {
    baru: c("baru"),
    sedang_ditangani: c("sedang_ditangani"),
    menunggu: c("menunggu_pengguna"),
    selesai: c("selesai") + c("ditutup"),
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Dashboard</h1>
        <div className="head-actions">
          <button onClick={exportPdf} className="btn btn-outline" title="Export PDF">
            <FileDown size={16} /> Export PDF
          </button>
          <button onClick={() => refetch()} className="btn btn-outline" title="Refresh">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      <div className="stat-cards">
        <div className="stat-card baru">
          <span className="count">{counts.baru}</span>
          <span className="label">Diterima</span>
        </div>
        <div className="stat-card proses">
          <span className="count">{counts.sedang_ditangani}</span>
          <span className="label">Sedang Dikerjakan</span>
        </div>
        <div className="stat-card tunggu">
          <span className="count">{counts.menunggu}</span>
          <span className="label">Menunggu</span>
        </div>
        <div className="stat-card selesai">
          <span className="count">{counts.selesai}</span>
          <span className="label">Selesai</span>
        </div>
      </div>

      <div className="chart-card">
        <h2>Tren Tiket (14 Hari)</h2>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={trend || []} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: colors.axis }} />
            <YAxis tick={{ fontSize: 11, fill: colors.axis }} allowDecimals={false} />
            <Tooltip
              contentStyle={{
                borderRadius: 10,
                border: "1px solid " + colors.tooltipBorder,
                background: colors.tooltipBg,
                color: colors.tooltipText,
                fontSize: 12,
              }}
            />
            <Line type="monotone" dataKey="created" name="Dibuat" stroke="#4f6df5" strokeWidth={2.5} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="resolved" name="Selesai" stroke="#2fbf71" strokeWidth={2.5} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Device Terdaftar</h2>
          <button className="btn-link" onClick={() => navigate("/devices")}>Lihat semua →</button>
        </div>
        <div className="device-grid">
          {(devices || []).slice(0, 6).map((d) => (
            <button
              key={d.device_id}
              className={"device-card" + (deviceId === d.device_id ? " active" : "")}
              onClick={() => setDeviceId(deviceId === d.device_id ? "" : d.device_id)}
              title="Klik untuk filter tiket device ini"
            >
              <span className="device-name">{d.device_name || d.device_id}</span>
              <span className="device-meta">
                {parseInt(d.active_count) > 0 ? (
                  <span className="badge-active">{d.active_count} aktif</span>
                ) : (
                  <span className="badge-done">{d.ticket_count} tiket</span>
                )}
              </span>
            </button>
          ))}
          {devices?.length === 0 && <span className="muted">Belum ada device</span>}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Tiket</h2>
          {hasFilter && (
            <button className="btn-link danger" onClick={clearFilters}>
              <X size={13} /> Hapus filter
            </button>
          )}
        </div>
        <div className="filters">
          <div className="search-box">
            <Search size={16} />
            <input
              type="text"
              placeholder="Cari nomor / judul / deskripsi..."
              value={search}
              onChange={(e) => onSearch(e.target.value)}
            />
          </div>
          <select value={status} onChange={(e) => onStatus(e.target.value)}>
            <option value="">Semua Status</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select value={priority} onChange={(e) => onPriority(e.target.value)}>
            <option value="">Semua Prioritas</option>
            {Object.entries(PRIO_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <div className={"date-field" + (dateInvalid ? " invalid" : "")}>
            <span className="date-label">Dari tanggal</span>
            <input type="date" value={from} onChange={(e) => onFrom(e.target.value)} title="Dari tanggal" />
          </div>
          <div className={"date-field" + (dateInvalid ? " invalid" : "")}>
            <span className="date-label">Sampai tanggal</span>
            <input type="date" value={to} onChange={(e) => onTo(e.target.value)} title="Sampai tanggal" />
          </div>
          {dateInvalid && <span className="date-err">Tanggal selesai sebelum tanggal mulai</span>}
        </div>

        {deviceId && (
          <div className="filter-note">
            Filter device: <strong>{devices?.find((d: any) => d.device_id === deviceId)?.device_name || deviceId}</strong>
            {" "}
            <button className="btn-link" onClick={() => navigate(`/devices/${deviceId}`)}>Detail →</button>
          </div>
        )}

        {isLoading ? (
          <div className="loading">Memuat...</div>
        ) : (
          <>
            <TicketList tickets={tickets || []} />
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              onChange={setPage}
            />
          </>
        )}
      </div>
    </div>
  );
}
