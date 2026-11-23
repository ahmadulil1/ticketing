import { useRef } from "react";
import { addMonths, parseISO, startOfDay } from "date-fns";
import { CalendarPlus, Plus, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TablePagination } from "@/components/ui/table-pagination";
import { cn, formatDate } from "@/lib/utils";

function getStatusTone(status) {
  if (status === "aktif") {
    return "bg-secondary text-secondary-foreground";
  }

  if (status === "maintenance") {
    return "bg-accent text-accent-foreground";
  }

  if (status === "rusak") {
    return "bg-destructive/15 text-destructive";
  }

  return "bg-muted text-muted-foreground";
}

function getIntervalLabel(intervalMonths) {
  if (Number(intervalMonths) === 6) {
    return "6 bulan";
  }

  if (Number(intervalMonths) === 24) {
    return "2 tahun";
  }

  return "1 tahun";
}

function getNextMaintenanceState(asset) {
  if (asset.priority_label === "belum-ada-histori") {
    return {
      label: "Belum ada histori",
      tone: "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300",
      textTone: "text-sky-700 dark:text-sky-300",
      rowTone: "!bg-sky-500/8 hover:!bg-sky-500/8",
      cellTone: "bg-sky-500/8",
    };
  }

  if (asset.priority_label === "lewat") {
    return {
      label: "Lewat",
      tone: "border-destructive/25 bg-destructive/12 text-destructive",
      textTone: "text-destructive",
      rowTone: "!bg-destructive/10 hover:!bg-destructive/10",
      cellTone: "bg-destructive/10",
    };
  }

  if (asset.priority_label === "mendekati") {
    return {
      label: "Mendekati",
      tone: "border-amber-500/25 bg-amber-500/12 text-amber-700 dark:text-amber-300",
      textTone: "text-amber-700 dark:text-amber-300",
      rowTone: "!bg-amber-500/10 hover:!bg-amber-500/10",
      cellTone: "bg-amber-500/10",
    };
  }

  if (!asset.next_maintenance_date) {
    return null;
  }

  const today = startOfDay(new Date());
  const nextDate = parseISO(asset.next_maintenance_date);
  const warningThreshold = addMonths(today, 3);

  if (nextDate <= today) {
    return {
      label: "Lewat",
      tone: "border-destructive/25 bg-destructive/12 text-destructive",
      textTone: "text-destructive",
      rowTone: "!bg-destructive/10 hover:!bg-destructive/10",
      cellTone: "bg-destructive/10",
    };
  }

  if (nextDate <= warningThreshold) {
    return {
      label: "Mendekati",
      tone: "border-amber-500/25 bg-amber-500/12 text-amber-700 dark:text-amber-300",
      textTone: "text-amber-700 dark:text-amber-300",
      rowTone: "!bg-amber-500/10 hover:!bg-amber-500/10",
      cellTone: "bg-amber-500/10",
    };
  }

  return null;
}

function AssetCard({ asset, onRowClick }) {
  const nextMaintenanceState = getNextMaintenanceState(asset);

  return (
    <button
      type="button"
      className={cn(
        "w-full rounded-2xl border border-border/70 bg-card p-4 text-left transition hover:border-primary/40 hover:bg-muted/35",
        nextMaintenanceState?.rowTone,
      )}
      onClick={() => onRowClick?.(asset)}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{asset.nama_perangkat}</p>
          <p className="text-sm text-muted-foreground">{asset.kode_aset}</p>
        </div>
        <Badge className={getStatusTone(asset.status)}>{asset.status}</Badge>
      </div>

      <div className="mt-4 grid gap-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Lokasi</span>
          <span className="text-right font-medium">{asset.lokasi || "-"}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Interval</span>
          <span className="text-right font-medium">
            {getIntervalLabel(asset.maintenance_interval_months)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Maintenance terakhir</span>
          <span className="text-right font-medium">
            {formatDate(asset.last_maintenance_date)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Histori</span>
          <span className="text-right font-medium">{asset.maintenance_count || 0} kali</span>
        </div>
        <div className="flex items-start justify-between gap-3">
          <span className="text-muted-foreground">Terjadwal</span>
          <div className="text-right">
            {asset.scheduled_date ? (
              <>
                <p className="font-medium">{formatDate(asset.scheduled_date)}</p>
                <Badge className="mt-1 border border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300">
                  Terjadwal
                </Badge>
              </>
            ) : (
              <span className="font-medium">-</span>
            )}
          </div>
        </div>
        <div className="flex items-start justify-between gap-3">
          <span className="text-muted-foreground">Berikutnya</span>
          <div className="flex flex-col items-end gap-1 text-right">
            <span className={nextMaintenanceState?.textTone || "font-medium"}>
              {formatDate(asset.next_maintenance_date)}
            </span>
            {nextMaintenanceState ? (
              <Badge className={cn("w-fit border", nextMaintenanceState.tone)}>
                {nextMaintenanceState.label}
              </Badge>
            ) : null}
          </div>
        </div>
      </div>

      <p className="mt-4 text-xs font-semibold text-primary">Buka detail aset</p>
    </button>
  );
}

export function AssetTable({
  title = "Daftar Aset",
  data = [],
  total = 0,
  page = 1,
  pageSize = 10,
  onPageChange,
  onPageSizeChange,
  filterControls = null,
  onCreate,
  onImport,
  onSchedule,
  onRowClick,
  showCreate = false,
  showImport = false,
  showSchedule = false,
  importLoading = false,
}) {
  const fileInputRef = useRef(null);

  return (
    <Card className="min-w-0 overflow-hidden border-border/70 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
      <CardHeader className="flex flex-col gap-4 border-b border-border/60 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle>{title}</CardTitle>
        </div>
        <div className="flex flex-wrap gap-3">
          {filterControls}
          {showImport ? (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file && onImport) {
                    onImport(file);
                  }
                  event.target.value = "";
                }}
              />
              <Button
                variant="outline"
                disabled={importLoading}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4" />
                {importLoading ? "Import..." : "Import Aset"}
              </Button>
            </>
          ) : null}
          {showSchedule ? (
            <Button variant="outline" onClick={onSchedule}>
              <CalendarPlus className="h-4 w-4" />
              Buat Jadwal
            </Button>
          ) : null}
          {showCreate ? (
            <Button onClick={onCreate}>
              <Plus className="h-4 w-4" />
              Tambah Aset
            </Button>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="min-w-0 p-0 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
        {data.length ? (
          <>
            <div className="grid gap-3 p-4 md:hidden">
              {data.map((asset) => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  onRowClick={onRowClick}
                />
              ))}
            </div>

            <div className="hidden min-w-0 flex-1 flex-col overflow-hidden md:flex md:min-h-0">
              <Table
                wrapperClassName="min-h-0 min-w-0 flex-1 border-b border-border/60"
                className="min-w-[1080px]"
              >
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky top-0 z-10">Kode Aset</TableHead>
                    <TableHead className="sticky top-0 z-10">Perangkat</TableHead>
                    <TableHead className="sticky top-0 z-10">Lokasi</TableHead>
                    <TableHead className="sticky top-0 z-10">Status</TableHead>
                    <TableHead className="sticky top-0 z-10">Interval</TableHead>
                    <TableHead className="sticky top-0 z-10">
                      Maintenance Terakhir
                    </TableHead>
                    <TableHead className="sticky top-0 z-10">Histori</TableHead>
                    <TableHead className="sticky top-0 z-10">Terjadwal</TableHead>
                    <TableHead className="sticky top-0 z-10">Berikutnya</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {data.map((asset) => {
                    const nextMaintenanceState = getNextMaintenanceState(asset);
                    const cellTone = nextMaintenanceState?.cellTone;

                    return (
                      <TableRow
                        key={asset.id}
                        className={cn("cursor-pointer", nextMaintenanceState?.rowTone)}
                        onClick={() => onRowClick?.(asset)}
                      >
                        <TableCell className={cn("font-semibold", cellTone)}>
                          {asset.kode_aset}
                        </TableCell>
                        <TableCell className={cellTone}>
                          <div>
                            <p className="font-semibold">{asset.nama_perangkat}</p>
                            <p className="text-xs text-muted-foreground">
                              {asset.tipe || "Tanpa tipe"}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className={cellTone}>{asset.lokasi || "-"}</TableCell>
                        <TableCell className={cellTone}>
                          <Badge className={getStatusTone(asset.status)}>{asset.status}</Badge>
                        </TableCell>
                        <TableCell className={cellTone}>
                          {getIntervalLabel(asset.maintenance_interval_months)}
                        </TableCell>
                        <TableCell className={cellTone}>
                          {formatDate(asset.last_maintenance_date)}
                        </TableCell>
                        <TableCell className={cellTone}>{asset.maintenance_count || 0} kali</TableCell>
                        <TableCell className={cellTone}>
                          {asset.scheduled_date ? (
                            <div className="flex flex-col gap-1">
                              <span>{formatDate(asset.scheduled_date)}</span>
                              <Badge className="w-fit border border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300">
                                Terjadwal
                              </Badge>
                            </div>
                          ) : "-"}
                        </TableCell>
                        <TableCell className={cellTone}>
                          <div className="flex flex-col gap-1">
                            <span className={nextMaintenanceState?.textTone || "text-foreground"}>
                              {formatDate(asset.next_maintenance_date)}
                            </span>
                            {nextMaintenanceState ? (
                              <Badge className={cn("w-fit border", nextMaintenanceState.tone)}>
                                {nextMaintenanceState.label}
                              </Badge>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <TablePagination
              page={page}
              pageSize={pageSize}
              total={total}
              itemLabel="aset"
              onPageChange={onPageChange}
              onPageSizeChange={onPageSizeChange}
            />
          </>
        ) : (
          <div className="p-6">
            <EmptyState
              title="Belum ada aset"
              description="Tambahkan master aset agar interval maintenance bisa dipantau."
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
