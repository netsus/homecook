import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const globals = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

function readRule(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = globals.match(
    new RegExp(`(?:^|\\n)\\s*${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`, "u"),
  );

  return match?.[1] ?? "";
}

describe("manual UI/UX layout policy", () => {
  it("keeps shopping checkboxes visually compact and consistent", () => {
    const selectAllRule = readRule(".shopping-select-all-control");
    const selectAllBoxRule = readRule(".shopping-select-all-control > span");
    const selectAllCheckedRule = readRule(
      '.shopping-select-all-control[aria-checked="true"] > span',
    );
    const webShoppingCheckRule = readRule(
      ".web-shopping-recipe-toggle,\n  .web-shopping-check",
    );
    const webShoppingCheckedRule = readRule(
      '.web-shopping-recipe-card-selected .web-shopping-recipe-toggle,\n  .web-shopping-check[aria-checked="true"]',
    );

    expect(selectAllRule).toContain("color: var(--web-text-1, #212529)");
    expect(selectAllBoxRule).toContain("border-radius: var(--radius-badge)");
    expect(selectAllBoxRule).toContain("color: var(--web-text-inverse, #fff)");
    expect(selectAllCheckedRule).toContain("border-color: var(--web-brand, var(--brand))");
    expect(selectAllCheckedRule).toContain("background: var(--web-brand, var(--brand))");
    expect(selectAllCheckedRule).toContain("color: var(--web-text-inverse, #fff)");
    expect(webShoppingCheckRule).toContain("width: 32px");
    expect(webShoppingCheckRule).toContain("height: 32px");
    expect(webShoppingCheckRule).toContain("min-width: 32px");
    expect(webShoppingCheckRule).toContain("min-height: 32px");
    expect(webShoppingCheckRule).toContain("color: var(--web-text-inverse)");
    expect(webShoppingCheckedRule).toContain("border-color: var(--web-brand)");
    expect(webShoppingCheckedRule).toContain("background: var(--web-brand)");
    expect(webShoppingCheckedRule).toContain("color: var(--web-text-inverse)");
  });

  it("keeps shopping preparation cards dense without hiding title link affordance on web", () => {
    const recipeCardRule = readRule(".web-shopping-recipe-card");
    const recipeCopyRule = readRule(".web-shopping-recipe-copy");
    const recipeThumbRule = readRule(".web-shopping-recipe-thumb");

    expect(recipeCardRule).toContain("grid-template-columns: 32px 52px minmax(0, 1fr)");
    expect(recipeCardRule).toContain("align-items: center");
    expect(recipeCardRule).toContain("padding: 14px");
    expect(recipeCopyRule).toContain("gap: 6px");
    expect(recipeThumbRule).toContain("width: 52px");
    expect(recipeThumbRule).toContain("height: 52px");
  });

  it("keeps web meal-add target chips vertically centered", () => {
    const targetRule = readRule(".web-meal-add-target");
    const targetIconRule = readRule(".web-meal-add-target svg");

    expect(targetRule).toContain("min-height: 28px");
    expect(targetRule).toContain("padding: 0 12px");
    expect(targetRule).toContain("line-height: 1");
    expect(targetIconRule).toContain("display: block");
    expect(targetIconRule).toContain("flex-shrink: 0");
  });

  it("keeps web mypage tab icons centered inside non-clipping wrappers", () => {
    const tabRule = readRule(".web-mypage-tabs .web-tab");
    const iconWrapperRule = readRule(".web-mypage-tabs .web-tab-icon");
    const iconSvgRule = readRule(".web-mypage-tabs .web-tab-icon-svg");

    expect(tabRule).toContain("line-height: 1");
    expect(iconWrapperRule).toContain("width: 22px");
    expect(iconWrapperRule).toContain("height: 22px");
    expect(iconWrapperRule).toContain("place-items: center");
    expect(iconWrapperRule).toContain("overflow: visible");
    expect(iconSvgRule).toContain("display: block");
    expect(iconSvgRule).toContain("overflow: visible");
    expect(iconSvgRule).toContain("flex-shrink: 0");
  });

  it("keeps cook mode whole-board steps compact with ingredient emphasis", () => {
    const boardRule = readRule(".cook-whole-board");
    const panelRule = readRule(".cook-whole-panel");
    const methodTagRule = readRule(".cook-whole-method-tag");
    const stepNumberRule = readRule(".cook-whole-step-number");
    const stepCopyRule = readRule(".cook-whole-step-copy p");
    const ingredientHighlightRule = readRule(".cook-whole-step-ingredient");
    const webBoardRule = readRule(".web-cook-whole-board");
    const webGridRule = readRule(".web-cook-whole-grid");

    expect(boardRule).toContain("gap: 10px");
    expect(panelRule).toContain("padding: 12px");
    expect(methodTagRule).toContain("min-height: 22px");
    expect(methodTagRule).toContain("padding: 0 8px");
    expect(stepNumberRule).toContain("width: 34px");
    expect(stepNumberRule).toContain("height: 34px");
    expect(stepCopyRule).toContain("font-weight: 500");
    expect(stepCopyRule).toContain("line-height: 1.42");
    expect(ingredientHighlightRule).toContain("color: var(--brand)");
    expect(ingredientHighlightRule).toContain("font-weight: 850");
    expect(webBoardRule).toContain("height: max(640px, calc(100dvh - var(--web-nav-h) - 40px))");
    expect(webBoardRule).toContain("overflow: hidden");
    expect(webGridRule).toContain("min-height: 0");
    expect(webGridRule).toContain("padding: 16px");
  });
});
