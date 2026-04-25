#!/usr/bin/env node
/**
 * 09-shopping-preview-create authority evidence capture script.
 * Captures mobile-default and mobile-narrow screenshots for SHOPPING_FLOW.
 *
 * Usage:
 *   node scripts/capture-09-shopping-preview-create-evidence.mjs
 */

import { chromium, devices } from "@playwright/test";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";

const BASE_URL = process.env.AUTHORITY_BASE_URL ?? "http://127.0.0.1:3100";
const OUT_DIR = join(process.cwd(), "ui", "designs", "evidence", "09-shopping-preview-create");
const ARTIFACT_DIR = join(process.cwd(), ".artifacts", "authority-evidence", "09-shopping-preview-create");
const AUTH_KEY = "homecook.e2e-auth-override";
const SHOPPING_FLOW_URL = `${BASE_URL}/shopping/flow`;

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

async function installShoppingRoutes(page) {
  await page.route("**/api/v1/shopping/preview", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      json: {
        success: true,
        data: {
          eligible_meals: [
            {
              id: "550e8400-e29b-41d4-a716-446655440001",
              recipe_id: "recipe-1",
              recipe_name: "고추장 삼겹살 볶음",
              recipe_thumbnail: null,
              planned_servings: 2,
              created_at: "2026-04-25T00:00:00.000Z",
            },
            {
              id: "550e8400-e29b-41d4-a716-446655440002",
              recipe_id: "recipe-2",
              recipe_name: "시금치 된장국",
              recipe_thumbnail: null,
              planned_servings: 3,
              created_at: "2026-04-25T00:30:00.000Z",
            },
            {
              id: "550e8400-e29b-41d4-a716-446655440003",
              recipe_id: "recipe-3",
              recipe_name: "계란말이",
              recipe_thumbnail: null,
              planned_servings: 1,
              created_at: "2026-04-25T01:00:00.000Z",
            },
          ],
        },
        error: null,
      },
    });
  });
}

async function captureView({ browser, viewport, outputPath }) {
  const page = await browser.newPage({
    ...devices["iPhone 12"],
    viewport,
  });

  try {
    await setAuth(page);
    await installShoppingRoutes(page);
    await page.goto(SHOPPING_FLOW_URL, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "장보기 준비" }).waitFor({
      state: "visible",
      timeout: 30_000,
    });
    await page.getByText("장보기 목록 만들기").waitFor({
      state: "visible",
      timeout: 30_000,
    });
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
      outputPath: join(OUT_DIR, "SHOPPING_FLOW-mobile-default.png"),
    });

    await captureView({
      browser,
      viewport: { width: 320, height: 812 },
      outputPath: join(OUT_DIR, "SHOPPING_FLOW-mobile-narrow.png"),
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
