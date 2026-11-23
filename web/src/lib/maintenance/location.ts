export function normalizeLocationInput(value: any) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  if (!text) return null;
  const upperText = text.toUpperCase();
  if (upperText.startsWith("KCP ")) return `KCP ${upperText.slice(4).trim()}`;
  if (upperText.startsWith("KC ")) return `KC ${upperText.slice(3).trim()}`;
  return text;
}
export function normalizeLocationOptions(values: any[] = []) {
  return [...new Set(values.map((v) => normalizeLocationInput(v)).filter(Boolean))].sort((a: any, b: any) => a.localeCompare(b));
}
