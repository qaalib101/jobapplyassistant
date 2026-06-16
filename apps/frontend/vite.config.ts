import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  build: {
    outDir: "../../dist/apps/frontend",
    emptyOutDir: true,
  },
  server: {
    port: 4318,
    proxy: {
      "/api": "http://localhost:4317",
    },
  },
});
