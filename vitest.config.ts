import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx", "lib/**/__tests__/**/*.test.ts", "lib/**/__tests__/**/*.test.tsx"],
    setupFiles: ["tests/setup.ts"],
    globals: true,
  },
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
  resolve: {
    // Espeja el alias "@/..." de tsconfig para que los tests importen igual.
    alias: { "@": resolve(__dirname, ".") },
  },
});
