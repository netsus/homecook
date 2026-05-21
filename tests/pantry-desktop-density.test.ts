import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const globalsCss = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

function ruleBody(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = globalsCss.match(new RegExp(`${escapedSelector}\\s*\\{([^}]+)\\}`));

  return match?.[1] ?? "";
}

describe("pantry desktop density", () => {
  it("keeps pantry ingredient cards compact enough for large catalogs", () => {
    expect(ruleBody(".web-pantry-grid")).toContain(
      "grid-template-columns: repeat(6, minmax(0, 1fr));",
    );
    expect(ruleBody(".web-pantry-grid")).toContain("gap: 10px;");
    expect(ruleBody(".web-pantry-card")).toContain("min-height: 118px;");
    expect(ruleBody(".web-pantry-card")).toContain("padding: 10px;");
    expect(ruleBody(".web-pantry-emoji")).toContain("width: 48px;");
    expect(ruleBody(".web-pantry-emoji")).toContain("height: 48px;");
  });
});
