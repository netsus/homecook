// @vitest-environment jsdom

import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WebShell } from "@/components/web";

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
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  });

  it("uses the Vercel production domain when the explicit public URL is absent", async () => {
    vi.resetModules();
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "homecook-flame.vercel.app";

    const { getPublicSiteOrigin } = await import("@/lib/legal-info");

    expect(getPublicSiteOrigin()).toBe("https://homecook-flame.vercel.app");
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
    expect(html).toContain("개인정보 처리의 법적 근거");
    expect(html).toContain("제3자 제공");
    expect(html).toContain("개인정보 처리위탁");
    expect(html).toContain("개인정보의 국외 이전");
    expect(html).toContain("만 14세 미만 아동의 개인정보");
    expect(html).toContain("권익침해 구제방법");
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
    expect(html).toContain("사용자 콘텐츠의 권리");
    expect(html).toContain("금지행위");
    expect(html).toContain("서비스 변경 및 중단");
    expect(html).toContain("면책고지 및 책임의 제한");
    expect(html).toContain("help@zipbap.example");
  });

  it("keeps global product navigation and local legal navigation separate", async () => {
    const page = await importWithSiteEnv(() => import("@/app/privacy/page"));
    const html = renderToStaticMarkup(React.createElement(page.default));
    const css = readSource("app/globals.css");

    expect(html).toContain('aria-label="데스크탑 주요 메뉴"');
    expect(html).toContain('href="/about"');
    expect(html).toContain('aria-label="법적 문서"');
    expect(html).toContain('aria-current="page"');
    expect(css).toContain(".legal-document-nav {");
  });

  it("leaves unknown legal facts blank instead of publishing placeholder copy", async () => {
    vi.resetModules();
    delete process.env.NEXT_PUBLIC_LEGAL_OPERATOR_NAME;
    delete process.env.NEXT_PUBLIC_LEGAL_EFFECTIVE_DATE;
    delete process.env.NEXT_PUBLIC_PRIVACY_OFFICER_NAME;
    delete process.env.NEXT_PUBLIC_PRIVACY_OFFICER_CONTACT;
    delete process.env.NEXT_PUBLIC_LEGAL_PROCESSING_CONSIGNMENT;
    delete process.env.NEXT_PUBLIC_LEGAL_OVERSEAS_TRANSFER_RECIPIENT;

    const { getLegalInfo } = await import("@/lib/legal-info");
    const legal = getLegalInfo();

    expect(legal.operatorName).toBe("");
    expect(legal.effectiveDate).toBe("");
    expect(legal.privacyOfficerName).toBe("");
    expect(legal.processingConsignment).toBe("");
    expect(legal.overseasTransferRecipient).toBe("");
    expect(Object.values(legal)).not.toContain("운영 정보 확인 필요");
  });

  it("exposes privacy and terms links in the shared web footer", () => {
    const html = renderToStaticMarkup(
      React.createElement(WebShell, null, React.createElement("main", null, "내용")),
    );

    expect(html).toContain("서비스 정보");
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/terms"');
  });

  it("allows focused fullscreen surfaces to omit the shared web footer", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        WebShell,
        { footer: false },
        React.createElement("main", null, "집중 화면"),
      ),
    );

    expect(html).not.toContain("서비스 정보");
    expect(html).not.toContain('href="/privacy"');
    expect(html).not.toContain('href="/terms"');
  });

  it("publishes robots.txt and sitemap.xml from the configured public site URL", async () => {
    const [{ default: robots }, { default: sitemap }] = await Promise.all([
      importWithSiteEnv(() => import("@/app/robots")),
      importWithSiteEnv(() => import("@/app/sitemap")),
    ]);

    const robotsResult = robots();
    const sitemapResult = await sitemap();
    const sitemapUrls = sitemapResult.map((entry) => entry.url);

    expect(robotsResult).toMatchObject({
      rules: {
        allow: "/",
        disallow: expect.arrayContaining([
          "/admin",
          "/auth",
          "/login",
          "/mypage",
          "/planner",
          "/settings",
        ]),
        userAgent: "*",
      },
      sitemap: `${TEST_SITE_ORIGIN}/sitemap.xml`,
    });
    expect(sitemapUrls.slice(0, 4)).toEqual([
      TEST_SITE_ORIGIN,
      `${TEST_SITE_ORIGIN}/about`,
      `${TEST_SITE_ORIGIN}/privacy`,
      `${TEST_SITE_ORIGIN}/terms`,
    ]);
    expect(sitemapUrls.filter((url) => url === `${TEST_SITE_ORIGIN}/about`)).toHaveLength(1);
    expect(sitemapUrls.join("\n")).not.toContain("/admin");
    expect(sitemapUrls.join("\n")).not.toContain("/auth/");
    expect(sitemapUrls.join("\n")).not.toContain("/mypage");
  });

  it("publishes production-ready default social metadata", async () => {
    const layoutSource = readSource("app/layout.tsx");
    const homeSource = readSource("app/page.tsx");

    expect(layoutSource).not.toContain("alternates: {\n    canonical: \"/\"");
    expect(layoutSource).toContain("url: defaultOpenGraphImagePath");
    expect(layoutSource).toContain("width: socialImageSize.width");
    expect(layoutSource).toContain("height: socialImageSize.height");
    expect(layoutSource).toContain("images: [defaultTwitterImagePath]");
    expect(homeSource).toContain('canonical: "/"');
    expect(homeSource).toContain('url: "/"');
    expect(homeSource).toContain('type: "website"');
  });

  it("uses the official service name across metadata, legal info, and social images", async () => {
    const [{ getLegalInfo }, socialImage] = await Promise.all([
      import("@/lib/legal-info"),
      import("@/lib/seo/default-social-image"),
    ]);
    const layoutSource = readSource("app/layout.tsx");

    expect(layoutSource).toContain('applicationName: "무엇을 먹든"');
    expect(layoutSource).toContain('siteName: "무엇을 먹든"');
    expect(layoutSource).toContain('default: "무엇을 먹든"');
    expect(layoutSource).toContain('template: "%s | 무엇을 먹든"');
    expect(getLegalInfo().serviceName).toBe("무엇을 먹든");
    expect(socialImage.socialImageAlt).toContain("무엇을 먹든");
    expect(socialImage.defaultOpenGraphImagePath).toBe(
      "/brand/og-image-1200x630.png",
    );
    expect(socialImage.defaultTwitterImagePath).toBe(
      "/brand/twitter-image-1200x630.png",
    );
    expect(readSource("lib/seo/default-social-image.tsx")).toContain("무엇을 먹든");
    expect(readSource("lib/seo/default-social-image.tsx")).not.toContain(
      "linear-gradient",
    );
    expect(readSource("lib/seo/default-social-image.tsx")).not.toContain("HOMECOOK");
  });

  it("does not ship stale preview domains or fake contact strings in launch surfaces", () => {
    const layoutSource = readSource("app/layout.tsx");
    const mypageSource = readSource("components/mypage/mypage-screen.tsx");

    expect(layoutSource).not.toContain(OLD_PREVIEW_ORIGIN);
    expect(mypageSource).not.toContain("support@homecook.local");
    expect(mypageSource).not.toContain("@homecook");
  });
});
