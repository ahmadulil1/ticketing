import api from "@/lib/api";
export async function fetchWorkDay(date) { const { data } = await api.get("/maintenance/work", { params: { tanggal: date } }); return data || []; }
export async function completeWorkItem(id, payload) { await api.post(`/maintenance/${id}/complete`, payload); }
