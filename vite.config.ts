import { defineConfig } from "vite";

export default defineConfig({
  assetsInclude: ["**/*.lua"],
  build: { target: "es2022" },
});
