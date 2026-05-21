import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const globalsCss = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

function ruleBody(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = globalsCss.match(new RegExp(`${escapedSelector}\\s*\\{([^}]+)\\}`));

  return match?.[1] ?? "";
}

describe("planner desktop colors", () => {
  it("keeps the web planner on the existing web-owned palette", () => {
    expect(ruleBody(".web-planner-stat-success strong")).toContain(
      "color: var(--web-success);",
    );
    expect(ruleBody(".web-planner-stat-warning strong")).toContain(
      "color: var(--web-warning);",
    );
    expect(ruleBody(".web-planner-meal")).toContain(
      "border-left: 3px solid var(--web-brand);",
    );
    expect(ruleBody(".web-planner-meal-registered")).toContain(
      "border-left-color: var(--web-brand);",
    );
    expect(ruleBody(".web-planner-meal-shopped")).toContain(
      "border-left-color: var(--web-warning);",
    );
    expect(ruleBody(".web-planner-meal-cooked")).toContain(
      "border-left-color: var(--web-success);",
    );
    expect(ruleBody(".web-planner-dot-registered")).toContain(
      "background: var(--web-brand);",
    );
    expect(ruleBody(".web-planner-dot-shopped")).toContain(
      "background: var(--web-warning);",
    );
    expect(ruleBody(".web-planner-dot-cooked")).toContain(
      "background: var(--web-success);",
    );
    expect(ruleBody(".web-planner-add")).toContain(
      "border: 1px dashed var(--web-line-strong);",
    );
    expect(ruleBody(".web-planner-add")).toContain(
      "background: transparent;",
    );
    expect(ruleBody(".web-planner-add")).toContain(
      "color: var(--web-text-3);",
    );
    expect(ruleBody(".web-planner-add:hover")).toContain(
      "border-color: var(--web-brand);",
    );
    expect(ruleBody(".web-planner-add:hover")).toContain(
      "background: var(--web-brand-wash);",
    );
    expect(ruleBody(".web-planner-add:hover")).toContain(
      "color: var(--web-brand-accessible);",
    );
  });
});
