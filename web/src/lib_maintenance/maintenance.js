import { MAINTENANCE_SCHEMA, supabase } from "@/lib/supabaseClient";
import { resolveAssetCode } from "@/lib/asset-code";
import { normalizeLocationInput, normalizeLocationOptions } from "@/lib/location";

const maintenanceDb = supabase.schema(MAINTENANCE_SCHEMA);

function pickPreferredText(nextValue, fallbackValue) {
  if (typeof nextValue === "string" && nextValue.trim()) {
    return nextValue.trim();
  }

  if (typeof fallbackValue === "string" && fallbackValue.trim()) {
    return fallbackValue.trim();
  }

  return null;
}

function buildAssetPayload(record) {
  if (!record?.kode_aset || !record?.nama_perangkat) {
    return null;
  }

  return {
    kode_aset: resolveAssetCode({
      kodeAset: record.kode_aset,
      namaPerangkat: record.nama_perangkat,
      lokasi: record.lokasi,
      tipe: record.tipe,
    }),
    nama_perangkat: record.nama_perangkat.trim(),
    tipe: record.tipe?.trim() || null,
    lokasi: normalizeLocationInput(record.lokasi),
  };
}

function normalizeMaintenancePayload(payload) {
  return {
    ...payload,
    kode_aset: resolveAssetCode({
      kodeAset: payload.kode_aset,
      namaPerangkat: payload.nama_perangkat,
      lokasi: payload.lokasi,
      tipe: payload.tipe,
    }),
    nama_perangkat: payload.nama_perangkat?.trim() || "",
    tipe: payload.tipe?.trim() || null,
    lokasi: normalizeLocationInput(payload.lokasi),
    jenis_kegiatan: payload.jenis_kegiatan || "Maintenance",
    durasi: payload.durasi ?? null,
    status: payload.status || "selesai",
    catatan: payload.catatan?.trim() || null,
  };
}

function normalizeMaintenanceRows(rows) {
  return rows.map((row) => normalizeMaintenancePayload(row));
}

function getMaintenanceConflictKey(row) {
  return [
    row.tanggal_maintenance || "",
    row.kode_aset || "",
    row.jenis_kegiatan || "",
  ].join("|");
}

function deduplicateMaintenanceRows(rows) {
  return [
    ...rows
      .reduce((lookup, row) => {
        lookup.set(getMaintenanceConflictKey(row), row);
        return lookup;
      }, new Map())
      .values(),
  ];
}

async function fetchExistingMaintenanceRows(rows) {
  const dates = [...new Set(rows.map((row) => row.tanggal_maintenance).filter(Boolean))];
  const assetCodes = [...new Set(rows.map((row) => row.kode_aset).filter(Boolean))];

  if (!dates.length || !assetCodes.length) {
    return [];
  }

  const { data, error } = await maintenanceDb
    .from("maintenance")
    .select("tanggal_maintenance,kode_aset,jenis_kegiatan,status,catatan,durasi")
    .in("tanggal_maintenance", dates)
    .in("kode_aset", assetCodes);

  if (error) {
    throw error;
  }

  const importKeys = new Set(rows.map(getMaintenanceConflictKey));

  return (data || []).filter((row) => importKeys.has(getMaintenanceConflictKey(row)));
}

function mergeImportWithExistingRows(importRows, existingRows) {
  const existingLookup = existingRows.reduce((lookup, row) => {
    lookup.set(getMaintenanceConflictKey(row), row);
    return lookup;
  }, new Map());

  return importRows.map((row) => {
    const existing = existingLookup.get(getMaintenanceConflictKey(row));

    if (!existing) {
      return row;
    }

    if (existing.status !== "planning" && row.status === "planning") {
      return {
        ...row,
        status: existing.status,
        catatan: pickPreferredText(existing.catatan, row.catatan),
        durasi: existing.durasi ?? row.durasi,
      };
    }

    if (existing.catatan && !row.catatan) {
      return {
        ...row,
        catatan: existing.catatan,
      };
    }

    return row;
  });
}

function normalizeSearchFilter(value) {
  return String(value || "")
    .trim()
    .replaceAll(/[,%()]/g, " ")
    .replaceAll(/\s+/g, " ");
}

async function fetchExistingAssetsByCodes(assetCodes) {
  if (!assetCodes.length) {
    return [];
  }

  const { data, error } = await maintenanceDb
    .from("assets")
    .select("kode_aset,nama_perangkat,tipe,lokasi,status,maintenance_interval_months")
    .in("kode_aset", assetCodes);

  if (error) {
    throw error;
  }

  return data || [];
}

async function syncAssetCatalog(records) {
  const payload = records
    .map(buildAssetPayload)
    .filter(Boolean)
    .reduce((collection, item) => {
      const current = collection.get(item.kode_aset);

      collection.set(item.kode_aset, {
        kode_aset: item.kode_aset,
        nama_perangkat: pickPreferredText(item.nama_perangkat, current?.nama_perangkat),
        tipe: pickPreferredText(item.tipe, current?.tipe),
        lokasi: pickPreferredText(item.lokasi, current?.lokasi),
      });

      return collection;
    }, new Map());

  if (!payload.size) {
    return;
  }

  const existingAssets = await fetchExistingAssetsByCodes([...payload.keys()]);
  const existingLookup = existingAssets.reduce((lookup, item) => {
    lookup.set(item.kode_aset, item);
    return lookup;
  }, new Map());

  const mergedPayload = [...payload.values()].map((item) => {
    const existing = existingLookup.get(item.kode_aset);

    return {
      kode_aset: item.kode_aset,
      nama_perangkat: pickPreferredText(item.nama_perangkat, existing?.nama_perangkat),
      tipe: pickPreferredText(item.tipe, existing?.tipe),
      lokasi: pickPreferredText(item.lokasi, existing?.lokasi),
      status: existing?.status || "aktif",
      maintenance_interval_months: Number(existing?.maintenance_interval_months || 12),
    };
  });

  const { error } = await maintenanceDb
    .from("assets")
    .upsert(mergedPayload, { onConflict: "kode_aset" });

  if (error) {
    throw error;
  }
}

function applyMaintenanceFilters(query, filters) {
  let nextQuery = query;

  if (filters.lokasi) {
    nextQuery = nextQuery.ilike("lokasi", normalizeLocationInput(filters.lokasi));
  }

  if (filters.jenisKegiatan) {
    nextQuery = nextQuery.eq("jenis_kegiatan", filters.jenisKegiatan);
  }

  if (filters.status) {
    nextQuery = nextQuery.eq("status", filters.status);
  }

  if (filters.officeType === "kcp") {
    nextQuery = nextQuery.ilike("lokasi", "KCP %");
  }

  if (filters.officeType === "kc") {
    nextQuery = nextQuery.ilike("lokasi", "KC %");
  }

  if (filters.officeType === "lainnya") {
    nextQuery = nextQuery.not("lokasi", "ilike", "KC %").not("lokasi", "ilike", "KCP %");
  }

  if (filters.tanggalMulai) {
    nextQuery = nextQuery.gte("tanggal_maintenance", filters.tanggalMulai);
  }

  if (filters.tanggalSelesai) {
    nextQuery = nextQuery.lte("tanggal_maintenance", filters.tanggalSelesai);
  }

  if (filters.search) {
    const escaped = normalizeSearchFilter(filters.search);
    nextQuery = nextQuery.or(
      `kode_aset.ilike.%${escaped}%,nama_perangkat.ilike.%${escaped}%`,
    );
  }

  return nextQuery;
}

export async function fetchFilterOptions() {
  const { data, error } = await maintenanceDb.rpc("get_maintenance_filter_options");

  if (error) {
    throw error;
  }

  return {
    lokasi: normalizeLocationOptions(data?.lokasi || []),
    jenisKegiatan: data?.jenis_kegiatan || [],
  };
}

export async function fetchAvailableYears(lokasi) {
  if (!lokasi) {
    return [];
  }

  const { data, error } = await maintenanceDb.rpc(
    "get_available_maintenance_years",
    {
      p_lokasi: normalizeLocationInput(lokasi),
    },
  );

  if (error) {
    throw error;
  }

  return data?.map((item) => item.tahun) || [];
}

export async function fetchDashboardSummary(filters) {
  const { data, error } = await maintenanceDb.rpc("get_maintenance_dashboard", {
    p_lokasi: normalizeLocationInput(filters.lokasi) || null,
    p_date_from: filters.tanggalMulai || null,
    p_date_to: filters.tanggalSelesai || null,
    p_jenis_kegiatan: filters.jenisKegiatan || null,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function fetchMaintenanceList({
  filters,
  page,
  pageSize,
  sortColumn,
  sortDirection,
}) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = maintenanceDb.from("maintenance").select("*", { count: "exact" });

  if (sortColumn === "tanggal_maintenance") {
    query = query
      .order("tanggal_maintenance", { ascending: sortDirection === "asc" })
      .order("urutan_kunjungan", { ascending: true, nullsFirst: false })
      .order("lokasi", { ascending: true })
      .order("kode_aset", { ascending: true });
  } else {
    query = query.order(sortColumn, { ascending: sortDirection === "asc" });
  }

  query = query.range(from, to);

  query = applyMaintenanceFilters(query, filters);

  const { data, error, count } = await query;

  if (error) {
    throw error;
  }

  return {
    data: data || [],
    count: count || 0,
  };
}

export async function fetchMaintenanceForExport(filters) {
  let query = maintenanceDb
    .from("maintenance")
    .select("*")
    .order("tanggal_maintenance", { ascending: false })
    .limit(1000);

  query = applyMaintenanceFilters(query, filters);

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data || [];
}

export async function createMaintenance(payload) {
  const normalizedPayload = normalizeMaintenancePayload(payload);
  await syncAssetCatalog([normalizedPayload]);
  const { error } = await maintenanceDb.from("maintenance").insert(normalizedPayload);
  if (error) {
    throw error;
  }
}

export async function upsertMaintenanceRows(rows, assetRows = []) {
  const normalizedRows = deduplicateMaintenanceRows(normalizeMaintenanceRows(rows));
  await syncAssetCatalog([...assetRows, ...normalizedRows]);

  if (!normalizedRows.length) {
    return;
  }

  const existingRows = await fetchExistingMaintenanceRows(normalizedRows);
  const rowsToUpsert = mergeImportWithExistingRows(normalizedRows, existingRows);

  const { error } = await maintenanceDb.from("maintenance").upsert(rowsToUpsert, {
    onConflict: "tanggal_maintenance,kode_aset,jenis_kegiatan",
  });

  if (error) {
    throw error;
  }
}

export async function updateMaintenance(id, payload) {
  const normalizedPayload = normalizeMaintenancePayload(payload);
  await syncAssetCatalog([normalizedPayload]);
  const { error } = await maintenanceDb
    .from("maintenance")
    .update(normalizedPayload)
    .eq("id", id);

  if (error) {
    throw error;
  }
}

export async function deleteMaintenance(id) {
  const { error } = await maintenanceDb.from("maintenance").delete().eq("id", id);
  if (error) {
    throw error;
  }
}
