import api from "@/lib/api";
export async function fetchWorkDay(date: string) {
  const { data } = await api.get("/maintenance/work", { params: { tanggal: date } });
  return data || [];
}
export async function completeWorkItem(id: any, payload: any) {
  await api.post(`/maintenance/${id}/complete`, payload);
}
