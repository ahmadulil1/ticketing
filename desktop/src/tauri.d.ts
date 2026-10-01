// window.__TAURI__ terisi hanya jika withGlobalTauri: true di tauri.conf.json
interface Window {
  __TAURI__?: Record<string, unknown>;
  __TAURI_INTERNALS__?: {
    metadata?: {
      currentWindow?: { label: string };
    };
  };
}
