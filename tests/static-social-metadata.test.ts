import { describe, expect, it } from "vitest";

describe("static public social metadata", () => {
  it.each([
    ["privacy", "/privacy", "개인정보처리방침"],
    ["terms", "/terms", "이용약관"],
  ])("keeps the default social image on %s", async (pageName, url, title) => {
    const page = pageName === "privacy"
      ? await import("@/app/privacy/page")
      : await import("@/app/terms/page");

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
