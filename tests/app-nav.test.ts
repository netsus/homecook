import { describe, expect, it } from "vitest";

import {
  getSurfaceChromeRule,
  PRIMARY_MOBILE_TAB_ITEMS,
  PRIMARY_WEB_NAV_ITEMS,
  SURFACE_CHROME_RULES,
} from "@/lib/navigation/app-nav";

describe("app navigation chrome rules", () => {
  it("keeps the guide web-only while mobile remains four tabs", () => {
    expect(PRIMARY_WEB_NAV_ITEMS.map((item) => [item.label, item.href])).toEqual([
      ["홈", "/"],
      ["플래너", "/planner"],
      ["팬트리", "/pantry"],
      ["마이페이지", "/mypage"],
      ["집밥 가이드", "/about"],
    ]);
    expect(PRIMARY_MOBILE_TAB_ITEMS.map((item) => item.href)).toEqual([
      "/",
      "/planner",
      "/pantry",
      "/mypage",
    ]);
    expect(PRIMARY_MOBILE_TAB_ITEMS.some((item) => String(item.href) === "/about")).toBe(false);
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
    const validWebIds = new Set(PRIMARY_WEB_NAV_ITEMS.map((item) => item.id));
    const validMobileIds = new Set(PRIMARY_MOBILE_TAB_ITEMS.map((item) => item.id));

    for (const rule of Object.values(SURFACE_CHROME_RULES)) {
      expect(validWebIds.has(rule.primaryNavId)).toBe(true);
      expect(validMobileIds.has(rule.mobileBottomTab)).toBe(true);

      if (rule.showBack) {
        expect(rule.backFallbackHref).toMatch(/^\//);
      }
    }
  });
});
