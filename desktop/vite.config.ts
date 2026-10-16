import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
    // ponytail: proxy API + WS ke server produksi; origin localhost:1420 tak masuk
    // whitelist CORS. Hanya dipakai saat dev (screenshot tutorial), produksi pakai .env.
    proxy: {
      "/api": { target: "http://192.168.0.100", changeOrigin: true },
      "/ws": { target: "http://192.168.0.100", ws: true, changeOrigin: true },
    },
  },
  build: {
    target: "es2021",
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
});
