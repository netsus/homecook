import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Browser, type Page } from "@playwright/test";

import { installDiscoveryRoutes } from "./helpers/mock-routes";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
const EVIDENCE_PHASE = process.env.BRAND_IMAGE_EVIDENCE_PHASE ?? "after";
const WRITE_TRACKED_EVIDENCE = process.env.BRAND_IMAGE_EVIDENCE_WRITE === "1";
const EVIDENCE_DIR = path.resolve(
  process.cwd(),
  "ui/designs/evidence/service-brand-image-assets",
);
const BEFORE_GEOMETRY_PATH = path.join(EVIDENCE_DIR, "HOME-before-geometry.json");

const VIEWPORTS = [
  { height: 844, key: "390", kind: "mobile", width: 390 },
  { height: 568, key: "320", kind: "mobile", width: 320 },
  { height: 900, key: "1280", kind: "desktop", width: 1280 },
] as const;

async function openHome(
  browser: Browser,
  viewport: { height: number; width: number },
) {
  const context = await browser.newContext({ deviceScaleFactor: 1, viewport });
  const page = await context.newPage();
  await installDiscoveryRoutes(page);
  await page.goto(`${BASE_URL}/`);
  await expect(page.getByPlaceholder("레시피 제목 검색")).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
      }
      nextjs-portal,
      [data-next-badge-root],
      [aria-label="Open Next.js Dev Tools"],
      [data-nextjs-dev-tools-button],
      [data-nextjs-toast] {
        display: none !important;
        visibility: hidden !important;
      }
    `,
  });
  return { context, page };
}

async function geometry(page: Page, kind: "desktop" | "mobile") {
  return page.evaluate((surface) => {
    const rect = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const value = element.getBoundingClientRect();
      return {
        height: value.height,
        left: value.left,
        top: value.top,
        width: value.width,
      };
    };

    return {
      brand: rect(surface === "desktop" ? ".web-topnav-brand" : "header.sticky h1"),
      firstTab: rect(".web-topnav-tab"),
      nav: rect(surface === "desktop" ? ".web-topnav" : "header.sticky"),
      overflowX:
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      search: rect('input[placeholder="레시피 제목 검색"]'),
      viewport: { height: window.innerHeight, width: window.innerWidth },
    };
  }, kind);
}

function screenshotName(
  phase: "after" | "before",
  viewport: (typeof VIEWPORTS)[number],
) {
  return viewport.kind === "desktop"
    ? `HOME-desktop-${phase}-1280.png`
    : `HOME-${phase}-${viewport.key}.png`;
}

async function refuseBeforeOverwrite() {
  for (const viewport of VIEWPORTS) {
    const file = path.join(EVIDENCE_DIR, screenshotName("before", viewport));
    try {
      await access(file);
      throw new Error(`Refusing to overwrite immutable before evidence: ${file}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

test("captures and audits the selected Mumeok image brand", async ({ browser, request }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chrome", "one deterministic evidence pass");
  expect(["before", "after"]).toContain(EVIDENCE_PHASE);

  const phase = EVIDENCE_PHASE as "after" | "before";
  if (WRITE_TRACKED_EVIDENCE) {
    await mkdir(EVIDENCE_DIR, { recursive: true });
    if (phase === "before") await refuseBeforeOverwrite();
  }
  const outputPath = (name: string) =>
    WRITE_TRACKED_EVIDENCE ? path.join(EVIDENCE_DIR, name) : testInfo.outputPath(name);
  const geometries: Record<string, Awaited<ReturnType<typeof geometry>>> = {};

  for (const viewport of VIEWPORTS) {
    const { context, page } = await openHome(browser, viewport);
    geometries[viewport.key] = await geometry(page, viewport.kind);
    expect(geometries[viewport.key].overflowX).toBe(0);
    expect(geometries[viewport.key].search?.top).toBeLessThan(viewport.height);

    if (phase === "after") {
      const brand = viewport.kind === "desktop"
        ? page.getByRole("link", { exact: true, name: "무먹, 무엇을 먹든" })
        : page.getByRole("heading", { exact: true, level: 1, name: "무먹, 무엇을 먹든" });
      const symbol = brand.locator("img.mumeok-brand-symbol");
      await expect(symbol).toBeVisible();
      await expect(symbol).toHaveAttribute("alt", "");
      await expect(symbol).toHaveAttribute("src", /mumeok-symbol-192\.png/);
      expect(await symbol.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBe(192);
    }

    await page.screenshot({
      fullPage: false,
      path: outputPath(screenshotName(phase, viewport)),
    });
    await context.close();
  }

  if (phase === "before") {
    await writeFile(
      outputPath("HOME-before-geometry.json"),
      `${JSON.stringify(geometries, null, 2)}\n`,
    );
    return;
  }

  const before = JSON.parse(await readFile(BEFORE_GEOMETRY_PATH, "utf8")) as typeof geometries;
  expect(geometries["1280"].nav).toEqual(before["1280"].nav);
  expect(geometries["1280"].firstTab).toEqual(before["1280"].firstTab);

  const nonHome = await browser.newContext({
    deviceScaleFactor: 1,
    viewport: { height: 900, width: 1280 },
  });
  const nonHomePage = await nonHome.newPage();
  await nonHomePage.goto(`${BASE_URL}/about`);
  const nonHomeNav = nonHomePage.locator(".web-topnav");
  const nonHomeBrand = nonHomeNav.getByRole("link", { exact: true, name: "무먹" });
  await expect(nonHomeBrand.locator("img.mumeok-brand-symbol")).toBeVisible();
  await expect(nonHomeNav.getByText("무엇을 먹든", { exact: true })).toHaveCount(0);
  await nonHome.close();

  for (const [route, contentType] of [
    ["/favicon.ico", "image/x-icon"],
    ["/brand/favicon-32.png", "image/png"],
    ["/brand/mumeok-symbol-192.png", "image/png"],
    ["/brand/app-icon-512.png", "image/png"],
    ["/brand/apple-touch-icon-180.png", "image/png"],
    ["/brand/og-image-1200x630.png", "image/png"],
    ["/brand/twitter-image-1200x630.png", "image/png"],
    ["/manifest.webmanifest", "application/manifest+json"],
  ] as const) {
    const response = await request.get(`${BASE_URL}${route}`);
    expect(response.status(), route).toBe(200);
    expect(response.headers()["content-type"], route).toContain(contentType);
  }

  await writeFile(
    outputPath("accessibility-geometry-audit.json"),
    `${JSON.stringify(
      {
        before,
        checks: {
          accessibleNameNoDuplicate: true,
          canonicalSymbolNaturalWidth: 192,
          desktopNavGeometryPreserved: true,
          homeNameHierarchyPreserved: true,
          mobileOverflowZero: true,
          nonHomeShortNameOnly: true,
        },
        phase: "after",
        result: "pass",
        viewports: geometries,
      },
      null,
      2,
    )}\n`,
  );
});
