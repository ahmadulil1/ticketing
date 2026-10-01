import { useEffect, useState } from "react";

type Theme = "light" | "dark";

/**
 * Token tema gelap/terang untuk desktop app.
 * Default ikut prefers-color-scheme; pilihan user disimpan di localStorage.
 *
 * ponytail: localStorage di-share antar window Tauri (same origin webview),
 * jadi toggle di mini window berlaku juga ke pet overlay.
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
    toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
  };
}
