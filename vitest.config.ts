import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";
import { establishOwnedVitestSuiteTemp } from "./tests/helpers/vitest-owned-suite-temp";

establishOwnedVitestSuiteTemp();

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    setupFiles: ["./tests/helpers/vitest-worker-temp.ts"],
  },
});
