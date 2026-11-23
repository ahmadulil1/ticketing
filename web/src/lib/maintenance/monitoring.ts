import api from "@/lib/api";
import { normalizeLocationInput } from "./location";
import { getOfficeType, matchesOfficeType } from "./office-type";

function normalizeDateValue(value: any) { return value ? String(value).slice(0,10) : null; }
function getLocationStatus(rows: any[]) { const total=rows.length; const done=rows.filter((r)=>r.status!=="planning").length; if(done===0) return "terjadwal"; if(done===total) return "selesai"; return "sebagian"; }
export function buildMonitoringSummary(rows: any[]) {
  const total = rows.length; const selesai = rows.filter((r)=>r.status!=="planning").length; const terjadwal = total-selesai;
  const locations = new Set(rows.map((r)=>normalizeLocationInput(r.lokasi)).filter(Boolean));
  const doneLocations = new Set(rows.filter((r)=>r.status!=="planning").map((r)=>normalizeLocationInput(r.lokasi)).filter(Boolean));
  const byOfficeType = ["kc","kcp","lainnya"].map((officeType)=>{ const scoped=rows.filter((r)=>getOfficeType(r.lokasi)===officeType); const sd=scoped.filter((r)=>r.status!=="planning").length; return { officeType, total: scoped.length, selesai: sd, terjadwal: scoped.length-sd }; });
  return { total, selesai, terjadwal, progress: total?Math.round((selesai/total)*100):0, totalLokasi: locations.size, lokasiSelesai: doneLocations.size, sisaLokasi: Math.max(locations.size-doneLocations.size,0), byOfficeType };
}
export function buildVisitTimeline(rows: any[]) {
  const dateMap = new Map<string, Map<string, any>>();
  [...rows].sort((l:any,r:any)=>{ const ld=normalizeDateValue(l.tanggal_maintenance)||""; const rd=normalizeDateValue(r.tanggal_maintenance)||""; if(ld!==rd) return rd.localeCompare(ld); const lo=l.urutan_kunjungan??9999; const ro=r.urutan_kunjungan??9999; if(lo!==ro) return lo-ro; return (l.lokasi||"").localeCompare(r.lokasi||""); }).forEach((row:any)=>{
    const date = normalizeDateValue(row.tanggal_maintenance) || "Tanpa tanggal";
    const locationKey = normalizeLocationInput(row.lokasi) || "Tanpa lokasi";
    if(!dateMap.has(date)) dateMap.set(date, new Map());
    const lm = dateMap.get(date)!;
    if(!lm.has(locationKey)) lm.set(locationKey, { date, lokasi: locationKey, officeType: getOfficeType(locationKey), urutan_kunjungan: row.urutan_kunjungan, rows: [] });
    lm.get(locationKey).rows.push(row);
  });
  return [...dateMap.entries()].map(([date,lm])=>({ date, locations: [...lm.values()].map((l:any)=>{ const done=l.rows.filter((r:any)=>r.status!=="planning").length; return { ...l, status: getLocationStatus(l.rows), total:l.rows.length, selesai: done, terjadwal: l.rows.length-done }; }) }));
}
export async function fetchMonitoringData(filters: any = {}) {
  const { data } = await api.get("/maintenance/monitoring", { params: { ...filters, lokasi: normalizeLocationInput(filters.lokasi) || undefined } });
  if (data?.rows && data?.summary && data?.timeline) return data;
  const rows = data || [];
  return { rows, summary: buildMonitoringSummary(rows), timeline: buildVisitTimeline(rows) };
}
