import api from "@/lib/api";
import { normalizeLocationInput } from "@/lib/location";
export async function fetchFilterOptions() { const { data } = await api.get("/maintenance/filter-options"); return data || { lokasi: [], jenisKegiatan: [] }; }
export async function fetchPublicFilterOptions() { const { data } = await api.get("/maintenance/public/filter-options"); return data || { lokasi: [], jenisKegiatan: [] }; }
export async function fetchAvailableYears(lokasi) { if (!lokasi) return []; const { data } = await api.get("/maintenance/years", { params: { lokasi: normalizeLocationInput(lokasi) } }); return data || []; }
export async function fetchDashboardSummary(filters) { const { data } = await api.get("/maintenance/dashboard", { params: { ...filters, lokasi: normalizeLocationInput(filters?.lokasi) || undefined } }); return data; }
export async function fetchMaintenanceList({ filters, page, pageSize, sortColumn, sortDirection }) { const { data } = await api.get("/maintenance/list", { params: { ...filters, lokasi: normalizeLocationInput(filters?.lokasi) || undefined, page, pageSize, sortColumn, sortDirection } }); return data || { data: [], count: 0 }; }
export async function fetchMaintenanceForExport(filters) { const { data } = await api.get("/maintenance/export", { params: { ...filters, lokasi: normalizeLocationInput(filters?.lokasi) || undefined } }); return data || []; }
export async function createMaintenance(payload) { await api.post("/maintenance", payload); }
export async function upsertMaintenanceRows(rows, assetRows = []) { await api.post("/maintenance/upsert", { rows, assets: assetRows }); }
export async function updateMaintenance(id, payload) { await api.patch(`/maintenance/${id}`, payload); }
export async function deleteMaintenance(id) { await api.delete(`/maintenance/${id}`); }
