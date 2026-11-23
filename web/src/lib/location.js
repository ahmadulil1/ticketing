export function normalizeLocationInput(value) {
  const text = String(value || "")
    .trim()
    .replaceAll(/\s+/g, " ");

  if (!text) {
    return null;
  }

  const upperText = text.toUpperCase();

  if (upperText.startsWith("KCP ")) {
    return `KCP ${upperText.slice(4).trim()}`;
  }

  if (upperText.startsWith("KC ")) {
    return `KC ${upperText.slice(3).trim()}`;
  }

  return text;
}

export function normalizeLocationOptions(values = []) {
  return [
    ...new Set(
      values
        .map((value) => normalizeLocationInput(value))
        .filter(Boolean),
    ),
  ].sort((left, right) => left.localeCompare(right));
}
