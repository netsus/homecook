import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Browser, type Page } from "@playwright/test";

import {
  captureTrackedEvidenceOnDemand,
  shouldUpdateTrackedEvidence,
  writeTrackedEvidenceOnDemand,
} from "./helpers/evidence-capture";

import { installDiscoveryRoutes } from "./helpers/mock-routes";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
const EVIDENCE_PHASE = process.env.HOME_LOCKUP_EVIDENCE_PHASE ?? "after";
const WRITE_TRACKED_EVIDENCE = shouldUpdateTrackedEvidence();
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
    const logo = document.querySelector(".mumeok-horizontal-logo");
    const search = document.querySelector<HTMLInputElement>(
      'input[placeholder="레시피 제목 검색"]',
    );

    return {
      accessibleName: brand?.getAttribute("aria-label") ?? brand?.textContent?.trim() ?? null,
      brand: rect(brand),
      firstTab: rect(firstTab),
      logo: rect(logo),
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

test("captures and audits the HOME service-name lockup", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chrome", "one deterministic evidence pass");
  expect(["before", "after"]).toContain(EVIDENCE_PHASE);

  const phase = EVIDENCE_PHASE as "after" | "before";
  if (WRITE_TRACKED_EVIDENCE && phase === "before") {
    await assertBeforeEvidenceDoesNotExist();
  }
  const writeEvidence = async (name: string, contents: string) => {
    if (WRITE_TRACKED_EVIDENCE) {
      await writeTrackedEvidenceOnDemand(path.join(EVIDENCE_DIR, name), contents);
    } else {
      await writeFile(testInfo.outputPath(name), contents);
    }
  };
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
        await expect(brand.locator("img.mumeok-horizontal-logo")).toHaveAttribute(
          "src",
          /mumeok-logo-horizontal\.png/,
        );
      } else {
        const brand = page.getByRole(
          "heading",
          { exact: true, level: 1, name: accessibleName },
        );
        await expect(
          page.getByRole("heading", { exact: true, level: 1, name: accessibleName }),
        ).toBeVisible();
        await expect(brand.locator("img.mumeok-horizontal-logo")).toHaveAttribute(
          "src",
          /mumeok-logo-horizontal\.png/,
        );
      }
      expect(geometry[viewport.key].logo?.width).toBeGreaterThan(130);
    }

    if (WRITE_TRACKED_EVIDENCE) {
      await captureTrackedEvidenceOnDemand(page, {
        fullPage: false,
        path: path.join(EVIDENCE_DIR, screenshotName(phase, viewport)),
      });
    } else {
      await page.screenshot({
        fullPage: false,
        path: testInfo.outputPath(screenshotName(phase, viewport)),
      });
    }
    await context.close();
  }

  if (phase === "before") {
    await writeEvidence(
      "HOME-before-geometry.json",
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
    nonHomeNav.getByRole("link", { exact: true, name: "무먹, 무엇을 먹든" }),
  ).toBeVisible();
  await expect(nonHomeNav.locator("img.mumeok-horizontal-logo")).toHaveAttribute(
    "src",
    /mumeok-logo-horizontal\.png/,
  );
  await nonHome.close();

  const before = JSON.parse(await readFile(BEFORE_GEOMETRY_PATH, "utf8")) as Record<
    string,
    Geometry
  >;
  const desktopGap = (geometry["1280"].firstTab?.left ?? 0) - (geometry["1280"].brand?.right ?? 0);
  expect(geometry["1280"].nav?.height).toBe(72);
  expect(desktopGap).toBeGreaterThanOrEqual(36);

  await writeEvidence(
    "HOME-accessibility-geometry-audit.json",
    `${JSON.stringify(
      {
        accessibleName: "무먹, 무엇을 먹든",
        before,
        checks: {
          desktopHorizontalLogo: true,
          desktopLogoTabGap: desktopGap,
          firstViewportSearchVisible: true,
          nonHomeLogoUnified: true,
          noDuplicateAccessibleName: true,
          noPageOverflow: true,
          mobileHorizontalLogo: true,
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
