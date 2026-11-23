import { useEffect, useState } from "react";
import { format } from "date-fns";
import { CheckCircle2, Clock3, MapPinned, PencilLine } from "lucide-react";
import { QuickCompleteDialog } from "@/components/maintenance/quick-complete-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { useRealtimeTick } from "@/hooks/use-realtime-tick";
import { toast } from "@/hooks/use-toast";
import { completeWorkItem, fetchWorkDay } from "@/lib/work";
import { getOfficeTypeLabel } from "@/lib/office-type";
import { formatDate, isIgnorableSupabaseAbortError } from "@/lib/utils";

function WorkStatusBadge({ item }) {
  if (item.status === "planning") {
    return <Badge className="border border-sky-500/30 bg-sky-500/12 text-sky-700 dark:text-sky-300">Terjadwal</Badge>;
  }

  return <Badge className="bg-secondary text-secondary-foreground">Selesai</Badge>;
}

export function WorkPage() {
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const realtimeTick = useRealtimeTick("work-live", ["maintenance"]);

  async function loadWorkDay() {
    try {
      setLoading(true);
      const result = await fetchWorkDay(date);
      setLocations(result);
    } catch (error) {
      if (isIgnorableSupabaseAbortError(error)) {
        return;
      }

      toast({ title: "Gagal memuat pekerjaan", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadWorkDay();
  }, [date, realtimeTick]);

  const total = locations.reduce((sum, location) => sum + location.total, 0);
  const selesai = locations.reduce((sum, location) => sum + location.selesai, 0);
  const terjadwal = locations.reduce((sum, location) => sum + location.terjadwal, 0);

  async function handleComplete(payload) {
    if (!selectedItem?.id) {
      return;
    }

    try {
      setSubmitting(true);
      await completeWorkItem(selectedItem.id, payload);
      toast({ title: "Pekerjaan selesai", description: "Catatan disimpan dan status diubah menjadi selesai." });
      setSelectedItem(null);
      await loadWorkDay();
    } catch (error) {
      toast({ title: "Gagal menyelesaikan pekerjaan", description: error.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-3xl border border-border/70 bg-card p-5 shadow-panel md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Alur lapangan</p>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight">Kerja Hari Ini</h1>
          <p className="mt-2 text-sm text-muted-foreground">Ikuti urutan kunjungan, pilih aset, isi catatan, lalu simpan sebagai selesai.</p>
        </div>
        <div className="w-full max-w-xs">
          <DatePicker value={date} onChange={setDate} placeholder="Pilih tanggal kerja" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-border/70"><CardContent className="p-5"><p className="text-sm text-muted-foreground">Tanggal</p><p className="mt-2 text-xl font-bold">{formatDate(date)}</p></CardContent></Card>
        <Card className="border-border/70"><CardContent className="p-5"><MapPinned className="h-5 w-5 text-primary" /><p className="mt-2 text-2xl font-bold">{locations.length}</p><p className="text-sm text-muted-foreground">Lokasi</p></CardContent></Card>
        <Card className="border-border/70"><CardContent className="p-5"><CheckCircle2 className="h-5 w-5 text-secondary" /><p className="mt-2 text-2xl font-bold">{selesai}</p><p className="text-sm text-muted-foreground">Selesai dari {total}</p></CardContent></Card>
        <Card className="border-border/70"><CardContent className="p-5"><Clock3 className="h-5 w-5 text-amber-600" /><p className="mt-2 text-2xl font-bold">{terjadwal}</p><p className="text-sm text-muted-foreground">Sisa terjadwal</p></CardContent></Card>
      </div>

      {loading ? (
        <LoadingState label="Memuat pekerjaan lapangan..." />
      ) : locations.length ? (
        <div className="grid gap-5 xl:grid-cols-2">
          {locations.map((location) => (
            <Card key={location.lokasi} className="border-border/70">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>{location.urutan_kunjungan ? `${location.urutan_kunjungan}. ` : ""}{location.lokasi}</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">{getOfficeTypeLabel(location.officeType)} · {location.selesai} selesai · {location.terjadwal} terjadwal</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {location.rows.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-border/70 bg-muted/25 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-semibold">{item.nama_perangkat}</p>
                        <p className="text-xs text-muted-foreground">{item.kode_aset} · {item.tipe || "Tanpa tipe"}</p>
                        <p className="mt-2 text-sm">{item.jenis_kegiatan || "Estimasi maintenance"}</p>
                        {item.status !== "planning" ? <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{item.catatan || "Selesai tanpa catatan."}</p> : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <WorkStatusBadge item={item} />
                        {item.status === "planning" ? (
                          <Button size="sm" onClick={() => setSelectedItem(item)}>
                            <PencilLine className="h-4 w-4" />
                            Isi Catatan
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState title="Tidak ada pekerjaan" description="Belum ada item maintenance untuk tanggal ini." />
      )}

      <QuickCompleteDialog item={selectedItem} open={Boolean(selectedItem)} onOpenChange={(open) => !open && setSelectedItem(null)} onSubmit={handleComplete} loading={submitting} />
    </div>
  );
}
