// @vitest-environment jsdom

import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const OLD_PREVIEW_ORIGIN = "https://homecook-flame.vercel.app";
const TEST_SITE_ORIGIN = "https://zipbap.example";

function readSource(sourcePath: string) {
  return readFileSync(resolve(process.cwd(), sourcePath), "utf8");
}

async function importWithSiteEnv<T>(loader: () => Promise<T>) {
  vi.resetModules();
  process.env.NEXT_PUBLIC_SITE_URL = TEST_SITE_ORIGIN;
  process.env.NEXT_PUBLIC_SERVICE_CONTACT_EMAIL = "help@zipbap.example";
  return loader();
}

describe("launch readiness legal and SEO routes", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.NEXT_PUBLIC_SERVICE_CONTACT_EMAIL;
  });

  it("renders the privacy page with required policy sections", async () => {
    const page = await importWithSiteEnv(() => import("@/app/privacy/page"));
    const html = renderToStaticMarkup(React.createElement(page.default));

    expect(page.metadata).toMatchObject({
      alternates: { canonical: "/privacy" },
      title: "개인정보처리방침",
    });
    expect(html).toContain("개인정보처리방침");
    expect(html).toContain("수집하는 개인정보");
    expect(html).toContain("보유 및 이용 기간");
    expect(html).toContain("제3자 제공");
    expect(html).toContain("위탁 및 국외 이전");
    expect(html).toContain("help@zipbap.example");
  });

  it("renders the terms page with required service terms sections", async () => {
    const page = await importWithSiteEnv(() => import("@/app/terms/page"));
    const html = renderToStaticMarkup(React.createElement(page.default));

    expect(page.metadata).toMatchObject({
      alternates: { canonical: "/terms" },
      title: "이용약관",
    });
    expect(html).toContain("이용약관");
    expect(html).toContain("서비스 범위");
    expect(html).toContain("계정과 탈퇴");
    expect(html).toContain("금지행위");
    expect(html).toContain("책임의 제한");
    expect(html).toContain("help@zipbap.example");
  });

  it("publishes robots.txt and sitemap.xml from the configured public site URL", async () => {
    const [{ default: robots }, { default: sitemap }] = await Promise.all([
      importWithSiteEnv(() => import("@/app/robots")),
      importWithSiteEnv(() => import("@/app/sitemap")),
    ]);

    const robotsResult = robots();
    const sitemapResult = sitemap();
    const sitemapUrls = sitemapResult.map((entry) => entry.url);

    expect(robotsResult).toMatchObject({
      rules: {
        allow: "/",
        userAgent: "*",
      },
      sitemap: `${TEST_SITE_ORIGIN}/sitemap.xml`,
    });
    expect(sitemapUrls).toEqual([
      TEST_SITE_ORIGIN,
      `${TEST_SITE_ORIGIN}/login`,
      `${TEST_SITE_ORIGIN}/privacy`,
      `${TEST_SITE_ORIGIN}/terms`,
    ]);
    expect(sitemapUrls.join("\n")).not.toContain("/admin");
    expect(sitemapUrls.join("\n")).not.toContain("/auth/");
    expect(sitemapUrls.join("\n")).not.toContain("/mypage");
  });

  it("does not ship stale preview domains or fake contact strings in launch surfaces", () => {
    const layoutSource = readSource("app/layout.tsx");
    const mypageSource = readSource("components/mypage/mypage-screen.tsx");

    expect(layoutSource).not.toContain(OLD_PREVIEW_ORIGIN);
    expect(mypageSource).not.toContain("support@homecook.local");
    expect(mypageSource).not.toContain("@homecook");
  });
});
