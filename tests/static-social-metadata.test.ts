import { describe, expect, it } from "vitest";

describe("static public social metadata", () => {
  const pageLoaders = {
    about: () => import("@/app/about/page"),
    privacy: () => import("@/app/privacy/page"),
    terms: () => import("@/app/terms/page"),
  } as const;

  it.each([
    ["about", "/about", "무먹 가이드"],
    ["privacy", "/privacy", "개인정보처리방침"],
    ["terms", "/terms", "이용약관"],
  ] as const)("keeps the default social image on %s", async (pageName, url, title) => {
    const page = await pageLoaders[pageName]();

    expect(page.metadata).toMatchObject({
      openGraph: {
        images: ["/opengraph-image"],
        title,
        type: "website",
        url,
      },
    });
  });
});
