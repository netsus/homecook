#!/usr/bin/env node
/**
 * H5 modal-system-redesign authority evidence capture script.
 * Captures E1–E10 screenshots for Quiet Kitchen Sheets redesign.
 * Usage: node scripts/capture-h5-evidence.mjs
 *
 * Requires: dev server running at http://localhost:3000
 * with NEXT_PUBLIC_HOMECOOK_ENABLE_QA_FIXTURES=1
 */

import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const BASE_URL = "http://localhost:3000";
const OUT_DIR = join(process.cwd(), "ui/designs/evidence/h5-modal-system-redesign");
const AUTH_KEY = "homecook.e2e-auth-override";

const COLUMNS = [
  { id: "column-breakfast", name: "아침", sort_order: 0 },
  { id: "column-lunch", name: "점심", sort_order: 1 },
  { id: "column-snack", name: "간식", sort_order: 2 },
  { id: "column-dinner", name: "저녁", sort_order: 3 },
];

const RECIPE_BOOKS = [
  { id: "book-1", name: "저장한 레시피", book_type: "saved", recipe_count: 5 },
  { id: "book-2", name: "주말 요리", book_type: "custom", recipe_count: 3 },
];

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function mockPlannerRoutes(page) {
  await page.route("**/api/v1/planner**", async (route) => {
    const today = todayKey();
    await route.fulfill({
      json: {
        success: true,
        data: { columns: COLUMNS, meals: [] },
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

async function mockRecipeBooksRoute(page) {
  await page.route("**/api/v1/recipe-books**", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: { books: RECIPE_BOOKS },
        error: null,
      },
    });
  });
}

async function mockIngredientsRoute(page) {
  await page.route("**/api/v1/ingredients**", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          items: [
            { id: "i1", standard_name: "양파", category: "채소" },
            { id: "i2", standard_name: "마늘", category: "채소" },
            { id: "i3", standard_name: "돼지고기", category: "육류" },
            { id: "i4", standard_name: "두부", category: "기타" },
            { id: "i5", standard_name: "김치", category: "기타" },
            { id: "i6", standard_name: "고추장", category: "양념" },
          ],
        },
        error: null,
      },
    });
  });
}

async function capture(page, name, { width, height }) {
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(400);
  const path = join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  console.warn(`  saved: ${path}`);
}

async function clipCapture(page, name, clip) {
  const path = join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path, clip });
  console.warn(`  saved: ${path}`);
}

async function openRecipePage(browser, { width = 390, height = 844 } = {}) {
  const page = await browser.newPage();
  await page.addInitScript(({ key }) => {
    window.localStorage.setItem(key, "authenticated");
  }, { key: AUTH_KEY });
  await mockPlannerRoutes(page);
  await mockMealsRoute(page);
  await mockRecipeBooksRoute(page);
  await page.setViewportSize({ width, height });
  await page.goto(`${BASE_URL}/recipe/mock-kimchi-jjigae`, { waitUntil: "networkidle" });
  return page;
}

async function openHomePage(browser, { width = 390, height = 844 } = {}) {
  const page = await browser.newPage();
  await page.addInitScript(({ key }) => {
    window.localStorage.setItem(key, "authenticated");
  }, { key: AUTH_KEY });
  await mockIngredientsRoute(page);
  await page.setViewportSize({ width, height });
  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
  return page;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  try {
    // ── E1: PlannerAdd sheet — full mobile view ──────────────────────────────
    console.warn("\n[E1] planner-add-sheet (390px)");
    {
      const page = await openRecipePage(browser);
      await page.waitForSelector('button:has-text("플래너에 추가")', { timeout: 10000 });
      await page.click('button:has-text("플래너에 추가")');
      await page.waitForSelector('role=dialog', { timeout: 8000 });
      await page.waitForTimeout(700);
      await capture(page, "E1-planner-add-sheet-mobile", { width: 390, height: 844 });
      await page.close();
    }

    // ── E2: PlannerAdd — date chip close-up (D4: M/D format) ────────────────
    console.warn("\n[E2] planner-add-date-chip (D4 format)");
    {
      const page = await openRecipePage(browser);
      await page.waitForSelector('button:has-text("플래너에 추가")', { timeout: 10000 });
      await page.click('button:has-text("플래너에 추가")');
      await page.waitForSelector('role=dialog', { timeout: 8000 });
      await page.waitForTimeout(700);
      const rail = page.locator('[aria-label="날짜 선택"]');
      const box = await rail.boundingBox().catch(() => null);
      if (box) {
        await clipCapture(page, "E2-planner-add-date-chip", {
          x: 0,
          y: Math.max(0, box.y - 16),
          width: 390,
          height: box.height + 32,
        });
      } else {
        await capture(page, "E2-planner-add-date-chip", { width: 390, height: 844 });
      }
      await page.close();
    }

    // ── E3: Save modal — full mobile view ───────────────────────────────────
    console.warn("\n[E3] save-modal (390px)");
    {
      const page = await openRecipePage(browser);
      await page.waitForSelector('button:has-text("저장")', { timeout: 10000 });
      await page.click('button[aria-label*="저장"], button:has-text("저장")');
      await page.waitForSelector('role=dialog[name="레시피 저장"]', { timeout: 8000 });
      await page.waitForTimeout(600);
      await capture(page, "E3-save-modal-mobile", { width: 390, height: 844 });
      await page.close();
    }

    // ── E4: Save modal — book selected (D1: olive tint) ─────────────────────
    console.warn("\n[E4] save-modal-book-selected (D1 olive)");
    {
      const page = await openRecipePage(browser);
      await page.waitForSelector('button:has-text("저장")', { timeout: 10000 });
      await page.click('button[aria-label*="저장"], button:has-text("저장")');
      await page.waitForSelector('role=dialog[name="레시피 저장"]', { timeout: 8000 });
      await page.waitForTimeout(600);
      // Click first book
      const firstBook = page.locator('[role="dialog"] button[aria-pressed]').first();
      await firstBook.click();
      await page.waitForTimeout(300);
      await capture(page, "E4-save-modal-book-selected", { width: 390, height: 844 });
      await page.close();
    }

    // ── E5: IngredientFilter modal — full mobile view ────────────────────────
    console.warn("\n[E5] ingredient-filter-modal (390px)");
    {
      const page = await openHomePage(browser);
      // Click ingredient filter button
      const filterButton = page.locator('button[aria-label*="재료"]').first();
      await filterButton.waitFor({ timeout: 8000 });
      await filterButton.click();
      await page.waitForSelector('role=dialog', { timeout: 8000 });
      await page.waitForTimeout(800);
      await capture(page, "E5-ingredient-filter-modal", { width: 390, height: 844 });
      await page.close();
    }

    // ── E6: IngredientFilter — category selected (D1: olive) ────────────────
    console.warn("\n[E6] ingredient-filter-category-selected");
    {
      const page = await openHomePage(browser);
      const filterButton = page.locator('button[aria-label*="재료"]').first();
      await filterButton.waitFor({ timeout: 8000 });
      await filterButton.click();
      await page.waitForSelector('role=dialog', { timeout: 8000 });
      await page.waitForTimeout(800);
      // Click "채소" category
      await page.locator('[role="dialog"] button:has-text("채소")').click();
      await page.waitForTimeout(400);
      await capture(page, "E6-ingredient-filter-category-selected", { width: 390, height: 844 });
      await page.close();
    }

    // ── E7: Sort sheet — mobile (D2: no eyebrow, D3: icon close) ────────────
    console.warn("\n[E7] sort-sheet-mobile (390px)");
    {
      const page = await openHomePage(browser);
      const sortButton = page.locator('button[aria-haspopup="listbox"]').first();
      await sortButton.waitFor({ timeout: 8000 });
      await sortButton.click();
      await page.waitForTimeout(600);
      await capture(page, "E7-sort-sheet-mobile", { width: 390, height: 844 });
      await page.close();
    }

    // ── E8: Sort sheet — option selected (D1: olive tint) ───────────────────
    console.warn("\n[E8] sort-sheet-selected (D1 olive)");
    {
      const page = await openHomePage(browser);
      const sortButton = page.locator('button[aria-haspopup="listbox"]').first();
      await sortButton.waitFor({ timeout: 8000 });
      await sortButton.click();
      await page.waitForTimeout(600);
      // Select second option
      const options = page.locator('[role="option"]');
      const count = await options.count();
      if (count > 1) {
        await options.nth(1).click();
        await page.waitForTimeout(200);
        await sortButton.click();
        await page.waitForTimeout(600);
      }
      await capture(page, "E8-sort-sheet-selected", { width: 390, height: 844 });
      await page.close();
    }

    // ── E9: All 4 modals — chrome consistency overview (430px) ──────────────
    console.warn("\n[E9] modal-chrome-4up overview");
    {
      // PlannerAdd
      {
        const page = await openRecipePage(browser, { width: 430, height: 932 });
        await page.waitForSelector('button:has-text("플래너에 추가")', { timeout: 10000 });
        await page.click('button:has-text("플래너에 추가")');
        await page.waitForSelector('role=dialog', { timeout: 8000 });
        await page.waitForTimeout(700);
        await capture(page, "E9a-planner-add-chrome", { width: 430, height: 932 });
        await page.close();
      }
      // Save
      {
        const page = await openRecipePage(browser, { width: 430, height: 932 });
        await page.waitForSelector('button:has-text("저장")', { timeout: 10000 });
        await page.click('button[aria-label*="저장"], button:has-text("저장")');
        await page.waitForSelector('role=dialog[name="레시피 저장"]', { timeout: 8000 });
        await page.waitForTimeout(600);
        await capture(page, "E9b-save-chrome", { width: 430, height: 932 });
        await page.close();
      }
      // IngredientFilter
      {
        const page = await openHomePage(browser, { width: 430, height: 932 });
        const filterButton = page.locator('button[aria-label*="재료"]').first();
        await filterButton.waitFor({ timeout: 8000 });
        await filterButton.click();
        await page.waitForSelector('role=dialog', { timeout: 8000 });
        await page.waitForTimeout(800);
        await capture(page, "E9c-ingredient-filter-chrome", { width: 430, height: 932 });
        await page.close();
      }
      // Sort
      {
        const page = await openHomePage(browser, { width: 430, height: 932 });
        const sortButton = page.locator('button[aria-haspopup="listbox"]').first();
        await sortButton.waitFor({ timeout: 8000 });
        await sortButton.click();
        await page.waitForTimeout(600);
        await capture(page, "E9d-sort-chrome", { width: 430, height: 932 });
        await page.close();
      }
    }

    // ── E10: Narrow viewport stress test (320px) ────────────────────────────
    console.warn("\n[E10] narrow-320px-planner-add");
    {
      const page = await openRecipePage(browser, { width: 320, height: 568 });
      await page.waitForSelector('button:has-text("플래너에 추가")', { timeout: 10000 });
      await page.click('button:has-text("플래너에 추가")');
      await page.waitForSelector('role=dialog', { timeout: 8000 });
      await page.waitForTimeout(700);
      await capture(page, "E10-planner-add-narrow-320", { width: 320, height: 568 });
      await page.close();
    }

    console.warn(`\nAll H5 evidence screenshots saved to ${OUT_DIR}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
