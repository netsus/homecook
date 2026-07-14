import { describe, expect, it } from "vitest";

describe("static public social metadata", () => {
  const pageLoaders = {
    about: () => import("@/app/about/page"),
    home: () => import("@/app/page"),
    privacy: () => import("@/app/privacy/page"),
    terms: () => import("@/app/terms/page"),
  } as const;

  it.each([
    ["about", "/about", "무먹 가이드"],
    ["home", "/", undefined],
    ["privacy", "/privacy", "개인정보처리방침"],
    ["terms", "/terms", "이용약관"],
  ] as const)("keeps the default social image on %s", async (pageName, url, title) => {
    const page = await pageLoaders[pageName]();

    expect(page.metadata).toMatchObject({
      openGraph: {
        url,
      },
    });

    if (pageName === "home") {
      expect(page.metadata.openGraph).toMatchObject({
        images: [
          {
            alt: "무엇을 먹든 — 레시피부터 장보기, 요리 기록까지",
            height: 630,
            type: "image/png",
            url: "/brand/og-image-1200x630.png",
            width: 1200,
          },
        ],
        locale: "ko_KR",
        siteName: "무엇을 먹든",
        type: "website",
      });
      return;
    }

    expect(page.metadata.openGraph).toMatchObject({
      images: ["/brand/og-image-1200x630.png"],
      title,
      type: "website",
    });
  });
});
