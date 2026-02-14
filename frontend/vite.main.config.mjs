import { defineConfig } from "vite";
import path from "node:path";
import { builtinModules } from "node:module";

const external = [
  "electron",
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
];

export default defineConfig({
  build: {
    outDir: "dist-electron",
    emptyOutDir: false,
    sourcemap: false,
    lib: {
      entry: path.resolve(__dirname, "src/main.js"),
      formats: ["cjs"],
      fileName: () => "main.js",
    },
    rollupOptions: {
      external,
      output: {
        exports: "named",
      },
    },
    target: "node18",
    minify: false,
  },
});
