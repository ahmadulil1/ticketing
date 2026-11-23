import { useEffect, useMemo, useState } from "react";
import {
  ACTIVITY_OPTIONS,
  DEFAULT_FORM_VALUES,
  MAINTENANCE_STATUS_OPTIONS,
} from "@/lib/constants";
import { resolveAssetCode } from "@/lib/asset-code";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

function normalizeFormValues(values) {
  return {
    tanggal_maintenance: values?.tanggal_maintenance || "",
    kode_aset: values?.kode_aset || "",
    nama_perangkat: values?.nama_perangkat || "",
    tipe: values?.tipe || "",
    lokasi: values?.lokasi || "",
    jenis_kegiatan: values?.jenis_kegiatan || "",
    durasi: values?.durasi?.toString() || "",
    status: values?.status || "selesai",
    catatan: values?.catatan || "",
  };
}

function validateForm(values) {
  const nextErrors = {};

  if (!values.tanggal_maintenance) {
    nextErrors.tanggal_maintenance = "Tanggal maintenance wajib diisi.";
  }

  if (!values.nama_perangkat.trim()) {
    nextErrors.nama_perangkat = "Nama perangkat wajib diisi.";
  }

  if (values.durasi && Number(values.durasi) < 0) {
    nextErrors.durasi = "Durasi tidak boleh negatif.";
  }

  return nextErrors;
}

export function MaintenanceFormDialog({
  open,
  onOpenChange,
  initialValues,
  lokasiOptions = [],
  onSubmit,
  loading = false,
}) {
  const [formValues, setFormValues] = useState(DEFAULT_FORM_VALUES);
  const [errors, setErrors] = useState({});

  const title = useMemo(
    () => (initialValues?.id ? "Edit Data Maintenance" : "Tambah Data Maintenance"),
    [initialValues?.id],
  );

  useEffect(() => {
    if (open) {
      setFormValues(normalizeFormValues(initialValues));
      setErrors({});
    }
  }, [initialValues, open]);

  function updateField(name, value) {
    setFormValues((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = validateForm(formValues);

    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    await onSubmit({
      tanggal_maintenance: formValues.tanggal_maintenance,
      kode_aset: resolveAssetCode({
        kodeAset: formValues.kode_aset,
        namaPerangkat: formValues.nama_perangkat,
        lokasi: formValues.lokasi,
        tipe: formValues.tipe,
      }),
      nama_perangkat: formValues.nama_perangkat.trim(),
      tipe: formValues.tipe.trim() || null,
      lokasi: formValues.lokasi.trim() || null,
      jenis_kegiatan: formValues.jenis_kegiatan || null,
      durasi: formValues.durasi ? Number(formValues.durasi) : null,
      status: formValues.status,
      catatan: formValues.catatan.trim() || null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Lengkapi form maintenance perangkat untuk menyimpan riwayat kerja tim IT.
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
          <div>
            <label className="mb-2 block text-sm font-semibold">Tanggal maintenance</label>
            <DatePicker
              value={formValues.tanggal_maintenance}
              onChange={(value) => updateField("tanggal_maintenance", value)}
              placeholder="Pilih tanggal maintenance"
            />
            {errors.tanggal_maintenance ? (
              <p className="mt-1 text-xs text-destructive">{errors.tanggal_maintenance}</p>
            ) : null}
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold">Kode aset</label>
            <Input
              value={formValues.kode_aset}
              onChange={(event) => updateField("kode_aset", event.target.value)}
              placeholder="AST-001 atau kosongkan jika tidak diketahui"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Jika kosong, sistem akan membuat kode aset otomatis untuk perangkat yang belum diketahui.
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold">Nama perangkat</label>
            <Input
              value={formValues.nama_perangkat}
              onChange={(event) => updateField("nama_perangkat", event.target.value)}
              placeholder="Laptop Finance 01"
            />
            {errors.nama_perangkat ? (
              <p className="mt-1 text-xs text-destructive">{errors.nama_perangkat}</p>
            ) : null}
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold">Tipe</label>
            <Input
              value={formValues.tipe}
              onChange={(event) => updateField("tipe", event.target.value)}
              placeholder="Laptop / Printer / UPS"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold">Lokasi</label>
            <Input
              list="lokasi-options"
              value={formValues.lokasi}
              onChange={(event) => updateField("lokasi", event.target.value)}
              placeholder="Cabang Jakarta"
            />
            <datalist id="lokasi-options">
              {lokasiOptions.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold">Jenis kegiatan</label>
            <Select
              value={formValues.jenis_kegiatan}
              onChange={(event) => updateField("jenis_kegiatan", event.target.value)}
            >
              <option value="">Pilih jenis kegiatan</option>
              {ACTIVITY_OPTIONS.map((activity) => (
                <option key={activity} value={activity}>
                  {activity}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold">Durasi (menit)</label>
            <Input
              type="number"
              min="0"
              value={formValues.durasi}
              onChange={(event) => updateField("durasi", event.target.value)}
              placeholder="60"
            />
            {errors.durasi ? (
              <p className="mt-1 text-xs text-destructive">{errors.durasi}</p>
            ) : null}
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold">Status</label>
            <Select
              value={formValues.status}
              onChange={(event) => updateField("status", event.target.value)}
            >
              {MAINTENANCE_STATUS_OPTIONS.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-semibold">Catatan</label>
            <Textarea
              value={formValues.catatan}
              onChange={(event) => updateField("catatan", event.target.value)}
              placeholder="Catatan hasil maintenance, spare part, atau kendala."
            />
          </div>

          <div className="flex items-center justify-end gap-3 md:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Menyimpan..." : "Simpan Data"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
