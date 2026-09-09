import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";
import { ALL_TEST_PATTERNS } from "./tests/helpers/vitest-suite-patterns";
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
    include: ALL_TEST_PATTERNS,
    setupFiles: ["./tests/helpers/vitest-worker-temp.ts"],
  },
});
