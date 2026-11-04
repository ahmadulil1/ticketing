import { useQuery } from "@tanstack/react-query";
import { useRealtime } from "../hooks/useRealtime";
import { useTheme } from "../hooks/useTheme";
import api from "../lib/api";
import { Search, RefreshCw, FileDown, X, Inbox, Wrench, Clock, CheckCircle2, ChevronRight, Monitor } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import Pagination from "../components/Pagination";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Badge, badgeVariants } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { VariantProps } from "class-variance-authority";

const STATUS_LABEL: Record<string, string> = {
  baru: "Diterima", sedang_ditangani: "Sedang Dikerjakan", menunggu_pengguna: "Menunggu",
  selesai: "Selesai", ditutup: "Ditutup", dibuka_kembali: "Dibuka Kembali",
};
const PRIO_LABEL: Record<string, string> = { rendah: "Rendah", normal: "Sedang", tinggi: "Tinggi", urgent: "Urgent" };

type BadgeVariant = VariantProps<typeof badgeVariants>["variant"];
const STATUS_BADGE: Record<string, BadgeVariant> = {
  baru: "statusBaru", sedang_ditangani: "statusProses", menunggu_pengguna: "statusTunggu",
  selesai: "statusSelesai", ditutup: "statusTutup", dibuka_kembali: "statusBaru",
};
const PRIO_BADGE: Record<string, BadgeVariant> = {
  tinggi: "prioTinggi", urgent: "prioTinggi", normal: "prioNormal", rendah: "prioRendah",
};

// Kelas field native (select + date) yang menyamai shadcn Input,
// termasuk latar gelapnya agar konsisten dengan Input di mode gelap.
const fieldClass =
  "border-input bg-transparent flex h-9 w-full min-w-0 rounded-md border px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] dark:bg-input/30 md:text-sm";

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

  // Klik baris ringkasan: filter status itu (klik lagi = lepas filter), lalu sorot daftar tiket.
  const onStatCard = (v: string) => {
    onStatus(status === v ? "" : v);
    document.getElementById("ticket-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Ringkasan grafik: total dibuat vs selesai dari data tren yang sudah ada.
  const trendTotals = (trend || []).reduce(
    (acc, d) => ({ created: acc.created + (d.created || 0), resolved: acc.resolved + (d.resolved || 0) }),
    { created: 0, resolved: 0 }
  );

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
  // Total = jumlah keempat baris ringkasan (Selesai sudah mencakup Ditutup).
  const countsTotal = counts.baru + counts.sedang_ditangani + counts.menunggu + counts.selesai;

  return (
    <div className="page dash">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1 text-[0.9375rem]">Ringkasan tiket, perangkat, dan tren penanganan.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={exportPdf} title="Export PDF">
            <FileDown size={16} /> Export PDF
          </Button>
          <Button variant="outline" size="icon" onClick={() => refetch()} title="Refresh" aria-label="Muat ulang daftar tiket">
            <RefreshCw size={16} />
          </Button>
        </div>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="gap-4 py-5 lg:col-start-1 lg:row-start-1">
          <CardHeader>
            <CardTitle className="text-base font-bold">Ringkasan</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <div className="flex flex-col divide-y divide-border">
              <button
                type="button"
                className={"flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" + (status === "baru" ? " bg-primary/10" : "")}
                onClick={() => onStatCard("baru")}
                title="Tampilkan tiket Diterima"
                aria-pressed={status === "baru"}
              >
                <span className="bg-primary/10 text-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"><Inbox size={18} /></span>
                <span className="flex-1 text-sm font-semibold">Diterima</span>
                <span className="text-lg font-extrabold">{counts.baru}</span>
                <ChevronRight size={16} className="text-muted-foreground shrink-0" />
              </button>
              <button
                type="button"
                className={"flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" + (status === "sedang_ditangani" ? " bg-[color-mix(in_srgb,var(--warning)_14%,transparent)]" : "")}
                onClick={() => onStatCard("sedang_ditangani")}
                title="Tampilkan tiket Sedang Dikerjakan"
                aria-pressed={status === "sedang_ditangani"}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--warning)_14%,transparent)] text-(--warning)"><Wrench size={18} /></span>
                <span className="flex-1 text-sm font-semibold">Sedang Dikerjakan</span>
                <span className="text-lg font-extrabold">{counts.sedang_ditangani}</span>
                <ChevronRight size={16} className="text-muted-foreground shrink-0" />
              </button>
              <button
                type="button"
                className={"flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" + (status === "menunggu_pengguna" ? " bg-[color-mix(in_srgb,#9b59b6_14%,transparent)]" : "")}
                onClick={() => onStatCard("menunggu_pengguna")}
                title="Tampilkan tiket Menunggu"
                aria-pressed={status === "menunggu_pengguna"}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,#9b59b6_14%,transparent)] text-[#9b59b6]"><Clock size={18} /></span>
                <span className="flex-1 text-sm font-semibold">Menunggu</span>
                <span className="text-lg font-extrabold">{counts.menunggu}</span>
                <ChevronRight size={16} className="text-muted-foreground shrink-0" />
              </button>
              <div
                className="flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left"
                title="Selesai + Ditutup"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--success)_14%,transparent)] text-(--success)"><CheckCircle2 size={18} /></span>
                <span className="flex-1 text-sm font-semibold">Selesai</span>
                <span className="text-lg font-extrabold">{counts.selesai}</span>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-3 border-t border-border px-2 pt-3" title="Total semua tiket">
              <span className="flex-1 text-sm font-semibold">Total tiket</span>
              <span className="text-lg font-extrabold">{countsTotal}</span>
            </div>
          </CardContent>
        </Card>

          <Card className="min-w-0 lg:col-start-2 lg:row-start-1">
            <CardHeader>
              <CardTitle className="text-base font-bold">Tren Tiket (14 Hari)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="text-muted-foreground flex flex-wrap gap-x-5 gap-y-1 text-sm">
                <span>
                  <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: colors.primary }} />
                  <strong className="text-foreground">{trendTotals.created}</strong> dibuat
                </span>
                <span>
                  <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: colors.success }} />
                  <strong className="text-foreground">{trendTotals.resolved}</strong> selesai
                </span>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={trend || []} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="trendCreated" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={colors.primary} stopOpacity={0.25} />
                      <stop offset="100%" stopColor={colors.primary} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="trendResolved" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={colors.success} stopOpacity={0.25} />
                      <stop offset="100%" stopColor={colors.success} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: colors.axis }} tickLine={false} axisLine={{ stroke: colors.grid }} />
                  <YAxis tick={{ fontSize: 11, fill: colors.axis }} tickLine={false} axisLine={{ stroke: colors.grid }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 10,
                      border: "1px solid " + colors.tooltipBorder,
                      background: colors.tooltipBg,
                      color: colors.tooltipText,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: colors.tooltipText, fontWeight: 600 }}
                    cursor={{ stroke: colors.grid, strokeWidth: 1 }}
                  />
                  <Area type="monotone" dataKey="created" name="Dibuat" stroke={colors.primary} strokeWidth={2.5} fill="url(#trendCreated)" dot={{ r: 3 }} />
                  <Area type="monotone" dataKey="resolved" name="Selesai" stroke={colors.success} strokeWidth={2.5} fill="url(#trendResolved)" dot={{ r: 3 }} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card id="ticket-panel" className="min-w-0 lg:col-start-2 lg:row-start-2">
            <CardHeader className="flex-row items-center justify-between gap-3">
              <CardTitle className="text-base font-bold">
                Tiket {!isLoading && <span className="text-muted-foreground ml-1 text-sm font-medium">· {total} tiket</span>}
              </CardTitle>
              {hasFilter && (
                <Button variant="link" size="sm" className="text-destructive" onClick={clearFilters}>
                  <X size={13} /> Hapus filter
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex min-w-[280px] flex-[2] flex-col gap-1.5">
                  <Label htmlFor="dash-search" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Cari tiket</Label>
                  <div className="relative">
                    <Search size={16} className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                    <Input
                      id="dash-search"
                      type="text"
                      placeholder="Cari nomor / judul / deskripsi..."
                      aria-label="Cari nomor, judul, atau deskripsi tiket"
                      value={search}
                      onChange={(e) => onSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
                <div className="flex min-w-[150px] max-w-[220px] flex-1 flex-col gap-1.5">
                  <Label htmlFor="dash-status" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Status</Label>
                  <Select value={status || "all"} onValueChange={(v) => onStatus(v === "all" ? "" : v)}>
                    <SelectTrigger id="dash-status" aria-label="Filter status">
                      <SelectValue placeholder="Semua Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua Status</SelectItem>
                      {Object.entries(STATUS_LABEL).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex min-w-[150px] max-w-[220px] flex-1 flex-col gap-1.5">
                  <Label htmlFor="dash-prio" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Prioritas</Label>
                  <Select value={priority || "all"} onValueChange={(v) => onPriority(v === "all" ? "" : v)}>
                    <SelectTrigger id="dash-prio" aria-label="Filter prioritas">
                      <SelectValue placeholder="Semua Prioritas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua Prioritas</SelectItem>
                      {Object.entries(PRIO_LABEL).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex min-w-[150px] max-w-[220px] flex-1 flex-col gap-1.5">
                  <Label htmlFor="dash-from" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Dari tanggal</Label>
                  <input id="dash-from" type="date" value={from} onChange={(e) => onFrom(e.target.value)} title="Dari tanggal" aria-label="Dari tanggal" className={fieldClass + (dateInvalid ? " border-destructive" : "")} />
                </div>
                <div className="flex min-w-[150px] max-w-[220px] flex-1 flex-col gap-1.5">
                  <Label htmlFor="dash-to" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Sampai tanggal</Label>
                  <input id="dash-to" type="date" value={to} onChange={(e) => onTo(e.target.value)} title="Sampai tanggal" aria-label="Sampai tanggal" className={fieldClass + (dateInvalid ? " border-destructive" : "")} />
                </div>
                {dateInvalid && <span className="text-destructive self-center text-sm">Tanggal selesai sebelum tanggal mulai</span>}
              </div>

              {deviceId && (
                <div className="text-muted-foreground text-sm">
                  Filter device: <strong className="text-foreground">{devices?.find((d: any) => d.device_id === deviceId)?.device_name || deviceId}</strong>
                  {" "}
                  <Button variant="link" size="sm" className="h-auto px-1 py-0" onClick={() => navigate(`/devices/${deviceId}`)}>Detail →</Button>
                </div>
              )}

              {isLoading ? (
                <div className="text-muted-foreground py-8 text-center text-sm">Memuat...</div>
              ) : tickets && tickets.length > 0 ? (
                <>
                  <div className="overflow-hidden rounded-xl border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="px-4 text-xs font-bold uppercase tracking-wider">Tiket</TableHead>
                          <TableHead className="px-4 text-xs font-bold uppercase tracking-wider">Status</TableHead>
                          <TableHead className="px-4 text-xs font-bold uppercase tracking-wider">Prioritas</TableHead>
                          <TableHead className="hidden px-4 text-xs font-bold uppercase tracking-wider md:table-cell">Perangkat</TableHead>
                          <TableHead className="px-4 text-xs font-bold uppercase tracking-wider">Tanggal</TableHead>
                          <TableHead aria-label="Pesan belum dibaca" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tickets.map((t) => (
                          <TableRow
                            key={t.id}
                            onClick={() => navigate("/ticket/" + t.id, { state: { from: "/" } })}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") navigate("/ticket/" + t.id, { state: { from: "/" } });
                            }}
                            tabIndex={0}
                            className="cursor-pointer focus-visible:bg-accent focus-visible:outline-none"
                          >
                            <TableCell className="whitespace-normal px-4 py-3.5">
                              <span className="text-primary mb-0.5 block text-xs font-semibold">{t.ticket_number}</span>
                              <span className="block text-sm font-semibold break-words">{t.title}</span>
                            </TableCell>
                            <TableCell className="px-4 py-3.5">
                              <Badge variant={STATUS_BADGE[t.status] ?? "secondary"}>
                                {STATUS_LABEL[t.status] || t.status.replace(/_/g, " ")}
                              </Badge>
                            </TableCell>
                            <TableCell className="px-4 py-3.5">
                              {t.priority && (
                                <Badge variant={PRIO_BADGE[t.priority] ?? "secondary"}>
                                  {PRIO_LABEL[t.priority] || t.priority}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="hidden px-4 py-3.5 md:table-cell">{t.device_name || t.requester_name || "Karyawan"}</TableCell>
                            <TableCell className="text-muted-foreground whitespace-nowrap px-4 py-3.5 text-sm">{dayjs(t.created_at).format("DD MMM HH:mm")}</TableCell>
                            <TableCell className="px-4 py-3.5">
                              {t.unread_count != null && t.unread_count > 0 && (
                                <span className="bg-destructive flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white">{t.unread_count}</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <Pagination
                    page={page}
                    totalPages={totalPages}
                    total={total}
                    onChange={setPage}
                  />
                </>
              ) : (
                <div className="text-muted-foreground py-8 text-center text-sm">Tidak ada tiket yang cocok dengan filter.</div>
              )}
            </CardContent>
          </Card>

        <Card className="gap-4 py-5 lg:col-start-1 lg:row-start-2">
          <CardHeader className="flex-row items-center justify-between gap-3">
            <CardTitle className="text-base font-bold">Device Terdaftar</CardTitle>
            <Button variant="link" size="sm" className="h-auto px-1 py-0" onClick={() => navigate("/devices")}>Lihat semua →</Button>
          </CardHeader>
          <CardContent className="px-4">
            <div className="flex flex-col divide-y divide-border">
              {(devices || []).slice(0, 6).map((d) => (
                <button
                  key={d.device_id}
                  type="button"
                  className={"flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" + (deviceId === d.device_id ? " bg-primary/10" : "")}
                  onClick={() => setDeviceId(deviceId === d.device_id ? "" : d.device_id)}
                  title="Klik untuk filter tiket device ini"
                >
                  <span className="bg-primary/10 text-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"><Monitor size={17} /></span>
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold" title={d.device_name || d.device_id}>{d.device_name || d.device_id}</span>
                    {parseInt(d.active_count) > 0 ? (
                      <Badge variant="statusSelesai">{d.active_count} aktif</Badge>
                    ) : (
                      <Badge variant="statusTutup">{d.ticket_count} tiket</Badge>
                    )}
                  </span>
                  <ChevronRight size={16} className="text-muted-foreground shrink-0" />
                </button>
              ))}
              {devices?.length === 0 && <span className="text-muted-foreground text-sm">Belum ada device</span>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
