import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "./src/index.ts",
  format: "esm",
  outDir: "./dist",
  clean: true,
  noExternal: [/@rms-modern\/.*/],
  external: [
    "@libsql/linux-x64-musl",
    "@libsql/darwin-arm64",
    "@libsql/darwin-x64",
    "bun",
  ],
});
