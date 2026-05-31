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
  it("aligns app brand tokens with the desktop web brand blue", () => {
    expect(tokenValue("--brand-primary")).toBe("#00A1FF");
    expect(tokenValue("--brand-primary-hover")).toBe("#0087d7");
    expect(tokenValue("--brand-primary-accessible")).toBe("#0072BD");
    expect(tokenValue("--brand-primary-soft")).toBe("rgba(0, 161, 255, 0.08)");
    expect(tokenValue("--brand-primary-border")).toBe("#8BD2FF");
    expect(tokenValue("--brand-primary-rgb")).toBe("0, 161, 255");
    expect(tokenValue("--brand-contrast")).toBe("var(--brand-primary-accessible)");
  });

  it("routes app planner accents through global tokens", () => {
    expect(tokenValue("--planner-add")).toBe("var(--brand)");
    expect(tokenValue("--planner-add-soft")).toBe("var(--brand-soft)");
  });

  it("defines status summary tokens in globals.css", () => {
    expect(tokenValue("--planner-status-cooked")).toBe("var(--success)");
    expect(tokenValue("--planner-status-cooked-soft")).toBe("var(--success-soft)");
    expect(tokenValue("--planner-status-shopping")).toBe("var(--warning)");
    expect(tokenValue("--planner-status-shopping-soft")).toBe("var(--warning-soft)");
    expect(tokenValue("--planner-status-registered")).toBe("var(--text-3)");
    expect(tokenValue("--planner-status-registered-strong")).toBe("var(--text-2)");
    expect(tokenValue("--planner-status-registered-soft")).toBe("var(--surface-fill)");
  });
});
