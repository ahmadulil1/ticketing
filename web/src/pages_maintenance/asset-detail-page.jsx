import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CalendarClock, CheckCircle2, Clock3, History, Pencil, ShieldCheck } from "lucide-react";
import { AssetFormDialog } from "@/components/assets/asset-form-dialog";
import { QuickCompleteDialog } from "@/components/maintenance/quick-complete-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";
import { useRealtimeTick } from "@/hooks/use-realtime-tick";
import { toast } from "@/hooks/use-toast";
import { fetchAssetDetail, updateAsset } from "@/lib/assets";
import { completeWorkItem } from "@/lib/work";
import { formatDate, isIgnorableSupabaseAbortError } from "@/lib/utils";

function priorityLabel(value) {
  if (value === "lewat") return "Lewat maintenance";
  if (value === "mendekati") return "Mendekati jadwal";
  if (value === "belum-ada-histori") return "Belum ada histori";
  return "Normal";
}

function statusBadge(status) {
  if (status === "planning") {
    return "border border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300";
  }

  return "bg-secondary text-secondary-foreground";
}

function intervalLabel(value) {
  if (Number(value) === 6) return "6 bulan";
  if (Number(value) === 24) return "2 tahun";
  return "1 tahun";
}

export function AssetDetailPage() {
  const { assetId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [completeItem, setCompleteItem] = useState(null);
  const [completeLoading, setCompleteLoading] = useState(false);
  const realtimeTick = useRealtimeTick("asset-detail-live", ["assets", "maintenance"]);

  async function loadAssetDetail() {
    try {
      setLoading(true);
      const result = await fetchAssetDetail(assetId);
      setData(result);
    } catch (error) {
      if (isIgnorableSupabaseAbortError(error)) return;
      setData({ asset: null, history: [], scheduledRows: [], completedRows: [] });
      toast({ title: "Gagal memuat detail aset", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAssetDetail();
  }, [assetId, realtimeTick]);

  async function handleUpdateAsset(payload) {
    try {
      setEditLoading(true);
      await updateAsset(data.asset.id, payload);
      toast({ title: "Aset diperbarui", description: "Perubahan aset berhasil disimpan." });
      setEditOpen(false);
      await loadAssetDetail();
    } catch (error) {
      toast({ title: "Gagal menyimpan aset", description: error.message, variant: "destructive" });
    } finally {
      setEditLoading(false);
    }
  }

  async function handleComplete(payload) {
    if (!completeItem?.id) return;

    try {
      setCompleteLoading(true);
      await completeWorkItem(completeItem.id, payload);
      toast({ title: "Pekerjaan selesai", description: "Catatan disimpan dan status diubah menjadi selesai." });
      setCompleteItem(null);
      await loadAssetDetail();
    } catch (error) {
      toast({ title: "Gagal menyelesaikan pekerjaan", description: error.message, variant: "destructive" });
    } finally {
      setCompleteLoading(false);
    }
  }

  if (loading && !data) {
    return <LoadingState label="Memuat detail aset..." />;
  }

  if (!data?.asset) {
    return (
      <div className="rounded-3xl border border-border/70 bg-card p-6">
        <p className="font-semibold">Aset tidak ditemukan.</p>
        <Button asChild className="mt-4" variant="outline">
          <Link to="/assets">Kembali ke Aset</Link>
        </Button>
      </div>
    );
  }

  const { asset, history, scheduledRows, completedRows } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-3xl border border-border/70 bg-card p-5 shadow-panel md:flex-row md:items-start md:justify-between">
        <div>
          <Button asChild variant="ghost" className="mb-3 px-0 hover:bg-transparent">
            <Link to="/assets">
              <ArrowLeft className="h-4 w-4" />
              Kembali ke Aset
            </Link>
          </Button>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Detail aset</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight">{asset.nama_perangkat}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{asset.kode_aset} · {asset.lokasi || "Tanpa lokasi"} · {asset.tipe || "Tanpa tipe"}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge>{asset.status}</Badge>
            <Badge className="border border-border bg-muted text-muted-foreground">{intervalLabel(asset.maintenance_interval_months)}</Badge>
            <Badge className="border border-primary/25 bg-primary/10 text-primary">{priorityLabel(asset.priority_label)}</Badge>
            {asset.scheduled_date ? <Badge className="border border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300">Menunggu dikerjakan</Badge> : null}
          </div>
        </div>
        <Button onClick={() => setEditOpen(true)}>
          <Pencil className="h-4 w-4" />
          Edit aset
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card className="border-border/70"><CardContent className="p-5"><CheckCircle2 className="h-5 w-5 text-secondary" /><p className="mt-2 text-sm text-muted-foreground">Maintenance terakhir</p><p className="mt-1 text-xl font-bold">{formatDate(asset.last_maintenance_date)}</p></CardContent></Card>
        <Card className="border-border/70"><CardContent className="p-5"><Clock3 className="h-5 w-5 text-amber-600" /><p className="mt-2 text-sm text-muted-foreground">Berikutnya</p><p className="mt-1 text-xl font-bold">{formatDate(asset.next_maintenance_date)}</p></CardContent></Card>
        <Card className="border-border/70"><CardContent className="p-5"><History className="h-5 w-5 text-primary" /><p className="mt-2 text-sm text-muted-foreground">Histori selesai</p><p className="mt-1 text-xl font-bold">{completedRows.length} kali</p></CardContent></Card>
        <Card className="border-border/70"><CardContent className="p-5"><CalendarClock className="h-5 w-5 text-sky-600" /><p className="mt-2 text-sm text-muted-foreground">Menunggu</p><p className="mt-1 text-xl font-bold">{scheduledRows.length} item</p></CardContent></Card>
        <Card className="border-border/70"><CardContent className="p-5"><ShieldCheck className="h-5 w-5 text-secondary" /><p className="mt-2 text-sm text-muted-foreground">Status aset</p><p className="mt-1 text-xl font-bold capitalize">{asset.status}</p></CardContent></Card>
      </div>

      {scheduledRows.length ? (
        <Card className="border-border/70">
          <CardHeader><CardTitle>Menunggu Dikerjakan</CardTitle></CardHeader>
          <CardContent className="grid gap-3 xl:grid-cols-2">
            {scheduledRows.map((row) => (
              <div key={row.id} className="rounded-2xl border border-sky-500/20 bg-sky-500/8 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-semibold">{formatDate(row.tanggal_maintenance)}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{row.jenis_kegiatan || "Rencana maintenance"}</p>
                  </div>
                  <Button size="sm" onClick={() => setCompleteItem(row)}>Isi catatan</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-border/70">
        <CardHeader><CardTitle>Riwayat Maintenance</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {history.length ? history.map((row) => (
            <div key={row.id} className="rounded-2xl border border-border/70 bg-muted/25 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-semibold">{formatDate(row.tanggal_maintenance)}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{row.jenis_kegiatan || "Maintenance"} · {row.lokasi || "-"}</p>
                </div>
                <Badge className={statusBadge(row.status)}>{row.status === "planning" ? "Menunggu dikerjakan" : "Selesai"}</Badge>
              </div>
              <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground">{row.status === "planning" ? "Masih menunggu pengerjaan di lokasi." : row.catatan || "Selesai tanpa catatan."}</p>
            </div>
          )) : (
            <div className="rounded-2xl border border-border/70 bg-muted/25 p-4 text-sm text-muted-foreground">Belum ada riwayat maintenance untuk aset ini.</div>
          )}
        </CardContent>
      </Card>

      <AssetFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        initialValues={asset}
        lokasiOptions={asset.lokasi ? [asset.lokasi] : []}
        onSubmit={handleUpdateAsset}
        loading={editLoading}
      />
      <QuickCompleteDialog
        item={completeItem}
        open={Boolean(completeItem)}
        onOpenChange={(open) => !open && setCompleteItem(null)}
        onSubmit={handleComplete}
        loading={completeLoading}
      />
    </div>
  );
}
