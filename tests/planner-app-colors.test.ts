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
    expect(tokenValue("--brand-primary-accessible")).toBe("#00A1FF");
    expect(tokenValue("--brand-primary-soft")).toBe("rgba(0, 161, 255, 0.08)");
    expect(tokenValue("--brand-primary-border")).toBe("#8BD2FF");
    expect(tokenValue("--brand-primary-rgb")).toBe("0, 161, 255");
    expect(tokenValue("--brand-contrast")).toBe("var(--brand-primary)");
  });

  it("routes app planner accents through global tokens", () => {
    expect(tokenValue("--planner-add")).toBe("var(--text-3)");
    expect(tokenValue("--planner-add-soft")).toBe("transparent");
  });

  it("matches app planner status tokens to the desktop web palette", () => {
    expect(tokenValue("--planner-status-cooked")).toBe("#E94B5F");
    expect(tokenValue("--planner-status-cooked-soft")).toBe("rgba(233, 75, 95, 0.14)");
    expect(tokenValue("--planner-status-shopping")).toBe("#21C36B");
    expect(tokenValue("--planner-status-shopping-soft")).toBe("rgba(33, 195, 107, 0.12)");
    expect(tokenValue("--planner-status-registered")).toBe("#00A1FF");
    expect(tokenValue("--planner-status-registered-strong")).toBe("#007fd0");
    expect(tokenValue("--planner-status-registered-soft")).toBe("rgba(0, 161, 255, 0.08)");
  });

  it("uses a brighter active like color", () => {
    expect(tokenValue("--like-active")).toBe("#ff4f5a");
  });
});
