import { defineConfig } from "vite";
import { resolve } from "node:path";
export default defineConfig({
  base: "/Mycity/",
  build: {
    rollupOptions: {
      input: {
        district: resolve("index.html"),
        benchmarks: resolve("benchmarks/index.html"),
        gallery: resolve("gallery/index.html"),
      },
    },
  },
});
