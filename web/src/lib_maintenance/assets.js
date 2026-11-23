import { MAINTENANCE_SCHEMA, supabase } from "@/lib/supabaseClient";
import { resolveAssetCode } from "@/lib/asset-code";
import { normalizeLocationInput, normalizeLocationOptions } from "@/lib/location";

const assetsDb = supabase.schema(MAINTENANCE_SCHEMA);

function pickPreferredText(nextValue, fallbackValue) {
  if (typeof nextValue === "string" && nextValue.trim()) {
    return nextValue.trim();
  }

  if (typeof fallbackValue === "string" && fallbackValue.trim()) {
    return fallbackValue.trim();
  }

  return null;
}

function getAssetRpcFilters(filters = {}) {
  return {
    p_lokasi: normalizeLocationInput(filters.lokasi) || null,
    p_status: filters.status || null,
    p_search: filters.search?.trim() || null,
    p_interval_months: filters.maintenanceIntervalMonths
      ? Number(filters.maintenanceIntervalMonths)
      : null,
    p_priority: filters.priority || null,
  };
}

function normalizeAssetPayload(payload) {
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
    maintenance_interval_months: Number(payload.maintenance_interval_months || 12),
  };
}

function normalizeImportedAssetPayload(payload) {
  return {
    kode_aset: resolveAssetCode({
      kodeAset: payload.kode_aset,
      namaPerangkat: payload.nama_perangkat,
      lokasi: payload.lokasi,
      tipe: payload.tipe,
    }),
    nama_perangkat: payload.nama_perangkat?.trim() || "",
    tipe: payload.tipe?.trim() || null,
    lokasi: normalizeLocationInput(payload.lokasi),
  };
}

function deduplicateAssetPayloads(rows) {
  return [
    ...rows
      .map(normalizeImportedAssetPayload)
      .filter((row) => row.kode_aset && row.nama_perangkat)
      .reduce((lookup, row) => {
        const current = lookup.get(row.kode_aset);

        lookup.set(row.kode_aset, {
          kode_aset: row.kode_aset,
          nama_perangkat: pickPreferredText(row.nama_perangkat, current?.nama_perangkat),
          tipe: pickPreferredText(row.tipe, current?.tipe),
          lokasi: pickPreferredText(row.lokasi, current?.lokasi),
        });

        return lookup;
      }, new Map())
      .values(),
  ];
}

function getScheduleConflictKey(row) {
  return [
    row.tanggal_maintenance || "",
    row.kode_aset || "",
    row.jenis_kegiatan || "",
  ].join("|");
}

function getVisitOrderByLocation(rows) {
  const locations = [
    ...new Set(rows.map((row) => row.lokasi).filter(Boolean)),
  ].sort((left, right) => left.localeCompare(right));

  return locations.reduce((lookup, lokasi, index) => {
    lookup.set(lokasi, index + 1);
    return lookup;
  }, new Map());
}

function getAssetCodes(rows) {
  return [...new Set((rows || []).map((asset) => asset.kode_aset).filter(Boolean))];
}

async function fetchAssetMaintenanceContext(assetRows) {
  const assetCodes = getAssetCodes(assetRows);

  if (!assetCodes.length) {
    return new Map();
  }

  const { data, error } = await assetsDb
    .from("maintenance")
    .select("kode_aset,tanggal_maintenance,status,jenis_kegiatan,catatan")
    .in("kode_aset", assetCodes)
    .order("tanggal_maintenance", { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []).reduce((lookup, item) => {
    const current = lookup.get(item.kode_aset) || {
      maintenance_count: 0,
      scheduled_date: null,
      scheduled_activity: null,
      last_note: null,
    };

    if (item.status === "planning") {
      if (!current.scheduled_date || item.tanggal_maintenance < current.scheduled_date) {
        current.scheduled_date = item.tanggal_maintenance;
        current.scheduled_activity = item.jenis_kegiatan;
      }
    } else {
      current.maintenance_count += 1;
      if (!current.last_note && item.catatan) {
        current.last_note = item.catatan;
      }
    }

    lookup.set(item.kode_aset, current);
    return lookup;
  }, new Map());
}

async function fetchExistingAssetsByCodes(assetCodes) {
  if (!assetCodes.length) {
    return [];
  }

  const { data, error } = await assetsDb
    .from("assets")
    .select("kode_aset,nama_perangkat,tipe,lokasi,status,maintenance_interval_months")
    .in("kode_aset", assetCodes);

  if (error) {
    throw error;
  }

  return data || [];
}

async function enrichAssetRows(assetRows) {
  const contextLookup = await fetchAssetMaintenanceContext(assetRows);

  return (assetRows || []).map((asset) => ({
    ...asset,
    ...(contextLookup.get(asset.kode_aset) || {
      maintenance_count: 0,
      scheduled_date: null,
      scheduled_activity: null,
      last_note: null,
    }),
  }));
}

async function fetchScheduledAssetCount(filters = {}) {
  let query = assetsDb
    .from("maintenance")
    .select("kode_aset,lokasi,status")
    .eq("status", "planning")
    .limit(2000);

  if (filters.lokasi) {
    query = query.eq("lokasi", filters.lokasi);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return new Set((data || []).map((item) => item.kode_aset).filter(Boolean)).size;
}

export async function fetchAssetList({
  filters = {},
  page = 1,
  pageSize = 10,
}) {
  const { data, error } = await assetsDb.rpc("get_asset_list", {
    ...getAssetRpcFilters(filters),
    p_page: page,
    p_page_size: pageSize,
  });

  if (error) {
    throw error;
  }

  const result = data || { data: [], count: 0 };

  return {
    ...result,
    data: await enrichAssetRows(result.data || []),
  };
}

export async function fetchAssetOptions() {
  const { data, error } = await assetsDb.rpc("get_asset_options");

  if (error) {
    throw error;
  }

  return {
    ...(data || { status: [], intervals: [] }),
    lokasi: normalizeLocationOptions(data?.lokasi || []),
  };
}

export async function fetchAssetSummary(filters = {}) {
  const { data, error } = await assetsDb.rpc(
    "get_asset_summary",
    getAssetRpcFilters(filters),
  );

  if (error) {
    throw error;
  }

  return {
    ...(data || {}),
    scheduled_assets: await fetchScheduledAssetCount(filters),
  };
}

export async function fetchAssetHistory(kodeAset) {
  if (!kodeAset) {
    return [];
  }

  const { data, error } = await assetsDb
    .from("maintenance")
    .select("*")
    .eq("kode_aset", kodeAset)
    .order("tanggal_maintenance", { ascending: false })
    .limit(50);

  if (error) {
    throw error;
  }

  return data || [];
}

export async function fetchAssetDetail(id) {
  if (!id) {
    throw new Error("ID aset tidak valid.");
  }

  const { data, error } = await assetsDb
    .from("assets")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return {
      asset: null,
      history: [],
      scheduledRows: [],
      completedRows: [],
    };
  }

  const [asset] = await enrichAssetRows([data]);
  const history = await fetchAssetHistory(asset.kode_aset);

  return {
    asset,
    history,
    scheduledRows: history.filter((row) => row.status === "planning"),
    completedRows: history.filter((row) => row.status !== "planning"),
  };
}

export async function createAsset(payload) {
  const normalizedPayload = normalizeAssetPayload(payload);
  const { error } = await assetsDb.from("assets").insert(normalizedPayload);

  if (error) {
    throw error;
  }
}

export async function updateAsset(id, payload) {
  const normalizedPayload = normalizeAssetPayload(payload);
  const { error } = await assetsDb.from("assets").update(normalizedPayload).eq("id", id);

  if (error) {
    throw error;
  }
}

export async function upsertAssetRows(rows) {
  const normalizedRows = deduplicateAssetPayloads(rows);

  if (!normalizedRows.length) {
    return 0;
  }

  const existingAssets = await fetchExistingAssetsByCodes(
    normalizedRows.map((row) => row.kode_aset),
  );
  const existingLookup = existingAssets.reduce((lookup, item) => {
    lookup.set(item.kode_aset, item);
    return lookup;
  }, new Map());

  const payload = normalizedRows.map((row) => {
    const existing = existingLookup.get(row.kode_aset);

    return {
      kode_aset: row.kode_aset,
      nama_perangkat: pickPreferredText(row.nama_perangkat, existing?.nama_perangkat),
      tipe: pickPreferredText(row.tipe, existing?.tipe),
      lokasi: pickPreferredText(row.lokasi, existing?.lokasi),
      status: existing?.status || "aktif",
      maintenance_interval_months: Number(existing?.maintenance_interval_months || 12),
    };
  });

  const { error } = await assetsDb
    .from("assets")
    .upsert(payload, { onConflict: "kode_aset" });

  if (error) {
    throw error;
  }

  return payload.length;
}

export async function createAssetMaintenanceSchedule({
  tanggal_maintenance,
  scopeType,
  lokasi,
  jenis_kegiatan,
}) {
  if (!tanggal_maintenance) {
    throw new Error("Tanggal jadwal wajib diisi.");
  }

  let query = assetsDb
    .from("assets")
    .select("kode_aset,nama_perangkat,tipe,lokasi,status")
    .eq("status", "aktif")
    .order("lokasi", { ascending: true })
    .order("kode_aset", { ascending: true })
    .limit(5000);

  if (scopeType === "lokasi") {
    if (!lokasi) {
      throw new Error("Lokasi wajib dipilih.");
    }
    query = query.eq("lokasi", lokasi);
  }

  if (scopeType === "kc") {
    query = query.ilike("lokasi", "KC %");
  }

  if (scopeType === "kcp") {
    query = query.ilike("lokasi", "KCP %");
  }

  const { data: assets, error: assetError } = await query;

  if (assetError) {
    throw assetError;
  }

  if (!assets?.length) {
    return { planned: 0, skippedCompleted: 0, skippedInvalid: 0 };
  }

  const activity = jenis_kegiatan?.trim() || "Estimasi maintenance";
  const visitOrderByLocation = getVisitOrderByLocation(assets);
  const plannedRows = assets
    .filter((asset) => asset.kode_aset && asset.nama_perangkat && asset.lokasi)
    .map((asset) => ({
      tanggal_maintenance,
      kode_aset: asset.kode_aset,
      nama_perangkat: asset.nama_perangkat,
      tipe: asset.tipe || null,
      lokasi: asset.lokasi,
      jenis_kegiatan: activity,
      durasi: null,
      status: "planning",
      catatan: null,
      urutan_kunjungan: visitOrderByLocation.get(asset.lokasi) || null,
    }));

  const skippedInvalid = assets.length - plannedRows.length;

  if (!plannedRows.length) {
    return { planned: 0, skippedCompleted: 0, skippedInvalid };
  }

  const { data: existingRows, error: existingError } = await assetsDb
    .from("maintenance")
    .select("tanggal_maintenance,kode_aset,jenis_kegiatan,status")
    .eq("tanggal_maintenance", tanggal_maintenance)
    .eq("jenis_kegiatan", activity)
    .in("kode_aset", plannedRows.map((row) => row.kode_aset));

  if (existingError) {
    throw existingError;
  }

  const completedKeys = new Set(
    (existingRows || [])
      .filter((row) => row.status !== "planning")
      .map(getScheduleConflictKey),
  );

  const rowsToUpsert = plannedRows.filter(
    (row) => !completedKeys.has(getScheduleConflictKey(row)),
  );

  if (rowsToUpsert.length) {
    const { error } = await assetsDb.from("maintenance").upsert(rowsToUpsert, {
      onConflict: "tanggal_maintenance,kode_aset,jenis_kegiatan",
    });

    if (error) {
      throw error;
    }
  }

  return {
    planned: rowsToUpsert.length,
    skippedCompleted: plannedRows.length - rowsToUpsert.length,
    skippedInvalid,
  };
}

export async function deleteAsset(id) {
  const { error } = await assetsDb.from("assets").delete().eq("id", id);

  if (error) {
    throw error;
  }
}
