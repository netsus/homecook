#!/usr/bin/env node
/**
 * 07-meal-manage authority evidence capture script.
 * Captures mobile-default and mobile-narrow screenshots for MEAL_SCREEN.
 * Usage: node scripts/capture-07-meal-manage-evidence.mjs
 *
 * Requires: dev server running at http://localhost:3000
 * with NEXT_PUBLIC_HOMECOOK_ENABLE_QA_FIXTURES=1
 */

import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const BASE_URL = "http://localhost:3000";
const OUT_DIR = join(process.cwd(), "ui/designs/evidence/07-meal-manage");
const AUTH_KEY = "homecook.e2e-auth-override";

// QA fixture breakfast column — registered meal (status badge: 식사 등록 완료)
const PLAN_DATE = new Date().toISOString().slice(0, 10);
const COLUMN_ID = "550e8400-e29b-41d4-a716-446655440050";
const SLOT_NAME = encodeURIComponent("아침");
const MEAL_URL = `/planner/${PLAN_DATE}/${COLUMN_ID}?slot=${SLOT_NAME}`;

async function setAuth(page) {
  await page.addInitScript(
    ({ key, state }) => {
      window.localStorage.setItem(key, state);
    },
    { key: AUTH_KEY, state: "authenticated" },
  );
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });

  try {
    // E1: mobile default (390×844)
    {
      const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
      });
      await setAuth(page);
      await page.goto(`${BASE_URL}${MEAL_URL}`);
      await page.waitForSelector("[data-testid='meal-screen-add-cta']", { timeout: 8000 });
      await page.screenshot({ path: join(OUT_DIR, "MEAL_SCREEN-mobile.png"), fullPage: false });
      console.warn("[E1] MEAL_SCREEN-mobile.png captured");
      await page.close();
    }

    // E2: mobile narrow (320×812)
    {
      const page = await browser.newPage({
        viewport: { width: 320, height: 812 },
        deviceScaleFactor: 2,
      });
      await setAuth(page);
      await page.goto(`${BASE_URL}${MEAL_URL}`);
      await page.waitForSelector("[data-testid='meal-screen-add-cta']", { timeout: 8000 });
      await page.screenshot({ path: join(OUT_DIR, "MEAL_SCREEN-mobile-narrow.png"), fullPage: false });
      console.warn("[E2] MEAL_SCREEN-mobile-narrow.png captured");
      await page.close();
    }
  } finally {
    await browser.close();
  }

  console.warn("Evidence capture complete →", OUT_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
