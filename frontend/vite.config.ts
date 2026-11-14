/// <reference types="vitest/config" />
// Vite config for the Planetary Explorer frontend. Tailwind v4 runs as a Vite
// plugin (no postcss.config needed); vitest uses jsdom so component tests can
// render React trees without a browser. The Three.js canvas is excluded from
// jsdom tests - see src/test/setup.ts and the globe unit tests, which exercise
// the pure math (latLonToVector3, score -> colour) rather than WebGL.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: { port: 5173 },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // keep the 3D and charting vendors in their own long-cached chunks
        manualChunks: {
          three: ["three", "@react-three/fiber", "@react-three/drei"],
          charts: ["recharts"],
          react: ["react", "react-dom", "@tanstack/react-query", "zustand"],
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
  },
});
