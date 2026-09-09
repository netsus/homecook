import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";
import { HARNESS_TEST_FILES } from "./tests/helpers/vitest-suite-patterns";
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
    include: HARNESS_TEST_FILES,
    setupFiles: ["./tests/helpers/vitest-worker-temp.ts"],
  },
});
