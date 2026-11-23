import { format } from "date-fns";
import { normalizeAssetCodeInput, resolveAssetCode } from "@/lib/asset-code";
import { normalizeLocationInput } from "@/lib/location";

function normalizeHeader(header) {
  return String(header || "")
    .trim()
    .toLowerCase()
    .replaceAll(/\s+/g, "_");
}

function excelSerialToDate(value, XLSX) {
  const parsed = XLSX.SSF.parse_date_code(value);
  if (!parsed) {
    throw new Error(`Nilai tanggal Excel tidak valid: ${value}`);
  }

  return format(
    new Date(parsed.y, parsed.m - 1, parsed.d),
    "yyyy-MM-dd",
  );
}

function normalizeDate(value, XLSX) {
  if (value === null || value === undefined || value === "") {
    throw new Error("Tanggal maintenance wajib diisi.");
  }

  if (typeof value === "number") {
    return excelSerialToDate(value, XLSX);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Format tanggal tidak dikenali: ${value}`);
  }

  return format(date, "yyyy-MM-dd");
}

function normalizeText(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  if (isPlaceholderText(text)) {
    return null;
  }

  return text;
}

function isPlaceholderText(value) {
  const text = String(value ?? "").trim();
  return ["", "-", "\u2013", "\u2014", "â€“", "â€”"].includes(text);
}

function isPlanningNote(value) {
  return isPlaceholderText(value);
}

function hasImportValue(value) {
  return normalizeText(value) !== null;
}

function normalizeStatus(value, planning) {
  const text = normalizeText(value)?.toLowerCase();

  if (["planning", "rencana", "terjadwal", "planned"].includes(text)) {
    return "planning";
  }

  if (["selesai", "done", "completed"].includes(text)) {
    return "selesai";
  }

  return planning ? "planning" : "selesai";
}

function extractAssetCodeFromNote(value) {
  const text = String(value ?? "");
  const match = text.match(/kode\s*aset\s*:?\s*([A-Za-z0-9][A-Za-z0-9_-]*)/i);

  return match?.[1] || null;
}

function getImportedAssetCode(row) {
  return extractAssetCodeFromNote(row.catatan) || row.kode_aset;
}

function getAssetCodeImportMarker(row) {
  const importedCode = normalizeAssetCodeInput(extractAssetCodeFromNote(row.catatan));
  const originalCode = normalizeAssetCodeInput(row.kode_aset);

  if (!importedCode || !originalCode || importedCode === originalCode) {
    return null;
  }

  return [
    "[Info import]",
    `Kode aset dipakai dari catatan: ${importedCode}.`,
    `Kode aset kolom Excel sebelumnya: ${originalCode}.`,
  ].join(" ");
}

function buildImportedNote(row, status) {
  if (status === "planning") {
    return null;
  }

  return [normalizeText(row.catatan), getAssetCodeImportMarker(row)]
    .filter(Boolean)
    .join("\n\n") || null;
}

function hasAssetCandidate(row) {
  return [row.kode_aset, row.nama_perangkat, row.tipe, row.lokasi].some(hasImportValue);
}

function normalizeActivity(value, planning) {
  const text = normalizeText(value);

  if (text) {
    return text;
  }

  return planning ? "Estimasi maintenance" : null;
}

function normalizeRequiredText(value, fieldLabel) {
  const text = normalizeText(value);
  if (!text) {
    throw new Error(`${fieldLabel} wajib diisi.`);
  }

  return text;
}

function parseDurationToMinutes(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    if (value < 0) {
      throw new Error("Durasi tidak boleh negatif.");
    }

    return value;
  }

  const text = String(value).trim().toLowerCase();
  if (!text || text === "-") {
    return null;
  }

  if (/^-\d/.test(text)) {
    throw new Error("Durasi tidak boleh negatif.");
  }

  let total = 0;
  const jamMatch = text.match(/(\d+)\s*jam/);
  const menitMatch = text.match(/(\d+)\s*menit/);

  if (jamMatch) {
    total += Number(jamMatch[1]) * 60;
  }

  if (menitMatch) {
    total += Number(menitMatch[1]);
  }

  if (!total && /^\d+$/.test(text)) {
    total = Number(text);
  }

  if (total < 0) {
    throw new Error("Durasi tidak boleh negatif.");
  }

  return total || null;
}

function mapRow(rawRow, XLSX, urutanKunjungan, fallbackLokasi = null) {
  const row = Object.fromEntries(
    Object.entries(rawRow).map(([key, value]) => [normalizeHeader(key), value]),
  );
  const planning = isPlanningNote(row.catatan);
  const status = normalizeStatus(row.status, planning);
  const lokasi = normalizeLocationInput(row.lokasi) || fallbackLokasi;

  if (status === "planning" && !lokasi) {
    throw new Error("Lokasi wajib diisi untuk data terjadwal.");
  }

  return {
    tanggal_maintenance: normalizeDate(row.tanggal_maintenance, XLSX),
    nama_perangkat: normalizeRequiredText(row.nama_perangkat, "Nama perangkat"),
    tipe: normalizeText(row.tipe),
    lokasi,
    kode_aset: resolveAssetCode({
      kodeAset: getImportedAssetCode(row),
      namaPerangkat: row.nama_perangkat,
      lokasi,
      tipe: row.tipe,
    }),
    jenis_kegiatan: normalizeActivity(row.jenis_kegiatan, status === "planning"),
    durasi: parseDurationToMinutes(row.durasi),
    status,
    catatan: buildImportedNote(row, status),
    urutan_kunjungan: urutanKunjungan,
  };
}

function mapAssetRow(rawRow, fallbackLokasi = null) {
  const row = Object.fromEntries(
    Object.entries(rawRow).map(([key, value]) => [normalizeHeader(key), value]),
  );

  if (!hasAssetCandidate(row)) {
    return null;
  }

  const lokasi = normalizeLocationInput(row.lokasi) || fallbackLokasi;

  return {
    kode_aset: resolveAssetCode({
      kodeAset: getImportedAssetCode(row),
      namaPerangkat: row.nama_perangkat,
      lokasi,
      tipe: row.tipe,
    }),
    nama_perangkat: normalizeRequiredText(row.nama_perangkat, "Nama perangkat"),
    tipe: normalizeText(row.tipe),
    lokasi,
  };
}

function getVisitOrder(date, lokasi, visitOrderByDate) {
  if (!date || !lokasi) {
    return null;
  }

  if (!visitOrderByDate.has(date)) {
    visitOrderByDate.set(date, new Map());
  }

  const visitOrder = visitOrderByDate.get(date);
  if (!visitOrder.has(lokasi)) {
    visitOrder.set(lokasi, visitOrder.size + 1);
  }

  return visitOrder.get(lokasi);
}

function deduplicateAssetRows(rows) {
  return [
    ...rows
      .filter(Boolean)
      .reduce((lookup, row) => {
        lookup.set(row.kode_aset, row);
        return lookup;
      }, new Map())
      .values(),
  ];
}

export async function parseMaintenanceWorkbook(file) {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });

  if (!workbook.SheetNames.length) {
    throw new Error("Workbook Excel tidak memiliki sheet.");
  }

  const rows = [];
  const assetRows = [];
  const errors = [];
  const visitOrderByDate = new Map();
  const lastLocationByDate = new Map();
  let totalRows = 0;

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(sheet, {
      defval: "",
      raw: true,
    });

    totalRows += rawRows.length;

    rawRows.forEach((rawRow, index) => {
      try {
        const normalizedRow = Object.fromEntries(
          Object.entries(rawRow).map(([key, value]) => [normalizeHeader(key), value]),
        );

        if (!hasAssetCandidate(normalizedRow)) {
          return;
        }

        if (!hasImportValue(normalizedRow.tanggal_maintenance)) {
          assetRows.push(mapAssetRow(rawRow));
          return;
        }

        const date = normalizeDate(normalizedRow.tanggal_maintenance, XLSX);
        const explicitLokasi = normalizeLocationInput(normalizedRow.lokasi);
        const lokasi = explicitLokasi || lastLocationByDate.get(date) || null;
        const urutanKunjungan = getVisitOrder(date, lokasi, visitOrderByDate);

        if (explicitLokasi) {
          lastLocationByDate.set(date, explicitLokasi);
        }

        rows.push(mapRow(rawRow, XLSX, urutanKunjungan, lokasi));
        assetRows.push(mapAssetRow(rawRow, lokasi));
      } catch (error) {
        errors.push(`${sheetName} baris ${index + 2}: ${error.message}`);
      }
    });
  });

  if (!totalRows) {
    throw new Error("File Excel kosong.");
  }

  return {
    rows,
    assetRows: deduplicateAssetRows(assetRows),
    errors,
    totalRows,
    planningRows: rows.filter((row) => row.status === "planning").length,
  };
}

export async function parseAssetWorkbook(file) {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });

  if (!workbook.SheetNames.length) {
    throw new Error("Workbook Excel tidak memiliki sheet.");
  }

  const assetRows = [];
  const errors = [];
  let totalRows = 0;

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(sheet, {
      defval: "",
      raw: true,
    });

    totalRows += rawRows.length;

    rawRows.forEach((rawRow, index) => {
      try {
        const normalizedRow = Object.fromEntries(
          Object.entries(rawRow).map(([key, value]) => [normalizeHeader(key), value]),
        );

        if (!hasAssetCandidate(normalizedRow)) {
          return;
        }

        assetRows.push(mapAssetRow(rawRow));
      } catch (error) {
        errors.push(`${sheetName} baris ${index + 2}: ${error.message}`);
      }
    });
  });

  if (!totalRows) {
    throw new Error("File Excel kosong.");
  }

  return {
    assetRows: deduplicateAssetRows(assetRows),
    errors,
    totalRows,
  };
}
