import { describe, expect, it } from "vitest";

import {
  buildReturnHref,
  resolveReturnHref,
  sanitizeInternalPath,
} from "@/lib/navigation/return-context";
import { resolveMypageRestoreState } from "@/lib/navigation/mypage-return-state";

describe("return context navigation helpers", () => {
  it("accepts only app-internal return paths", () => {
    expect(sanitizeInternalPath("/mypage")).toBe("/mypage");
    expect(sanitizeInternalPath("/mypage?tab=shopping#history")).toBe(
      "/mypage?tab=shopping#history",
    );
    expect(sanitizeInternalPath("https://evil.example/mypage")).toBe("/");
    expect(sanitizeInternalPath("//evil.example/mypage")).toBe("/");
    expect(sanitizeInternalPath("javascript:alert(1)")).toBe("/");
    expect(sanitizeInternalPath("recipe/abc")).toBe("/");
  });

  it("builds target links with encoded return context", () => {
    const href = buildReturnHref("/shopping/lists/list-1?mode=readonly", {
      restore: "shopping-history-tab",
      returnSurface: "mypage.shopping-history",
      returnTo: "/mypage",
    });

    const url = new URL(href, "http://homecook.test");

    expect(url.pathname).toBe("/shopping/lists/list-1");
    expect(url.searchParams.get("mode")).toBe("readonly");
    expect(url.searchParams.get("returnTo")).toBe("/mypage");
    expect(url.searchParams.get("returnSurface")).toBe("mypage.shopping-history");
    expect(url.searchParams.get("restore")).toBe("shopping-history-tab");
  });

  it("resolves return target and carries restoration hints to that target", () => {
    const params = new URLSearchParams({
      restore: "shopping-history-tab",
      returnSurface: "mypage.shopping-history",
      returnTo: "/mypage",
    });

    expect(resolveReturnHref(params, "/planner")).toBe(
      "/mypage?returnSurface=mypage.shopping-history&restore=shopping-history-tab",
    );
  });

  it("falls back when return context is missing or unsafe", () => {
    expect(resolveReturnHref(new URLSearchParams(), "/planner")).toBe("/planner");
    expect(
      resolveReturnHref(
        new URLSearchParams({ returnTo: "https://evil.example" }),
        "/planner",
      ),
    ).toBe("/planner");
  });

  it("normalizes the removed mypage account tab to preferences", () => {
    expect(sanitizeInternalPath("/mypage?tab=account")).toBe(
      "/mypage?tab=preferences",
    );
    expect(
      resolveReturnHref(
        new URLSearchParams({ returnTo: "/mypage?tab=account" }),
        "/mypage?tab=preferences",
      ),
    ).toBe("/mypage?tab=preferences");
  });

  it("maps mypage return context to the initial recipebook surface", () => {
    expect(
      resolveMypageRestoreState(
        new URLSearchParams({
          restore: "recipebook-tab",
          returnSurface: "mypage.recipebooks",
        }),
      ),
    ).toEqual({ activeTab: "recipebooks", mobileSurface: "recipebook" });
  });

  it("maps mypage return context to the initial shopping history surface", () => {
    expect(
      resolveMypageRestoreState(
        new URLSearchParams({
          restore: "shopping-history-tab",
          returnSurface: "mypage.shopping-history",
        }),
      ),
    ).toEqual({ activeTab: "shopping", mobileSurface: "shopping" });
  });

  it("maps leftovers return context to the initial leftovers tab", () => {
    expect(
      resolveMypageRestoreState(
        new URLSearchParams({
          restore: "mypage-home",
          returnSurface: "mypage.leftovers",
        }),
      ),
    ).toEqual({ activeTab: "leftovers", mobileSurface: "home" });
  });

  it("maps eaten-list return context to the initial eaten tab", () => {
    expect(
      resolveMypageRestoreState(
        new URLSearchParams({
          restore: "eaten-list-tab",
          returnSurface: "mypage.eaten-list",
        }),
      ),
    ).toEqual({ activeTab: "eaten", mobileSurface: "home" });
  });
});
