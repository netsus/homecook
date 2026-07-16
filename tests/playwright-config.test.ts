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
});
