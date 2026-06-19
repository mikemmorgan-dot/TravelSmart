import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// Builds the UI into ./dist, which server.js serves.
export default defineConfig({ plugins: [react()], build: { outDir: "dist" } });
