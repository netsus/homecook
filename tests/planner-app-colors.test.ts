import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const globalsCss = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

function tokenValue(tokenName: string) {
  const escapedName = tokenName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = globalsCss.match(new RegExp(`${escapedName}:\\s*([^;]+);`));

  return match?.[1].trim() ?? "";
}

describe("planner app colors", () => {
  it("routes app planner accents through global tokens", () => {
    expect(tokenValue("--planner-add")).toBe("var(--brand)");
    expect(tokenValue("--planner-add-soft")).toBe("var(--brand-soft)");
  });

  it("defines status summary tokens in globals.css", () => {
    expect(tokenValue("--planner-status-cooked")).toBe("#2F8F5B");
    expect(tokenValue("--planner-status-cooked-soft")).toBe("#EAF7EE");
    expect(tokenValue("--planner-status-shopping")).toBe("#B7791F");
    expect(tokenValue("--planner-status-shopping-soft")).toBe("#FFF3D6");
    expect(tokenValue("--planner-status-registered")).toBe("#6B7280");
    expect(tokenValue("--planner-status-registered-strong")).toBe("#374151");
    expect(tokenValue("--planner-status-registered-soft")).toBe("#F3F5F7");
  });
});
