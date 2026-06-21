import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const globalsCss = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

function ruleBody(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = globalsCss.match(
    new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`, "m"),
  );
  return match?.[1] ?? "";
}

describe("shopping pantry reflection popup styles", () => {
  it("keeps desktop amount labels away from the scroll edge", () => {
    expect(ruleBody(".web-reflect-item")).toContain("padding: 0 22px 0 12px;");
    expect(ruleBody(".web-reflect-item small")).toContain("margin-right: 8px;");
  });
});

describe("shopping detail styles", () => {
  it("makes the web progress title prominent", () => {
    const titleRule = ruleBody(".web-shopping-progress-title-row span:first-child");

    expect(titleRule).toContain("font-size: 17px;");
    expect(titleRule).toContain("font-weight: 900;");
  });

  it("uses success green for completed read-only check indicators", () => {
    const completeCheckRule = ruleBody(".web-shopping-check-complete");

    expect(completeCheckRule).toContain("border-color: var(--web-success);");
    expect(completeCheckRule).toContain("background: rgba(26, 174, 57, 0.1);");
    expect(completeCheckRule).toContain("color: var(--web-success);");
  });

  it("lays out web item name and amount horizontally with stronger names", () => {
    const copyRule = ruleBody(".web-shopping-item-copy");
    const nameRule = ruleBody(".web-shopping-item-copy strong");
    const amountRule = ruleBody(".web-shopping-item-copy small");

    expect(copyRule).toContain("display: flex;");
    expect(copyRule).toContain("align-items: baseline;");
    expect(copyRule).toContain("justify-content: space-between;");
    expect(copyRule).toContain("gap: 14px;");
    expect(nameRule).toContain("font-size: 15px;");
    expect(amountRule).toContain("font-size: 13px;");
    expect(amountRule).toContain("white-space: nowrap;");
  });

  it("keeps pantry reflection sections visually separated", () => {
    const listRule = ruleBody(".web-reflect-list");
    const sectionRule = ruleBody(".web-reflect-section");
    const titleRule = ruleBody(".web-reflect-section-title");
    const sectionListRule = ruleBody(".web-reflect-section-list");

    expect(listRule).toContain("gap: 14px;");
    expect(sectionRule).toContain("display: grid;");
    expect(titleRule).toContain("justify-content: space-between;");
    expect(titleRule).toContain("font-weight: 900;");
    expect(sectionListRule).toContain("gap: 8px;");
  });
});
