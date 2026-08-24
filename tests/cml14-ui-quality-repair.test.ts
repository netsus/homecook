import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const globalsCss = readFileSync("app/globals.css", "utf8");

function tokenValue(tokenName: string) {
  const escapedName = tokenName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = globalsCss.match(new RegExp(`${escapedName}:\\s*([^;]+);`));

  return match?.[1].trim() ?? "";
}

function ruleBody(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = globalsCss.match(new RegExp(`${escapedSelector}\\s*\\{([^}]+)\\}`));

  return match?.[1] ?? "";
}

function contrastRatio(foreground: string, background: string) {
  const luminance = (hex: string) => {
    const channels = hex
      .slice(1)
      .match(/.{2}/g)!
      .map((channel) => Number.parseInt(channel, 16) / 255)
      .map((channel) =>
        channel <= 0.04045
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4,
      );

    return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
  };

  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));

  return (lighter + 0.05) / (darker + 0.05);
}

describe("#14 Stage 4 UI quality repair regressions", () => {
  it("keeps text brand aliases at WCAG AA contrast on white surfaces", () => {
    const accessibleBrand = tokenValue("--brand-primary-accessible");
    const accessibleBrandHover = tokenValue("--brand-primary-accessible-hover");

    expect(contrastRatio(accessibleBrand, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(accessibleBrandHover, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(tokenValue("--brand-contrast")).toBe(
      "var(--brand-primary-accessible)",
    );
  });

  it("keeps shared profile and back controls at least 44px square", () => {
    expect(Number.parseFloat(tokenValue("--app-back-button-size"))).toBeGreaterThanOrEqual(44);

    const profileButton = ruleBody(".profile-summary .web-profile-button");
    expect(profileButton).toContain("width: 44px;");
    expect(profileButton).toContain("height: 44px;");
  });

  it("gives HOME tag rails permitted labelled semantics", () => {
    const source = readFileSync("components/home/home-screen.tsx", "utf8");

    expect(source).toContain('role="status"');
    expect(source).toMatch(
      /<div[^>]+aria-label="태그 필터"[^>]+role="group"|<div[^>]+role="group"[^>]+aria-label="태그 필터"/u,
    );
  });

  it("keeps the HOME search input itself at least 44px high", () => {
    expect(ruleBody(".home-mobile-search-bar input")).toContain(
      "min-height: 44px;",
    );
  });

  it("makes every mobile cook-mode scroll region keyboard focusable and named", () => {
    for (const file of [
      "components/cooking/cook-mode-mobile-ui.tsx",
      "components/cooking/cook-mode-loading-board.tsx",
      "components/cooking/snapshot-v2-cook-mode-view.tsx",
    ]) {
      const source = readFileSync(file, "utf8");
      const scrollRegion = source.match(
        /<main[\s\S]*?overflow-y-auto[\s\S]*?>/u,
      )?.[0];

      expect(scrollRegion, file).toContain('aria-label="요리 내용"');
      expect(scrollRegion, file).toContain("tabIndex={0}");
    }
  });

  it("keeps LEFTOVERS app-bar links at least 44px high", () => {
    const source = readFileSync("components/leftovers/leftovers-screen.tsx", "utf8");
    const mobileAppBar = source.slice(source.indexOf("function MobileAppBar"));

    expect(mobileAppBar).toContain("h-11 w-11");
    expect(mobileAppBar).toContain("min-h-11");
  });
});
