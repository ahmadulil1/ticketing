import { useEffect } from "react";

/**
 * Cek update otomatis saat app start + tiap 4 jam.
 * ponytail: butuh plugin-updater; di browser (dev vite) no-op.
 */
export function useAutoUpdate() {
  useEffect(() => {
    let alive = true;

    const check = async () => {
      if (!(typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window))) return;
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const upd = await check();
        if (!alive || !upd) return;
        console.info(`[update] ${upd.version} tersedia (saat ini ${upd.currentVersion})`);
        // Install otomatis (passive: progress bar bawaan OS)
        await upd.downloadAndInstall();
        const { relaunch } = await import("@tauri-apps/plugin-process");
        await relaunch();
      } catch (e) {
        console.error("[update] gagal:", e);
      }
    };

    check();
    const id = setInterval(check, 4 * 60 * 60 * 1000);
    return () => { alive = false; clearInterval(id); };
  }, []);
}
