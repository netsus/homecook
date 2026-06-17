import { describe, expect, it } from "vitest";

import {
  getSurfaceChromeRule,
  PRIMARY_MOBILE_TAB_ITEMS,
  PRIMARY_WEB_NAV_ITEMS,
  SURFACE_CHROME_RULES,
} from "@/lib/navigation/app-nav";

describe("app navigation chrome rules", () => {
  it("keeps global web and mobile navigation targets aligned", () => {
    expect(PRIMARY_WEB_NAV_ITEMS.map((item) => item.href)).toEqual(
      PRIMARY_MOBILE_TAB_ITEMS.map((item) => item.href),
    );
  });

  it("maps detail flows back to the owning global tab", () => {
    expect(getSurfaceChromeRule("shopping.flow")).toMatchObject({
      backFallbackHref: "/planner",
      mobileBottomTab: "planner",
      primaryNavId: "planner",
      showBack: true,
    });
    expect(getSurfaceChromeRule("recipe.detail")).toMatchObject({
      mobileBottomTab: "home",
      primaryNavId: "home",
      showBack: true,
    });
    expect(getSurfaceChromeRule("recipebook.detail")).toMatchObject({
      backFallbackHref: "/mypage?tab=recipebooks",
      mobileBottomTab: "mypage",
      primaryNavId: "mypage",
      showBack: true,
    });
  });

  it("keeps every surface chrome rule mapped to valid global navigation", () => {
    const validIds = new Set(PRIMARY_WEB_NAV_ITEMS.map((item) => item.id));

    for (const rule of Object.values(SURFACE_CHROME_RULES)) {
      expect(validIds.has(rule.primaryNavId)).toBe(true);
      expect(validIds.has(rule.mobileBottomTab)).toBe(true);

      if (rule.showBack) {
        expect(rule.backFallbackHref).toMatch(/^\//);
      }
    }
  });
});
