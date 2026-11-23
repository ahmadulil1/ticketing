import { MAINTENANCE_SCHEMA, supabase } from "@/lib/supabaseClient";
import { getOfficeType, matchesOfficeType } from "@/lib/office-type";
import { normalizeLocationInput } from "@/lib/location";

const monitoringDb = supabase.schema(MAINTENANCE_SCHEMA);

function normalizeDateValue(value) {
  if (!value) {
    return null;
  }

  return String(value).slice(0, 10);
}

function getLocationStatus(rows) {
  const total = rows.length;
  const done = rows.filter((row) => row.status !== "planning").length;

  if (done === 0) {
    return "terjadwal";
  }

  if (done === total) {
    return "selesai";
  }

  return "sebagian";
}

function applyClientFilters(rows, filters = {}) {
  return rows.filter((row) => {
    const rowDate = normalizeDateValue(row.tanggal_maintenance);
    const rowStatus = row.status === "planning" ? "planning" : "selesai";

    if (filters.status && rowStatus !== filters.status) {
      return false;
    }

    if (filters.officeType && !matchesOfficeType(row.lokasi, filters.officeType)) {
      return false;
    }

    if (
      filters.lokasi &&
      normalizeLocationInput(row.lokasi) !== normalizeLocationInput(filters.lokasi)
    ) {
      return false;
    }

    if (filters.tanggalMulai && rowDate < filters.tanggalMulai) {
      return false;
    }

    if (filters.tanggalSelesai && rowDate > filters.tanggalSelesai) {
      return false;
    }

    return true;
  });
}

function sortForTimeline(left, right) {
  const leftDate = normalizeDateValue(left.tanggal_maintenance) || "";
  const rightDate = normalizeDateValue(right.tanggal_maintenance) || "";

  if (leftDate !== rightDate) {
    return rightDate.localeCompare(leftDate);
  }

  const leftOrder = left.urutan_kunjungan ?? 9999;
  const rightOrder = right.urutan_kunjungan ?? 9999;

  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }

  return (left.lokasi || "").localeCompare(right.lokasi || "");
}

export function buildMonitoringSummary(rows) {
  const total = rows.length;
  const selesai = rows.filter((row) => row.status !== "planning").length;
  const terjadwal = total - selesai;
  const locations = new Set(rows.map((row) => normalizeLocationInput(row.lokasi)).filter(Boolean));
  const doneLocations = new Set(
    rows
      .filter((row) => row.status !== "planning")
      .map((row) => normalizeLocationInput(row.lokasi))
      .filter(Boolean),
  );

  const byOfficeType = ["kc", "kcp", "lainnya"].map((officeType) => {
    const scoped = rows.filter((row) => getOfficeType(row.lokasi) === officeType);
    const scopedDone = scoped.filter((row) => row.status !== "planning").length;

    return {
      officeType,
      total: scoped.length,
      selesai: scopedDone,
      terjadwal: scoped.length - scopedDone,
    };
  });

  return {
    total,
    selesai,
    terjadwal,
    progress: total ? Math.round((selesai / total) * 100) : 0,
    totalLokasi: locations.size,
    lokasiSelesai: doneLocations.size,
    sisaLokasi: Math.max(locations.size - doneLocations.size, 0),
    byOfficeType,
  };
}

export function buildVisitTimeline(rows) {
  const dateMap = new Map();

  [...rows].sort(sortForTimeline).forEach((row) => {
    const date = normalizeDateValue(row.tanggal_maintenance) || "Tanpa tanggal";
    const locationKey = normalizeLocationInput(row.lokasi) || "Tanpa lokasi";

    if (!dateMap.has(date)) {
      dateMap.set(date, new Map());
    }

    const locationMap = dateMap.get(date);
    if (!locationMap.has(locationKey)) {
      locationMap.set(locationKey, {
        date,
        lokasi: locationKey,
        officeType: getOfficeType(locationKey),
        urutan_kunjungan: row.urutan_kunjungan,
        rows: [],
      });
    }

    locationMap.get(locationKey).rows.push(row);
  });

  return [...dateMap.entries()].map(([date, locationMap]) => ({
    date,
    locations: [...locationMap.values()].map((location) => ({
      ...location,
      status: getLocationStatus(location.rows),
      total: location.rows.length,
      selesai: location.rows.filter((row) => row.status !== "planning").length,
      terjadwal: location.rows.filter((row) => row.status === "planning").length,
    })),
  }));
}

export async function fetchMonitoringData(filters = {}) {
  let query = monitoringDb
    .from("maintenance")
    .select("*")
    .order("tanggal_maintenance", { ascending: false })
    .order("urutan_kunjungan", { ascending: true, nullsFirst: false })
    .order("lokasi", { ascending: true })
    .limit(2000);

  if (filters.tanggalMulai) {
    query = query.gte("tanggal_maintenance", filters.tanggalMulai);
  }

  if (filters.tanggalSelesai) {
    query = query.lte("tanggal_maintenance", filters.tanggalSelesai);
  }

  if (filters.lokasi) {
    query = query.ilike("lokasi", normalizeLocationInput(filters.lokasi));
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  const rows = applyClientFilters(data || [], filters);

  return {
    rows,
    summary: buildMonitoringSummary(rows),
    timeline: buildVisitTimeline(rows),
  };
}
