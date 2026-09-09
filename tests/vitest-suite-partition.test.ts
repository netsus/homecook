import { readdirSync } from "node:fs";
import { matchesGlob } from "node:path";

import { describe, expect, it, vi } from "vitest";
import { configDefaults } from "vitest/config";

vi.mock("./helpers/vitest-owned-suite-temp", () => ({
  establishOwnedVitestSuiteTemp: vi.fn(),
}));

import fullConfig from "../vitest.config";
import harnessConfig from "../vitest.harness.config";
import productConfig from "../vitest.product.config";

function selects(config: typeof fullConfig, file: string) {
  return config.test!.include!.some((pattern) => matchesGlob(file, pattern))
    && !(config.test!.exclude ?? configDefaults.exclude).some((pattern) => matchesGlob(file, pattern));
}

const testFiles = readdirSync("tests", { recursive: true })
  .filter((file): file is string => typeof file === "string")
  .map((file) => `tests/${file}`)
  .filter((file) => selects(fullConfig, file));

describe("Vitest suite partition", () => {
  it("selects every discovered test exactly once across product and harness", () => {
    const incorrectlySelected = testFiles.filter((file) =>
      Number(selects(productConfig, file)) + Number(selects(harnessConfig, file)) !== 1,
    );
    expect(incorrectlySelected).toEqual([]);
  });

  it("keeps unknown new tests in product, including harness-like names and nested files", () => {
    for (const file of ["tests/future-widget.test.tsx", "tests/omo-future.test.ts", "tests/new/nested.test.ts"]) {
      expect(selects(fullConfig, file)).toBe(true);
      expect(selects(productConfig, file)).toBe(true);
      expect(selects(harnessConfig, file)).toBe(false);
    }
  });

  it("requires an explicit existing harness file list without duplicate entries", () => {
    const harnessFiles = harnessConfig.test!.include!;
    expect(harnessFiles.filter((file) => !testFiles.includes(file))).toEqual([]);
    expect(new Set(harnessFiles).size).toBe(harnessFiles.length);
  });

  it("preserves UI-sensitive evidence and local runtime checks in product", () => {
    for (const file of ["tests/authority-evidence-presence.test.ts", "tests/dev-local-supabase-runtime.test.ts"]) {
      expect(selects(productConfig, file)).toBe(true);
      expect(selects(harnessConfig, file)).toBe(false);
    }
    expect(selects(harnessConfig, "tests/production-release-rulesets-c2.test.ts")).toBe(true);
  });
});
