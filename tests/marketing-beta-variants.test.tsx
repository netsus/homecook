import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { resolveMarketingAdVariant } from "@/lib/marketing/demand-validation";

const redirect = vi.hoisted(() => vi.fn((url: string) => { throw new Error(`redirect:${url}`); }));
vi.mock("next/navigation", () => ({ redirect }));

import BetaPage from "@/app/beta/page";

describe("three active landing variants", () => {
  beforeEach(() => { redirect.mockClear(); vi.stubGlobal("React", React); });

  it("keeps the bare beta profile link without redirecting it into paid variant a", async () => {
    expect(await BetaPage({ searchParams: Promise.resolve({}) })).toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });

  it.each(["instagram", "facebook"])("keeps the explicit %s profile link without an ad-variant redirect", async (profileSource) => {
    expect(await BetaPage({ searchParams: Promise.resolve({ profile_source: profileSource }) })).toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });

  it.each([undefined, "d", "default", "invalid"])("redirects attributed %s to a while retaining query values", async (variant) => {
    await expect(Promise.resolve().then(() => BetaPage({ searchParams: Promise.resolve({
      ...(variant ? { ad_variant: variant } : {}),
      utm_source: ["first source", "second"],
      returnTo: "/planner?segment=log",
    }) }))).rejects.toThrow("redirect:");
    const url = new URL(redirect.mock.calls[0][0], "http://localhost");
    expect(url.pathname).toBe("/beta");
    expect(url.searchParams.getAll("ad_variant")).toEqual(["a"]);
    expect(url.searchParams.getAll("utm_source")).toEqual(["first source", "second"]);
    expect(url.searchParams.get("returnTo")).toBe("/planner?segment=log");
  });

  it.each(["a", "b", "c"])("keeps %s without a redirect", async (variant) => {
    expect(await BetaPage({ searchParams: Promise.resolve({ ad_variant: variant }) })).toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("preserves the recognized UTM winner and raw attribution", async () => {
    await expect(Promise.resolve().then(() => BetaPage({ searchParams: Promise.resolve({ ad_variant: "d", utm_content: "hook_cooked_weight" }) }))).rejects.toThrow("redirect:/beta?ad_variant=b&utm_content=hook_cooked_weight");
    expect(resolveMarketingAdVariant("hook_workaround", "b")).toBe("a");
  });

  it("keeps shared results read-only without injecting an ad variant", async () => {
    expect(await BetaPage({ searchParams: Promise.resolve({ result: "pro-measurer" }) })).toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });

  it.each([null, "default", "d"] as const)("normalizes new view attribution %s to a", (variant) => {
    expect(resolveMarketingAdVariant(null, variant)).toBe("a");
  });
});
