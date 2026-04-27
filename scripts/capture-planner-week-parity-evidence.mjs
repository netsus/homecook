#!/usr/bin/env node
/**
 * baemin-prototype-planner-week-parity — 3-way capture evidence script
 *
 * Captures 7 PLANNER_WEEK states × 2 viewports for the specified layer.
 * States: initial, prototype-overview, scrolled, loading, empty, unauthorized, error
 *
 * Usage:
 *   HOMECOOK_ENABLE_QA_FIXTURES=1 NEXT_PUBLIC_HOMECOOK_ENABLE_QA_FIXTURES=1 pnpm dev   (in another terminal)
 *   node scripts/capture-planner-week-parity-evidence.mjs [--layer current|after|prototype]
 *
 * --layer current   captures current (baseline) layer
 * --layer after     captures after (candidate) layer  [default]
 * --layer prototype captures prototype layer from static HTML
 */

import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const EVIDENCE_DIR = path.join(
  ROOT,
  "qa/visual/parity/baemin-prototype-planner-week-parity",
);
const BASE_URL = process.env.PARITY_BASE_URL || "http://localhost:3000";
const PROTOTYPE_PATH = path.join(
  ROOT,
  "ui/designs/prototypes/homecook-baemin-prototype.html",
);
const EVIDENCE_OUT = process.env.PARITY_EVIDENCE_DIR
  ? path.resolve(process.env.PARITY_EVIDENCE_DIR)
  : EVIDENCE_DIR;

const VIEWPORTS = [
  { width: 390, height: 844, label: "390" },
  { width: 320, height: 568, label: "320" },
];

const layerArg = (() => {
  const idx = process.argv.indexOf("--layer");
  return idx >= 0 ? process.argv[idx + 1] : "after";
})();

if (!["current", "after", "prototype"].includes(layerArg)) {
  console.error(`Unknown layer: ${layerArg}`);
  process.exit(1);
}

function log(msg) {
  process.stdout.write(`${msg}\n`);
}

function capturePath(viewport, state, layer) {
  return path.join(
    EVIDENCE_OUT,
    `${viewport}-PLANNER_WEEK-${state}-${layer}.png`,
  );
}

/* ── Mock planner data ──────────────────────────────────────────── */

function buildDateKey(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const TODAY = buildDateKey(0);

const MOCK_COLUMNS = [
  { id: "col-breakfast", name: "아침", sort_order: 0 },
  { id: "col-lunch", name: "점심", sort_order: 1 },
  { id: "col-snack", name: "간식", sort_order: 2 },
  { id: "col-dinner", name: "저녁", sort_order: 3 },
];

const MOCK_MEALS = [
  // Today — 3 meals filled
  {
    id: "m1",
    recipe_id: "r1",
    recipe_title: "김치볶음밥",
    recipe_thumbnail_url: null,
    plan_date: TODAY,
    column_id: "col-breakfast",
    planned_servings: 2,
    status: "cook_done",
    is_leftover: false,
  },
  {
    id: "m2",
    recipe_id: "r2",
    recipe_title: "된장찌개",
    recipe_thumbnail_url: null,
    plan_date: TODAY,
    column_id: "col-lunch",
    planned_servings: 3,
    status: "shopping_done",
    is_leftover: false,
  },
  {
    id: "m3",
    recipe_id: "r3",
    recipe_title: "제육볶음",
    recipe_thumbnail_url: null,
    plan_date: TODAY,
    column_id: "col-dinner",
    planned_servings: 2,
    status: "registered",
    is_leftover: false,
  },
  // Tomorrow — 2 meals
  {
    id: "m4",
    recipe_id: "r4",
    recipe_title: "파스타 알리오 올리오",
    recipe_thumbnail_url: null,
    plan_date: buildDateKey(1),
    column_id: "col-lunch",
    planned_servings: 1,
    status: "registered",
    is_leftover: false,
  },
  {
    id: "m5",
    recipe_id: "r5",
    recipe_title: "닭갈비",
    recipe_thumbnail_url: null,
    plan_date: buildDateKey(1),
    column_id: "col-dinner",
    planned_servings: 4,
    status: "registered",
    is_leftover: false,
  },
  // Day after tomorrow — 1 leftover meal
  {
    id: "m6",
    recipe_id: "r1",
    recipe_title: "김치볶음밥 (남은요리)",
    recipe_thumbnail_url: null,
    plan_date: buildDateKey(2),
    column_id: "col-breakfast",
    planned_servings: 1,
    status: "registered",
    is_leftover: true,
  },
];

const MOCK_PLANNER_RESPONSE = {
  success: true,
  data: {
    columns: MOCK_COLUMNS,
    meals: MOCK_MEALS,
  },
  error: null,
};

const MOCK_PLANNER_EMPTY_RESPONSE = {
  success: true,
  data: {
    columns: MOCK_COLUMNS,
    meals: [],
  },
  error: null,
};

const AUTH_KEY = "homecook.e2e-auth-override";

/* ── Route mock helpers ──────────────────────────────────────────── */

async function installAuthOverride(page, mode = "authenticated") {
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: AUTH_KEY, value: mode },
  );
}

async function installNormalRoutes(page) {
  await installAuthOverride(page, "authenticated");
  await page.route("**/api/v1/planner**", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: MOCK_PLANNER_RESPONSE });
    } else {
      await route.continue();
    }
  });
  await page.route("**/api/v1/meals", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        json: { success: true, data: { id: "new-meal-1" }, error: null },
      });
    } else if (route.request().method() === "GET") {
      await route.fulfill({ json: MOCK_PLANNER_RESPONSE });
    } else {
      await route.continue();
    }
  });
}

async function installLoadingRoutes(page) {
  await installAuthOverride(page, "authenticated");
  await page.route("**/api/v1/planner**", async () => {
    // Never respond — keeps loading skeleton visible
    await new Promise(() => {});
  });
}

async function installEmptyRoutes(page) {
  await installAuthOverride(page, "authenticated");
  await page.route("**/api/v1/planner**", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: MOCK_PLANNER_EMPTY_RESPONSE });
    } else {
      await route.continue();
    }
  });
}

async function installErrorRoutes(page) {
  await installAuthOverride(page, "authenticated");
  await page.route("**/api/v1/planner**", async (route) => {
    await route.fulfill({ status: 500 });
  });
}

async function installUnauthorizedRoutes(page) {
  await installAuthOverride(page, "guest");
}

/* ── Wait helpers ────────────────────────────────────────────────── */

async function waitForPlannerReady(page) {
  await page.waitForFunction(
    () => {
      // The planner body is rendered when we see day card articles or
      // the summary stats section or "끼 계획 중" text
      return (
        document.body.textContent?.includes("끼 계획 중") ||
        document.body.textContent?.includes("식단 플래너") &&
          document.querySelector('[data-testid="planner-week-body"]')
      );
    },
    { timeout: 15000 },
  );
}

async function waitForLoadingSkeleton(page) {
  await page.waitForTimeout(1500);
}

async function waitForErrorState(page) {
  await page.waitForFunction(
    () =>
      document.body.textContent?.includes("플래너를 불러오지 못했어요") ||
      !!document.querySelector('[data-testid="content-state"]'),
    { timeout: 15000 },
  );
}

async function waitForEmptyState(page) {
  await page.waitForFunction(
    () =>
      document.body.textContent?.includes("아직 등록된 식사가 없어요") ||
      document.body.textContent?.includes("0끼 계획 중"),
    { timeout: 15000 },
  );
}

async function waitForUnauthorizedState(page) {
  await page.waitForFunction(
    () =>
      document.body.textContent?.includes("이 화면은 로그인이 필요해요") ||
      document.body.textContent?.includes("로그인"),
    { timeout: 15000 },
  );
}

/* ── Capture function ────────────────────────────────────────────── */

async function captureState(browser, viewport, stateId, layer) {
  const page = await browser.newPage();
  await page.setViewportSize({
    width: viewport.width,
    height: viewport.height,
  });

  let setupRoutes;
  switch (stateId) {
    case "loading":
      setupRoutes = installLoadingRoutes;
      break;
    case "empty":
      setupRoutes = installEmptyRoutes;
      break;
    case "error":
      setupRoutes = installErrorRoutes;
      break;
    case "unauthorized":
      setupRoutes = installUnauthorizedRoutes;
      break;
    default:
      setupRoutes = installNormalRoutes;
      break;
  }

  await setupRoutes(page);

  await page.goto(`${BASE_URL}/planner`, { waitUntil: "commit" });

  // Wait for appropriate state
  switch (stateId) {
    case "loading":
      await waitForLoadingSkeleton(page);
      break;
    case "error":
      await waitForErrorState(page);
      break;
    case "empty":
      await waitForEmptyState(page);
      break;
    case "unauthorized":
      await waitForUnauthorizedState(page);
      break;
    case "scrolled":
      await waitForPlannerReady(page);
      // Scroll down to show lower day cards
      await page.evaluate(() => {
        window.scrollBy(0, 600);
      });
      await page.waitForTimeout(300);
      break;
    case "prototype-overview":
      await waitForPlannerReady(page);
      // Prototype-overview shows the same as initial but captures the
      // full day-card overview layout (like prototype's default view)
      break;
    case "initial":
    default:
      await waitForPlannerReady(page);
      break;
  }

  // Stabilize for screenshot
  await page.waitForTimeout(200);

  const filePath = capturePath(viewport.label, stateId, layer);
  await page.screenshot({
    path: filePath,
    fullPage: stateId !== "loading",
  });

  await page.close();
  return filePath;
}

/* ── Prototype layer capture ─────────────────────────────────────── */

const PROTOTYPE_FEASIBLE_STATES = ["initial", "prototype-overview", "scrolled"];

async function capturePrototypeState(browser, viewport, stateId) {
  const page = await browser.newPage();
  await page.setViewportSize({
    width: viewport.width,
    height: viewport.height,
  });

  // Pre-seed localStorage so the prototype opens on the planner tab
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "hc_route",
      JSON.stringify({ tab: "planner", detail: null }),
    );
  });

  await page.goto(`file://${PROTOTYPE_PATH}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);

  // Normalize the prototype showcase layout for capture
  await page.evaluate(
    ({ vpW, vpH }) => {
      const root = document.getElementById("root");
      const wrapper = root.firstElementChild;
      const deviceContainer = wrapper.children[0];
      const sidePanel = wrapper.children[1];

      sidePanel.style.display = "none";

      wrapper.style.padding = "0";
      wrapper.style.gap = "0";
      wrapper.style.justifyContent = "flex-start";
      wrapper.style.alignItems = "flex-start";
      wrapper.style.minHeight = "0";
      wrapper.style.overflow = "hidden";

      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
      document.body.style.display = "block";
      document.body.style.padding = "0";
      document.body.style.margin = "0";
      document.body.style.minHeight = "0";
      document.body.style.background = "#FFFFFF";

      const deviceLabel = deviceContainer.children[1];
      if (deviceLabel) deviceLabel.style.display = "none";

      const deviceShell = deviceContainer.children[0];
      const shellRect = deviceShell.getBoundingClientRect();
      const scaleX = vpW / shellRect.width;
      const scaleY = vpH / shellRect.height;
      deviceContainer.style.transformOrigin = "top left";
      deviceContainer.style.transform = `scale(${scaleX}, ${scaleY})`;
      deviceContainer.style.position = "fixed";
      deviceContainer.style.left = "0";
      deviceContainer.style.top = "0";
    },
    { vpW: viewport.width, vpH: viewport.height },
  );

  await page.waitForTimeout(300);

  switch (stateId) {
    case "scrolled": {
      await page.evaluate(() => {
        const scrollable =
          document.querySelector("[style*='overflow']") || window;
        if (scrollable === window) {
          window.scrollBy(0, 600);
        } else {
          scrollable.scrollTop = 600;
        }
      });
      await page.waitForTimeout(500);
      break;
    }
    case "prototype-overview":
    case "initial":
    default:
      break;
  }

  await page.waitForTimeout(200);
  const filePath = capturePath(viewport.label, stateId, "prototype");
  await page.screenshot({ path: filePath, fullPage: false });
  await page.close();
  return filePath;
}

/* ── Main ────────────────────────────────────────────────────────── */

async function main() {
  await mkdir(EVIDENCE_OUT, { recursive: true });
  const layer = layerArg;

  if (layer === "prototype") {
    const browser = await chromium.launch({ headless: true });
    try {
      for (const viewport of VIEWPORTS) {
        for (const state of PROTOTYPE_FEASIBLE_STATES) {
          const filePath = await capturePrototypeState(
            browser,
            viewport,
            state,
          );
          log(
            `✅ ${viewport.label}px ${state} (prototype) → ${path.basename(filePath)}`,
          );
        }
      }
      log(`\nPrototype captures saved to: ${EVIDENCE_OUT}`);
      log(
        "Note: loading, empty, unauthorized, error states are N/A for prototype.",
      );
    } finally {
      await browser.close();
    }
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const states = [
    "initial",
    "prototype-overview",
    "scrolled",
    "loading",
    "empty",
    "unauthorized",
    "error",
  ];

  try {
    log(`Using base URL: ${BASE_URL}`);
    for (const viewport of VIEWPORTS) {
      for (const state of states) {
        const filePath = await captureState(browser, viewport, state, layer);
        log(
          `✅ ${viewport.label}px ${state} (${layer}) → ${path.basename(filePath)}`,
        );
      }
    }
    log(`\nAll ${layer} captures saved to: ${EVIDENCE_OUT}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
