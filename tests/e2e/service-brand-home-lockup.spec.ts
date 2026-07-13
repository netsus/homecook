import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Browser, type Page } from "@playwright/test";

import { installDiscoveryRoutes } from "./helpers/mock-routes";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
const EVIDENCE_PHASE = process.env.HOME_LOCKUP_EVIDENCE_PHASE ?? "after";
const WRITE_TRACKED_EVIDENCE = process.env.HOME_LOCKUP_EVIDENCE_WRITE === "1";
const EVIDENCE_DIR = path.resolve(
  process.cwd(),
  "ui/designs/evidence/service-brand-home-lockup",
);
const BEFORE_GEOMETRY_PATH = path.join(EVIDENCE_DIR, "HOME-before-geometry.json");

const VIEWPORTS = [
  { height: 844, key: "390", kind: "mobile", width: 390 },
  { height: 568, key: "320", kind: "mobile", width: 320 },
  { height: 900, key: "1280", kind: "desktop", width: 1280 },
] as const;

type Geometry = Awaited<ReturnType<typeof readGeometry>>;
type Rect = NonNullable<Geometry["nav"]>;

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

async function readGeometry(page: Page, kind: "desktop" | "mobile") {
  return page.evaluate((surface) => {
    const rect = (element: Element | null) => {
      if (!element) return null;
      const value = element.getBoundingClientRect();
      return {
        bottom: value.bottom,
        height: value.height,
        left: value.left,
        right: value.right,
        top: value.top,
        width: value.width,
      };
    };
    const css = (element: Element | null) => {
      if (!element) return null;
      const value = window.getComputedStyle(element);
      return {
        backgroundColor: value.backgroundColor,
        color: value.color,
        fontSize: Number.parseFloat(value.fontSize),
        lineHeight: Number.parseFloat(value.lineHeight),
        whiteSpace: value.whiteSpace,
      };
    };

    const nav = document.querySelector(
      surface === "desktop" ? ".web-topnav" : "header.sticky",
    );
    const brand = document.querySelector(
      surface === "desktop" ? ".web-topnav-brand" : "header.sticky h1",
    );
    const primary = document.querySelector(
      surface === "desktop"
        ? ".web-topnav-brand-primary"
        : ".home-app-brand-primary",
    );
    const supporting = document.querySelector(
      surface === "desktop"
        ? ".web-topnav-brand-supporting"
        : ".home-app-brand-supporting",
    );
    const firstTab = document.querySelector(".web-topnav-tab");
    const search = document.querySelector<HTMLInputElement>(
      'input[placeholder="레시피 제목 검색"]',
    );

    return {
      accessibleName: brand?.getAttribute("aria-label") ?? brand?.textContent?.trim() ?? null,
      brand: rect(brand),
      firstTab: rect(firstTab),
      nav: rect(nav),
      overflowX:
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      primary: { rect: rect(primary), style: css(primary) },
      search: rect(search),
      supporting: { rect: rect(supporting), style: css(supporting) },
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

async function assertBeforeEvidenceDoesNotExist() {
  const beforePaths = [
    ...VIEWPORTS.map((viewport) =>
      path.join(EVIDENCE_DIR, screenshotName("before", viewport)),
    ),
    BEFORE_GEOMETRY_PATH,
  ];

  for (const beforePath of beforePaths) {
    try {
      await access(beforePath);
    } catch {
      continue;
    }

    throw new Error(`Refusing to overwrite immutable before evidence: ${beforePath}`);
  }
}

function parseRgb(color: string) {
  const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  if (!channels || channels.length !== 3) return null;
  return channels;
}

function contrastRatio(foreground: string, background: string) {
  const toLuminance = (color: string) => {
    const channels = parseRgb(color);
    if (!channels) return null;
    const normalized = channels.map((channel) => {
      const value = channel / 255;
      return value <= 0.03928
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * normalized[0] + 0.7152 * normalized[1] + 0.0722 * normalized[2];
  };
  const foregroundLuminance = toLuminance(foreground);
  const backgroundLuminance = toLuminance(background);
  if (foregroundLuminance === null || backgroundLuminance === null) return null;
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function maxRectDelta(first: Rect | null, second: Rect | null) {
  if (!first || !second) return Number.POSITIVE_INFINITY;
  return Math.max(
    ...Object.keys(first).map((key) =>
      Math.abs(first[key as keyof Rect] - second[key as keyof Rect]),
    ),
  );
}

test("captures and audits the HOME service-name lockup", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chrome", "one deterministic evidence pass");
  expect(["before", "after"]).toContain(EVIDENCE_PHASE);

  const phase = EVIDENCE_PHASE as "after" | "before";
  if (WRITE_TRACKED_EVIDENCE) {
    await mkdir(EVIDENCE_DIR, { recursive: true });
    if (phase === "before") {
      await assertBeforeEvidenceDoesNotExist();
    }
  }
  const outputPath = (filename: string) =>
    WRITE_TRACKED_EVIDENCE
      ? path.join(EVIDENCE_DIR, filename)
      : testInfo.outputPath(filename);
  const geometry: Record<string, Geometry> = {};

  for (const viewport of VIEWPORTS) {
    const { context, page } = await openHome(browser, viewport);
    geometry[viewport.key] = await readGeometry(page, viewport.kind);
    expect(geometry[viewport.key].overflowX).toBe(0);
    expect(geometry[viewport.key].search?.bottom).toBeLessThanOrEqual(viewport.height);

    if (phase === "after") {
      const accessibleName = "무먹, 무엇을 먹든";
      if (viewport.kind === "desktop") {
        const brand = page.getByRole("link", { exact: true, name: accessibleName });
        await expect(brand).toBeVisible();
        await expect(brand).toHaveAttribute("href", "/");
      } else {
        await expect(
          page.getByRole("heading", { exact: true, level: 1, name: accessibleName }),
        ).toBeVisible();
      }

      const current = geometry[viewport.key];
      expect(current.primary.rect?.bottom).toBeLessThanOrEqual(
        current.supporting.rect?.top ?? -1,
      );
      expect(current.primary.style?.fontSize).toBeGreaterThan(
        current.supporting.style?.fontSize ?? Number.POSITIVE_INFINITY,
      );
      expect(current.supporting.rect?.height).toBeLessThanOrEqual(
        (current.supporting.style?.lineHeight ?? 0) + 0.5,
      );
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
      `${JSON.stringify(geometry, null, 2)}\n`,
    );
    return;
  }

  const nonHome = await browser.newContext({
    deviceScaleFactor: 1,
    viewport: { height: 900, width: 1280 },
  });
  const nonHomePage = await nonHome.newPage();
  await nonHomePage.goto(`${BASE_URL}/about`);
  const nonHomeNav = nonHomePage.locator(".web-topnav");
  await expect(
    nonHomeNav.getByRole("link", { exact: true, name: "무먹" }),
  ).toBeVisible();
  await expect(nonHomeNav.getByText("무엇을 먹든", { exact: true })).toHaveCount(0);
  await nonHome.close();

  const before = JSON.parse(await readFile(BEFORE_GEOMETRY_PATH, "utf8")) as Record<
    string,
    Geometry
  >;
  const supportingContrast = Object.fromEntries(
    Object.entries(geometry).map(([key, value]) => {
      const style = value.supporting.style;
      const ratio = style
        ? contrastRatio(style.color, style.backgroundColor === "rgba(0, 0, 0, 0)" ? "rgb(255, 255, 255)" : style.backgroundColor)
        : null;
      expect(ratio).not.toBeNull();
      expect(ratio ?? 0).toBeGreaterThanOrEqual(4.5);
      return [key, ratio];
    }),
  );

  const geometryTolerancePx = 0;
  const desktopNavMaxDeltaPx = maxRectDelta(
    geometry["1280"].nav,
    before["1280"].nav,
  );
  const desktopTabMaxDeltaPx = maxRectDelta(
    geometry["1280"].firstTab,
    before["1280"].firstTab,
  );
  expect(desktopNavMaxDeltaPx).toBeLessThanOrEqual(geometryTolerancePx);
  expect(desktopTabMaxDeltaPx).toBeLessThanOrEqual(geometryTolerancePx);

  await writeFile(
    outputPath("HOME-accessibility-geometry-audit.json"),
    `${JSON.stringify(
      {
        accessibleName: "무먹, 무엇을 먹든",
        before,
        checks: {
          desktopNavHeightPreserved: desktopNavMaxDeltaPx <= geometryTolerancePx,
          desktopNavMaxDeltaPx,
          desktopTabGeometryPreserved: desktopTabMaxDeltaPx <= geometryTolerancePx,
          desktopTabMaxDeltaPx,
          firstViewportSearchVisible: true,
          geometryTolerancePx,
          nonHomeShortNameOnly: true,
          noDuplicateAccessibleName: true,
          noPageOverflow: true,
          supportingNameContrastAA: supportingContrast,
          supportingNameSingleLine: true,
          verticalHierarchy: true,
        },
        phase: "after",
        result: "pass",
        viewports: geometry,
      },
      null,
      2,
    )}\n`,
  );
});
