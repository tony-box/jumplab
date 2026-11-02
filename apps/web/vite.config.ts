import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["jump-lab.svg"],
      manifest: {
        name: "2D MTB Jump Lab",
        short_name: "Jump Lab",
        description: "Deterministic 2D mountain-bike jump workbench",
        theme_color: "#303841",
        background_color: "#f7f8fa",
        display: "standalone",
        start_url: "/workbench",
        icons: [
          { src: "/jump-lab.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }
        ]
      },
      workbox: {
        navigateFallback: "/index.html",
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
        additionalManifestEntries: [
          { url: "/designer", revision: "scenario-v3" },
          { url: "/pose", revision: "designer-redirect-v1" }
        ]
      },
      devOptions: {
        enabled: false
      }
    })
  ],
  server: {
    host: "127.0.0.1",
    port: 4173
  }
});
