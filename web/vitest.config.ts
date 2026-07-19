import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Mirror the Next "@/..." path alias so tests import the same way app code does.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
  },
});
