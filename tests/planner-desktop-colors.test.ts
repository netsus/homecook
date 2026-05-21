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
  it("uses calmer planner-specific status and add tokens", () => {
    expect(globalsCss).toContain("--planner-status-registered: #6f7f8d;");
    expect(globalsCss).toContain("--planner-status-shopping: #c47a2c;");
    expect(globalsCss).toContain("--planner-status-cooked: #4f8f62;");
    expect(globalsCss).toContain("--planner-add: #1e8ccf;");
    expect(globalsCss).toContain("--planner-add-border: rgba(30, 140, 207, 0.34);");
    expect(globalsCss).toContain("--planner-add-wash: rgba(30, 140, 207, 0.08);");
  });

  it("maps planner status cards, legend dots, and add CTA to that palette", () => {
    expect(ruleBody(".web-planner-meal-registered")).toContain(
      "border-left-color: var(--planner-status-registered);",
    );
    expect(ruleBody(".web-planner-meal-shopped")).toContain(
      "border-left-color: var(--planner-status-shopping);",
    );
    expect(ruleBody(".web-planner-meal-cooked")).toContain(
      "border-left-color: var(--planner-status-cooked);",
    );
    expect(ruleBody(".web-planner-dot-registered")).toContain(
      "background: var(--planner-status-registered);",
    );
    expect(ruleBody(".web-planner-dot-shopped")).toContain(
      "background: var(--planner-status-shopping);",
    );
    expect(ruleBody(".web-planner-dot-cooked")).toContain(
      "background: var(--planner-status-cooked);",
    );
    expect(ruleBody(".web-planner-add")).toContain(
      "border: 1px dashed var(--planner-add-border);",
    );
    expect(ruleBody(".web-planner-add")).toContain(
      "background: var(--planner-add-wash);",
    );
    expect(ruleBody(".web-planner-add")).toContain(
      "color: var(--planner-add);",
    );
    expect(ruleBody(".web-planner-add:hover")).toContain(
      "border-color: var(--planner-add);",
    );
    expect(ruleBody(".web-planner-add:hover")).toContain(
      "background: var(--planner-add-wash);",
    );
    expect(ruleBody(".web-planner-add:hover")).toContain(
      "color: var(--planner-add);",
    );
  });
});
