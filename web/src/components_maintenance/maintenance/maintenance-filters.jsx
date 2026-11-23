import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Filter, RotateCcw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { MAINTENANCE_STATUS_OPTIONS } from "@/lib/constants";
import { OFFICE_TYPE_OPTIONS } from "@/lib/office-type";
import { cn } from "@/lib/utils";

export function MaintenanceFilters({
  filters,
  onChange,
  onReset,
  lokasiOptions = [],
  yearOptions = [],
  activityOptions = [],
  showSearch = false,
  showStatusAndOffice = true,
}) {
  const [open, setOpen] = useState(false);

  const activeCount = useMemo(
    () =>
      [
        filters.lokasi,
        filters.tahun,
        filters.tanggalMulai,
        filters.tanggalSelesai,
        filters.jenisKegiatan,
        showStatusAndOffice ? filters.status : "",
        showStatusAndOffice ? filters.officeType : "",
        showSearch ? filters.search : "",
      ].filter(Boolean).length,
    [filters, showSearch],
  );

  const filterSheet = open ? createPortal(
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-slate-950/40"
        onClick={() => setOpen(false)}
      />
      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex h-dvh max-h-dvh w-full max-w-md flex-col border-l border-border bg-background p-6 shadow-2xl",
        )}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">Filter</h2>
            <p className="text-sm text-muted-foreground">
              Atur filter data maintenance.
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="mt-6 flex-1 space-y-4 overflow-y-auto pr-1">
          <div>
            <label className="mb-2 block text-sm font-semibold">Lokasi</label>
            <Select
              value={filters.lokasi}
              onChange={(event) => onChange("lokasi", event.target.value)}
            >
              <option value="">Semua lokasi</option>
              {lokasiOptions.map((lokasi) => (
                <option key={lokasi} value={lokasi}>
                  {lokasi}
                </option>
              ))}
            </Select>
          </div>

          {showStatusAndOffice ? (
            <div>
              <label className="mb-2 block text-sm font-semibold">Jenis kantor</label>
              <Select
                value={filters.officeType}
                onChange={(event) => onChange("officeType", event.target.value)}
              >
                <option value="">Semua jenis kantor</option>
                {OFFICE_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}

          <div>
            <label className="mb-2 block text-sm font-semibold">Tahun</label>
            <Select
              value={filters.tahun}
              disabled={!filters.lokasi}
              onChange={(event) => onChange("tahun", event.target.value)}
            >
              <option value="">Semua tahun</option>
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold">Tanggal mulai</label>
            <DatePicker
              value={filters.tanggalMulai}
              onChange={(value) => onChange("tanggalMulai", value)}
              placeholder="Pilih tanggal mulai"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold">Tanggal selesai</label>
            <DatePicker
              value={filters.tanggalSelesai}
              onChange={(value) => onChange("tanggalSelesai", value)}
              placeholder="Pilih tanggal selesai"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold">Jenis kegiatan</label>
            <Select
              value={filters.jenisKegiatan}
              onChange={(event) => onChange("jenisKegiatan", event.target.value)}
            >
              <option value="">Semua kegiatan</option>
              {activityOptions.map((activity) => (
                <option key={activity} value={activity}>
                  {activity}
                </option>
              ))}
            </Select>
          </div>

          {showStatusAndOffice ? (
            <div>
              <label className="mb-2 block text-sm font-semibold">Status</label>
              <Select
                value={filters.status}
                onChange={(event) => onChange("status", event.target.value)}
              >
                <option value="">Semua status</option>
                {MAINTENANCE_STATUS_OPTIONS.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}

          {showSearch ? (
            <div>
              <label className="mb-2 block text-sm font-semibold">
                Search aset/perangkat
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Cari kode aset atau nama perangkat"
                  value={filters.search}
                  onChange={(event) => onChange("search", event.target.value)}
                />
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-6 border-t border-border pt-6">
          <div className="flex gap-3">
            {activeCount ? (
              <Button variant="outline" className="flex-1" onClick={onReset}>
                <RotateCcw className="h-4 w-4" />
                Reset
              </Button>
            ) : null}
            <Button className="flex-1" onClick={() => setOpen(false)}>
              Terapkan
            </Button>
          </div>
        </div>
      </aside>
    </>,
    document.body,
  ) : null;

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => setOpen(true)}>
          <Filter className="h-4 w-4" />
          {activeCount ? `Filter (${activeCount})` : "Filter"}
        </Button>
      </div>

      {filterSheet}
    </>
  );
}
