import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";

export function QuickCompleteDialog({ item, open, onOpenChange, onSubmit, loading }) {
  const [catatan, setCatatan] = useState("");
  const [durasi, setDurasi] = useState("");

  useEffect(() => {
    if (open) {
      setCatatan(item?.catatan || "");
      setDurasi(item?.durasi?.toString() || "");
    }
  }, [item, open]);

  async function handleSubmit(event) {
    event.preventDefault();

    if (!catatan.trim()) {
      toast({
        title: "Catatan wajib diisi",
        description: "Isi hasil pekerjaan sebelum menyelesaikan item.",
        variant: "destructive",
      });
      return;
    }

    await onSubmit({ catatan, durasi });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Isi Catatan & Selesaikan</DialogTitle>
          <DialogDescription>
            {item?.nama_perangkat || "Pekerjaan"} · {item?.lokasi || "-"}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="rounded-2xl border border-border/70 bg-muted/30 p-4 text-sm">
            <p className="font-semibold">{item?.jenis_kegiatan || "Estimasi maintenance"}</p>
            <p className="mt-1 text-muted-foreground">
              {item?.kode_aset || "-"} · {item?.tipe || "Tanpa tipe"}
            </p>
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold">Catatan hasil pekerjaan</label>
            <Textarea
              autoFocus
              value={catatan}
              onChange={(event) => setCatatan(event.target.value)}
              placeholder="Tulis pekerjaan yang dilakukan, kendala, atau penggantian komponen."
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold">Durasi (menit)</label>
            <Input
              type="number"
              min="0"
              value={durasi}
              onChange={(event) => setDurasi(event.target.value)}
              placeholder="Opsional"
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Menyimpan..." : "Simpan Selesai"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
