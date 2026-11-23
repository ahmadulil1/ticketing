import { useEffect, useState } from "react";
import { format, startOfMonth } from "date-fns";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Clock3,
  MapPinned,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { MaintenanceFilters } from "@/components/maintenance/maintenance-filters";
import { DashboardCharts } from "@/components/maintenance/dashboard-charts";
import { StatsCard } from "@/components/maintenance/stats-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/loading-state";
import { useRealtimeTick } from "@/hooks/use-realtime-tick";
import { DEFAULT_FILTERS } from "@/lib/constants";
import { fetchAssetSummary } from "@/lib/assets";
import {
  fetchAvailableYears,
  fetchDashboardSummary,
  fetchFilterOptions,
} from "@/lib/maintenance";
import { fetchMonitoringData } from "@/lib/monitoring";
import { getOfficeTypeLabel } from "@/lib/office-type";
import { isIgnorableSupabaseAbortError } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

export function DashboardPage() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [options, setOptions] = useState({ lokasi: [], jenisKegiatan: [] });
  const [yearOptions, setYearOptions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [assetSummary, setAssetSummary] = useState(null);
  const [todayMonitoring, setTodayMonitoring] = useState(null);
  const [monthMonitoring, setMonthMonitoring] = useState(null);
  const [loading, setLoading] = useState(true);
  const realtimeTick = useRealtimeTick("maintenance-live-dashboard", [
    "maintenance",
    "assets",
  ]);

  useEffect(() => {
    async function loadFilterOptions() {
      try {
        const filterOptions = await fetchFilterOptions();
        setOptions(filterOptions);
      } catch (error) {
        if (isIgnorableSupabaseAbortError(error)) {
          return;
        }

        toast({
          title: "Gagal memuat dashboard",
          description: error.message,
          variant: "destructive",
        });
      }
    }

    loadFilterOptions();
  }, [realtimeTick]);

  useEffect(() => {
    async function loadYears() {
      if (!filters.lokasi) {
        setYearOptions([]);
        return;
      }

      try {
        const years = await fetchAvailableYears(filters.lokasi);
        setYearOptions(years);
      } catch (error) {
        if (isIgnorableSupabaseAbortError(error)) {
          return;
        }

        toast({
          title: "Gagal memuat tahun",
          description: error.message,
          variant: "destructive",
        });
      }
    }

    loadYears();
  }, [filters.lokasi, realtimeTick]);

  useEffect(() => {
    async function loadDashboardData() {
      try {
        setLoading(true);
        const assetFilters = {
          lokasi: filters.lokasi || "",
          status: "",
          maintenanceIntervalMonths: "",
          priority: "",
          search: "",
        };

        const today = format(new Date(), "yyyy-MM-dd");
        const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");
        const monitoringFilters = {
          lokasi: filters.lokasi || "",
          officeType: "",
          status: "",
        };

        const [
          maintenanceSummary,
          assetsSummary,
          todayData,
          monthData,
        ] = await Promise.all([
          fetchDashboardSummary(filters),
          fetchAssetSummary(assetFilters),
          fetchMonitoringData({
            ...monitoringFilters,
            tanggalMulai: today,
            tanggalSelesai: today,
          }),
          fetchMonitoringData({
            ...monitoringFilters,
            tanggalMulai: monthStart,
            tanggalSelesai: today,
          }),
        ]);

        setSummary(maintenanceSummary);
        setAssetSummary(assetsSummary);
        setTodayMonitoring(todayData);
        setMonthMonitoring(monthData);
      } catch (error) {
        if (isIgnorableSupabaseAbortError(error)) {
          return;
        }

        toast({
          title: "Gagal memuat ringkasan",
          description: error.message,
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, [filters, realtimeTick]);

  function handleFilterChange(field, value) {
    setFilters((current) => {
      const next = { ...current, [field]: value };

      if (field === "lokasi") {
        next.tahun = "";
      }

      if (field === "tahun") {
        if (!value) {
          next.tanggalMulai = "";
          next.tanggalSelesai = "";
        } else {
          next.tanggalMulai = `${value}-01-01`;
          next.tanggalSelesai = `${value}-12-31`;
        }
      }

      if (field === "tanggalMulai" || field === "tanggalSelesai") {
        next.tahun = "";
      }

      return next;
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-3xl border border-border/70 bg-card/75 p-5 shadow-panel sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Ringkasan
          </p>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight">
            Dashboard Maintenance
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Ringkasan kerja harian dan progress periode berjalan.
          </p>
        </div>
        <MaintenanceFilters
          filters={filters}
          onChange={handleFilterChange}
          onReset={() => setFilters(DEFAULT_FILTERS)}
          lokasiOptions={options.lokasi}
          yearOptions={yearOptions}
          activityOptions={options.jenisKegiatan}
          showStatusAndOffice={false}
        />
      </div>

      {loading && !summary ? (
        <LoadingState label="Memuat dashboard maintenance..." />
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
            <Card className="border-border/70 bg-primary text-primary-foreground">
              <CardContent className="p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-foreground/75">
                      Fokus hari ini
                    </p>
                    <h2 className="mt-2 text-3xl font-extrabold tracking-tight">
                      {todayMonitoring?.summary?.terjadwal || 0} sisa terjadwal
                    </h2>
                    <p className="mt-2 text-sm text-primary-foreground/75">
                      {todayMonitoring?.summary?.selesai || 0} selesai dari {todayMonitoring?.summary?.total || 0} pekerjaan di {todayMonitoring?.summary?.totalLokasi || 0} lokasi.
                    </p>
                  </div>
                  <Button asChild variant="secondary">
                    <Link to="/work">Buka Kerja Hari Ini</Link>
                  </Button>
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl bg-primary-foreground/12 p-4">
                    <CheckCircle2 className="h-5 w-5" />
                    <p className="mt-2 text-2xl font-bold">{todayMonitoring?.summary?.selesai || 0}</p>
                    <p className="text-sm text-primary-foreground/75">Selesai</p>
                  </div>
                  <div className="rounded-2xl bg-primary-foreground/12 p-4">
                    <Clock3 className="h-5 w-5" />
                    <p className="mt-2 text-2xl font-bold">{todayMonitoring?.summary?.terjadwal || 0}</p>
                    <p className="text-sm text-primary-foreground/75">Terjadwal</p>
                  </div>
                  <div className="rounded-2xl bg-primary-foreground/12 p-4">
                    <MapPinned className="h-5 w-5" />
                    <p className="mt-2 text-2xl font-bold">{todayMonitoring?.summary?.totalLokasi || 0}</p>
                    <p className="text-sm text-primary-foreground/75">Lokasi</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/70">
              <CardHeader>
                <CardTitle>Progress Bulan Ini</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-4xl font-extrabold tracking-tight">
                      {monthMonitoring?.summary?.progress || 0}%
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {monthMonitoring?.summary?.selesai || 0} selesai, {monthMonitoring?.summary?.terjadwal || 0} terjadwal
                    </p>
                  </div>
                  <div className="rounded-full bg-muted px-3 py-1 text-sm text-muted-foreground">
                    {monthMonitoring?.summary?.total || 0} pekerjaan
                  </div>
                </div>
                <div className="mt-4 h-3 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${monthMonitoring?.summary?.progress || 0}%` }}
                  />
                </div>
                <div className="mt-4 grid gap-2 text-sm">
                  {monthMonitoring?.summary?.byOfficeType?.map((item) => (
                    <div key={item.officeType} className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">{getOfficeTypeLabel(item.officeType)}</span>
                      <span className="font-semibold">{item.selesai}/{item.total}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            <StatsCard
              label="Total aset"
              value={assetSummary?.total_assets ?? summary?.total_aset ?? 0}
              hint={`${assetSummary?.missing_history_assets ?? 0} tanpa histori`}
              icon={Boxes}
              tone="secondary"
            />
            <StatsCard
              label="Aset aktif"
              value={assetSummary?.active_assets || 0}
              icon={ShieldCheck}
            />
            <StatsCard
              label="Total maintenance"
              value={summary?.total_maintenance || 0}
              icon={Wrench}
            />
            <StatsCard
              label="Perlu maintenance"
              value={assetSummary?.due_assets || 0}
              hint={`${assetSummary?.overdue_assets || 0} lewat`}
              icon={AlertTriangle}
              tone="accent"
            />
          </div>

          <DashboardCharts
            yearly={summary?.yearly || []}
            activities={summary?.activities || []}
          />
        </>
      )}
    </div>
  );
}
