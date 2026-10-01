import { useQuery } from "@tanstack/react-query";
import api from "../lib/api";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, LineChart, Line,
} from "recharts";
import { Clock, CheckCircle, MonitorSmartphone, Inbox } from "lucide-react";
import { useTheme } from "../hooks/useTheme";

const STATUS_LABEL: Record<string, string> = {
  baru: "Diterima", sedang_ditangani: "Sedang Dikerjakan", menunggu_pengguna: "Menunggu",
  selesai: "Selesai", ditutup: "Ditutup", dibuka_kembali: "Dibuka Kembali",
};
const PRIO_LABEL: Record<string, string> = { rendah: "Rendah", normal: "Sedang", tinggi: "Tinggi", urgent: "Urgent" };
const STATUS_COLORS: Record<string, string> = {
  baru: "#4f6df5", sedang_ditangani: "#f5a623", menunggu_pengguna: "#9b59b6",
  selesai: "#2fbf71", ditutup: "#8a93a3", dibuka_kembali: "#e74c3c",
};
const PRIO_COLORS: Record<string, string> = {
  rendah: "#8a93a3", normal: "#4f6df5", tinggi: "#f5a623", urgent: "#e74c3c",
};

export default function Stats() {
  const { data: stats } = useQuery({
    queryKey: ["stats"],
    queryFn: async () => {
      const res = await api.get("/tickets/stats/summary");
      return res.data;
    },
    refetchInterval: 15000,
  });

  const { data: trend } = useQuery({
    queryKey: ["trend"],
    queryFn: async () => {
      const res = await api.get("/tickets/stats/trend");
      return res.data as Array<{ date: string; created: number; resolved: number }>;
    },
    refetchInterval: 30000,
  });

  const byStatus = (stats?.by_status || []).map((s: any) => ({
    name: STATUS_LABEL[s.status] || s.status,
    value: parseInt(s.count),
    key: s.status,
  }));
  const byPriority = (stats?.by_priority || []).map((p: any) => ({
    name: PRIO_LABEL[p.priority] || p.priority,
    value: parseInt(p.count),
    key: p.priority,
  }));

  const fmtDuration = (secs: any) => {
    const n = Number(secs);
    if (!n || isNaN(n)) return "-";
    const h = Math.floor(n / 3600);
    if (h >= 1) return `${h} jam`;
    const m = Math.floor(n / 60);
    return `${m} menit`;
  };

  const t = stats?.totals || {};
  const { colors } = useTheme();

  return (
    <div className="page">
      <div className="page-head">
        <h1>Statistik</h1>
      </div>

      <div className="stat-cards">
        <div className="stat-card icon inbox">
          <span className="ic"><Inbox size={18} /></span>
          <span className="count">{t.total || 0}</span>
          <span className="label">Total Tiket</span>
        </div>
        <div className="stat-card icon baru">
          <span className="ic"><Clock size={18} /></span>
          <span className="count">{t.today_new || 0}</span>
          <span className="label">Baru Hari Ini</span>
        </div>
        <div className="stat-card icon selesai">
          <span className="ic"><CheckCircle size={18} /></span>
          <span className="count">{t.resolved || 0}</span>
          <span className="label">Selesai</span>
        </div>
        <div className="stat-card icon proses">
          <span className="ic"><MonitorSmartphone size={18} /></span>
          <span className="count">{stats?.device_count || 0}</span>
          <span className="label">Device</span>
        </div>
      </div>

      <div className="chart-grid">
        <div className="chart-card">
          <h2>Tren 14 Hari</h2>
          <ResponsiveContainer width="100%" height={240}>
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
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="created" name="Dibuat" stroke="#4f6df5" strokeWidth={2.5} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="resolved" name="Selesai" stroke="#2fbf71" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h2>Per Status</h2>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={byStatus}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={44}
                label={(e: any) => `${e.name} (${e.value})`}
                labelLine={false}
              >
                {byStatus.map((s: any) => (
                  <Cell key={s.key} fill={STATUS_COLORS[s.key] || "#8a93a3"} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  borderRadius: 10,
                  border: "1px solid " + colors.tooltipBorder,
                  background: colors.tooltipBg,
                  color: colors.tooltipText,
                  fontSize: 12,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h2>Per Prioritas</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={byPriority} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: colors.axis }} />
              <YAxis tick={{ fontSize: 11, fill: colors.axis }} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  borderRadius: 10,
                  border: "1px solid " + colors.tooltipBorder,
                  background: colors.tooltipBg,
                  color: colors.tooltipText,
                  fontSize: 12,
                }}
                cursor={{ fill: colors.cursor }}
              />
              <Bar dataKey="value" name="Tiket" radius={[6, 6, 0, 0]} maxBarSize={60}>
                {byPriority.map((p: any) => (
                  <Cell key={p.key} fill={PRIO_COLORS[p.key] || "#8a93a3"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h2>Performa</h2>
          <div className="perf-rows">
            <div className="perf-row">
              <span className="perf-label">Rata-rata waktu resolusi</span>
              <span className="perf-val">{fmtDuration(t.avg_resolve_seconds)}</span>
            </div>
            <div className="perf-row">
              <span className="perf-label">Tiket dari device (guest)</span>
              <span className="perf-val">{t.from_guest || 0}</span>
            </div>
            <div className="perf-row">
              <span className="perf-label">Device terdaftar</span>
              <span className="perf-val">{stats?.device_count || 0}</span>
            </div>
            <div className="perf-row">
              <span className="perf-label">Tingkat penyelesaian</span>
              <span className="perf-val">
                {t.total > 0 ? Math.round(((t.resolved || 0) / t.total) * 100) : 0}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
