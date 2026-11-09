import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["logo-32.png", "logo-48.png", "logo-180.png", "logo-192.png", "logo-512.png", "logo.jpg"],
      manifest: {
        name: "IshuriApp — Rwanda’s school atlas",
        short_name: "IshuriApp",
        description: "Search Rwanda’s approved schools, rankings, events and school websites.",
        theme_color: "#1565C0",
        background_color: "#1565C0",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "logo-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "logo-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        ],
      },
    }),
  ],
  server: { port: 5173 },
});
