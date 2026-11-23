export const OFFICE_TYPE_OPTIONS = [
  { value: "kc", label: "Kantor Cabang" },
  { value: "kcp", label: "Kantor Cabang Pembantu" },
  { value: "lainnya", label: "Lainnya" },
];
export function getOfficeType(lokasi: any) {
  const normalized = String(lokasi || "").trim().toUpperCase();
  if (normalized.startsWith("KCP ")) return "kcp";
  if (normalized.startsWith("KC ")) return "kc";
  return "lainnya";
}
export function getOfficeTypeLabel(value: string) {
  return OFFICE_TYPE_OPTIONS.find((o) => o.value === value)?.label || "Lainnya";
}
export function matchesOfficeType(lokasi: any, officeType: string) {
  return !officeType || getOfficeType(lokasi) === officeType;
}
