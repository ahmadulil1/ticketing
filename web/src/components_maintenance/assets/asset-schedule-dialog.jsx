import { useEffect, useState } from "react";
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

const DEFAULT_VALUES = {
  tanggal_maintenance: "",
  scopeType: "lokasi",
  lokasi: "",
  jenis_kegiatan: "Estimasi maintenance",
};

function validate(values) {
  const errors = {};

  if (!values.tanggal_maintenance) {
    errors.tanggal_maintenance = "Tanggal jadwal wajib diisi.";
  }

  if (values.scopeType === "lokasi" && !values.lokasi) {
    errors.lokasi = "Lokasi wajib dipilih.";
  }

  return errors;
}

export function AssetScheduleDialog({
  open,
  onOpenChange,
  lokasiOptions = [],
  onSubmit,
  loading = false,
}) {
  const [values, setValues] = useState(DEFAULT_VALUES);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (open) {
      setValues(DEFAULT_VALUES);
      setErrors({});
    }
  }, [open]);

  function updateField(field, value) {
    setValues((current) => ({
      ...current,
      [field]: value,
      ...(field === "scopeType" && value !== "lokasi" ? { lokasi: "" } : {}),
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = validate(values);

    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    await onSubmit({
      tanggal_maintenance: values.tanggal_maintenance,
      scopeType: values.scopeType,
      lokasi: values.scopeType === "lokasi" ? values.lokasi : null,
      jenis_kegiatan: values.jenis_kegiatan.trim() || "Estimasi maintenance",
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Buat Jadwal Maintenance</DialogTitle>
          <DialogDescription>
            Buat row Terjadwal untuk aset aktif berdasarkan kantor, KC, atau KCP.
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
          <div>
            <label className="mb-2 block text-sm font-semibold">Tanggal jadwal</label>
            <DatePicker
              value={values.tanggal_maintenance}
              onChange={(value) => updateField("tanggal_maintenance", value)}
              placeholder="Pilih tanggal"
            />
            {errors.tanggal_maintenance ? (
              <p className="mt-1 text-xs text-destructive">{errors.tanggal_maintenance}</p>
            ) : null}
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold">Cakupan</label>
            <Select
              value={values.scopeType}
              onChange={(event) => updateField("scopeType", event.target.value)}
            >
              <option value="lokasi">Kantor tertentu</option>
              <option value="kc">Semua KC</option>
              <option value="kcp">Semua KCP</option>
            </Select>
          </div>

          {values.scopeType === "lokasi" ? (
            <div>
              <label className="mb-2 block text-sm font-semibold">Lokasi</label>
              <Select
                value={values.lokasi}
                onChange={(event) => updateField("lokasi", event.target.value)}
              >
                <option value="">Pilih lokasi</option>
                {lokasiOptions.map((lokasi) => (
                  <option key={lokasi} value={lokasi}>
                    {lokasi}
                  </option>
                ))}
              </Select>
              {errors.lokasi ? (
                <p className="mt-1 text-xs text-destructive">{errors.lokasi}</p>
              ) : null}
            </div>
          ) : null}

          <div className={values.scopeType === "lokasi" ? "" : "md:col-span-2"}>
            <label className="mb-2 block text-sm font-semibold">Jenis kegiatan</label>
            <Input
              value={values.jenis_kegiatan}
              onChange={(event) => updateField("jenis_kegiatan", event.target.value)}
              placeholder="Estimasi maintenance"
            />
          </div>

          <div className="rounded-2xl bg-muted/45 p-4 text-sm text-muted-foreground md:col-span-2">
            Jadwal dibuat untuk aset berstatus aktif. Jika row pada tanggal dan kegiatan yang sama sudah
            Selesai, sistem akan melewatinya agar catatan yang sudah diisi tidak tertimpa.
          </div>

          <div className="flex items-center justify-end gap-3 md:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Membuat..." : "Buat Jadwal"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
