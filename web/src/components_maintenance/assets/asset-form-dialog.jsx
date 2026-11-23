import { useEffect, useMemo, useState } from "react";
import {
  ASSET_STATUS_OPTIONS,
  DEFAULT_ASSET_FORM_VALUES,
  MAINTENANCE_INTERVAL_OPTIONS,
} from "@/lib/constants";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

function normalizeAssetValues(values) {
  return {
    kode_aset: values?.kode_aset || "",
    nama_perangkat: values?.nama_perangkat || "",
    tipe: values?.tipe || "",
    lokasi: values?.lokasi || "",
    status: values?.status || "aktif",
    maintenance_interval_months: values?.maintenance_interval_months?.toString() || "12",
  };
}

function validateAssetForm(values) {
  const nextErrors = {};

  if (!values.kode_aset.trim()) {
    nextErrors.kode_aset = "Kode aset wajib diisi.";
  }

  if (!values.nama_perangkat.trim()) {
    nextErrors.nama_perangkat = "Nama perangkat wajib diisi.";
  }

  return nextErrors;
}

export function AssetFormDialog({
  open,
  onOpenChange,
  initialValues,
  lokasiOptions = [],
  onSubmit,
  loading = false,
}) {
  const [formValues, setFormValues] = useState(DEFAULT_ASSET_FORM_VALUES);
  const [errors, setErrors] = useState({});

  const title = useMemo(
    () => (initialValues?.id ? "Edit Aset" : "Tambah Aset"),
    [initialValues?.id],
  );

  useEffect(() => {
    if (open) {
      setFormValues(normalizeAssetValues(initialValues));
      setErrors({});
    }
  }, [initialValues, open]);

  function updateField(field, value) {
    setFormValues((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = validateAssetForm(formValues);

    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    await onSubmit({
      kode_aset: formValues.kode_aset.trim().toUpperCase(),
      nama_perangkat: formValues.nama_perangkat.trim(),
      tipe: formValues.tipe.trim() || null,
      lokasi: formValues.lokasi.trim() || null,
      status: formValues.status,
      maintenance_interval_months: Number(formValues.maintenance_interval_months || 12),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Kelola master aset dan interval maintenance rutinnya.
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
          <div>
            <label className="mb-2 block text-sm font-semibold">Kode aset</label>
            <Input
              value={formValues.kode_aset}
              onChange={(event) => updateField("kode_aset", event.target.value)}
              placeholder="AST-001"
            />
            {errors.kode_aset ? (
              <p className="mt-1 text-xs text-destructive">{errors.kode_aset}</p>
            ) : null}
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
              placeholder="Laptop / Printer / Router"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold">Lokasi</label>
            <Input
              list="asset-location-options"
              value={formValues.lokasi}
              onChange={(event) => updateField("lokasi", event.target.value)}
              placeholder="Cabang Jakarta"
            />
            <datalist id="asset-location-options">
              {lokasiOptions.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold">Status</label>
            <Select
              value={formValues.status}
              onChange={(event) => updateField("status", event.target.value)}
            >
              {ASSET_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold">Interval maintenance</label>
            <Select
              value={formValues.maintenance_interval_months}
              onChange={(event) =>
                updateField("maintenance_interval_months", event.target.value)
              }
            >
              {MAINTENANCE_INTERVAL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex items-center justify-end gap-3 md:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Menyimpan..." : "Simpan Aset"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
