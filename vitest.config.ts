import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    // Espeja el alias "@/..." de tsconfig para que los tests importen igual.
    alias: { "@": resolve(__dirname, ".") },
  },
});
