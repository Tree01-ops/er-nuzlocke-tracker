import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Relative base so the build works on GitHub Pages subpaths as well as Netlify.
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "ER Nuzlocke",
        short_name: "ER Nuzlocke",
        description: "Elite Redux nuzlocke tracker with a Pokédex, randomized abilities and bans.",
        theme_color: "#d83030",
        background_color: "#f0f0e8",
        display: "standalone",
        start_url: "./",
        scope: "./",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Saved at install: the app, game data, music, and the sprite/cry indexes.
        globPatterns: ["**/*.{html,js,css,woff2,json,mid,wav,png}"],
        // Sprites and cries (~15 MB) are cached as they're viewed instead (or via the Run page button).
        globIgnores: ["sprites/*.png", "sounds/cries/*.wav"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /\/sprites\/[^/]+\.png$/.test(url.pathname),
            handler: "CacheFirst",
            options: { cacheName: "sprites" },
          },
          {
            urlPattern: ({ url }) => /\/sounds\/cries\/[^/]+\.wav$/.test(url.pathname),
            handler: "CacheFirst",
            options: { cacheName: "cries" },
          },
        ],
      },
    }),
  ],
});
