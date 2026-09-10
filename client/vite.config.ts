import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  define: {
    "import.meta.env.VITE_BUILD_ID": JSON.stringify(
      process.env.RENDER_GIT_COMMIT?.slice(0, 8) ?? process.env.VITE_APP_VERSION ?? "local",
    ),
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/upload": "http://localhost:3001",
      "/files": "http://localhost:3001",
      "/ping": "http://localhost:3001",
    },
  },
});
