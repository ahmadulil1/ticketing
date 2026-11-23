function sanitizeSegment(value: any) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}
export function normalizeAssetCodeInput(value: any) {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  const lowered = normalized.toLowerCase();
  if (["-", "unknown", "tidak diketahui"].includes(lowered)) return null;
  return normalized.toUpperCase();
}
export function buildUnknownAssetCode({ namaPerangkat, lokasi, tipe }: any) {
  const nameSegment = sanitizeSegment(namaPerangkat) || "TANPA-NAMA";
  const locationSegment = sanitizeSegment(lokasi) || sanitizeSegment(tipe) || "UMUM";
  return `UNKN-${nameSegment}-${locationSegment}`.slice(0, 80);
}
export function resolveAssetCode({ kodeAset, namaPerangkat, lokasi, tipe }: any) {
  return normalizeAssetCodeInput(kodeAset) || buildUnknownAssetCode({ namaPerangkat, lokasi, tipe });
}
