export const OFFICE_TYPE_OPTIONS = [
  { value: "kc", label: "Kantor Cabang" },
  { value: "kcp", label: "Kantor Cabang Pembantu" },
  { value: "lainnya", label: "Lainnya" },
];

export function getOfficeType(lokasi) {
  const normalized = String(lokasi || "").trim().toUpperCase();

  if (normalized.startsWith("KCP ")) {
    return "kcp";
  }

  if (normalized.startsWith("KC ")) {
    return "kc";
  }

  return "lainnya";
}

export function getOfficeTypeLabel(value) {
  return OFFICE_TYPE_OPTIONS.find((option) => option.value === value)?.label || "Lainnya";
}

export function matchesOfficeType(lokasi, officeType) {
  return !officeType || getOfficeType(lokasi) === officeType;
}
