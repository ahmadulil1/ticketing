import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Boxes, CalendarClock, Clock3, ShieldCheck } from "lucide-react";
import { AssetFilters } from "@/components/assets/asset-filters";
import { AssetFormDialog } from "@/components/assets/asset-form-dialog";
import { AssetScheduleDialog } from "@/components/assets/asset-schedule-dialog";
import { AssetTable } from "@/components/assets/asset-table";
import { StatsCard } from "@/components/maintenance/stats-card";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/loading-state";
import { useRealtimeTick } from "@/hooks/use-realtime-tick";
import { DEFAULT_ASSET_FILTERS } from "@/lib/constants";
import {
  createAsset,
  createAssetMaintenanceSchedule,
  fetchAssetList,
  fetchAssetOptions,
  fetchAssetSummary,
  updateAsset,
  upsertAssetRows,
} from "@/lib/assets";
import { parseAssetWorkbook } from "@/lib/maintenance-import";
import { isIgnorableSupabaseAbortError } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

export function AssetsPage() {
  const navigate = useNavigate();
  const [assetFilters, setAssetFilters] = useState(DEFAULT_ASSET_FILTERS);
  const [assetOptions, setAssetOptions] = useState({
    lokasi: [],
    status: [],
    intervals: [],
  });
  const [assetRows, setAssetRows] = useState([]);
  const [assetTotal, setAssetTotal] = useState(0);
  const [assetPage, setAssetPage] = useState(1);
  const [assetPageSize, setAssetPageSize] = useState(10);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [assetDialogOpen, setAssetDialogOpen] = useState(false);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [assetSubmitting, setAssetSubmitting] = useState(false);
  const [scheduleSubmitting, setScheduleSubmitting] = useState(false);
  const [assetImporting, setAssetImporting] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const realtimeTick = useRealtimeTick("assets-admin-live", ["assets", "maintenance"]);

  useEffect(() => {
    async function loadAssetOptionsAndSummary() {
      try {
        const [options, assetSummary] = await Promise.all([
          fetchAssetOptions(),
          fetchAssetSummary(assetFilters),
        ]);
        setAssetOptions(options);
        setSummary(assetSummary);
      } catch (error) {
        if (isIgnorableSupabaseAbortError(error)) {
          return;
        }

        toast({
          title: "Gagal memuat aset",
          description: error.message,
          variant: "destructive",
        });
      }
    }

    loadAssetOptionsAndSummary();
  }, [assetFilters, realtimeTick]);

  useEffect(() => {
    async function loadAssets() {
      try {
        setLoading(true);
        const result = await fetchAssetList({
          filters: assetFilters,
          page: assetPage,
          pageSize: assetPageSize,
        });
        setAssetRows(result.data);
        setAssetTotal(result.count);
      } catch (error) {
        if (isIgnorableSupabaseAbortError(error)) {
          return;
        }

        toast({
          title: "Gagal memuat daftar aset",
          description: error.message,
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    }

    loadAssets();
  }, [assetFilters, assetPage, assetPageSize, realtimeTick]);

  async function handleAssetSubmit(payload) {
    try {
      setAssetSubmitting(true);
      if (selectedAsset?.id) {
        await updateAsset(selectedAsset.id, payload);
        toast({
          title: "Aset diperbarui",
          description: "Perubahan aset berhasil disimpan.",
        });
      } else {
        await createAsset(payload);
        toast({
          title: "Aset ditambahkan",
          description: "Aset baru berhasil masuk ke master data.",
        });
      }

      setAssetDialogOpen(false);
      setSelectedAsset(null);
    } catch (error) {
      toast({
        title: "Gagal menyimpan aset",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setAssetSubmitting(false);
    }
  }

  async function refreshAssets() {
    const [options, assetSummary, result] = await Promise.all([
      fetchAssetOptions(),
      fetchAssetSummary(assetFilters),
      fetchAssetList({
        filters: assetFilters,
        page: assetPage,
        pageSize: assetPageSize,
      }),
    ]);

    setAssetOptions(options);
    setSummary(assetSummary);
    setAssetRows(result.data);
    setAssetTotal(result.count);
  }

  async function handleAssetImport(file) {
    try {
      setAssetImporting(true);
      const parsed = await parseAssetWorkbook(file);

      if (!parsed.assetRows.length) {
        throw new Error("Tidak ada aset valid yang bisa diimport.");
      }

      const importedCount = await upsertAssetRows(parsed.assetRows);
      await refreshAssets();

      toast({
        title: "Import aset selesai",
        description:
          parsed.errors.length > 0
            ? `${importedCount} aset diproses, ${parsed.errors.length} baris dilewati.`
            : `${importedCount} aset berhasil diinsert/update.`,
      });

      if (parsed.errors.length) {
        toast({
          title: "Sebagian baris aset dilewati",
          description: parsed.errors.slice(0, 3).join(" | "),
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Import aset gagal",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setAssetImporting(false);
    }
  }

  async function handleCreateSchedule(payload) {
    try {
      setScheduleSubmitting(true);
      const result = await createAssetMaintenanceSchedule(payload);
      await refreshAssets();
      setScheduleDialogOpen(false);

      toast({
        title: "Jadwal dibuat",
        description: `${result.planned} item terjadwal dibuat/update. ${result.skippedCompleted} item selesai dilewati.`,
      });

      if (result.skippedInvalid) {
        toast({
          title: "Sebagian aset dilewati",
          description: `${result.skippedInvalid} aset tidak punya data minimal untuk dibuat jadwal.`,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Gagal membuat jadwal",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setScheduleSubmitting(false);
    }
  }

  function handleAssetFilterChange(field, value) {
    setAssetPage(1);
    setAssetFilters((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function applyAssetQuickFilter(nextFilters) {
    setAssetPage(1);
    setAssetFilters((current) => ({ ...current, ...nextFilters }));
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-5">
        <StatsCard
          label="Total aset"
          value={summary?.total_assets || 0}
          hint={`${summary?.missing_history_assets || 0} tanpa histori`}
          icon={Boxes}
          tone="secondary"
        />
        <StatsCard
          label="Aset aktif"
          value={summary?.active_assets || 0}
          icon={ShieldCheck}
        />
        <StatsCard
          label="Lewat maintenance"
          value={summary?.overdue_assets || 0}
          hint={`${summary?.due_assets || 0} butuh tindakan`}
          icon={AlertTriangle}
          tone="accent"
        />
        <StatsCard
          label="Mendekati"
          value={summary?.upcoming_assets || 0}
          hint="<= 3 bulan"
          icon={Clock3}
        />
        <StatsCard
          label="Sudah terjadwal"
          value={summary?.scheduled_assets || 0}
          hint="dari data estimasi"
          icon={CalendarClock}
        />
      </div>

      <div className="flex flex-wrap gap-2 rounded-3xl border border-border/70 bg-card p-4">
        <Button variant="outline" onClick={() => applyAssetQuickFilter({ priority: "lewat" })}>
          Lewat
        </Button>
        <Button variant="outline" onClick={() => applyAssetQuickFilter({ priority: "mendekati" })}>
          Mendekati
        </Button>
        <Button variant="outline" onClick={() => applyAssetQuickFilter({ priority: "belum-ada-histori" })}>
          Belum ada histori
        </Button>
        <Button variant="outline" onClick={() => applyAssetQuickFilter({ status: "aktif" })}>
          Aset aktif
        </Button>
        <Button variant="ghost" onClick={() => applyAssetQuickFilter(DEFAULT_ASSET_FILTERS)}>
          Reset
        </Button>
      </div>

      {loading && !assetRows.length ? (
        <LoadingState label="Memuat master aset..." />
      ) : (
        <AssetTable
          title="Master Aset"
          data={assetRows}
          total={assetTotal}
          page={assetPage}
          pageSize={assetPageSize}
          onPageChange={setAssetPage}
          onPageSizeChange={(value) => {
            setAssetPageSize(value);
            setAssetPage(1);
          }}
          filterControls={(
            <AssetFilters
              filters={assetFilters}
              onChange={handleAssetFilterChange}
              onReset={() => {
                setAssetPage(1);
                setAssetFilters(DEFAULT_ASSET_FILTERS);
              }}
              lokasiOptions={assetOptions.lokasi}
              statusOptions={assetOptions.status}
              intervalOptions={assetOptions.intervals}
            />
          )}
          showCreate
          showImport
          showSchedule
          importLoading={assetImporting}
          onImport={handleAssetImport}
          onSchedule={() => setScheduleDialogOpen(true)}
          onCreate={() => {
            setSelectedAsset(null);
            setAssetDialogOpen(true);
          }}
          onRowClick={(asset) => navigate(`/assets/${asset.id}`)}
        />
      )}

      <AssetFormDialog
        open={assetDialogOpen}
        onOpenChange={setAssetDialogOpen}
        initialValues={selectedAsset}
        lokasiOptions={assetOptions.lokasi}
        onSubmit={handleAssetSubmit}
        loading={assetSubmitting}
      />

      <AssetScheduleDialog
        open={scheduleDialogOpen}
        onOpenChange={setScheduleDialogOpen}
        lokasiOptions={assetOptions.lokasi}
        onSubmit={handleCreateSchedule}
        loading={scheduleSubmitting}
      />

    </div>
  );
}
