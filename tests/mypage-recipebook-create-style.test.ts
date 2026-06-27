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
});
