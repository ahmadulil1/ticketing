import { CheckCircle2, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDate, formatMinutes } from "@/lib/utils";

function statusTone(status) {
  return status === "planning"
    ? "border border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300"
    : "bg-secondary text-secondary-foreground";
}

export function MaintenanceDetailDialog({
  open,
  onOpenChange,
  item,
  canManage,
  onEdit,
  onDelete,
  onComplete,
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Rincian Maintenance</DialogTitle>
          <DialogDescription>
            {item?.nama_perangkat || "Data maintenance"} · {formatDate(item?.tanggal_maintenance)}
          </DialogDescription>
        </DialogHeader>

        {item ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-border/70 bg-muted/25 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xl font-bold">{item.nama_perangkat}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {item.kode_aset} · {item.tipe || "Tanpa tipe"}
                  </p>
                </div>
                <Badge className={statusTone(item.status)}>
                  {item.status === "planning" ? "Menunggu dikerjakan" : "Selesai"}
                </Badge>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border/70 p-4">
                <p className="text-sm text-muted-foreground">Tanggal</p>
                <p className="mt-1 font-semibold">{formatDate(item.tanggal_maintenance)}</p>
              </div>
              <div className="rounded-2xl border border-border/70 p-4">
                <p className="text-sm text-muted-foreground">Lokasi</p>
                <p className="mt-1 font-semibold">
                  {item.urutan_kunjungan ? `${item.urutan_kunjungan}. ` : ""}{item.lokasi || "-"}
                </p>
              </div>
              <div className="rounded-2xl border border-border/70 p-4">
                <p className="text-sm text-muted-foreground">Kegiatan</p>
                <p className="mt-1 font-semibold">{item.jenis_kegiatan || "Maintenance"}</p>
              </div>
              <div className="rounded-2xl border border-border/70 p-4">
                <p className="text-sm text-muted-foreground">Durasi</p>
                <p className="mt-1 font-semibold">{formatMinutes(item.durasi)}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-border/70 p-4">
              <p className="text-sm text-muted-foreground">Catatan hasil kerja</p>
              <p className="mt-2 whitespace-pre-line text-sm">
                {item.status === "planning" ? "Masih menunggu pengerjaan di lokasi." : item.catatan || "Selesai tanpa catatan."}
              </p>
            </div>

            {canManage ? (
              <div className="flex flex-wrap justify-end gap-3 border-t border-border pt-4">
                <Button variant="outline" onClick={() => onEdit?.(item)}>
                  <Pencil className="h-4 w-4" />
                  Edit
                </Button>
                {item.status === "planning" ? (
                  <Button onClick={() => onComplete?.(item)}>
                    <CheckCircle2 className="h-4 w-4" />
                    Isi Catatan & Selesaikan
                  </Button>
                ) : null}
                <Button variant="destructive" onClick={() => onDelete?.(item)}>
                  <Trash2 className="h-4 w-4" />
                  Hapus
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
