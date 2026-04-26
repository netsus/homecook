#!/usr/bin/env node
/**
 * 10a-shopping-detail-interact authority evidence capture script.
 * Captures mobile-default, mobile-scrolled, and mobile-narrow screenshots for SHOPPING_DETAIL.
 *
 * Usage:
 *   node scripts/capture-10a-shopping-detail-interact-evidence.mjs
 */

import { chromium, devices } from "@playwright/test";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";

const BASE_URL = process.env.AUTHORITY_BASE_URL ?? "http://127.0.0.1:3100";
const LIST_ID = "550e8400-e29b-41d4-a716-446655440001";
const AUTH_KEY = "homecook.e2e-auth-override";
const DETAIL_URL = `${BASE_URL}/shopping/lists/${LIST_ID}`;
const OUT_DIR = join(process.cwd(), "ui", "designs", "evidence", "10a-shopping-detail-interact");
const ARTIFACT_DIR = join(process.cwd(), ".artifacts", "authority-evidence", "10a-shopping-detail-interact");

function log(message) {
  process.stdout.write(`${message}\n`);
}

async function waitForServer(url, timeoutMs = 60_000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 500) {
        return true;
      }
    } catch {
      // keep polling until timeout
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return false;
}

function startDevServer() {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const logPath = join(ARTIFACT_DIR, "capture-dev.log");
  const logStream = createWriteStream(logPath, { flags: "a" });
  const child = spawn(
    "pnpm",
    ["exec", "next", "dev", "--turbopack", "--port", "3100", "--hostname", "127.0.0.1"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        HOMECOOK_ENABLE_QA_FIXTURES: "1",
        NEXT_PUBLIC_HOMECOOK_ENABLE_QA_FIXTURES: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);

  return { child, logPath };
}

async function ensureServerReady() {
  if (await waitForServer(BASE_URL, 3_000)) {
    return { child: null, logPath: null };
  }

  const started = startDevServer();
  const ready = await waitForServer(BASE_URL, 60_000);
  if (!ready) {
    throw new Error(`Failed to start dev server at ${BASE_URL}. See ${started.logPath}`);
  }

  return started;
}

async function setAuth(page) {
  await page.context().addCookies([
    {
      name: AUTH_KEY,
      value: "authenticated",
      url: BASE_URL,
      sameSite: "Lax",
    },
  ]);

  await page.addInitScript(
    ({ key, state }) => {
      window.localStorage.setItem(key, state);
    },
    { key: AUTH_KEY, state: "authenticated" },
  );
}

async function installShoppingDetailRoutes(page) {
  const detailPayload = {
    id: LIST_ID,
    title: "4월 12일 장보기",
    date_range_start: "2026-04-12",
    date_range_end: "2026-04-20",
    is_completed: false,
    completed_at: null,
    created_at: "2026-04-12T00:00:00.000Z",
    updated_at: "2026-04-12T00:00:00.000Z",
    recipes: [
      {
        recipe_id: "recipe-1",
        recipe_name: "김치찌개",
        recipe_thumbnail: null,
        shopping_servings: 4,
        planned_servings_total: 4,
      },
      {
        recipe_id: "recipe-2",
        recipe_name: "된장찌개",
        recipe_thumbnail: null,
        shopping_servings: 2,
        planned_servings_total: 2,
      },
    ],
    items: [
      {
        id: "item-1",
        ingredient_id: "ing-1",
        display_text: "양파 2개",
        amounts_json: [{ amount: 2, unit: "개" }],
        is_checked: false,
        is_pantry_excluded: false,
        added_to_pantry: false,
        sort_order: 0,
      },
      {
        id: "item-2",
        ingredient_id: "ing-2",
        display_text: "대파 1단",
        amounts_json: [{ amount: 1, unit: "단" }],
        is_checked: true,
        is_pantry_excluded: false,
        added_to_pantry: false,
        sort_order: 100,
      },
      {
        id: "item-3",
        ingredient_id: "ing-3",
        display_text: "돼지고기 200g + 1팩",
        amounts_json: [
          { amount: 200, unit: "g" },
          { amount: 1, unit: "팩" },
        ],
        is_checked: false,
        is_pantry_excluded: false,
        added_to_pantry: false,
        sort_order: 200,
      },
      {
        id: "item-4",
        ingredient_id: "ing-4",
        display_text: "다진마늘 1큰술",
        amounts_json: [{ amount: 1, unit: "큰술" }],
        is_checked: false,
        is_pantry_excluded: false,
        added_to_pantry: false,
        sort_order: 300,
      },
      {
        id: "item-5",
        ingredient_id: "ing-5",
        display_text: "참기름 1작은술",
        amounts_json: [{ amount: 1, unit: "작은술" }],
        is_checked: false,
        is_pantry_excluded: true,
        added_to_pantry: false,
        sort_order: 400,
      },
      {
        id: "item-6",
        ingredient_id: "ing-6",
        display_text: "간장 2큰술",
        amounts_json: [{ amount: 2, unit: "큰술" }],
        is_checked: false,
        is_pantry_excluded: true,
        added_to_pantry: false,
        sort_order: 500,
      },
    ],
  };

  await page.route(`**/api/v1/shopping/lists/${LIST_ID}`, async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      json: {
        success: true,
        data: detailPayload,
        error: null,
      },
    });
  });

  await page.route(`**/api/v1/shopping/lists/${LIST_ID}/items/*`, async (route) => {
    if (route.request().method() !== "PATCH") {
      await route.continue();
      return;
    }

    const requestBody = route.request().postDataJSON();
    const itemId = route.request().url().split("/").pop() ?? "";
    const target = detailPayload.items.find((item) => item.id === itemId);

    if (!target) {
      await route.fulfill({
        status: 404,
        json: {
          success: false,
          data: null,
          error: {
            code: "RESOURCE_NOT_FOUND",
            message: "장보기 항목을 찾을 수 없어요.",
            fields: [],
          },
        },
      });
      return;
    }

    if (typeof requestBody?.is_checked === "boolean") {
      target.is_checked = requestBody.is_checked;
    }

    if (typeof requestBody?.is_pantry_excluded === "boolean") {
      target.is_pantry_excluded = requestBody.is_pantry_excluded;
      if (requestBody.is_pantry_excluded) {
        target.is_checked = false;
      }
    }

    await route.fulfill({
      status: 200,
      json: {
        success: true,
        data: target,
        error: null,
      },
    });
  });
}

async function captureView({ browser, viewport, outputPath, scrolled = false }) {
  const page = await browser.newPage({
    ...devices["iPhone 12"],
    viewport,
  });

  try {
    await setAuth(page);
    await installShoppingDetailRoutes(page);
    await page.goto(DETAIL_URL, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "장보기 상세" }).waitFor({
      state: "visible",
      timeout: 30_000,
    });
    await page.getByText("구매할 재료").waitFor({
      state: "visible",
      timeout: 30_000,
    });

    if (scrolled) {
      await page.mouse.wheel(0, 700);
      await page.waitForTimeout(300);
    }

    await page.screenshot({ path: outputPath, fullPage: false });
    log(`saved: ${outputPath}`);
  } finally {
    await page.close();
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(ARTIFACT_DIR, { recursive: true });

  const { child, logPath } = await ensureServerReady();
  const browser = await chromium.launch({ headless: true });

  try {
    await captureView({
      browser,
      viewport: { width: 390, height: 844 },
      outputPath: join(OUT_DIR, "SHOPPING_DETAIL-mobile-default.png"),
    });

    await captureView({
      browser,
      viewport: { width: 390, height: 844 },
      outputPath: join(OUT_DIR, "SHOPPING_DETAIL-mobile-default-scrolled.png"),
      scrolled: true,
    });

    await captureView({
      browser,
      viewport: { width: 320, height: 812 },
      outputPath: join(OUT_DIR, "SHOPPING_DETAIL-mobile-narrow.png"),
    });

    log(`authority evidence ready -> ${OUT_DIR}`);
    if (logPath && existsSync(logPath)) {
      log(`dev server log -> ${logPath}`);
    }
  } finally {
    await browser.close();
    if (child) {
      child.kill("SIGTERM");
      await new Promise((resolve) => child.once("exit", resolve));
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
