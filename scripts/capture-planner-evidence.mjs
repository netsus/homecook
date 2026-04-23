#!/usr/bin/env node
/**
 * H2 PLANNER_WEEK v2 authority evidence capture script.
 * Captures before/after screenshots for mobile viewports.
 * Usage: node scripts/capture-planner-evidence.mjs [--tag before|after]
 */

import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const BASE_URL = "http://localhost:3000";
const OUT_DIR = join(process.cwd(), "ui/designs/evidence/H2-planner-week-v2");
const TAG = process.argv.includes("--tag") ? process.argv[process.argv.indexOf("--tag") + 1] : "after";

const AUTH_KEY = "homecook.e2e-auth-override";

const COLUMNS = [
  { id: "column-breakfast", name: "아침", sort_order: 0 },
  { id: "column-lunch", name: "점심", sort_order: 1 },
  { id: "column-snack", name: "간식", sort_order: 2 },
  { id: "column-dinner", name: "저녁", sort_order: 3 },
];

function log(message) {
  process.stdout.write(`${message}\n`);
}

function shiftDate(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function makeMeals(startDate) {
  return [
    { id: "m1", recipe_id: "r1", recipe_title: "김치찌개", recipe_thumbnail_url: null, plan_date: startDate, column_id: "column-breakfast", planned_servings: 2, status: "registered", is_leftover: false },
    { id: "m2", recipe_id: "r2", recipe_title: "샐러드", recipe_thumbnail_url: null, plan_date: startDate, column_id: "column-lunch", planned_servings: 1, status: "shopping_done", is_leftover: false },
    { id: "m3", recipe_id: "r3", recipe_title: "과일볼", recipe_thumbnail_url: null, plan_date: startDate, column_id: "column-snack", planned_servings: 1, status: "cook_done", is_leftover: false },
    { id: "m4", recipe_id: "r4", recipe_title: "된장찌개", recipe_thumbnail_url: null, plan_date: startDate, column_id: "column-dinner", planned_servings: 2, status: "registered", is_leftover: false },
    { id: "m5", recipe_id: "r5", recipe_title: "순두부찌개", recipe_thumbnail_url: null, plan_date: shiftDate(startDate, 1), column_id: "column-breakfast", planned_servings: 2, status: "registered", is_leftover: false },
    { id: "m6", recipe_id: "r6", recipe_title: "비빔밥", recipe_thumbnail_url: null, plan_date: shiftDate(startDate, 2), column_id: "column-dinner", planned_servings: 1, status: "shopping_done", is_leftover: false },
  ];
}

async function mockRoutes(page) {
  await page.route("**/api/v1/planner**", async (route) => {
    const url = new URL(route.request().url());
    const startDate = url.searchParams.get("start_date") ?? "2026-04-14";
    await route.fulfill({
      json: {
        success: true,
        data: { columns: COLUMNS, meals: makeMeals(startDate) },
        error: null,
      },
    });
  });
}

async function capture(page, name, { width, height }) {
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(500);
  const path = join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  log(`  saved: ${path}`);
}

async function openPlannerPage(browser) {
  const page = await browser.newPage();
  await page.addInitScript(({ key }) => {
    window.localStorage.setItem(key, "authenticated");
  }, { key: AUTH_KEY });
  await mockRoutes(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}/planner`, { waitUntil: "networkidle" });
  log(`  navigated to: ${page.url()}`);

  // Wait for planner body or log what's visible
  try {
    await page.waitForSelector('[data-testid="planner-week-body"]', { timeout: 12000 });
  } catch {
    const bodyText = await page.locator("body").innerText();
    log(`  body snippet: ${bodyText.slice(0, 200)}`);
    throw new Error("planner-week-body not found");
  }
  return page;
}

async function run() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  try {
    if (TAG === "before") {
      // ── before: 390px default ──────────────────────────────────────
      const page = await openPlannerPage(browser);
      await capture(page, "PLANNER_WEEK-before-mobile", { width: 390, height: 844 });
      await page.close();
    } else {
      // ── after: 390px default + 2-day overview + scrolled ──────────
      {
        const page = await openPlannerPage(browser);
        await capture(page, "PLANNER_WEEK-v2-mobile", { width: 390, height: 844 });
        await capture(page, "PLANNER_WEEK-v2-2day-overview", { width: 390, height: 844 });

        await page.evaluate(() => { window.scrollBy(0, 250); });
        await page.waitForTimeout(300);
        await capture(page, "PLANNER_WEEK-v2-mobile-scrolled", { width: 390, height: 844 });
        await page.close();
      }

      // ── after: 320px narrow ────────────────────────────────────────
      {
        const page = await openPlannerPage(browser);
        await capture(page, "PLANNER_WEEK-v2-mobile-narrow", { width: 320, height: 693 });
        await page.close();
      }

      // ── after: filled day card element screenshot ──────────────────
      {
        const page = await openPlannerPage(browser);
        const firstCard = page.locator('[aria-label*="식단 카드"]').first();
        await firstCard.screenshot({ path: join(OUT_DIR, "PLANNER_WEEK-v2-day-card-filled.png") });
        log(`  saved: ${join(OUT_DIR, "PLANNER_WEEK-v2-day-card-filled.png")}`);
        await page.close();
      }
    }

    log(`\nDone — tag: ${TAG}`);
  } finally {
    await browser.close();
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
