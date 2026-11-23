import { MAINTENANCE_SCHEMA, supabase } from "@/lib/supabaseClient";
import { buildVisitTimeline } from "@/lib/monitoring";

const workDb = supabase.schema(MAINTENANCE_SCHEMA);

export async function fetchWorkDay(date) {
  const { data, error } = await workDb
    .from("maintenance")
    .select("*")
    .eq("tanggal_maintenance", date)
    .order("urutan_kunjungan", { ascending: true, nullsFirst: false })
    .order("lokasi", { ascending: true })
    .order("kode_aset", { ascending: true });

  if (error) {
    throw error;
  }

  return buildVisitTimeline(data || [])[0]?.locations || [];
}

export async function completeWorkItem(id, payload) {
  const { error } = await workDb
    .from("maintenance")
    .update({
      catatan: payload.catatan?.trim() || null,
      durasi: payload.durasi ? Number(payload.durasi) : null,
      status: "selesai",
    })
    .eq("id", id);

  if (error) {
    throw error;
  }
}
