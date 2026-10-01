/**
 * Drag region untuk window Tauri 2.
 * data-tauri-drag-region saja tidak reliable; gunakan startDragging() native.
 *
 * Pakai: <div onMouseDown={useDragRegion()}>
 * ponytail: Windows snap-layout tetap native karena startDragging pakai WM_NCLBUTTONDOWN.
 */
export function useDragRegion() {
  return (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    // Hanya area kosong (bukan tombol/input)
    const target = e.target as HTMLElement;
    if (target.closest("button, input, select, textarea, a")) return;

    if (typeof window.__TAURI__ === "undefined") return;
    import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
      getCurrentWindow().startDragging().catch((err) => console.error("[drag] gagal:", err));
    });
  };
}
