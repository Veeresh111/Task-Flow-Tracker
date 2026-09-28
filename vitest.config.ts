import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", "dist", "src/test/e2e"],
    // Windows/Node≥20 tinypool flake (ERR_IPC_CHANNEL_CLOSED hangs worker
    // startup). Single-threaded execution is deterministic and fast enough
    // for this suite; proven by repeated runs in Session 6 hardening.
    pool: "threads",
    poolOptions: { threads: { singleThread: true } },
    fileParallelism: false,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
