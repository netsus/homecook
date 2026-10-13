import { describe, expect, it } from "vitest";
import {
  buildHomeDiscoveryHref,
  HOME_DISCOVERY_SCROLL_STATE_KEY,
  readHomeDiscoveryScrollState,
  readHomeDiscoveryReturnScrollState,
  readHomeDiscoveryState,
} from "@/lib/navigation/home-discovery-state";

const INGREDIENT_ID = "550e8400-e29b-41d4-a716-446655440010";

describe("home discovery URL and history state", () => {
  it("uses clean defaults for a direct home link", () => {
    expect(readHomeDiscoveryState(new URLSearchParams())).toEqual({
      query: "", sort: "view_count", ingredientIds: [], tagKey: null, themeId: null,
    });
  });

  it("restores query, sort, ingredient, tag, and theme together", () => {
    const state = readHomeDiscoveryState(new URLSearchParams({
      q: "두부", sort: "latest", ingredient_ids: `${INGREDIENT_ID},invalid,${INGREDIENT_ID}`,
      tag: "한식", theme: "theme-1",
    }));
    expect(state).toEqual({
      query: "두부", sort: "latest", ingredientIds: [INGREDIENT_ID], tagKey: "한식", themeId: "theme-1",
    });
    const href = buildHomeDiscoveryHref("/?utm_source=test#recipes", state);
    const url = new URL(href, "http://homecook.local");
    expect(url.searchParams.get("q")).toBe("두부");
    expect(url.searchParams.get("sort")).toBe("latest");
    expect(url.searchParams.get("ingredient_ids")).toBe(INGREDIENT_ID);
    expect(url.searchParams.get("tag")).toBe("한식");
    expect(url.searchParams.get("theme")).toBe("theme-1");
    expect(url.searchParams.get("utm_source")).toBe("test");
    expect(url.hash).toBe("#recipes");
  });

  it("removes reset filters and default sorting without dropping unrelated URL values", () => {
    const state = readHomeDiscoveryState(new URLSearchParams("sort=unknown"));
    expect(buildHomeDiscoveryHref("/?q=old&sort=latest&ingredient_ids=old&tag=old&theme=old&utm_source=test", state))
      .toBe("/?utm_source=test");
  });

  it("restores scroll only for the matching browser history entry", () => {
    const state = { [HOME_DISCOVERY_SCROLL_STATE_KEY]: { href: "/?q=tofu", top: 725, pages: 2 } };
    expect(readHomeDiscoveryScrollState(state, "/?q=tofu")).toEqual({ top: 725, pages: 2 });
    expect(readHomeDiscoveryScrollState(state, "/")).toBeNull();
    expect(readHomeDiscoveryScrollState(null, "/")).toBeNull();
  });

  it("accepts same-tab scroll only on an explicit matching home action return", () => {
    const raw = JSON.stringify({ href: "/?q=tofu&sort=latest", top: 725, pages: 2 });
    expect(readHomeDiscoveryReturnScrollState(raw, "/?q=tofu&sort=latest&returnSurface=home"))
      .toEqual({ top: 725, pages: 2 });
    expect(readHomeDiscoveryReturnScrollState(raw, "/?q=tofu&sort=latest")).toBeNull();
    expect(readHomeDiscoveryReturnScrollState(raw, "/?q=other&sort=latest&returnSurface=home")).toBeNull();
    expect(readHomeDiscoveryReturnScrollState(raw, "/?q=tofu&sort=latest&returnSurface=planner.week")).toBeNull();
    expect(readHomeDiscoveryReturnScrollState("{bad", "/?returnSurface=home")).toBeNull();
  });

  it("keeps repeated home returns compatible after consuming a marked source URL", () => {
    const href = "/?q=tofu&sort=latest&returnSurface=home";
    const raw = JSON.stringify({ href, top: 725, pages: 1 });
    expect(readHomeDiscoveryReturnScrollState(raw, href)).toEqual({ top: 725, pages: 1 });
  });

  it.each([
    { top: -1, pages: 1 }, { top: Number.NaN, pages: 1 }, { top: "725", pages: 1 },
    { top: 0, pages: 0 }, { top: 0, pages: 1.5 },
  ])("rejects invalid scroll state %o", (value) => {
    expect(readHomeDiscoveryScrollState({ [HOME_DISCOVERY_SCROLL_STATE_KEY]: { href: "/", ...value } }, "/")).toBeNull();
  });
});
