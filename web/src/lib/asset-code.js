function sanitizeSegment(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replaceAll(/[^A-Z0-9]+/g, "-")
    .replaceAll(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function normalizeAssetCodeInput(value) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    return null;
  }

  const lowered = normalized.toLowerCase();
  if (
    lowered === "-" ||
    lowered === "unknown" ||
    lowered === "tidak diketahui" ||
    lowered === "tidak_ diketahui"
  ) {
    return null;
  }

  return normalized.toUpperCase();
}

export function buildUnknownAssetCode({ namaPerangkat, lokasi, tipe }) {
  const nameSegment = sanitizeSegment(namaPerangkat) || "TANPA-NAMA";
  const locationSegment =
    sanitizeSegment(lokasi) || sanitizeSegment(tipe) || "UMUM";

  return `UNKN-${nameSegment}-${locationSegment}`.slice(0, 80);
}

export function resolveAssetCode({ kodeAset, namaPerangkat, lokasi, tipe }) {
  return (
    normalizeAssetCodeInput(kodeAset) ||
    buildUnknownAssetCode({ namaPerangkat, lokasi, tipe })
  );
}
