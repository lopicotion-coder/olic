import { defineConfig } from "vite";

export default defineConfig({
  base: "/",
  build: {
    target: "es2022",
    sourcemap: true,
    emptyOutDir: true,
  },
  server: {
    host: "0.0.0.0",
  },
});
