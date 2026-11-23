import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { useAuth } from "@/components/auth/auth-provider";
import { DeleteConfirmDialog } from "@/components/maintenance/delete-confirm-dialog";
import { MaintenanceDetailDialog } from "@/components/maintenance/maintenance-detail-dialog";
import { MaintenanceFilters } from "@/components/maintenance/maintenance-filters";
import { MaintenanceFormDialog } from "@/components/maintenance/maintenance-form-dialog";
import { MaintenanceTable } from "@/components/maintenance/maintenance-table";
import { QuickCompleteDialog } from "@/components/maintenance/quick-complete-dialog";
import { Button } from "@/components/ui/button";
import { useRealtimeTick } from "@/hooks/use-realtime-tick";
import { toast } from "@/hooks/use-toast";
import { DEFAULT_FILTERS } from "@/lib/constants";
import { exportMaintenanceToExcel } from "@/lib/export";
import {
  createMaintenance,
  deleteMaintenance,
  fetchAvailableYears,
  fetchFilterOptions,
  fetchMaintenanceForExport,
  fetchMaintenanceList,
  upsertMaintenanceRows,
  updateMaintenance,
} from "@/lib/maintenance";
import { parseMaintenanceWorkbook } from "@/lib/maintenance-import";
import { isIgnorableSupabaseAbortError } from "@/lib/utils";
import { completeWorkItem } from "@/lib/work";

export function MaintenancePage() {
  const { isAuthenticated } = useAuth();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [options, setOptions] = useState({ lokasi: [], jenisKegiatan: [] });
  const [yearOptions, setYearOptions] = useState([]);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortColumn, setSortColumn] = useState("tanggal_maintenance");
  const [sortDirection, setSortDirection] = useState("desc");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState(null);
  const [detailRow, setDetailRow] = useState(null);
  const [quickCompleteRow, setQuickCompleteRow] = useState(null);
  const [quickCompleteLoading, setQuickCompleteLoading] = useState(false);
  const deferredSearch = useDeferredValue(filters.search);
  const realtimeTick = useRealtimeTick("maintenance-live-page", ["maintenance"]);

  const effectiveFilters = useMemo(
    () => ({
      ...filters,
      search: deferredSearch,
    }),
    [deferredSearch, filters],
  );

  useEffect(() => {
    async function loadFilterOptions() {
      try {
        const filterOptions = await fetchFilterOptions();
        setOptions(filterOptions);
      } catch (error) {
        if (isIgnorableSupabaseAbortError(error)) {
          return;
        }

        toast({
          title: "Gagal memuat filter",
          description: error.message,
          variant: "destructive",
        });
      }
    }

    loadFilterOptions();
  }, [realtimeTick]);

  useEffect(() => {
    async function loadYears() {
      if (!filters.lokasi) {
        setYearOptions([]);
        return;
      }

      try {
        const years = await fetchAvailableYears(filters.lokasi);
        setYearOptions(years);
      } catch (error) {
        if (isIgnorableSupabaseAbortError(error)) {
          return;
        }

        toast({
          title: "Gagal memuat opsi tahun",
          description: error.message,
          variant: "destructive",
        });
      }
    }

    loadYears();
  }, [filters.lokasi, realtimeTick]);

  useEffect(() => {
    async function loadTable() {
      try {
        setLoading(true);
        const result = await fetchMaintenanceList({
          filters: effectiveFilters,
          page,
          pageSize,
          sortColumn,
          sortDirection,
        });
        setRows(result.data);
        setTotal(result.count);
      } catch (error) {
        if (isIgnorableSupabaseAbortError(error)) {
          return;
        }

        toast({
          title: "Gagal memuat data maintenance",
          description: error.message,
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    }

    loadTable();
  }, [effectiveFilters, page, pageSize, sortColumn, sortDirection, realtimeTick]);

  function handleFilterChange(field, value) {
    setPage(1);
    setFilters((current) => {
      const next = { ...current, [field]: value };

      if (field === "lokasi") {
        next.tahun = "";
      }

      if (field === "tahun") {
        if (!value) {
          next.tanggalMulai = "";
          next.tanggalSelesai = "";
        } else {
          next.tanggalMulai = `${value}-01-01`;
          next.tanggalSelesai = `${value}-12-31`;
        }
      }

      if (field === "tanggalMulai" || field === "tanggalSelesai") {
        next.tahun = "";
      }

      return next;
    });
  }

  function handleResetFilters() {
    setPage(1);
    setFilters(DEFAULT_FILTERS);
  }

  function applyQuickFilter(nextFilters) {
    setPage(1);
    setFilters((current) => ({
      ...current,
      ...nextFilters,
      tahun: nextFilters.tanggalMulai || nextFilters.tanggalSelesai ? "" : current.tahun,
    }));
  }

  function handleSort(column) {
    if (sortColumn === column) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortColumn(column);
    setSortDirection("asc");
  }

  async function refreshTable() {
    const result = await fetchMaintenanceList({
      filters: effectiveFilters,
      page,
      pageSize,
      sortColumn,
      sortDirection,
    });
    setRows(result.data);
    setTotal(result.count);
  }

  async function handleSubmit(payload) {
    try {
      setSubmitting(true);
      if (selectedRow?.id) {
        await updateMaintenance(selectedRow.id, payload);
        toast({
          title: "Data diperbarui",
          description: "Perubahan maintenance berhasil disimpan.",
        });
      } else {
        await createMaintenance(payload);
        toast({
          title: "Data ditambahkan",
          description: "Data maintenance baru berhasil dibuat.",
        });
      }

      setDialogOpen(false);
      setSelectedRow(null);
      setDetailRow(null);
      await refreshTable();
    } catch (error) {
      toast({
        title: "Gagal menyimpan data",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!selectedRow?.id) {
      return;
    }

    try {
      setDeleteLoading(true);
      await deleteMaintenance(selectedRow.id);
      toast({
        title: "Data dihapus",
        description: "Data maintenance telah dihapus dari sistem.",
      });
      setDeleteOpen(false);
      setSelectedRow(null);
      setDetailRow(null);
      await refreshTable();
    } catch (error) {
      toast({
        title: "Gagal menghapus data",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDeleteLoading(false);
    }
  }

  async function handleQuickComplete(payload) {
    if (!quickCompleteRow?.id) {
      return;
    }

    try {
      setQuickCompleteLoading(true);
      await completeWorkItem(quickCompleteRow.id, payload);
      toast({
        title: "Pekerjaan selesai",
        description: "Catatan disimpan dan status diubah menjadi selesai.",
      });
      setQuickCompleteRow(null);
      setDetailRow(null);
      await refreshTable();
    } catch (error) {
      toast({
        title: "Gagal menyelesaikan pekerjaan",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setQuickCompleteLoading(false);
    }
  }

  async function handleExport() {
    try {
      const exportRows = await fetchMaintenanceForExport(effectiveFilters);
      exportMaintenanceToExcel(exportRows);
      toast({
        title: "Export selesai",
        description: `${exportRows.length} data berhasil diexport ke Excel.`,
      });
    } catch (error) {
      toast({
        title: "Gagal export data",
        description: error.message,
        variant: "destructive",
      });
    }
  }

  async function handleImport(file) {
    try {
      setImportLoading(true);
      const parsed = await parseMaintenanceWorkbook(file);
      const assetRowCount = parsed.assetRows?.length || 0;

      if (!parsed.rows.length && !assetRowCount) {
        throw new Error("Tidak ada baris valid yang bisa diimport.");
      }

      await upsertMaintenanceRows(parsed.rows, parsed.assetRows);

      const filterOptions = await fetchFilterOptions();
      setOptions(filterOptions);
      await refreshTable();

      toast({
        title: "Import selesai",
        description:
          parsed.errors.length > 0
            ? `${parsed.rows.length} maintenance dan ${assetRowCount} aset diproses (${parsed.planningRows} planning), ${parsed.errors.length} baris dilewati.`
            : `${parsed.rows.length} maintenance dan ${assetRowCount} aset berhasil diinsert/update (${parsed.planningRows} terjadwal).`,
      });

      if (parsed.errors.length) {
        toast({
          title: "Sebagian baris dilewati",
          description: parsed.errors.slice(0, 3).join(" | "),
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Import gagal",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setImportLoading(false);
    }
  }

  return (
    <div className="space-y-6 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-hidden lg:space-y-4">
      <div className="flex flex-wrap gap-2 rounded-3xl border border-border/70 bg-card p-4">
        <Button
          variant="outline"
          onClick={() => applyQuickFilter({ status: "planning" })}
        >
          Terjadwal
        </Button>
        <Button
          variant="outline"
          onClick={() => applyQuickFilter({ status: "selesai" })}
        >
          Selesai
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            const today = format(new Date(), "yyyy-MM-dd");
            applyQuickFilter({ tanggalMulai: today, tanggalSelesai: today });
          }}
        >
          Hari ini
        </Button>
        <Button
          variant="outline"
          onClick={() => applyQuickFilter({ officeType: "kc" })}
        >
          Kantor Cabang
        </Button>
        <Button
          variant="outline"
          onClick={() => applyQuickFilter({ officeType: "kcp" })}
        >
          KCP
        </Button>
        <Button variant="ghost" onClick={handleResetFilters}>
          Reset
        </Button>
      </div>

      <MaintenanceTable
        data={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        sortColumn={sortColumn}
        sortDirection={sortDirection}
        loading={loading}
        onSort={handleSort}
        onPageChange={setPage}
        onPageSizeChange={(value) => {
          setPageSize(value);
          setPage(1);
        }}
        onCreate={() => {
          setSelectedRow(null);
          setDialogOpen(true);
        }}
        onRowClick={(row) => setDetailRow(row)}
        onExport={handleExport}
        onImport={handleImport}
        canManage={isAuthenticated}
        onRequestLogin={() =>
          toast({
            title: "Login diperlukan",
            description: "Silakan login Supabase untuk membuka akses CRUD.",
          })
        }
        importLoading={importLoading}
        showManageActions
        showExport
        showImport
        filterControls={(
          <MaintenanceFilters
            filters={filters}
            onChange={handleFilterChange}
            onReset={handleResetFilters}
            lokasiOptions={options.lokasi}
            yearOptions={yearOptions}
            activityOptions={options.jenisKegiatan}
            showSearch
          />
        )}
      />

      <MaintenanceFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initialValues={selectedRow}
        lokasiOptions={options.lokasi}
        onSubmit={handleSubmit}
        loading={submitting}
      />

      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        item={selectedRow}
        loading={deleteLoading}
        onConfirm={handleDelete}
      />

      <MaintenanceDetailDialog
        open={Boolean(detailRow)}
        onOpenChange={(open) => !open && setDetailRow(null)}
        item={detailRow}
        canManage={isAuthenticated}
        onEdit={(row) => {
          setSelectedRow(row);
          setDialogOpen(true);
        }}
        onDelete={(row) => {
          setSelectedRow(row);
          setDeleteOpen(true);
        }}
        onComplete={(row) => setQuickCompleteRow(row)}
      />

      <QuickCompleteDialog
        item={quickCompleteRow}
        open={Boolean(quickCompleteRow)}
        onOpenChange={(open) => !open && setQuickCompleteRow(null)}
        onSubmit={handleQuickComplete}
        loading={quickCompleteLoading}
      />
    </div>
  );
}
