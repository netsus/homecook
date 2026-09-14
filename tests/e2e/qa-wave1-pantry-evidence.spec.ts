import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Browser, type Page } from "@playwright/test";

const E2E_AUTH_OVERRIDE_KEY = "homecook.e2e-auth-override";
const E2E_AUTH_OVERRIDE_COOKIE = E2E_AUTH_OVERRIDE_KEY;
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
const EVIDENCE_DIR = path.resolve(
  process.cwd(),
  "ui/designs/evidence/wave1-port-pantry",
);

const viewports = {
  mobile: { width: 390, height: 844 },
  narrow: { width: 320, height: 568 },
} as const;

const pantryItems = [
  {
    id: "p0",
    ingredient_id: "rice",
    standard_name: "쌀",
    category: "주식",
    created_at: "2026-04-29T00:00:00Z",
  },
  {
    id: "p1",
    ingredient_id: "onion",
    standard_name: "양파",
    category: "채소",
    created_at: "2026-04-29T01:00:00Z",
  },
  {
    id: "p2",
    ingredient_id: "potato",
    standard_name: "감자",
    category: "채소",
    created_at: "2026-04-29T02:00:00Z",
  },
  {
    id: "p3",
    ingredient_id: "pepper",
    standard_name: "청양고추",
    category: "채소",
    created_at: "2026-04-29T03:00:00Z",
  },
  {
    id: "p4",
    ingredient_id: "egg",
    standard_name: "계란",
    category: "단백질",
    created_at: "2026-04-29T04:00:00Z",
  },
  {
    id: "p5",
    ingredient_id: "kimchi",
    standard_name: "김치",
    category: "양념",
    created_at: "2026-04-29T05:00:00Z",
  },
  {
    id: "p6",
    ingredient_id: "soysauce",
    standard_name: "간장",
    category: "양념",
    created_at: "2026-04-29T06:00:00Z",
  },
  {
    id: "p7",
    ingredient_id: "gochujang",
    standard_name: "고추장",
    category: "양념",
    created_at: "2026-04-29T07:00:00Z",
  },
  {
    id: "p8",
    ingredient_id: "doenjang",
    standard_name: "된장",
    category: "양념",
    created_at: "2026-04-29T08:00:00Z",
  },
  {
    id: "p9",
    ingredient_id: "sesameoil",
    standard_name: "참기름",
    category: "양념",
    created_at: "2026-04-29T09:00:00Z",
  },
  {
    id: "p10",
    ingredient_id: "gochugaru",
    standard_name: "고춧가루",
    category: "양념",
    created_at: "2026-04-29T10:00:00Z",
  },
  {
    id: "p11",
    ingredient_id: "sugar",
    standard_name: "설탕",
    category: "양념",
    created_at: "2026-04-29T11:00:00Z",
  },
  {
    id: "p12",
    ingredient_id: "garlic",
    standard_name: "다진마늘",
    category: "양념",
    created_at: "2026-04-29T12:00:00Z",
  },
];

const ingredients = [
  { id: "rice", standard_name: "쌀", category: "주식" },
  { id: "noodle", standard_name: "국수", category: "주식" },
  { id: "onion", standard_name: "양파", category: "채소" },
  { id: "potato", standard_name: "감자", category: "채소" },
  { id: "carrot", standard_name: "당근", category: "채소" },
  { id: "pepper", standard_name: "청양고추", category: "채소" },
  { id: "zucchini", standard_name: "애호박", category: "채소" },
  { id: "egg", standard_name: "계란", category: "단백질" },
  { id: "tofu", standard_name: "두부", category: "단백질" },
  { id: "chicken", standard_name: "닭가슴살", category: "단백질" },
  { id: "kimchi", standard_name: "김치", category: "양념" },
  { id: "soysauce", standard_name: "간장", category: "양념" },
  { id: "gochujang", standard_name: "고추장", category: "양념" },
  { id: "doenjang", standard_name: "된장", category: "양념" },
  { id: "sesameoil", standard_name: "참기름", category: "양념" },
  { id: "gochugaru", standard_name: "고춧가루", category: "양념" },
  { id: "sugar", standard_name: "설탕", category: "양념" },
  { id: "garlic", standard_name: "다진마늘", category: "양념" },
  { id: "spaghetti", standard_name: "스파게티", category: "주식" },
  { id: "glassnoodle", standard_name: "당면", category: "주식" },
  { id: "pork", standard_name: "돼지고기", category: "단백질" },
  { id: "beef", standard_name: "소고기", category: "단백질" },
  { id: "raw-chicken", standard_name: "닭고기", category: "단백질" },
  { id: "shrimp", standard_name: "새우", category: "단백질" },
  { id: "tuna", standard_name: "참치", category: "단백질" },
  { id: "salt", standard_name: "소금", category: "양념" },
  { id: "pepper-powder", standard_name: "후추", category: "양념" },
  { id: "oil", standard_name: "식용유", category: "양념" },
  { id: "oliveoil", standard_name: "올리브유", category: "양념" },
];

const bundles = [
  {
    id: "b1",
    name: "한식 기본 양념",
    display_order: 1,
    ingredients: [
      { ingredient_id: "soysauce", standard_name: "간장", is_in_pantry: true },
      { ingredient_id: "doenjang", standard_name: "된장", is_in_pantry: true },
      { ingredient_id: "gochujang", standard_name: "고추장", is_in_pantry: true },
      { ingredient_id: "sesameoil", standard_name: "참기름", is_in_pantry: true },
      { ingredient_id: "garlic", standard_name: "다진마늘", is_in_pantry: true },
      { ingredient_id: "sugar", standard_name: "설탕", is_in_pantry: true },
    ],
  },
  {
    id: "b2",
    name: "김치찌개 재료",
    display_order: 2,
    ingredients: [
      { ingredient_id: "kimchi", standard_name: "김치", is_in_pantry: true },
      { ingredient_id: "pork", standard_name: "돼지고기", is_in_pantry: false },
      { ingredient_id: "tofu", standard_name: "두부", is_in_pantry: false },
      { ingredient_id: "green-onion", standard_name: "대파", is_in_pantry: false },
      { ingredient_id: "onion", standard_name: "양파", is_in_pantry: true },
    ],
  },
  {
    id: "b3",
    name: "파스타 기본",
    display_order: 3,
    ingredients: [
      { ingredient_id: "spaghetti", standard_name: "스파게티", is_in_pantry: false },
      { ingredient_id: "oliveoil", standard_name: "올리브유", is_in_pantry: false },
      { ingredient_id: "garlic-clove", standard_name: "마늘", is_in_pantry: false },
      { ingredient_id: "green-onion", standard_name: "파마산", is_in_pantry: false },
      { ingredient_id: "pepperoncino", standard_name: "페퍼론치노", is_in_pantry: false },
    ],
  },
  {
    id: "b4",
    name: "샐러드 기본",
    display_order: 4,
    ingredients: [
      { ingredient_id: "lettuce", standard_name: "양상추", is_in_pantry: false },
      { ingredient_id: "tomato", standard_name: "방울토마토", is_in_pantry: false },
      { ingredient_id: "cucumber", standard_name: "오이", is_in_pantry: false },
      { ingredient_id: "dressing", standard_name: "드레싱", is_in_pantry: false },
      { ingredient_id: "egg", standard_name: "계란", is_in_pantry: true },
    ],
  },
];

async function preparePage(
  browser: Browser,
  viewport: { width: number; height: number },
) {
  const context = await browser.newContext({
    deviceScaleFactor: 1,
    viewport,
  });
  const page = await context.newPage();
  return { context, page };
}

async function stabilize(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addStyleTag({
    content: `
      *,
      *::before,
      *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
      }

      nextjs-portal,
      [data-next-badge-root],
      [aria-label="Open Next.js Dev Tools"],
      [data-nextjs-dev-tools-button],
      [data-nextjs-toast] {
        display: none !important;
        visibility: hidden !important;
      }
    `,
  });
}

async function setAuthOverride(page: Page) {
  await page.context().addCookies([
    {
      name: E2E_AUTH_OVERRIDE_COOKIE,
      sameSite: "Lax",
      url: BASE_URL,
      value: "authenticated",
    },
  ]);
  await page.addInitScript(
    ({ key, state }: { key: string; state: string }) => {
      window.localStorage.setItem(key, state);
    },
    { key: E2E_AUTH_OVERRIDE_KEY, state: "authenticated" },
  );
}

async function installPantryRoutes(
  page: Page,
  options: { empty?: boolean } = {},
) {
  await page.route("**/api/v1/pantry/bundles", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: { bundles },
        error: null,
      },
    });
  });

  await page.route((url) => url.pathname === "/api/v1/pantry", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fulfill({
        status: 201,
        json: { success: true, data: { added: 1, items: [] }, error: null },
      });
      return;
    }

    await route.fulfill({
      json: {
        success: true,
        data: { items: options.empty ? [] : pantryItems },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/ingredients**", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: { items: ingredients },
        error: null,
      },
    });
  });
}

test("capture Wave1 pantry authority evidence", async ({ browser }) => {
  await mkdir(EVIDENCE_DIR, { recursive: true });

  {
    const { context, page } = await preparePage(browser, viewports.mobile);
    await setAuthOverride(page);
    await installPantryRoutes(page);
    await page.goto(`${BASE_URL}/pantry`);
    await expect(page.getByText(/13\s*\/\s*29개/)).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "pantry-default.png"),
    });
    await context.close();
  }

  {
    const { context, page } = await preparePage(browser, viewports.narrow);
    await setAuthOverride(page);
    await installPantryRoutes(page);
    await page.goto(`${BASE_URL}/pantry`);
    await expect(page.getByText(/13\s*\/\s*29개/)).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "pantry-narrow.png"),
    });
    await context.close();
  }

  {
    const { context, page } = await preparePage(browser, viewports.mobile);
    await setAuthOverride(page);
    await installPantryRoutes(page);
    await page.goto(`${BASE_URL}/pantry`);
    await expect(page.getByText(/양파/)).toBeVisible();
    await page.getByRole("button", { name: "삭제" }).click();
    await page.getByRole("checkbox", { name: "양파 선택" }).click();
    await expect(page.getByRole("button", { name: "제거하기 (1)" })).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "pantry-select-delete.png"),
    });
    await context.close();
  }

  {
    const { context, page } = await preparePage(browser, viewports.mobile);
    await setAuthOverride(page);
    await installPantryRoutes(page, { empty: true });
    await page.goto(`${BASE_URL}/pantry`);
    await expect(page.getByText("아직 등록한 재료가 없어요")).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "pantry-empty.png"),
    });
    await context.close();
  }

  {
    const { context, page } = await preparePage(browser, viewports.mobile);
    await setAuthOverride(page);
    await installPantryRoutes(page);
    await page.goto(`${BASE_URL}/pantry`);
    await expect(page.getByText(/양파/)).toBeVisible();
    await page.getByRole("button", { name: /재료 추가/ }).first().click();
    await expect(page.getByRole("dialog", { name: "재료 추가" })).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "pantry-add-sheet.png"),
    });
    await context.close();
  }

  {
    const { context, page } = await preparePage(browser, viewports.narrow);
    await setAuthOverride(page);
    await installPantryRoutes(page);
    await page.goto(`${BASE_URL}/pantry`);
    await expect(page.getByText(/양파/)).toBeVisible();
    await page.getByRole("button", { name: /재료 추가/ }).first().click();
    await expect(page.getByRole("dialog", { name: "재료 추가" })).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "pantry-add-sheet-narrow.png"),
    });
    await context.close();
  }

  {
    const { context, page } = await preparePage(browser, viewports.mobile);
    await setAuthOverride(page);
    await installPantryRoutes(page);
    await page.goto(`${BASE_URL}/pantry`);
    await expect(page.getByText(/양파/)).toBeVisible();
    await page.getByRole("button", { name: "묶음으로 추가" }).click();
    await expect(
      page.getByRole("dialog", { name: "묶음으로 재료 추가" }),
    ).toBeVisible();
    await expect(page.getByText("한식 기본 양념")).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "pantry-bundle-picker.png"),
    });
    await context.close();
  }

  {
    const { context, page } = await preparePage(browser, viewports.narrow);
    await setAuthOverride(page);
    await installPantryRoutes(page);
    await page.goto(`${BASE_URL}/pantry`);
    await expect(page.getByText(/양파/)).toBeVisible();
    await page.getByRole("button", { name: "묶음으로 추가" }).click();
    await expect(
      page.getByRole("dialog", { name: "묶음으로 재료 추가" }),
    ).toBeVisible();
    await expect(page.getByText("한식 기본 양념")).toBeVisible();
    await stabilize(page);
    await page.screenshot({
      fullPage: false,
      path: path.join(EVIDENCE_DIR, "pantry-bundle-picker-narrow.png"),
    });
    await context.close();
  }
});
