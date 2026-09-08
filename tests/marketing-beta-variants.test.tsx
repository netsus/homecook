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

  it("keeps Facebook profile attribution when Meta appends its click identifier", async () => {
    const page = await BetaPage({
      searchParams: Promise.resolve({ profile_source: "facebook", fbclid: "opaque-click-id" }),
    });

    expect(page.props.initialProfileSource).toBe("facebook");
    expect(page.props.initialAttribution).toEqual({
      utm_campaign: "weekly_nutrition_2026",
      utm_content: "profile_link",
      utm_medium: "social_profile",
      utm_source: "facebook",
    });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("keeps the bare Instagram profile cohort when the app decorates the URL", async () => {
    const page = await BetaPage({ searchParams: Promise.resolve({ igsh: "opaque-share-id" }) });

    expect(page.props.initialProfileSource).toBe("instagram");
    expect(page.props.initialAttribution).toEqual(expect.objectContaining({
      utm_content: "profile_link",
      utm_source: "instagram",
    }));
    expect(redirect).not.toHaveBeenCalled();
  });

  it("does not let profile_source override explicit campaign attribution", async () => {
    await expect(Promise.resolve().then(() => BetaPage({ searchParams: Promise.resolve({
      profile_source: "facebook",
      utm_source: "meta",
    }) }))).rejects.toThrow("redirect:");
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
    const page = await BetaPage({ searchParams: Promise.resolve({ ad_variant: variant }) });
    expect(page).toBeTruthy();
    expect(page.props.initialAdVariant).toBe(variant);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("preserves the recognized UTM winner and raw attribution", async () => {
    await expect(Promise.resolve().then(() => BetaPage({ searchParams: Promise.resolve({ ad_variant: "d", utm_content: "hook_cooked_weight" }) }))).rejects.toThrow("redirect:/beta?ad_variant=b&utm_content=hook_cooked_weight");
    expect(resolveMarketingAdVariant("hook_workaround", "b")).toBe("a");
  });

  it("keeps shared results read-only without injecting an ad variant", async () => {
    const page = await BetaPage({ searchParams: Promise.resolve({ result: "pro-measurer", utm_source: "shared-source" }) });
    expect(page).toBeTruthy();
    expect(page.props.initialSharedResult).toBe("pro-measurer");
    expect(page.props.initialAttribution).toEqual({ utm_source: "shared-source" });
    expect(redirect).not.toHaveBeenCalled();
  });

  it.each([null, "default", "d"] as const)("normalizes new view attribution %s to a", (variant) => {
    expect(resolveMarketingAdVariant(null, variant)).toBe("a");
  });
});
