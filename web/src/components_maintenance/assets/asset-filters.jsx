import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Filter, RotateCcw, Search, X } from "lucide-react";
import {
  ASSET_PRIORITY_OPTIONS,
  MAINTENANCE_INTERVAL_OPTIONS,
} from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function AssetFilters({
  filters,
  onChange,
  onReset,
  lokasiOptions = [],
  statusOptions = [],
  intervalOptions = [],
}) {
  const [open, setOpen] = useState(false);

  const activeCount = useMemo(
    () =>
      [
        filters.lokasi,
        filters.status,
        filters.maintenanceIntervalMonths,
        filters.priority,
        filters.search,
      ].filter(Boolean).length,
    [filters],
  );

  const availableIntervals = useMemo(() => {
    if (intervalOptions.length) {
      return MAINTENANCE_INTERVAL_OPTIONS.filter((option) =>
        intervalOptions.includes(option.value),
      );
    }

    return MAINTENANCE_INTERVAL_OPTIONS;
  }, [intervalOptions]);

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
            <h2 className="text-lg font-bold">Filter Aset</h2>
            <p className="text-sm text-muted-foreground">
              Fokuskan daftar aset yang perlu tindakan.
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="mt-6 flex-1 space-y-4 overflow-y-auto pr-1">
          <div>
            <label className="mb-2 block text-sm font-semibold">
              Cari aset/perangkat
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Kode aset, perangkat, atau tipe"
                value={filters.search}
                onChange={(event) => onChange("search", event.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold">Lokasi</label>
            <Select
              value={filters.lokasi}
              onChange={(event) => onChange("lokasi", event.target.value)}
            >
              <option value="">Semua lokasi</option>
              {lokasiOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold">Status aset</label>
            <Select
              value={filters.status}
              onChange={(event) => onChange("status", event.target.value)}
            >
              <option value="">Semua status</option>
              {statusOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold">
              Interval maintenance
            </label>
            <Select
              value={filters.maintenanceIntervalMonths}
              onChange={(event) =>
                onChange("maintenanceIntervalMonths", event.target.value)
              }
            >
              <option value="">Semua interval</option>
              {availableIntervals.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold">Prioritas</label>
            <Select
              value={filters.priority}
              onChange={(event) => onChange("priority", event.target.value)}
            >
              <option value="">Semua prioritas</option>
              {ASSET_PRIORITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
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
      <Button onClick={() => setOpen(true)}>
        <Filter className="h-4 w-4" />
        {activeCount ? `Filter (${activeCount})` : "Filter"}
      </Button>

      {filterSheet}
    </>
  );
}
