import { describe, expect, it } from "vitest";

import {
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
    expect(SURFACE_CHROME_RULES["shopping.flow"]).toMatchObject({
      backFallbackHref: "/planner",
      mobileBottomTab: "planner",
      primaryNavId: "planner",
      showBack: true,
    });
    expect(SURFACE_CHROME_RULES["recipe.detail"]).toMatchObject({
      mobileBottomTab: "home",
      primaryNavId: "home",
      showBack: true,
    });
  });
});
