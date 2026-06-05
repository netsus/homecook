import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const globalsCss = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

function ruleBody(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = globalsCss.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "m"));
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
});
