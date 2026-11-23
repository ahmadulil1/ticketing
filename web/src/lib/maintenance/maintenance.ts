import api from "@/lib/api";
import { normalizeLocationInput } from "./location";

export async function fetchFilterOptions() {
  const { data } = await api.get("/maintenance/filter-options");
  return data || { lokasi: [], jenisKegiatan: [] };
}
export async function fetchPublicFilterOptions() {
  const { data } = await api.get("/maintenance/public/filter-options");
  return data || { lokasi: [], jenisKegiatan: [] };
}
export async function fetchAvailableYears(lokasi: string) {
  if (!lokasi) return [];
  const { data } = await api.get("/maintenance/years", { params: { lokasi: normalizeLocationInput(lokasi) } });
  return data || [];
}
export async function fetchDashboardSummary(filters: any) {
  const { data } = await api.get("/maintenance/dashboard", { params: { ...filters, lokasi: normalizeLocationInput(filters.lokasi) || undefined } });
  return data;
}
export async function fetchMaintenanceList({ filters, page, pageSize, sortColumn, sortDirection }: any) {
  const { data } = await api.get("/maintenance/list", { params: { ...filters, lokasi: normalizeLocationInput(filters?.lokasi) || undefined, page, pageSize, sortColumn, sortDirection } });
  return data || { data: [], count: 0 };
}
export async function fetchMaintenanceForExport(filters: any) {
  const { data } = await api.get("/maintenance/export", { params: { ...filters, lokasi: normalizeLocationInput(filters?.lokasi) || undefined } });
  return data || [];
}
export async function createMaintenance(payload: any) { await api.post("/maintenance", payload); }
export async function upsertMaintenanceRows(rows: any[], assetRows: any[] = []) { await api.post("/maintenance/upsert", { rows, assets: assetRows }); }
export async function updateMaintenance(id: any, payload: any) { await api.patch(`/maintenance/${id}`, payload); }
export async function deleteMaintenance(id: any) { await api.delete(`/maintenance/${id}`); }
