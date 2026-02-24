import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import svgr from 'vite-plugin-svgr';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), svgr()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        github_spa_hack: path.resolve(__dirname, '404.html'),
      },
    },
  },
});
