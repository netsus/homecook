#!/usr/bin/env node
/**
 * H3 planner-add-sync authority evidence capture script.
 * Captures screenshots for mobile viewports (E1–E6).
 * Usage: node scripts/capture-h3-evidence.mjs
 *
 * Requires: dev server running with NEXT_PUBLIC_HOMECOOK_ENABLE_QA_FIXTURES=1
 */

import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const BASE_URL = "http://localhost:3000";
const OUT_DIR = join(process.cwd(), "ui/designs/evidence/h3-planner-add-sync");
const AUTH_KEY = "homecook.e2e-auth-override";

const COLUMNS = [
  { id: "column-breakfast", name: "아침", sort_order: 0 },
  { id: "column-lunch", name: "점심", sort_order: 1 },
  { id: "column-snack", name: "간식", sort_order: 2 },
  { id: "column-dinner", name: "저녁", sort_order: 3 },
];

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function shiftDate(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function mockPlannerRoutes(page) {
  await page.route("**/api/v1/planner**", async (route) => {
    const today = todayKey();
    await route.fulfill({
      json: {
        success: true,
        data: {
          columns: COLUMNS,
          meals: [
            {
              id: "m1",
              recipe_id: "r1",
              recipe_title: "김치찌개",
              recipe_thumbnail_url: null,
              plan_date: today,
              column_id: "column-breakfast",
              planned_servings: 2,
              status: "registered",
              is_leftover: false,
            },
          ],
        },
        error: null,
      },
    });
  });
}

async function mockMealsRoute(page) {
  await page.route("**/api/v1/meals", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        json: { success: true, data: { id: "new-meal-1" }, error: null },
      });
    } else {
      await route.continue();
    }
  });
}

async function capture(page, name, { width, height }) {
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(400);
  const path = join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  console.log(`  saved: ${path}`);
}

async function openRecipeDetailPage(browser, { width = 390, height = 844 } = {}) {
  const page = await browser.newPage();
  await page.addInitScript(({ key }) => {
    window.localStorage.setItem(key, "authenticated");
  }, { key: AUTH_KEY });
  await mockPlannerRoutes(page);
  await mockMealsRoute(page);
  await page.setViewportSize({ width, height });

  // Navigate to the QA fixture recipe detail
  await page.goto(`${BASE_URL}/recipe/mock-kimchi-jjigae`, {
    waitUntil: "networkidle",
  });
  console.log("  navigated to:", page.url());

  return page;
}

async function waitForCTA(page) {
  await page.waitForSelector('button:has-text("플래너에 추가")', { timeout: 10000 });
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  try {
    // ── E1: RECIPE_DETAIL-baseline (full page at 390px) ─────────────────────
    console.log("\n[E1] RECIPE_DETAIL-baseline (390px)");
    {
      const page = await openRecipeDetailPage(browser);
      await waitForCTA(page);
      await capture(page, "RECIPE_DETAIL-baseline", { width: 390, height: 844 });
      await page.close();
    }

    // ── E6: recipe-detail-cta-hierarchy (CTA row close-up) ──────────────────
    console.log("\n[E6] recipe-detail-cta-hierarchy");
    {
      const page = await openRecipeDetailPage(browser);
      await waitForCTA(page);
      // Clip to the CTA row area
      const ctaButton = page.locator('button:has-text("플래너에 추가")').first();
      const box = await ctaButton.boundingBox();
      if (box) {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.screenshot({
          path: join(OUT_DIR, "recipe-detail-cta-hierarchy.png"),
          clip: { x: 0, y: Math.max(0, box.y - 24), width: 390, height: box.height + 80 },
        });
        console.log(`  saved: ${join(OUT_DIR, "recipe-detail-cta-hierarchy.png")}`);
      } else {
        await capture(page, "recipe-detail-cta-hierarchy", { width: 390, height: 844 });
      }
      await page.close();
    }

    // ── E2: planner-add-sheet-mobile (390px, sheet open, date selected) ─────
    console.log("\n[E2] planner-add-sheet-mobile (390px)");
    {
      const page = await openRecipeDetailPage(browser);
      await waitForCTA(page);
      await page.click('button:has-text("플래너에 추가")');
      await page.waitForSelector('role=dialog', { timeout: 8000 });
      await page.waitForTimeout(600);
      await capture(page, "planner-add-sheet-mobile", { width: 390, height: 844 });
      await page.close();
    }

    // ── E4: planner-add-sheet-date-label (date format close-up) ─────────────
    console.log("\n[E4] planner-add-sheet-date-label");
    {
      const page = await openRecipeDetailPage(browser);
      await waitForCTA(page);
      await page.click('button:has-text("플래너에 추가")');
      await page.waitForSelector('role=dialog', { timeout: 8000 });
      await page.waitForTimeout(600);
      // Find the date confirmation label (olive colored text)
      const label = page.locator('[aria-live="polite"]').filter({ hasText: /월/ }).first();
      const box = await label.boundingBox().catch(() => null);
      if (box) {
        await page.screenshot({
          path: join(OUT_DIR, "planner-add-sheet-date-label.png"),
          clip: { x: 0, y: Math.max(0, box.y - 40), width: 390, height: box.height + 120 },
        });
        console.log(`  saved: ${join(OUT_DIR, "planner-add-sheet-date-label.png")}`);
      } else {
        await capture(page, "planner-add-sheet-date-label", { width: 390, height: 844 });
      }
      await page.close();
    }

    // ── E3: planner-add-sheet-narrow (320px) ────────────────────────────────
    console.log("\n[E3] planner-add-sheet-narrow (320px)");
    {
      const page = await openRecipeDetailPage(browser, { width: 320, height: 568 });
      await waitForCTA(page);
      await page.click('button:has-text("플래너에 추가")');
      await page.waitForSelector('role=dialog', { timeout: 8000 });
      await page.waitForTimeout(600);
      await capture(page, "planner-add-sheet-narrow", { width: 320, height: 568 });
      await page.close();
    }

    // ── E5: planner-add-toast-mobile (success toast, 390px) ─────────────────
    console.log("\n[E5] planner-add-toast-mobile (390px)");
    {
      const page = await openRecipeDetailPage(browser);
      await waitForCTA(page);
      await page.click('button:has-text("플래너에 추가")');
      await page.waitForSelector('role=dialog', { timeout: 8000 });
      await page.waitForTimeout(600);
      // Click submit
      await page.click('[role="dialog"] button:has-text("플래너에 추가")');
      // Wait for dialog to close and toast to appear
      await page.waitForSelector('[role="status"]', { timeout: 6000 });
      await page.waitForTimeout(300);
      await capture(page, "planner-add-toast-mobile", { width: 390, height: 844 });
      await page.close();
    }

    console.log(`\nAll evidence screenshots saved to ${OUT_DIR}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
