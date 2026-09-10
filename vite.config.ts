import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// vitest 実行中は NODE_ENV を必ず test にする。
//
// Claude デスクトップのようなホストプロセスは NODE_ENV=production を持っており、
// そこから起動したシェルはそれを継承する。その値のまま vitest を走らせると
// React が production ビルドに解決され、act() が存在しないため
// @testing-library/react の render() が全部落ちる。
//
// CI には NODE_ENV が無いので CI は green のまま＝手元だけ赤くなる。
// npm スクリプト側で NODE_ENV=test と書く手もあるが、Windows のシェルでは
// その書き方が使えないため、ここで潰しておく。
// @ts-expect-error process is a nodejs global
if (process.env.VITEST) {
  // @ts-expect-error process is a nodejs global
  process.env.NODE_ENV = "test";
}

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },

  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // Rust 側は cargo test が見るので vitest の対象から外す
    exclude: ["node_modules/**", "dist/**", "src-tauri/**"],
  },
}));
