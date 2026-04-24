#!/usr/bin/env node
/**
 * 08a meal-add-search authority evidence capture script.
 * Captures mobile-default and mobile-narrow screenshots for:
 * - MENU_ADD
 * - RECIPE_SEARCH_PICKER
 *
 * Usage:
 *   node scripts/capture-08a-evidence.mjs
 *
 * Behavior:
 * - Reuses an existing dev server on http://127.0.0.1:3100 when available.
 * - Otherwise starts `pnpm dev -- --port 3100 --hostname 127.0.0.1`
 *   with QA fixtures enabled and waits until the server is ready.
 * - Writes all artifacts under repo-local `ui/designs/evidence/08a/`
 *   and `.artifacts/authority-evidence/08a/`.
 */

import { chromium, devices } from "@playwright/test";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";

const BASE_URL = process.env.AUTHORITY_BASE_URL ?? "http://127.0.0.1:3100";
const OUT_DIR = join(process.cwd(), "ui", "designs", "evidence", "08a");
const ARTIFACT_DIR = join(process.cwd(), ".artifacts", "authority-evidence", "08a");
const AUTH_KEY = "homecook.e2e-auth-override";

const PLAN_DATE = "2026-04-18";
const COLUMN_ID = "550e8400-e29b-41d4-a716-446655440050";
const SLOT_NAME = "아침";
const MENU_ADD_URL = `${BASE_URL}/menu-add?date=${PLAN_DATE}&columnId=${COLUMN_ID}&slot=${encodeURIComponent(SLOT_NAME)}`;

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
      // Ignore until timeout.
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

async function installRecipeSearchRoute(page) {
  await page.route("**/api/v1/recipes?*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      json: {
        success: true,
        data: {
          items: [
            {
              id: "r1",
              title: "김치찌개",
              thumbnail_url: null,
              tags: ["한식", "찌개"],
              base_servings: 2,
              view_count: 100,
              like_count: 10,
              save_count: 5,
              source_type: "system",
            },
          ],
          next_cursor: null,
          has_next: false,
        },
        error: null,
      },
    });
  });
}

async function captureView({
  browser,
  viewport,
  menuPath,
  searchPath,
}) {
  const page = await browser.newPage({
    ...devices["iPhone 12"],
    viewport,
  });

  try {
    await setAuth(page);
    await installRecipeSearchRoute(page);
    await page.goto(MENU_ADD_URL, { waitUntil: "networkidle" });
    await page.locator("h1:has-text('식사 추가')").waitFor({ state: "visible", timeout: 10_000 });
    await page.screenshot({ path: menuPath, fullPage: false });
    log(`saved: ${menuPath}`);

    await page.locator('input[aria-label="레시피 검색"]').fill("김치");
    await page.locator('button[aria-label="검색"]').click();
    await page.locator("text=김치찌개").waitFor({ state: "visible", timeout: 10_000 });
    await page.screenshot({ path: searchPath, fullPage: false });
    log(`saved: ${searchPath}`);
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
      menuPath: join(OUT_DIR, "MENU_ADD-mobile.png"),
      searchPath: join(OUT_DIR, "RECIPE_SEARCH_PICKER-mobile.png"),
    });

    await captureView({
      browser,
      viewport: { width: 320, height: 812 },
      menuPath: join(OUT_DIR, "MENU_ADD-mobile-narrow.png"),
      searchPath: join(OUT_DIR, "RECIPE_SEARCH_PICKER-mobile-narrow.png"),
    });

    log(`authority evidence ready → ${OUT_DIR}`);
    if (logPath && existsSync(logPath)) {
      log(`dev server log → ${logPath}`);
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
