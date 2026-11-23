import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useRealtimeTick } from "@/hooks/use-realtime-tick";
import { toast } from "@/hooks/use-toast";
import { fetchMonitoringData } from "@/lib/monitoring";
import { getOfficeTypeLabel, getOfficeType } from "@/lib/office-type";
import { cn, formatDate, formatMinutes, isIgnorableSupabaseAbortError } from "@/lib/utils";

function StatusBadge({ status }) {
  if (status === "selesai") {
    return <Badge className="bg-secondary text-secondary-foreground">Selesai</Badge>;
  }

  return <Badge className="border border-sky-500/30 bg-sky-500/12 text-sky-700 dark:text-sky-300">Menunggu dikerjakan</Badge>;
}

function SummaryCard({ label, value, hint, icon: Icon, tone = "default" }) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-border/70 bg-card p-5 shadow-sm",
        tone === "primary" && "bg-primary text-primary-foreground",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p
            className={cn(
              "text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground",
              tone === "primary" && "text-primary-foreground/75",
            )}
          >
            {label}
          </p>
          <p className="mt-3 text-3xl font-extrabold tracking-tight">{value}</p>
          {hint ? (
            <p className={cn("mt-2 text-sm text-muted-foreground", tone === "primary" && "text-primary-foreground/75")}>
              {hint}
            </p>
          ) : null}
        </div>
        <div className={cn("rounded-2xl bg-muted p-3", tone === "primary" && "bg-primary-foreground/15")}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function ProgressBar({ done, total }) {
  const progress = total ? Math.round((done / total) * 100) : 0;

  return (
    <div className="rounded-3xl border border-border/70 bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Progress Kunjungan</p>
          <p className="mt-2 text-2xl font-extrabold">{progress}% selesai</p>
        </div>
        <p className="text-sm text-muted-foreground">{done} dari {total} item</p>
      </div>
      <div className="mt-4 h-4 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

function DetailTable({ rows }) {
  return (
    <Table
      wrapperClassName="max-h-[calc(100vh-330px)] min-w-0 border-b border-border/60"
      className="min-w-[1040px]"
    >
      <TableHeader>
        <TableRow>
          <TableHead className="sticky top-0 z-10">No</TableHead>
          <TableHead className="sticky top-0 z-10">Aset</TableHead>
          <TableHead className="sticky top-0 z-10">Kode</TableHead>
          <TableHead className="sticky top-0 z-10">Tipe</TableHead>
          <TableHead className="sticky top-0 z-10">Kegiatan</TableHead>
          <TableHead className="sticky top-0 z-10">Status</TableHead>
          <TableHead className="sticky top-0 z-10">Durasi</TableHead>
          <TableHead className="sticky top-0 z-10">Catatan</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, index) => {
          const isPlanning = row.status === "planning";

          return (
            <TableRow key={row.id}>
              <TableCell className="w-16 font-semibold">{index + 1}</TableCell>
              <TableCell className="min-w-56">
                <p className="font-semibold">{row.nama_perangkat}</p>
              </TableCell>
              <TableCell className="font-medium">{row.kode_aset}</TableCell>
              <TableCell>{row.tipe || "Tanpa tipe"}</TableCell>
              <TableCell className="max-w-64">{row.jenis_kegiatan || "-"}</TableCell>
              <TableCell>
                <StatusBadge status={isPlanning ? "terjadwal" : "selesai"} />
              </TableCell>
              <TableCell>{formatMinutes(row.durasi)}</TableCell>
              <TableCell className="max-w-md">
                <p className="whitespace-pre-line text-sm text-muted-foreground">
                  {isPlanning ? "Masih menunggu pengerjaan di lokasi." : row.catatan || "-"}
                </p>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function buildFilters(searchParams) {
  const tanggal = searchParams.get("tanggal") || "";

  return {
    tanggalMulai: tanggal,
    tanggalSelesai: tanggal,
    lokasi: searchParams.get("lokasi") || "",
    status: searchParams.get("status") || "",
    officeType: "",
  };
}

export function VisitMaintenanceDetailPage() {
  const [searchParams] = useSearchParams();
  const tanggal = searchParams.get("tanggal") || "";
  const lokasi = searchParams.get("lokasi") || "";
  const [monitoring, setMonitoring] = useState(null);
  const [loading, setLoading] = useState(true);
  const realtimeTick = useRealtimeTick("visit-maintenance-detail", ["maintenance"]);

  const filters = useMemo(() => buildFilters(searchParams), [searchParams]);
  const rows = monitoring?.rows || [];

  useEffect(() => {
    async function loadDetail() {
      try {
        setLoading(true);
        const result = await fetchMonitoringData(filters);
        setMonitoring(result);
      } catch (error) {
        if (isIgnorableSupabaseAbortError(error)) {
          return;
        }

        toast({ title: "Gagal memuat detail kunjungan", description: error.message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    }

    loadDetail();
  }, [filters, realtimeTick]);

  if (!tanggal || !lokasi) {
    return <Navigate to="/" replace />;
  }

  const selesai = rows.filter((row) => row.status !== "planning").length;
  const terjadwal = rows.length - selesai;
  const totalDurasi = rows.reduce((total, row) => total + (Number(row.durasi) || 0), 0);

  return (
    <div className="min-w-0 space-y-5">
      <section className="overflow-hidden rounded-[2rem] border border-border/70 bg-card shadow-panel">
        <div className="p-6 md:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Detail Kunjungan Maintenance
              </p>
              <h1 className="mt-3 max-w-4xl text-3xl font-black tracking-tight md:text-4xl">{lokasi}</h1>
              <p className="mt-3 text-sm text-muted-foreground">
                {formatDate(tanggal)} / {getOfficeTypeLabel(getOfficeType(lokasi))}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link to="/">
                  <ArrowLeft className="h-4 w-4" />
                  Kembali
                </Link>
              </Button>
            </div>
          </div>
        </div>
        <div className="grid gap-4 p-5 md:grid-cols-4">
          <SummaryCard
            label="Total Item"
            value={rows.length}
            hint="aset dalam kunjungan"
            icon={BriefcaseBusiness}
            tone="primary"
          />
          <SummaryCard label="Selesai" value={selesai} hint="sudah dikerjakan" icon={CheckCircle2} />
          <SummaryCard label="Menunggu" value={terjadwal} hint="belum dikerjakan" icon={Clock3} />
          <ProgressBar done={selesai} total={rows.length} />
        </div>
        {totalDurasi ? (
          <div className="border-t border-border/70 px-5 pb-5">
            <div className="rounded-3xl bg-muted/45 p-4 text-sm">
              Total durasi tercatat: <span className="font-bold">{formatMinutes(totalDurasi)}</span>
            </div>
          </div>
        ) : null}
      </section>

      {loading && !monitoring ? (
        <LoadingState label="Memuat detail kunjungan..." />
      ) : (
        <Card className="min-w-0 overflow-hidden border-border/70">
          <CardHeader className="border-b border-border/60">
            <CardTitle>Tabel Detail Maintenance</CardTitle>
            <p className="text-sm text-muted-foreground">
              Daftar aset, kegiatan, status, durasi, dan catatan untuk lokasi ini.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {rows.length ? (
              <DetailTable rows={rows} />
            ) : (
              <div className="p-6">
                <EmptyState title="Belum ada data" description="Tidak ada item maintenance untuk kunjungan ini." />
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
