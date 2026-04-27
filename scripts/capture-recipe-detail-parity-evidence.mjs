#!/usr/bin/env node
/**
 * baemin-prototype-recipe-detail-parity — 3-way capture evidence script
 *
 * Captures 7 RECIPE_DETAIL states × 2 viewports for the specified layer.
 * States: initial, scrolled, planner-add-open, save-open, login-gate-open, loading, error
 *
 * Usage:
 *   pnpm dev   (in another terminal)
 *   node scripts/capture-recipe-detail-parity-evidence.mjs [--layer current|after|prototype]
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
  "qa/visual/parity/baemin-prototype-recipe-detail-parity",
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

// Use the QA fixture mock recipe ID
const RECIPE_ID = "mock-recipe-01";

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
    `${viewport}-RECIPE_DETAIL-${state}-${layer}.png`,
  );
}

/* ── Mock recipe detail data ─────────────────────────────────────── */

const MOCK_RECIPE = {
  id: RECIPE_ID,
  title: "김치볶음밥",
  description: "간단하고 맛있는 김치볶음밥 레시피입니다. 냉장고 속 남은 김치로 뚝딱 만들어 보세요.",
  thumbnail_url: null,
  base_servings: 2,
  tags: ["한식", "볶음밥", "간편식"],
  source_type: "system",
  source: null,
  view_count: 1250,
  like_count: 120,
  save_count: 230,
  plan_count: 52,
  cook_count: 89,
  ingredients: [
    { id: "i1", ingredient_id: "ing1", standard_name: "밥", amount: 2, unit: "공기", ingredient_type: "QUANT", display_text: "밥 2공기", scalable: true, sort_order: 1 },
    { id: "i2", ingredient_id: "ing2", standard_name: "김치", amount: 200, unit: "g", ingredient_type: "QUANT", display_text: "김치 200g", scalable: true, sort_order: 2 },
    { id: "i3", ingredient_id: "ing3", standard_name: "돼지고기", amount: 100, unit: "g", ingredient_type: "QUANT", display_text: "돼지고기 100g", scalable: true, sort_order: 3 },
    { id: "i4", ingredient_id: "ing4", standard_name: "참기름", amount: null, unit: null, ingredient_type: "TO_TASTE", display_text: "참기름 약간", scalable: false, sort_order: 4 },
    { id: "i5", ingredient_id: "ing5", standard_name: "계란", amount: 2, unit: "개", ingredient_type: "QUANT", display_text: "계란 2개", scalable: true, sort_order: 5 },
  ],
  steps: [
    { id: "s1", step_number: 1, instruction: "김치를 잘게 썰고, 돼지고기는 한입 크기로 준비합니다.", cooking_method: { id: "m1", code: "prep", label: "손질", color_key: "green" }, ingredients_used: [], heat_level: null, duration_seconds: 300, duration_text: "5분" },
    { id: "s2", step_number: 2, instruction: "팬에 기름을 두르고 돼지고기를 중불에서 볶다가 김치를 넣고 함께 볶아주세요.", cooking_method: { id: "m2", code: "stir_fry", label: "볶기", color_key: "orange" }, ingredients_used: [], heat_level: "중불", duration_seconds: 420, duration_text: "7분" },
    { id: "s3", step_number: 3, instruction: "밥을 넣고 골고루 섞으며 볶아주세요. 참기름을 둘러 마무리합니다.", cooking_method: { id: "m3", code: "stir_fry", label: "볶기", color_key: "orange" }, ingredients_used: [], heat_level: "센불", duration_seconds: 180, duration_text: "3분" },
  ],
  user_status: null,
};

const MOCK_RECIPE_RESPONSE = {
  success: true,
  data: MOCK_RECIPE,
  error: null,
};

const MOCK_RECIPE_BOOKS = {
  success: true,
  data: {
    books: [
      { id: "bk1", name: "저장됨", book_type: "saved", recipe_count: 5, sort_order: 0 },
      { id: "bk2", name: "나만의 레시피", book_type: "custom", recipe_count: 3, sort_order: 1 },
    ],
  },
  error: null,
};

const MOCK_PLANNER_COLUMNS = {
  success: true,
  data: {
    columns: [
      { id: "col1", name: "아침", sort_order: 0, color: "#FFD700" },
      { id: "col2", name: "점심", sort_order: 1, color: "#90EE90" },
      { id: "col3", name: "저녁", sort_order: 2, color: "#87CEEB" },
    ],
    meals: [],
  },
  error: null,
};

const AUTH_KEY = "homecook.e2e-auth-override";

/* ── Route mock helpers ──────────────────────────────────────────── */

async function installAuthOverride(page, mode = "authenticated") {
  await page.addInitScript(({ key, value }) => {
    window.localStorage.setItem(key, value);
  }, { key: AUTH_KEY, value: mode });
}

async function installNormalRoutes(page) {
  await installAuthOverride(page, "authenticated");
  await page.route(`**/api/v1/recipes/${RECIPE_ID}`, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: MOCK_RECIPE_RESPONSE });
    } else {
      await route.continue();
    }
  });
  await page.route(`**/api/v1/recipes/${RECIPE_ID}/like`, async (route) => {
    await route.fulfill({
      json: { success: true, data: { is_liked: true, like_count: 121 }, error: null },
    });
  });
  await page.route(`**/api/v1/recipes/${RECIPE_ID}/save`, async (route) => {
    await route.fulfill({
      json: { success: true, data: { saved: true, save_count: 231 }, error: null },
    });
  });
  await page.route("**/api/v1/recipe-books**", async (route) => {
    await route.fulfill({ json: MOCK_RECIPE_BOOKS });
  });
  await page.route("**/api/v1/planner**", async (route) => {
    await route.fulfill({ json: MOCK_PLANNER_COLUMNS });
  });
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

async function installLoadingRoutes(page) {
  await installAuthOverride(page, "authenticated");
  await page.route(`**/api/v1/recipes/${RECIPE_ID}`, async () => {
    // Never respond — keeps loading skeleton visible
    await new Promise(() => {});
  });
}

async function installErrorRoutes(page) {
  await installAuthOverride(page, "authenticated");
  await page.route(`**/api/v1/recipes/${RECIPE_ID}`, async (route) => {
    await route.fulfill({ status: 500 });
  });
}

async function installLoggedOutRoutes(page) {
  await installAuthOverride(page, "guest");
  await page.route(`**/api/v1/recipes/${RECIPE_ID}`, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        json: {
          ...MOCK_RECIPE_RESPONSE,
          data: { ...MOCK_RECIPE, user_status: null },
        },
      });
    } else {
      await route.continue();
    }
  });
  await page.route("**/api/v1/recipe-books**", async (route) => {
    await route.fulfill({ json: MOCK_RECIPE_BOOKS });
  });
  await page.route("**/api/v1/planner**", async (route) => {
    await route.fulfill({ json: MOCK_PLANNER_COLUMNS });
  });
}

/* ── Wait helpers ────────────────────────────────────────────────── */

async function waitForRecipeReady(page) {
  await page.waitForFunction(
    () => {
      const h1 = document.querySelector("h1");
      return h1 && h1.textContent && h1.textContent.length > 0;
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
      !!document.querySelector('[data-testid="content-state"]') ||
      document.body.textContent?.includes("레시피를 불러오지 못했어요") ||
      document.body.textContent?.includes("오류"),
    { timeout: 15000 },
  );
}

/* ── Capture function ────────────────────────────────────────────── */

async function captureState(browser, viewport, stateId, layer) {
  const page = await browser.newPage();
  await page.setViewportSize({ width: viewport.width, height: viewport.height });

  let setupRoutes;
  switch (stateId) {
    case "loading":
      setupRoutes = installLoadingRoutes;
      break;
    case "error":
      setupRoutes = installErrorRoutes;
      break;
    case "login-gate-open":
      setupRoutes = installLoggedOutRoutes;
      break;
    default:
      setupRoutes = installNormalRoutes;
      break;
  }

  await setupRoutes(page);

  await page.goto(`${BASE_URL}/recipe/${RECIPE_ID}`, { waitUntil: "commit" });

  // Wait for appropriate state
  switch (stateId) {
    case "loading":
      await waitForLoadingSkeleton(page);
      break;
    case "error":
      await waitForErrorState(page);
      break;
    case "scrolled":
      await waitForRecipeReady(page);
      // Scroll to the ingredients section
      await page.evaluate(() => {
        const sections = Array.from(document.querySelectorAll("p"));
        const target = sections.find((p) =>
          p.textContent?.includes("재료"),
        );
        if (target) target.scrollIntoView({ block: "start" });
        else window.scrollBy(0, 600);
      });
      await page.waitForTimeout(300);
      break;
    case "planner-add-open":
      await waitForRecipeReady(page);
      // Click the planner add button
      {
        const btn = page.getByRole("button", { name: "플래너에 추가" });
        await btn.first().click();
        await page.waitForTimeout(800);
      }
      break;
    case "save-open":
      await waitForRecipeReady(page);
      // Click the save button (metric action button)
      {
        const btn = page.getByRole("button", { name: "저장" });
        await btn.first().click();
        await page.waitForTimeout(800);
      }
      break;
    case "login-gate-open":
      await waitForRecipeReady(page);
      // Click a protected action to trigger login gate
      {
        const likeBtn = page.getByRole("button", { name: /좋아요/ });
        await likeBtn.first().click();
        await page.waitForTimeout(800);
      }
      break;
    case "initial":
    default:
      await waitForRecipeReady(page);
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

const PROTOTYPE_FEASIBLE_STATES = [
  "initial",
  "scrolled",
];

async function capturePrototypeState(browser, viewport, stateId) {
  const page = await browser.newPage();
  await page.setViewportSize({ width: viewport.width, height: viewport.height });

  // Pre-seed localStorage so the prototype opens directly to recipe detail (r1 = 김치볶음밥)
  await page.addInitScript(() => {
    window.localStorage.setItem("hc_route", JSON.stringify({ tab: "home", detail: "r1" }));
  });

  await page.goto(`file://${PROTOTYPE_PATH}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);

  // Normalize the prototype showcase layout for capture
  await page.evaluate(({ vpW, vpH }) => {
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
  }, { vpW: viewport.width, vpH: viewport.height });

  await page.waitForTimeout(300);

  switch (stateId) {
    case "scrolled": {
      await page.evaluate(() => {
        const scrollable = document.querySelector("[style*='overflow']") || window;
        if (scrollable === window) {
          window.scrollBy(0, 600);
        } else {
          scrollable.scrollTop = 600;
        }
      });
      await page.waitForTimeout(500);
      break;
    }
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
          const filePath = await capturePrototypeState(browser, viewport, state);
          log(`✅ ${viewport.label}px ${state} (prototype) → ${path.basename(filePath)}`);
        }
      }
      log(`\nPrototype captures saved to: ${EVIDENCE_OUT}`);
      log("Note: planner-add-open, save-open, login-gate-open, loading, error states are N/A for prototype.");
    } finally {
      await browser.close();
    }
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const states = [
    "initial",
    "scrolled",
    "planner-add-open",
    "save-open",
    "login-gate-open",
    "loading",
    "error",
  ];

  try {
    log(`Using base URL: ${BASE_URL}`);
    for (const viewport of VIEWPORTS) {
      for (const state of states) {
        const filePath = await captureState(browser, viewport, state, layer);
        log(`✅ ${viewport.label}px ${state} (${layer}) → ${path.basename(filePath)}`);
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
