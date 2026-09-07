import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // WebSocket → Cloudflare Worker dev server (wrangler dev on 8787).
      "/ws": {
        target: "http://localhost:8787",
        ws: true,
      },
    },
  },
});