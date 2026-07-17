#!/usr/bin/env node

import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE_URL = process.env.PLANNER_NUTRITION_EVIDENCE_BASE_URL ?? "http://127.0.0.1:3000";
const ROOT = process.cwd();
const PHASE_INDEX = process.argv.indexOf("--phase");
const PHASE = PHASE_INDEX >= 0 ? process.argv[PHASE_INDEX + 1] : "after";
const OUTPUT_DIR = path.join(
  ROOT,
  "ui/designs/evidence/planner-nutrition-summary",
  PHASE,
);

const AUTH_KEY = "homecook.e2e-auth-override";
const FIXED_NOW = "2026-07-17T09:00:00.000+09:00";
const PLAN_DATE = "2026-07-13";
const BREAKFAST_COLUMN_ID = "550e8400-e29b-41d4-a716-446655440050";
const MEAL_PATH = `/planner/${PLAN_DATE}/${BREAKFAST_COLUMN_ID}?slot=${encodeURIComponent("아침")}`;

const CAPTURES = [
  { label: "390", viewport: { width: 390, height: 844 } },
  { label: "320", viewport: { width: 320, height: 568 } },
  { label: "desktop-1280", viewport: { width: 1280, height: 900 } },
];

if (PHASE !== "before" && PHASE !== "after") {
  throw new Error(`--phase must be before or after, received: ${PHASE}`);
}

async function preparePage(browser, viewport) {
  const context = await browser.newContext({
    deviceScaleFactor: 1,
    viewport,
  });

  await context.addCookies([
    {
      name: AUTH_KEY,
      sameSite: "Lax",
      url: BASE_URL,
      value: "authenticated",
    },
  ]);

  const page = await context.newPage();
  await page.addInitScript(
    ({ authKey, fixedNow }) => {
      window.localStorage.setItem(authKey, "authenticated");

      const RealDate = Date;
      const fixedTime = new RealDate(fixedNow).getTime();

      class FixedDate extends RealDate {
        constructor(...args) {
          if (args.length === 0) {
            super(fixedTime);
            return;
          }

          super(...args);
        }

        static now() {
          return fixedTime;
        }
      }

      Object.setPrototypeOf(FixedDate, RealDate);
      globalThis.Date = FixedDate;
    },
    { authKey: AUTH_KEY, fixedNow: FIXED_NOW },
  );
  await page.emulateMedia({ reducedMotion: "reduce" });

  return { context, page };
}

async function stabilize(page) {
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
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(120);
}

async function recordGeometry(page, screenId, label) {
  const geometry = await page.evaluate(() => {
    const documentElement = document.documentElement;
    const body = document.body;
    const addCta = document.querySelector('[data-testid="meal-screen-add-cta"]');
    const mealScrollArea = document.querySelector('[data-testid="meal-screen-scroll-area"]');
    const plannerBody = document.querySelector('[data-testid="planner-week-body"]');

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      document: {
        clientWidth: documentElement.clientWidth,
        scrollWidth: Math.max(documentElement.scrollWidth, body.scrollWidth),
        pageLevelHorizontalOverflow:
          Math.max(documentElement.scrollWidth, body.scrollWidth) > documentElement.clientWidth,
      },
      addCta: addCta?.getBoundingClientRect().toJSON() ?? null,
      mealScrollArea: mealScrollArea?.getBoundingClientRect().toJSON() ?? null,
      plannerBody: plannerBody?.getBoundingClientRect().toJSON() ?? null,
    };
  });

  await writeFile(
    path.join(OUTPUT_DIR, `${screenId}-${label}-geometry.json`),
    `${JSON.stringify(geometry, null, 2)}\n`,
  );
}

async function captureScreen(browser, screenId, route, waitForSelector, capture) {
  const { context, page } = await preparePage(browser, capture.viewport);

  try {
    await page.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle" });
    await page.locator(waitForSelector).waitFor({ state: "visible", timeout: 20_000 });
    await stabilize(page);
    await page.screenshot({
      path: path.join(OUTPUT_DIR, `${screenId}-${capture.label}.png`),
      fullPage: false,
    });
    await recordGeometry(page, screenId, capture.label);
  } finally {
    await context.close();
  }
}

async function run() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  try {
    for (const capture of CAPTURES) {
      await captureScreen(
        browser,
        "PLANNER_WEEK",
        "/planner",
        '[data-testid="planner-week-body"]',
        capture,
      );
      await captureScreen(
        browser,
        "MEAL_SCREEN",
        MEAL_PATH,
        '[data-testid="meal-screen-add-cta"]',
        capture,
      );
    }
  } finally {
    await browser.close();
  }

  process.stdout.write(`Captured ${PHASE} evidence in ${OUTPUT_DIR}\n`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
