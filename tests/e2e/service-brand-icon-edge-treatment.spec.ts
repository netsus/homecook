import { expect, test } from "@playwright/test";

test("serves dedicated favicon and install icon assets", async ({ page, request }) => {
  await page.goto("/");

  const documentIcons = await page.locator('link[rel~="icon"]').evaluateAll((links) =>
    links.map((link) => ({
      href: link.getAttribute("href"),
      rel: link.getAttribute("rel"),
      sizes: link.getAttribute("sizes"),
      type: link.getAttribute("type"),
    })),
  );
  expect(documentIcons.some((icon) => icon.href?.includes("favicon"))).toBe(true);
  expect(documentIcons.some((icon) => icon.href?.includes("mumeok-symbol-192"))).toBe(false);
  expect(documentIcons.some((icon) => icon.href?.includes("app-icon"))).toBe(false);

  const manifestResponse = await request.get("/manifest.webmanifest");
  expect(manifestResponse.status()).toBe(200);
  expect(manifestResponse.headers()["content-type"]).toContain(
    "application/manifest+json",
  );
  const manifest = await manifestResponse.json();
  expect(manifest.icons).toEqual([
    {
      sizes: "192x192",
      src: "/brand/app-icon-192.png",
      type: "image/png",
    },
    {
      sizes: "512x512",
      src: "/brand/app-icon-512.png",
      type: "image/png",
    },
  ]);

  for (const [route, contentType] of [
    ["/favicon.ico", "image/x-icon"],
    ["/brand/favicon-32.png", "image/png"],
    ["/brand/app-icon-192.png", "image/png"],
    ["/brand/app-icon-512.png", "image/png"],
    ["/brand/apple-touch-icon-180.png", "image/png"],
  ] as const) {
    const response = await request.get(route);
    expect(response.status(), route).toBe(200);
    expect(response.headers()["content-type"], route).toContain(contentType);
  }
});
