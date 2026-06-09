import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const globalsCss = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

function ruleBody(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = Array.from(
    globalsCss.matchAll(new RegExp(`${escapedSelector}\\s*\\{([^}]+)\\}`, "g")),
  );

  return matches.at(-1)?.[1] ?? "";
}

function ruleBodyPattern(selectorPattern: string) {
  const match = globalsCss.match(new RegExp(`${selectorPattern}\\s*\\{([^}]+)\\}`));

  return match?.[1] ?? "";
}

describe("planner desktop colors", () => {
  it("routes the web planner through shared planner status tokens", () => {
    expect(ruleBody(".web-planner-stat-success strong")).toContain(
      "color: var(--planner-status-cooked);",
    );
    expect(ruleBody(".web-planner-stat-warning strong")).toContain(
      "color: var(--planner-status-shopping);",
    );
    expect(ruleBody(".web-planner-stat-registered strong")).toContain(
      "color: var(--planner-status-registered);",
    );
    expect(ruleBody(".web-planner-meal")).toContain(
      "border: 1px solid var(--web-line);",
    );
    expect(ruleBody(".web-planner-meal-status")).toContain(
      "border: 1px solid transparent;",
    );
    expect(ruleBody(".web-planner-meal-status")).toContain("width: 18px;");
    expect(ruleBody(".web-planner-meal-status")).toContain("height: 7px;");
    expect(ruleBody(".web-planner-meal-status-registered")).toContain(
      "background: var(--planner-status-registered);",
    );
    expect(ruleBody(".web-planner-meal-status-shopped")).toContain(
      "background: var(--planner-status-shopping);",
    );
    expect(ruleBody(".web-planner-meal-status-cooked")).toContain(
      "background: var(--planner-status-cooked);",
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
    expect(ruleBody(".web-meal-status-shopped")).toContain(
      "color: var(--planner-status-shopping);",
    );
    expect(ruleBodyPattern("\\.web-meal-status-cooked,\\s+\\.web-meal-leftover")).toContain(
      "color: var(--planner-status-cooked);",
    );
    expect(ruleBody(".web-meal-list-delete .web-meal-delete-button")).toContain(
      "color: var(--web-error);",
    );
  });

  it("matches the desktop meal serving stepper to the app control treatment", () => {
    expect(ruleBody(".web-meal-inline-stepper")).toContain(
      "background: var(--surface-fill);",
    );
    expect(ruleBody(".web-meal-inline-stepper")).toContain("padding: 4px 7px;");
    expect(ruleBody(".web-meal-inline-stepper button")).toContain(
      "place-items: center;",
    );
    expect(ruleBody(".web-meal-inline-stepper button")).toContain(
      "border: 1px solid var(--line-strong);",
    );
    expect(ruleBody(".web-meal-inline-stepper button")).toContain("width: 38px;");
    expect(ruleBody(".web-meal-inline-stepper button")).toContain("height: 38px;");
    expect(ruleBody(".web-meal-inline-stepper button")).toContain("line-height: 0;");
    expect(ruleBody(".web-meal-inline-stepper button")).toContain("font-weight: 500;");
    expect(ruleBody(".web-meal-stepper-symbol")).toContain("transform: translateY(-1px);");
  });

  it("matches the desktop meal add CTA to the app outline treatment", () => {
    expect(ruleBody(".web-meal-add-link")).toContain(
      "border: 1px solid var(--web-brand);",
    );
    expect(ruleBody(".web-meal-add-link")).toContain("background: transparent;");
    expect(ruleBody(".web-meal-add-link")).toContain(
      "color: var(--web-brand-accessible);",
    );
  });

  it("keeps desktop meal titles readable without overflowing card height", () => {
    expect(ruleBody(".web-meal-title-button")).toContain("-webkit-line-clamp: 2;");
    expect(ruleBody(".web-meal-title-button")).toContain("line-clamp: 2;");
    expect(ruleBody(".web-meal-title-button")).toContain("overflow-wrap: anywhere;");
    expect(ruleBody(".web-meal-title-button")).toContain("max-height: calc(1.3em * 2);");
  });

  it("uses the same wide web container outside login surfaces", () => {
    expect(ruleBody(".web-shell:not(.web-login-shell) .web-container")).toContain(
      "max-width: var(--web-content-wide);",
    );
  });
});
