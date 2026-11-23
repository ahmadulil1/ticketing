import api from "@/lib/api";
import { resolveAssetCode } from "@/lib/asset-code";
import { normalizeLocationInput } from "@/lib/location";
function getAssetRpcFilters(filters = {}) { return { lokasi: normalizeLocationInput(filters.lokasi) || undefined, status: filters.status || undefined, search: filters.search?.trim?.() || undefined, maintenanceIntervalMonths: filters.maintenanceIntervalMonths || undefined, priority: filters.priority || undefined }; }
export async function fetchAssetList({ filters = {}, page = 1, pageSize = 10 }) { const { data } = await api.get("/assets/list", { params: { ...getAssetRpcFilters(filters), page, pageSize } }); return data || { data: [], count: 0 }; }
export async function fetchAssetOptions() { const { data } = await api.get("/assets/options"); return data || { lokasi: [], status: [], intervals: [] }; }
export async function fetchAssetSummary(filters = {}) { const { data } = await api.get("/assets/summary", { params: getAssetRpcFilters(filters) }); return data || {}; }
export async function fetchAssetHistory(kodeAset) { if (!kodeAset) return []; const { data } = await api.get(`/assets/history/${encodeURIComponent(kodeAset)}`); return data || []; }
export async function fetchAssetDetail(id) { const { data } = await api.get(`/assets/${id}`); return data; }
export async function createAsset(payload) { await api.post("/assets", payload); }
export async function updateAsset(id, payload) { await api.patch(`/assets/${id}`, payload); }
export async function upsertAssetRows(rows) { const { data } = await api.post("/assets/upsert", { rows }); return data?.count || 0; }
export async function createAssetMaintenanceSchedule(payload) { const { data } = await api.post("/assets/schedule", payload); return data; }
export async function deleteAsset(id) { await api.delete(`/assets/${id}`); }
