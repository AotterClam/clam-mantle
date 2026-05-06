import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";

/**
 * Admin SPA build — emits ONE self-contained `dist/index.html` with
 * JS / CSS / assets all inlined. Platform-agnostic: any adapter
 * (cloudflare, netlify, ...) serves the file as a single string for
 * every URL under `/admin/*` — no `/admin/assets/*` plumbing needed.
 *
 * Trade-off: each cold load fetches the full bundle (no HTTP caching
 * of JS chunks). Acceptable for a 1–2 operator admin tool; revisit
 * if the SPA grows past ~1 MB.
 *
 * Dev: `pnpm dev` runs Vite at http://localhost:5173/admin/. Proxy
 * forwards API/auth calls to `wrangler dev` on :8787; run the blog
 * starter on that port and open http://localhost:5173/admin/ for HMR.
 */
export default defineConfig({
  base: "/admin/",
  plugins: [react(), tailwindcss(), viteSingleFile()],
  build: {
    outDir: "./dist",
    emptyOutDir: true,
    cssCodeSplit: false,
  },
  server: {
    proxy: {
      "/admin/api": "http://localhost:8787",
      "/admin/auth": "http://localhost:8787",
      "/admin/logout": "http://localhost:8787",
      "/oauth": "http://localhost:8787",
      "/.well-known": "http://localhost:8787",
    },
  },
});
