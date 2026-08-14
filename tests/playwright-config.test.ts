import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("Playwright QA server configuration", () => {
  it("uses the repository-standard Turbopack dev server", () => {
    const config = readFileSync(
      resolve(process.cwd(), "playwright.config.ts"),
      "utf8",
    );

    expect(config).toContain("next dev --turbopack");
  });

  it("starts the QA server with the local-only auth authority", () => {
    const config = readFileSync(
      resolve(process.cwd(), "playwright.config.ts"),
      "utf8",
    );

    expect(config).toContain("HOMECOOK_AUTH_AUTHORITY=local");
  });

  it("allows only a tiny absolute pixel variance for the ingredient modal", () => {
    const visualSpec = readFileSync(
      resolve(process.cwd(), "tests/e2e/qa-visual.spec.ts"),
      "utf8",
    );
    const ingredientModalAssertion = visualSpec.match(
      /toHaveScreenshot\("qa-ingredient-filter-modal\.png", \{[\s\S]*?\}\);/,
    );

    expect(ingredientModalAssertion?.[0]).toContain("maxDiffPixels: 64");
  });
});
