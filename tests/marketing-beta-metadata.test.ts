import { describe, expect, it } from "vitest";

describe("/beta metadata", () => {
  it("keeps the beta landing noindex and points canonical/open graph at /beta", async () => {
    const page = await import("@/app/beta/page");

    expect(page.metadata).toMatchObject({
      alternates: {
        canonical: "/beta",
      },
      openGraph: {
        images: ["/assets/funnel/share/og-share.png"],
        title: "30초 식단 기록 테스트",
        type: "website",
        url: "/beta",
      },
      robots: {
        follow: false,
        index: false,
      },
      title: "30초 식단 기록 테스트",
      twitter: {
        card: "summary_large_image",
        images: ["/assets/funnel/share/og-share.png"],
        title: "30초 식단 기록 테스트",
      },
    });
  });

  it("keeps the dedicated acquisition landing Lighthouse gate at the approved threshold", async () => {
    const imported = await import("../lighthouserc.marketing.js");
    const config = imported.default;
    const assertions = config.ci.assert.assertions;

    expect(config.ci.collect.settings.onlyCategories).toEqual([
      "performance",
      "accessibility",
    ]);
    expect(config.ci.collect.settings.formFactor).toBe("mobile");
    expect(config.ci.collect.settings.throttlingMethod).toBe("simulate");
    expect(config.ci.collect.settings.throttling).toEqual({
      cpuSlowdownMultiplier: 4,
      rttMs: 100,
      throughputKbps: 4096,
    });
    expect(assertions["categories:performance"]).toEqual([
      "error",
      { minScore: 0.9 },
    ]);
    expect(assertions["categories:accessibility"]).toEqual([
      "error",
      { minScore: 0.9 },
    ]);
    expect(assertions["largest-contentful-paint"]).toEqual([
      "error",
      { maxNumericValue: 2500 },
    ]);
    expect(assertions["cumulative-layout-shift"]).toEqual([
      "error",
      { maxNumericValue: 0.1 },
    ]);
  });
});
