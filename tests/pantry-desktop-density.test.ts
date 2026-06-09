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
      "grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));",
    );
    expect(ruleBody(".web-pantry-grid")).toContain("gap: 12px;");
    expect(ruleBody(".web-pantry-card")).toContain(
      "grid-template-columns: 56px minmax(0, 1fr);",
    );
    expect(ruleBody(".web-pantry-card")).toContain("min-height: 84px;");
    expect(ruleBody(".web-pantry-card")).toContain("align-items: center;");
    expect(ruleBody(".web-pantry-card")).toContain("padding: 12px;");
    expect(ruleBody(".web-pantry-emoji")).toContain("width: 56px;");
    expect(ruleBody(".web-pantry-emoji")).toContain("height: 56px;");
    expect(ruleBody(".web-pantry-card-copy")).toContain("min-width: 0;");
  });

  it("keeps input focus states aligned to the blue brand ring across app and web", () => {
    expect(globalsCss).toContain("input:focus-visible,");
    expect(globalsCss).toContain("textarea:focus-visible,");
    expect(globalsCss).toContain("select:focus-visible");
    expect(globalsCss).toContain("border-color: var(--brand);");
    expect(globalsCss).toContain("border-color: var(--web-brand);");
  });
});
