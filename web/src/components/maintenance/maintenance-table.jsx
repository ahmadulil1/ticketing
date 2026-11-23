import { useRef } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  FileSpreadsheet,
  Plus,
  Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TablePagination } from "@/components/ui/table-pagination";
import { cn, formatDate, formatMinutes } from "@/lib/utils";

function SortIcon({ active, direction }) {
  if (!active) {
    return <ArrowUpDown className="h-4 w-4" />;
  }

  return direction === "asc" ? (
    <ArrowUp className="h-4 w-4" />
  ) : (
    <ArrowDown className="h-4 w-4" />
  );
}

function getMaintenanceStatus(item) {
  return item.status === "planning" ? "planning" : "selesai";
}

function getMaintenanceStatusTone(status) {
  if (status === "planning") {
    return "border-amber-500/25 bg-amber-500/12 text-amber-700 dark:text-amber-300";
  }

  return "border-secondary/40 bg-secondary text-secondary-foreground";
}

function formatMaintenanceStatus(status) {
  return status === "planning" ? "Terjadwal" : "Selesai";
}

function MaintenanceCard({
  item,
  onRowClick,
}) {
  return (
    <button
      type="button"
      className={cn(
        "w-full rounded-2xl border border-border/70 bg-card p-4 text-left transition",
        onRowClick && "hover:border-primary/40 hover:bg-muted/35",
      )}
      onClick={() => onRowClick?.(item)}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{item.nama_perangkat}</p>
          <p className="text-sm text-muted-foreground">{item.kode_aset}</p>
        </div>
        <span className="text-sm font-medium">{formatDate(item.tanggal_maintenance)}</span>
      </div>

      <div className="mt-4 grid gap-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Status</span>
          <Badge
            className={getMaintenanceStatusTone(getMaintenanceStatus(item))}
          >
            {formatMaintenanceStatus(getMaintenanceStatus(item))}
          </Badge>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Lokasi</span>
          <span className="text-right font-medium">
            {item.urutan_kunjungan ? `${item.urutan_kunjungan}. ` : ""}{item.lokasi || "-"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Kegiatan</span>
          <div className="flex justify-end">
            {item.jenis_kegiatan ? <Badge>{item.jenis_kegiatan}</Badge> : "-"}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Durasi</span>
          <span className="text-right font-medium">{formatMinutes(item.durasi)}</span>
        </div>
        <div className="grid gap-1">
          <span className="text-muted-foreground">Catatan</span>
          <p className="text-sm">{item.catatan || "-"}</p>
        </div>
      </div>

      {onRowClick ? <p className="mt-4 text-xs font-semibold text-primary">Buka rincian</p> : null}
    </button>
  );
}

export function MaintenanceTable({
  data = [],
  total = 0,
  page = 1,
  pageSize = 10,
  sortColumn,
  sortDirection,
  loading = false,
  onSort,
  onPageChange,
  onPageSizeChange,
  onCreate,
  onRowClick,
  onExport,
  onImport,
  canManage = false,
  onRequestLogin,
  importLoading = false,
  showManageActions = true,
  showExport = true,
  showImport = true,
  filterControls = null,
}) {
  const fileInputRef = useRef(null);

  return (
    <Card className="min-w-0 overflow-hidden border-border/70 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
      <CardHeader className="flex flex-col gap-4 border-b border-border/60 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle>Data Maintenance</CardTitle>
        </div>
        <div className="flex flex-wrap gap-3">
          {filterControls}
          {showExport ? (
            <Button variant="outline" onClick={onExport}>
              <FileSpreadsheet className="h-4 w-4" />
              Export Excel
            </Button>
          ) : null}
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
                onClick={() => {
                  if (!canManage) {
                    onRequestLogin?.();
                    return;
                  }

                  fileInputRef.current?.click();
                }}
              >
                <Upload className="h-4 w-4" />
                {importLoading ? "Import..." : "Import Excel"}
              </Button>
            </>
          ) : null}
          {showManageActions ? (
            <Button onClick={canManage ? onCreate : onRequestLogin}>
              <Plus className="h-4 w-4" />
              {canManage ? "Tambah Data" : "Login untuk CRUD"}
            </Button>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="min-w-0 p-0 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
        {loading && !data.length ? (
          <div className="p-6">
            <LoadingState label="Memuat data maintenance..." />
          </div>
        ) : data.length ? (
          <>
            <div className="grid gap-3 p-4 md:hidden">
              {data.map((item) => (
                <MaintenanceCard
                  key={item.id}
                  item={item}
                  onRowClick={onRowClick}
                />
              ))}
            </div>

            <div className="hidden min-w-0 flex-1 flex-col overflow-hidden md:flex md:min-h-0">
              <Table
                wrapperClassName="min-h-0 min-w-0 flex-1 border-b border-border/60"
                className="min-w-[960px]"
              >
                <TableHeader>
                  <TableRow>
                    {[
                      ["tanggal_maintenance", "Tanggal"],
                      ["kode_aset", "Kode Aset"],
                      ["nama_perangkat", "Perangkat"],
                      ["lokasi", "Lokasi"],
                      ["urutan_kunjungan", "Urutan"],
                      ["jenis_kegiatan", "Kegiatan"],
                      ["status", "Status"],
                      ["durasi", "Durasi"],
                    ].map(([column, label]) => (
                      <TableHead key={column} className="sticky top-0 z-10">
                        <button
                          type="button"
                          className="inline-flex items-center gap-2"
                          onClick={() => onSort(column)}
                        >
                          {label}
                          <SortIcon
                            active={sortColumn === column}
                            direction={sortDirection}
                          />
                        </button>
                      </TableHead>
                    ))}
                    <TableHead className="sticky top-0 z-10">Catatan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((item) => (
                    <TableRow
                      key={item.id}
                      className={cn(onRowClick && "cursor-pointer")}
                      onClick={() => onRowClick?.(item)}
                    >
                      <TableCell className="min-w-32 font-medium">
                        {formatDate(item.tanggal_maintenance)}
                      </TableCell>
                      <TableCell>{item.kode_aset}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-semibold">{item.nama_perangkat}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.tipe || "Tanpa tipe"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>{item.lokasi || "-"}</TableCell>
                      <TableCell>{item.urutan_kunjungan || "-"}</TableCell>
                      <TableCell>
                        {item.jenis_kegiatan ? (
                          <Badge>{item.jenis_kegiatan}</Badge>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={getMaintenanceStatusTone(
                            getMaintenanceStatus(item),
                          )}
                        >
                          {formatMaintenanceStatus(getMaintenanceStatus(item))}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatMinutes(item.durasi)}</TableCell>
                      <TableCell className="max-w-xs">
                        <p className="line-clamp-2 text-sm text-muted-foreground">
                          {item.catatan || "-"}
                        </p>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <TablePagination
              page={page}
              pageSize={pageSize}
              total={total}
              itemLabel="data"
              onPageChange={onPageChange}
              onPageSizeChange={onPageSizeChange}
            />
          </>
        ) : (
          <div className="p-6">
            <EmptyState />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
