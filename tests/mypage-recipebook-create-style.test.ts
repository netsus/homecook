import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const GLOBAL_CSS = readFileSync("app/globals.css", "utf8");

function readRule(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = GLOBAL_CSS.match(
    new RegExp(`${escapedSelector}\\s*\\{([^}]+)\\}`),
  );

  return match?.[1] ?? "";
}

describe("mypage recipebook create styles", () => {
  it("removes the inner focus box from the web recipebook create input", () => {
    const panelRule = readRule(".web-recipebooks-create-panel");
    const panelFocusRule = readRule(".web-recipebooks-create-panel:focus-within");
    const inputRule = readRule(".web-recipebooks-create-panel input");
    const inputFocusRule = readRule(
      ".web-recipebooks-create-panel input:focus-visible",
    );

    expect(panelRule).toContain("border: 1px solid var(--web-brand);");
    expect(panelFocusRule).toContain("box-shadow:");
    expect(panelFocusRule).toContain("0 0 0 3px rgba(0, 161, 255, 0.16)");
    expect(panelFocusRule).toContain("0 12px 26px rgba(61, 42, 23, 0.12)");
    expect(inputRule).toContain("appearance: none;");
    expect(inputRule).toContain("background: transparent;");
    expect(inputRule).toContain("box-shadow: none;");
    expect(inputRule).toContain("outline: 0;");
    expect(inputFocusRule).toContain("box-shadow: none;");
    expect(inputFocusRule).toContain("outline: 0;");
  });

  it("renders mobile recipebook create actions as real buttons", () => {
    const primaryRule = readRule(".mobile-recipebooks-create-action");
    const secondaryRule = readRule(".mobile-recipebooks-create-cancel");

    expect(primaryRule).toContain("display: inline-flex;");
    expect(primaryRule).toContain("min-height: 36px;");
    expect(primaryRule).toContain("border-radius: 999px;");
    expect(primaryRule).toContain("background: #00a1ff;");
    expect(primaryRule).toContain("color: white;");
    expect(primaryRule).toContain("white-space: nowrap;");
    expect(secondaryRule).toContain("display: inline-flex;");
    expect(secondaryRule).toContain("min-height: 36px;");
    expect(secondaryRule).toContain("border-radius: 999px;");
    expect(secondaryRule).toContain("border: 1px solid rgba(0, 161, 255, 0.22);");
    expect(secondaryRule).toContain("background: rgba(255, 255, 255, 0.92);");
    expect(secondaryRule).toContain("white-space: nowrap;");
  });
});
