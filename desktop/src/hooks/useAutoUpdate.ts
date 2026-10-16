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
      // Cek hanya dari satu window untuk hindari race downloadAndInstall antar window.
      if (window.location.hash !== "#pet-overlay") return;
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const upd = await check();
        if (!alive || !upd) return;
        await upd.downloadAndInstall();
        const { relaunch } = await import("@tauri-apps/plugin-process");
        await relaunch();
      } catch (e) {
        const msg = String((e as any)?.message || e);
        console.error("[update] gagal:", e);
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          await invoke("log_update_error", { msg: `GAGAL: ${msg}` });
          await invoke("show_notification", { title: "Update gagal", body: msg });
        } catch {}
      }
    };

    check();
    const id = setInterval(check, 4 * 60 * 60 * 1000);
    return () => { alive = false; clearInterval(id); };
  }, []);
}
