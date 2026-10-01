import { useEffect, useState } from "react";

type Theme = "light" | "dark";

/** Warna semantik untuk elemen non-CSS (chart recharts). */
export const themeColors = {
  light: {
    grid: "#eef0f4",
    axis: "#8a93a3",
    tooltipBg: "#ffffff",
    tooltipBorder: "#e3e7ee",
    tooltipText: "#1e2430",
    cursor: "#f5f7fb",
  },
  dark: {
    grid: "#232c3b",
    axis: "#9aa5b8",
    tooltipBg: "#1c2330",
    tooltipBorder: "#2d3542",
    tooltipText: "#e6edf3",
    cursor: "#1c2330",
  },
};

/**
 * Token tema gelap/terang.
 * Default ikut prefers-color-scheme OS; pilihan user disimpan di localStorage.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  return {
    theme,
    colors: themeColors[theme],
    toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
  };
}
