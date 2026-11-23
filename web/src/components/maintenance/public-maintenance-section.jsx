import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { MaintenanceFilters } from "@/components/maintenance/maintenance-filters";
import { MaintenanceTable } from "@/components/maintenance/maintenance-table";
import { DEFAULT_FILTERS } from "@/lib/constants";
import { exportMaintenanceToExcel } from "@/lib/export";
import {
  fetchAvailableYears,
  fetchFilterOptions,
  fetchMaintenanceForExport,
  fetchMaintenanceList,
} from "@/lib/maintenance";
import { isIgnorableSupabaseAbortError } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

export function PublicMaintenanceSection({ realtimeTick = 0 }) {
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
  const deferredSearch = useDeferredValue(filters.search);

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

  function handleSort(column) {
    if (sortColumn === column) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortColumn(column);
    setSortDirection("asc");
  }

  return (
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
      onExport={handleExport}
      showManageActions={false}
      showImport={false}
      showExport
      filterControls={(
        <MaintenanceFilters
          filters={filters}
          onChange={handleFilterChange}
          onReset={() => {
            setPage(1);
            setFilters(DEFAULT_FILTERS);
          }}
          lokasiOptions={options.lokasi}
          yearOptions={yearOptions}
          activityOptions={options.jenisKegiatan}
          showSearch
        />
      )}
    />
  );
}
