#!/usr/bin/env node
/**
 * baemin-prototype-home-parity — 3-way capture evidence script
 *
 * Captures 7 HOME states × 2 viewports for the "after" layer.
 * The "current" layer must be captured on master before parity changes.
 * The "prototype" layer is captured from the prototype HTML.
 *
 * Usage:
 *   pnpm dev   (in another terminal)
 *   node scripts/capture-home-parity-evidence.mjs [--layer current|after|prototype]
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
  "qa/visual/parity/baemin-prototype-home-parity",
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
    `${viewport}-HOME-${state}-${layer}.png`,
  );
}

/* ── Mock route helpers (for loading/empty/error states) ─────────── */

const MOCK_RECIPES = {
  success: true,
  data: {
    items: [
      {
        id: "r1",
        title: "김치볶음밥",
        source_type: "system",
        like_count: 120,
        save_count: 230,
        base_servings: 2,
        tags: ["한식", "볶음밥"],
        thumbnail_url: null,
      },
      {
        id: "r2",
        title: "된장찌개",
        source_type: "system",
        like_count: 89,
        save_count: 150,
        tags: ["한식", "찌개"],
        thumbnail_url: null,
      },
      {
        id: "r3",
        title: "제육볶음",
        source_type: "youtube",
        like_count: 200,
        save_count: 310,
        tags: ["한식", "볶음"],
        thumbnail_url: null,
      },
      {
        id: "r4",
        title: "파스타 알리오 올리오",
        source_type: "manual",
        like_count: 95,
        save_count: 80,
        tags: ["양식", "파스타"],
        thumbnail_url: null,
      },
      {
        id: "r5",
        title: "닭갈비",
        source_type: "system",
        like_count: 150,
        save_count: 180,
        tags: ["한식"],
        thumbnail_url: null,
      },
      {
        id: "r6",
        title: "순두부찌개",
        source_type: "system",
        like_count: 110,
        save_count: 140,
        tags: ["한식", "찌개"],
        thumbnail_url: null,
      },
    ],
    next_cursor: null,
    has_next: false,
  },
  error: null,
};

const MOCK_THEMES = {
  success: true,
  data: {
    themes: [
      {
        id: "t1",
        title: "오늘의 한식 추천",
        recipes: MOCK_RECIPES.data.items.slice(0, 4),
      },
    ],
  },
  error: null,
};

const MOCK_INGREDIENTS = {
  success: true,
  data: {
    items: [
      { id: "ing1", name: "양파", category: "채소" },
      { id: "ing2", name: "대파", category: "채소" },
      { id: "ing3", name: "소고기", category: "육류" },
    ],
  },
  error: null,
};

async function installNormalRoutes(page) {
  await page.route("**/api/v1/recipes/themes", async (route) => {
    await route.fulfill({ json: MOCK_THEMES });
  });
  await page.route("**/api/v1/ingredients**", async (route) => {
    await route.fulfill({ json: MOCK_INGREDIENTS });
  });
  await page.route("**/api/v1/recipes?**", async (route) => {
    await route.fulfill({ json: MOCK_RECIPES });
  });
}

async function installEmptyRoutes(page) {
  await page.route("**/api/v1/recipes/themes", async (route) => {
    await route.fulfill({
      json: { success: true, data: { themes: [] }, error: null },
    });
  });
  await page.route("**/api/v1/ingredients**", async (route) => {
    await route.fulfill({ json: MOCK_INGREDIENTS });
  });
  await page.route("**/api/v1/recipes?**", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: { items: [], next_cursor: null, has_next: false },
        error: null,
      },
    });
  });
}

async function installErrorRoutes(page) {
  await page.route("**/api/v1/recipes/themes", async (route) => {
    await route.fulfill({
      json: { success: true, data: { themes: [] }, error: null },
    });
  });
  await page.route("**/api/v1/ingredients**", async (route) => {
    await route.fulfill({ json: MOCK_INGREDIENTS });
  });
  await page.route("**/api/v1/recipes?**", async (route) => {
    await route.fulfill({ status: 500 });
  });
}

async function installLoadingRoutes(page) {
  await page.route("**/api/v1/recipes/themes", async () => {
    // Never respond — keeps loading skeleton visible
    await new Promise(() => {});
  });
  await page.route("**/api/v1/ingredients**", async (route) => {
    await route.fulfill({ json: MOCK_INGREDIENTS });
  });
  await page.route("**/api/v1/recipes?**", async () => {
    await new Promise(() => {});
  });
}

async function installFilterActiveRoutes(page) {
  await page.route("**/api/v1/recipes/themes", async (route) => {
    await route.fulfill({ json: MOCK_THEMES });
  });
  await page.route("**/api/v1/ingredients**", async (route) => {
    await route.fulfill({ json: MOCK_INGREDIENTS });
  });
  await page.route("**/api/v1/recipes?**", async (route) => {
    // Return a filtered subset regardless of params
    await route.fulfill({
      json: {
        success: true,
        data: {
          items: MOCK_RECIPES.data.items.slice(0, 3),
          next_cursor: null,
          has_next: false,
        },
        error: null,
      },
    });
  });
}

async function waitForHomeReady(page) {
  await page.waitForFunction(
    () => {
      const headings = Array.from(document.querySelectorAll("h2"));
      return headings.some(
        (h) =>
          h.textContent?.includes("모든 레시피") ||
          h.textContent?.includes("검색 결과") ||
          h.textContent?.includes("다른 조합"),
      );
    },
    { timeout: 15000 },
  );
}

async function waitForLoadingSkeleton(page) {
  // Wait for the skeleton to appear
  await page.waitForTimeout(1500);
}

async function waitForErrorState(page) {
  await page.waitForFunction(
    () =>
      !!document.querySelector('[data-testid="content-state"]') ||
      document.body.textContent?.includes("레시피를 불러오지 못했어요"),
    { timeout: 15000 },
  );
}

async function waitForEmptyState(page) {
  await page.waitForFunction(
    () =>
      document.body.textContent?.includes("다른 조합을 찾아보세요") ||
      document.body.textContent?.includes("다른 조합"),
    { timeout: 15000 },
  );
}

/* ── Capture functions ───────────────────────────────────────────── */

async function captureState(browser, viewport, stateId, layer) {
  const page = await browser.newPage();
  await page.setViewportSize({ width: viewport.width, height: viewport.height });

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
    case "filter-active":
      setupRoutes = installFilterActiveRoutes;
      break;
    default:
      setupRoutes = installNormalRoutes;
      break;
  }

  await setupRoutes(page);

  await page.goto(BASE_URL, { waitUntil: "commit" });

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
    case "filter-active":
      await waitForHomeReady(page);
      // Open ingredient filter modal, select an ingredient, apply
      await page.getByRole("button", { name: /재료로 검색/ }).click();
      await page.getByRole("dialog", { name: "재료로 검색" }).waitFor();
      // Click the label that wraps the hidden checkbox (not the checkbox itself)
      const labels = page.getByRole("dialog", { name: "재료로 검색" }).locator("label");
      const labelCount = await labels.count();
      if (labelCount > 0) {
        await labels.first().click();
        await page.waitForTimeout(300);
        const applyBtn = page.getByRole("button", { name: /적용/ });
        if (await applyBtn.isEnabled()) {
          await applyBtn.click();
          await page.waitForTimeout(500);
        }
      }
      break;
    case "scrolled-to-recipes-entry":
      await waitForHomeReady(page);
      // Scroll to "모든 레시피" section header
      await page.evaluate(() => {
        const headings = Array.from(document.querySelectorAll("h2"));
        const target = headings.find((h) =>
          h.textContent?.includes("모든 레시피"),
        );
        if (target) {
          target.scrollIntoView({ block: "start" });
        }
      });
      await page.waitForTimeout(300);
      break;
    case "sort-open":
      await waitForHomeReady(page);
      await page.getByRole("button", { name: /정렬 기준/ }).click();
      await page.waitForTimeout(300);
      break;
    case "initial":
    default:
      await waitForHomeReady(page);
      break;
  }

  // Stabilize for screenshot
  await page.waitForTimeout(200);

  const filePath = capturePath(viewport.label, stateId, layer);
  await page.screenshot({
    path: filePath,
    fullPage: stateId !== "loading", // loading state may have infinite scroll
  });

  await page.close();
  return filePath;
}

/* ── Prototype layer capture ──────────────────────────────────────── */

const PROTOTYPE_FEASIBLE_STATES = [
  "initial",
  "scrolled-to-recipes-entry",
  "sort-open",
  "filter-active",
];

async function capturePrototypeState(browser, viewport, stateId) {
  const page = await browser.newPage();
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(`file://${PROTOTYPE_PATH}`, { waitUntil: "networkidle" });
  // The prototype HTML uses React client-side rendering; wait for content
  await page.waitForTimeout(3000);

  // Normalize the prototype showcase layout for capture:
  // The prototype renders as a centered device frame (402×874) with a
  // side panel (screen navigation, quick flows). For parity evidence we
  // need only the mobile device content. Hide the side panel, remove
  // wrapper padding, and CSS-transform the device shell to fill the
  // viewport exactly.
  await page.evaluate(({ vpW, vpH }) => {
    const root = document.getElementById("root");
    const wrapper = root.firstElementChild;
    const deviceContainer = wrapper.children[0];
    const sidePanel = wrapper.children[1];

    // Hide showcase side panel
    sidePanel.style.display = "none";

    // Reset wrapper layout
    wrapper.style.padding = "0";
    wrapper.style.gap = "0";
    wrapper.style.justifyContent = "flex-start";
    wrapper.style.alignItems = "flex-start";
    wrapper.style.minHeight = "0";
    wrapper.style.overflow = "hidden";

    // Reset body/html
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.display = "block";
    document.body.style.padding = "0";
    document.body.style.margin = "0";
    document.body.style.minHeight = "0";
    document.body.style.background = "#FFFFFF";

    // Hide device label below the phone frame
    const deviceLabel = deviceContainer.children[1];
    if (deviceLabel) deviceLabel.style.display = "none";

    // Scale device shell to fill viewport exactly
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
    case "scrolled-to-recipes-entry": {
      // Scroll inside the device content area
      await page.evaluate(() => {
        const sections = Array.from(document.querySelectorAll("h2, h3"));
        const target = sections.find((el) =>
          el.textContent?.includes("레시피") || el.textContent?.includes("추천"),
        );
        if (target) target.scrollIntoView({ block: "start" });
        else window.scrollBy(0, 600);
      });
      await page.waitForTimeout(500);
      break;
    }
    case "sort-open": {
      const sortBtn = page.locator("button").filter({ hasText: /정렬|조회|인기/ }).first();
      if (await sortBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await sortBtn.click();
        await page.waitForTimeout(500);
      }
      break;
    }
    case "filter-active": {
      const filterBtn = page.locator("button").filter({ hasText: /재료/ }).first();
      if (await filterBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await filterBtn.click();
        await page.waitForTimeout(500);
      }
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
      log("Note: loading/empty/error states are N/A for prototype.");
    } finally {
      await browser.close();
    }
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const states = [
    "initial",
    "scrolled-to-recipes-entry",
    "sort-open",
    "filter-active",
    "loading",
    "empty",
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
