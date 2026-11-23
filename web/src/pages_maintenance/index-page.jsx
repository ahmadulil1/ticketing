import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  Clock3,
  MapPinned,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { Select } from "@/components/ui/select";
import { useRealtimeTick } from "@/hooks/use-realtime-tick";
import { toast } from "@/hooks/use-toast";
import { fetchFilterOptions } from "@/lib/maintenance";
import { fetchMonitoringData } from "@/lib/monitoring";
import { getOfficeTypeLabel, OFFICE_TYPE_OPTIONS } from "@/lib/office-type";
import { cn, formatDate, isIgnorableSupabaseAbortError } from "@/lib/utils";

const DEFAULT_MONITORING_FILTERS = {
  tanggalMulai: "",
  tanggalSelesai: "",
  status: "",
  officeType: "",
  lokasi: "",
};

function StatusBadge({ status }) {
  if (status === "selesai") {
    return <Badge className="bg-secondary text-secondary-foreground">Selesai</Badge>;
  }

  if (status === "sebagian") {
    return (
      <Badge className="border border-amber-500/30 bg-amber-500/12 text-amber-700 dark:text-amber-300">
        Sedang berjalan
      </Badge>
    );
  }

  return (
    <Badge className="border border-sky-500/30 bg-sky-500/12 text-sky-700 dark:text-sky-300">
      Menunggu dikerjakan
    </Badge>
  );
}

function KpiCard({ label, value, hint, icon: Icon, tone = "default" }) {
  return (
    <Card className={cn("border-border/70", tone === "accent" && "bg-primary text-primary-foreground")}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p
              className={cn(
                "text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground",
                tone === "accent" && "text-primary-foreground/75",
              )}
            >
              {label}
            </p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight">{value}</h2>
            {hint ? (
              <p className={cn("mt-2 text-sm text-muted-foreground", tone === "accent" && "text-primary-foreground/75")}>
                {hint}
              </p>
            ) : null}
          </div>
          <div className={cn("rounded-2xl bg-muted p-3 text-foreground", tone === "accent" && "bg-primary-foreground/15 text-primary-foreground")}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function IndexPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState(DEFAULT_MONITORING_FILTERS);
  const [options, setOptions] = useState({ lokasi: [] });
  const [monitoring, setMonitoring] = useState(null);
  const [loading, setLoading] = useState(true);
  const realtimeTick = useRealtimeTick("index-monitoring-live", ["maintenance", "assets"]);

  useEffect(() => {
    async function loadOptions() {
      try {
        const filterOptions = await fetchFilterOptions();
        setOptions(filterOptions);
      } catch (error) {
        if (isIgnorableSupabaseAbortError(error)) {
          return;
        }

        toast({ title: "Gagal memuat filter", description: error.message, variant: "destructive" });
      }
    }

    loadOptions();
  }, [realtimeTick]);

  useEffect(() => {
    async function loadMonitoring() {
      try {
        setLoading(true);
        const result = await fetchMonitoringData(filters);
        setMonitoring(result);
      } catch (error) {
        if (isIgnorableSupabaseAbortError(error)) {
          return;
        }

        toast({ title: "Gagal memuat monitoring", description: error.message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    }

    loadMonitoring();
  }, [filters, realtimeTick]);

  const summary = monitoring?.summary;

  function handleOfficeTypeChange(value) {
    setFilters((current) => ({
      ...current,
      officeType: value,
      lokasi: "",
    }));
  }

  function handleVisitClick(location) {
    const nextParams = new URLSearchParams({
      tanggal: location.date,
      lokasi: location.lokasi,
    });

    if (filters.status) {
      nextParams.set("status", filters.status);
    }

    navigate(`/monitoring/kunjungan?${nextParams.toString()}`);
  }

  return (
    <div className="min-w-0 space-y-5">
      <div className="rounded-3xl border border-border/70 bg-card p-5 shadow-panel">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Pantauan manager
            </p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight">
              Perkembangan Maintenance IT
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Lihat kantor yang sudah dikunjungi, rencana yang masih menunggu, urutan kunjungan, dan ringkasan pekerjaan per lokasi.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <DatePicker
              value={filters.tanggalMulai}
              onChange={(value) => setFilters((current) => ({ ...current, tanggalMulai: value }))}
              placeholder="Tanggal mulai"
            />
            <DatePicker
              value={filters.tanggalSelesai}
              onChange={(value) => setFilters((current) => ({ ...current, tanggalSelesai: value }))}
              placeholder="Tanggal selesai"
            />
            <Select
              value={filters.officeType}
              onChange={(event) => handleOfficeTypeChange(event.target.value)}
            >
              <option value="">Semua kantor</option>
              {OFFICE_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
            <Select
              value={filters.status}
              onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
            >
              <option value="">Semua status</option>
              <option value="selesai">Selesai</option>
              <option value="planning">Menunggu dikerjakan</option>
            </Select>
            <Select
              value={filters.lokasi}
              onChange={(event) => setFilters((current) => ({ ...current, lokasi: event.target.value }))}
            >
              <option value="">Semua lokasi</option>
              {options.lokasi.map((lokasi) => (
                <option key={lokasi} value={lokasi}>{lokasi}</option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      {loading && !monitoring ? (
        <LoadingState label="Memuat perkembangan maintenance..." />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <KpiCard label="Perkembangan" value={`${summary?.progress || 0}%`} hint={`${summary?.selesai || 0} dari ${summary?.total || 0} item kerja`} icon={BarChart3} tone="accent" />
            <KpiCard label="Item kerja" value={summary?.total || 0} icon={BriefcaseBusiness} />
            <KpiCard label="Selesai" value={summary?.selesai || 0} icon={CheckCircle2} />
            <KpiCard label="Menunggu" value={summary?.terjadwal || 0} icon={Clock3} />
            <KpiCard label="Lokasi" value={summary?.totalLokasi || 0} hint={`${summary?.sisaLokasi || 0} belum selesai`} icon={MapPinned} />
            <KpiCard label="Hari kunjungan" value={monitoring?.timeline.length || 0} hint="tanggal berisi data" icon={CalendarDays} />
          </div>

          <div className="grid gap-5 xl:grid-cols-[0.9fr_1.7fr]">
            <Card className="border-border/70">
              <CardHeader>
                <CardTitle>Ringkasan Per Kantor</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {summary?.byOfficeType.map((item) => {
                  const progress = item.total ? Math.round((item.selesai / item.total) * 100) : 0;

                  return (
                    <button
                      type="button"
                      key={item.officeType}
                      className="w-full rounded-2xl p-2 text-left transition hover:bg-muted/45"
                      onClick={() => handleOfficeTypeChange(item.officeType)}
                    >
                      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                        <span className="font-semibold">{getOfficeTypeLabel(item.officeType)}</span>
                        <span className="text-muted-foreground">{progress}%</span>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.selesai} selesai, {item.terjadwal} menunggu
                      </p>
                    </button>
                  );
                })}
              </CardContent>
            </Card>

            <Card className="border-border/70">
              <CardHeader>
                <CardTitle>Urutan Kunjungan</CardTitle>
              </CardHeader>
              <CardContent className="monitoring-scrollbar max-h-[620px] space-y-5 overflow-y-auto pr-2">
                {monitoring?.timeline.length ? monitoring.timeline.map((dateGroup) => (
                  <div key={dateGroup.date} className="space-y-3">
                    <div className="sticky top-0 z-10 bg-card py-1 text-sm font-bold">
                      {formatDate(dateGroup.date)}
                    </div>
                    {dateGroup.locations.map((location) => (
                      <button
                        type="button"
                        key={`${dateGroup.date}-${location.lokasi}`}
                        className="w-full rounded-2xl border border-border/70 bg-muted/25 p-4 text-left transition hover:border-primary/35 hover:bg-muted/50"
                        onClick={() => handleVisitClick(location)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold">
                              {location.urutan_kunjungan ? `${location.urutan_kunjungan}. ` : ""}{location.lokasi}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {getOfficeTypeLabel(location.officeType)} / {location.total} item kerja
                            </p>
                          </div>
                          <StatusBadge status={location.status} />
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                          <span>{location.selesai} selesai</span>
                          <span>{location.terjadwal} menunggu</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )) : (
                  <EmptyState
                    title="Belum ada data"
                    description="Data akan tampil setelah maintenance dimasukkan atau dicatat."
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
