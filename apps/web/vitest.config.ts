// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true, // You can use globals like `expect` without import
    environment: "jsdom", // Set the environment to 'bun'
    watch: false, // Disable watching by default
  },
});
