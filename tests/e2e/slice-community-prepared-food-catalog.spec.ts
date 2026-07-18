import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Browser, type Page } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
const AUTH_KEY = "homecook.e2e-auth-override";
const PLAN_DATE = "2026-07-18";
const COLUMN_ID = "col-breakfast";
const SLOT_NAME = "아침";
const MENU_PATH = `/menu-add?date=${PLAN_DATE}&columnId=${COLUMN_ID}&slot=${encodeURIComponent(SLOT_NAME)}&source=product`;
const SETTINGS_PATH = "/settings";
const EVIDENCE_DIR = path.resolve(
  process.cwd(),
  "ui/designs/evidence/community-prepared-food-catalog/2026-07-18/playwright-auto",
);

type MutationError =
  | "editUnauthorized"
  | "deleteUnauthorized"
  | "deleteFailure"
  | "reportDuplicate"
  | "reportFailure"
  | "reportNotAllowed"
  | "editLocked"
  | "settingsDeleteFailure";

function createProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: "dataset-yogurt",
    name: "공공 요거트",
    brand: "공공 식품",
    visibility: "public",
    source_type: "public_dataset",
    editable: false,
    nutrition_version_id: "nutrition-version-dataset",
    basis_relations: [],
    nutrition: {
      basis: { amount: 100, unit: "g" },
      label_basis_text: null,
      values: {
        energy_kcal: {
          amount: 70,
          known_amount: null,
          status: "complete",
          display_mode: "total",
        },
      },
      calculation_status: "complete",
      calculation_quality: "direct",
      warnings: [],
      sources: [],
    },
    ...overrides,
  };
}

async function setAuthenticated(page: Page) {
  await page.context().addCookies([
    { name: AUTH_KEY, value: "authenticated", url: BASE_URL, sameSite: "Lax" },
  ]);
  await page.addInitScript(({ key }) => {
    window.localStorage.setItem(key, "authenticated");
  }, { key: AUTH_KEY });
}

async function setGuest(page: Page) {
  await page.context().addCookies([
    { name: AUTH_KEY, value: "guest", url: BASE_URL, sameSite: "Lax" },
  ]);
  await page.addInitScript(({ key }) => {
    window.localStorage.setItem(key, "guest");
  }, { key: AUTH_KEY });
}

async function installSettingsRoutes(page: Page, mutationError?: MutationError) {
  await page.route("**/api/v1/users/me/progress", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          level: {
            current_level: 6,
            total_xp: 520,
            current_level_start_xp: 500,
            next_level_start_xp: 650,
            xp_into_current_level: 20,
            xp_to_next_level: 130,
            progress_ratio: 0.1333,
            progress_percent: 13,
          },
          event_counts: {
            cooking_completed: 3,
            shopping_completed: 2,
            recipe_saved_distinct_ever: 7,
            custom_book_created: 1,
          },
          last_updated_at: "2026-06-10T00:00:00.000Z",
        },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/users/me/gamification", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          level: {
            current_level: 6,
            total_xp: 520,
            xp_to_next_level: 130,
            progress_percent: 13,
          },
          featured_badges: [],
          badges: { earned: [], locked: [] },
          quests: { active: [], completed_recent: [] },
          tutorial: { active_steps: [] },
          notifications: { unseen: [] },
          last_updated_at: "2026-06-10T00:00:00.000Z",
        },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/users/me/gamification/notifications/seen", async (route) => {
    await route.fulfill({ json: { success: true, data: { seen_notification_ids: [] }, error: null } });
  });

  await page.route("**/api/v1/planner/columns", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          columns: [
            { id: "col-1", name: "아침", sort_order: 0 },
            { id: "col-2", name: "점심", sort_order: 1 },
            { id: "col-3", name: "저녁", sort_order: 2 },
          ],
        },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/auth/logout", async (route) => {
    await route.fulfill({
      json: { success: true, data: { logged_out: true }, error: null },
    });
  });

  await page.route("**/api/v1/users/me/settings", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: { settings: { screen_wake_lock: false } },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/users/me", async (route) => {
    if (route.request().method() === "DELETE") {
      if (mutationError === "settingsDeleteFailure") {
        await route.fulfill({
          status: 500,
          json: {
            success: false,
            data: null,
            error: { code: "INTERNAL_ERROR", message: "탈퇴에 실패했어요.", fields: [] },
          },
        });
        return;
      }

      await route.fulfill({
        json: { success: true, data: { deleted: true }, error: null },
      });
      return;
    }

    await route.fulfill({
      json: {
        success: true,
        data: {
          id: "user-e2e",
          email: "e2e@example.com",
          nickname: "집밥러",
          profile_image_url: null,
          social_provider: "kakao",
          settings: { screen_wake_lock: false },
        },
        error: null,
      },
    });
  });
}

async function installCommunityRoutes(page: Page, mutationError?: MutationError) {
  await installSettingsRoutes(page, mutationError);

  let deleteFailureOnce = mutationError === "deleteFailure";
  let deleteUnauthorizedOnce = mutationError === "deleteUnauthorized";
  let editUnauthorizedOnce = mutationError === "editUnauthorized";
  let reportFailureOnce = mutationError === "reportFailure";
  let reportDuplicateOnce = mutationError === "reportDuplicate";
  let reportNotAllowedOnce = mutationError === "reportNotAllowed";
  let editLockedOnce = mutationError === "editLocked";
  let createdManualProduct: ReturnType<typeof createProduct> | null = null;

  await page.route("**/api/v1/food-products?*", async (route) => {
    const url = new URL(route.request().url());
    const query = url.searchParams.get("q") ?? "";
    const source = url.searchParams.get("source") ?? "all";

    const dataset = createProduct();
    const sharedManual = createProduct({
      id: "shared-manual",
      name: "공유 두유",
      brand: "두유 공방",
      source_type: "manual",
      visibility: "public",
      editable: false,
      nutrition_version_id: "nutrition-version-shared",
      nutrition: {
        ...createProduct().nutrition,
        basis: { amount: 190, unit: "ml" },
        label_basis_text: "1팩(190mL)",
        values: {
          energy_kcal: {
            amount: 99,
            known_amount: null,
            status: "complete",
            display_mode: "total",
          },
        },
      },
    });
    const ownerManual = createProduct({
      id: "owner-manual",
      name: "내 그래놀라",
      brand: "집밥 공방",
      source_type: "manual",
      visibility: "public",
      editable: true,
    });
    const legacyNoRelation = createProduct({
      id: "legacy-no-relation",
      name: "관계 없는 기존 간식",
      brand: "개인 보관",
      source_type: "manual",
      visibility: "private",
      editable: true,
      basis_relations: [],
      nutrition: {
        ...createProduct().nutrition,
        basis: { amount: 1, unit: "serving" },
        label_basis_text: "1회(1개)",
        values: {
          energy_kcal: {
            amount: 180,
            known_amount: null,
            status: "complete",
            display_mode: "total",
          },
        },
      },
    });

    const manualItems = [sharedManual, ownerManual, legacyNoRelation];
    if (createdManualProduct) {
      manualItems.unshift(createdManualProduct);
    }
    if (query === "없는 제품") {
      await route.fulfill({
        json: {
          success: true,
          data: { items: [], next_cursor: null, has_next: false },
          error: null,
        },
      });
      return;
    }
    const items = source === "manual"
      ? manualItems
      : [dataset, ...manualItems];

    await route.fulfill({
      json: {
        success: true,
        data: { items, next_cursor: null, has_next: false },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/food-products", async (route) => {
    const method = route.request().method();
    if (method !== "POST") {
      await route.continue();
      return;
    }

    createdManualProduct = createProduct({
      id: "created-manual",
      name: "공유 시리얼",
      brand: null,
      source_type: "manual",
      visibility: "public",
      editable: true,
      nutrition_version_id: "nutrition-version-created",
    });
    await route.fulfill({
      status: 201,
      json: {
        success: true,
        data: {
          product: createdManualProduct,
        },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/food-products/*/report", async (route) => {
    if (deleteUnauthorizedOnce) {
      deleteUnauthorizedOnce = false;
    }
    if (reportFailureOnce) {
      reportFailureOnce = false;
      await route.fulfill({
        status: 500,
        json: {
          success: false,
          data: null,
          error: { code: "INTERNAL_ERROR", message: "신고를 보내지 못했어요.", fields: [] },
        },
      });
      return;
    }
    if (reportDuplicateOnce) {
      reportDuplicateOnce = false;
      await route.fulfill({
        status: 409,
        json: {
          success: false,
          data: null,
          error: { code: "PRODUCT_ALREADY_REPORTED", message: "이미 신고한 제품이에요.", fields: [] },
        },
      });
      return;
    }
    if (reportNotAllowedOnce) {
      reportNotAllowedOnce = false;
      await route.fulfill({
        status: 409,
        json: {
          success: false,
          data: null,
          error: { code: "PRODUCT_REPORT_NOT_ALLOWED", message: "이 제품은 지금 신고할 수 없어요.", fields: [] },
        },
      });
      return;
    }

    await route.fulfill({
      status: 201,
      json: { success: true, data: { reported: true }, error: null },
    });
  });

  await page.route("**/api/v1/food-products/*", async (route) => {
    const method = route.request().method();
    const pathname = new URL(route.request().url()).pathname;
    const productId = pathname.split("/").at(-1);

    if (method === "PATCH") {
      if (editUnauthorizedOnce && productId === "owner-manual") {
        editUnauthorizedOnce = false;
        await route.fulfill({
          status: 401,
          json: {
            success: false,
            data: null,
            error: { code: "UNAUTHORIZED", message: "로그인이 필요해요.", fields: [] },
          },
        });
        return;
      }
      if (editLockedOnce && productId === "owner-manual") {
        editLockedOnce = false;
        await route.fulfill({
          status: 409,
          json: {
            success: false,
            data: null,
            error: {
              code: "PRODUCT_MODERATION_LOCKED",
              message: "현재 검토 또는 운영 제한 상태라 수정하거나 삭제할 수 없어요",
              fields: [],
            },
          },
        });
        return;
      }

      const body = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        json: {
          success: true,
          data: {
            product: createProduct({
              id: "owner-manual",
              name: body.name ?? "수정된 그래놀라",
              brand: body.brand ?? "집밥 공방",
              source_type: "manual",
              visibility: "public",
              editable: true,
            }),
          },
          error: null,
        },
      });
      return;
    }

    if (method === "DELETE") {
      if (deleteUnauthorizedOnce) {
        deleteUnauthorizedOnce = false;
        await route.fulfill({
          status: 401,
          json: {
            success: false,
            data: null,
            error: { code: "UNAUTHORIZED", message: "로그인이 필요해요.", fields: [] },
          },
        });
        return;
      }
      if (deleteFailureOnce) {
        deleteFailureOnce = false;
        await route.fulfill({
          status: 500,
          json: {
            success: false,
            data: null,
            error: { code: "INTERNAL_ERROR", message: "네트워크 오류", fields: [] },
          },
        });
        return;
      }

      await route.fulfill({
        json: { success: true, data: { deleted: true }, error: null },
      });
      return;
    }

    await route.continue();
  });

  await page.route("**/api/v1/product-planner-entries", async (route) => {
    await route.fulfill({
      status: 201,
      json: {
        success: true,
        data: {
          entry: {
            id: "entry-community-product",
            entry_type: "product",
            product_id: "shared-manual",
            product_name: "공유 두유",
            product_brand: "두유 공방",
            quantity: { amount: 100, unit: "ml" },
            workflow_status: null,
            product_nutrition_version_id: "nutrition-version-shared",
            basis_relations: [],
            nutrition: {
              basis: { amount: 190, unit: "ml" },
              label_basis_text: "1팩(190mL)",
              values: {
                energy_kcal: {
                  amount: 99,
                  known_amount: null,
                  status: "complete",
                  display_mode: "total",
                },
              },
              calculation_status: "complete",
              calculation_quality: "direct",
              warnings: [],
              sources: [],
            },
            plan_date: PLAN_DATE,
            column_id: COLUMN_ID,
          },
        },
        error: null,
      },
    });
  });
}

async function gotoPickerReady(page: Page, mutationError?: MutationError) {
  await setAuthenticated(page);
  await installCommunityRoutes(page, mutationError);
  await page.goto(MENU_PATH);
  await expect(page.getByRole("heading", { name: "완제품 추가" })).toBeVisible();
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth - doc.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(1);
}

async function openCreateForm(page: Page) {
  await page.getByRole("searchbox", { name: "완제품 검색" }).fill("없는 제품");
  await expect(page.getByText("검색 결과가 없어요")).toBeVisible();
  await page.getByRole("button", { name: "새 완제품 등록" }).click();
  await expect(page.getByRole("heading", { name: "완제품 직접 등록" })).toBeVisible();
}

async function captureViewportEvidence(
  browser: Browser,
  viewport: { suffix: string; width: number; height: number },
) {
  const context = await browser.newContext({
    deviceScaleFactor: 1,
    viewport: { width: viewport.width, height: viewport.height },
  });
  const page = await context.newPage();
  await gotoPickerReady(page);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: path.join(EVIDENCE_DIR, `food-product-picker-${viewport.suffix}.png`),
    scale: "css",
  });

  await page.getByRole("button", { name: "공유 두유 선택" }).click();
  const quantityInput = page.getByRole("spinbutton", { name: "완제품 수량" });
  const addCta = page.getByRole("button", { name: "아침에 완제품 추가" });
  await expect(quantityInput).toBeVisible();
  await expect(addCta).toBeVisible();
  await expect(addCta).toBeInViewport();
  await page.screenshot({
    path: path.join(EVIDENCE_DIR, `food-product-selected-${viewport.suffix}.png`),
    scale: "css",
  });

  if (viewport.width === 320 && viewport.height === 568) {
    const ctaBox = await addCta.boundingBox();
    expect(ctaBox).not.toBeNull();
    expect((ctaBox?.y ?? 0) + (ctaBox?.height ?? 0)).toBeLessThanOrEqual(568);
  }

  await openCreateForm(page);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: path.join(EVIDENCE_DIR, `food-product-create-${viewport.suffix}.png`),
    scale: "css",
  });

  await page.goto(SETTINGS_PATH);
  await expect(page.getByText("계정 삭제하기")).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: path.join(EVIDENCE_DIR, `settings-${viewport.suffix}.png`),
    scale: "css",
  });
  await page.getByText("계정 삭제하기").click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.screenshot({
    path: path.join(EVIDENCE_DIR, `settings-delete-dialog-${viewport.suffix}.png`),
    scale: "css",
  });

  await page.goto("/planner");
  const weekNutritionSummary = page.getByTestId("planner-week-nutrition-summary");
  await expect(weekNutritionSummary).toBeVisible();
  await expect(weekNutritionSummary).toContainText("kcal", { timeout: 15_000 });
  const plannerProductRow = page.getByText("플레인 요거트").first();
  await expect(plannerProductRow).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.keyboard.press("Home");
  expect(await page.evaluate(() => window.scrollY)).toBeLessThanOrEqual(1);
  if (viewport.width === 320) {
    const bottomNav = page.getByRole("navigation", { name: "플래너 하단 탭" });
    const rowBox = await plannerProductRow.boundingBox();
    const navBox = await bottomNav.boundingBox();
    expect(rowBox).not.toBeNull();
    expect(navBox).not.toBeNull();
    const visibleHeight = Math.min(rowBox!.y + rowBox!.height, navBox!.y) - Math.max(rowBox!.y, 0);
    expect(visibleHeight).toBeGreaterThanOrEqual(12);
  }
  await page.screenshot({
    path: path.join(EVIDENCE_DIR, `planner-week-after-${viewport.suffix}.png`),
    scale: "css",
  });
  if (viewport.width < 1280) {
    await plannerProductRow.evaluate((element) => {
      element.scrollIntoView({ block: "center", inline: "nearest" });
    });
    await expect(plannerProductRow).toBeInViewport();
    const productRowBox = await plannerProductRow.boundingBox();
    expect(productRowBox).not.toBeNull();
    expect(productRowBox?.y ?? 0).toBeGreaterThanOrEqual(52);
    expect((productRowBox?.y ?? 0) + (productRowBox?.height ?? 0)).toBeLessThanOrEqual(viewport.height - 76);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `planner-week-row-after-${viewport.suffix}.png`),
      scale: "css",
    });
  }
  await context.close();
}

test.describe("community prepared food catalog Stage 4", () => {
  test("shows source filter and badges, keeps 100g/100mL defaults, and avoids legacy inference @smoke-core", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chrome", "community slice runs once with exact checks");
    await gotoPickerReady(page);

    await expect(page.getByRole("button", { name: "전체" })).toBeVisible();
    await expect(page.getByRole("button", { name: "공공 영양DB" })).toBeVisible();
    await expect(page.getByRole("button", { name: "사용자 등록" })).toBeVisible();
    await expect(page.getByRole("button", { name: "공공 요거트 선택" }).getByText("공공 영양DB")).toBeVisible();
    await expect(page.getByRole("button", { name: "공유 두유 선택" }).getByText("사용자 등록")).toBeVisible();
    await expect(page.getByRole("button", { name: "관계 없는 기존 간식 선택" }).getByText("비공개 보관")).toBeVisible();

    await page.getByRole("button", { name: "사용자 등록" }).click();
    await expect(page.getByText("공공 요거트")).toHaveCount(0);
    await expect(page.getByText("공유 두유")).toBeVisible();

    await page.getByRole("button", { name: "공유 두유 선택" }).click();
    const quantityInput = page.getByRole("spinbutton", { name: "완제품 수량" });
    await expect(quantityInput).toHaveValue("100");
    await expect(quantityInput).toHaveAttribute("step", "1");
    await expect(page.getByText("100mL 기준")).toBeVisible();

    await page.getByRole("button", { name: "관계 없는 기존 간식 선택" }).click();
    await expect(quantityInput).toHaveValue("1");
    await expect(page.getByText("100g/100mL 비교 불가")).toBeVisible();
    await expect(page.getByText("기준 1회")).toBeVisible();
  });

  test("shows public create notice, default 100g, syncs manual filter+query after create, and owner edit lock feedback", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chrome", "community slice runs once with exact checks");
    await gotoPickerReady(page, "editLocked");

    await page.getByRole("button", { name: "공공 영양DB" }).click();
    await openCreateForm(page);
    await expect(page.getByText("다른 로그인 사용자도 검색하고 식단에 추가할 수 있어요.")).toBeVisible();
    await expect(page.getByText("등록자만 수정·삭제할 수 있고, 다른 사용자는 읽기와 추가만 가능해요.")).toBeVisible();
    await expect(page.getByRole("spinbutton", { name: "기준량" })).toHaveValue("100");
    await page.getByRole("textbox", { name: /제품명/ }).fill("공유 시리얼");
    await page.getByRole("textbox", { name: /원 라벨 기준량/ }).fill("1회(40g)");
    await page.getByRole("spinbutton", { name: /열량/ }).fill("180");
    await page.getByRole("button", { name: "등록하고 선택" }).click();
    await expect(page.getByRole("heading", { name: "완제품 추가" })).toBeVisible();
    await expect(page.getByRole("button", { name: "사용자 등록" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("searchbox", { name: "완제품 검색" })).toHaveValue("공유 시리얼");
    await expect(page.getByRole("button", { name: "공유 시리얼 선택" })).toBeVisible();
    await expect(page.getByText("공공 요거트")).toHaveCount(0);

    await page.getByRole("button", { name: "내 그래놀라 수정" }).click();
    await expect(page.getByRole("heading", { name: "사용자 등록 제품 수정" })).toBeVisible();
    await page.getByRole("textbox", { name: /제품명/ }).fill("수정된 그래놀라");
    await page.getByRole("button", { name: "변경 내용 저장" }).click();
    await expect(page.getByText("현재 검토 또는 운영 제한 상태라 수정하거나 삭제할 수 없어요")).toBeVisible();
  });

  test("retries owner delete in the same confirm dialog", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chrome", "community slice runs once with exact checks");
    await gotoPickerReady(page, "deleteFailure");

    await page.getByRole("button", { name: "내 그래놀라 삭제" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog.getByText('"내 그래놀라" 제품을 삭제할까요?')).toBeVisible();
    await dialog.getByRole("button", { name: "삭제" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("네트워크 오류");
    await dialog.getByRole("button", { name: "삭제" }).click();
    await expect(dialog).toHaveCount(0);
  });

  test("shows report only for eligible shared manual products and retries with the same reason/detail", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chrome", "community slice runs once with exact checks");
    await gotoPickerReady(page, "reportFailure");

    await expect(page.getByRole("button", { name: "공유 두유 신고" })).toBeVisible();
    await expect(page.getByRole("button", { name: "내 그래놀라 신고" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "공공 요거트 신고" })).toHaveCount(0);

    await page.getByRole("button", { name: "공유 두유 신고" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText('"공유 두유" 제품 신고')).toBeVisible();
    await expect(dialog.getByLabel("스팸·광고예요")).toBeVisible();
    await expect(dialog.getByLabel("영양 정보가 달라요")).toBeVisible();
    await expect(dialog.getByLabel("중복 제품이에요")).toBeVisible();
    await expect(dialog.getByLabel("권리 침해가 있어요")).toBeVisible();
    await expect(dialog.getByLabel("안전 문제가 있어요")).toBeVisible();
    await expect(dialog.getByLabel("기타")).toBeVisible();

    await dialog.getByLabel("권리 침해가 있어요").check();
    await dialog.getByRole("textbox", { name: /상세 설명/ }).fill("상세 신고 메모");
    await dialog.getByRole("button", { name: "신고 보내기" }).click();
    await expect(dialog.getByRole("alert")).toContainText("신고를 보내지 못했어요.");
    await dialog.getByRole("button", { name: "신고 보내기" }).click();
    await expect(page.getByRole("status")).toHaveText("신고했어요.");
  });

  test("PATCH 401 keeps edit return context with product id/action and restores the same edit draft after login", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chrome", "community slice runs once with exact checks");
    await gotoPickerReady(page, "editUnauthorized");

    await page.getByRole("button", { name: "내 그래놀라 수정" }).click();
    await expect(page.getByRole("heading", { name: "사용자 등록 제품 수정" })).toBeVisible();
    await page.getByRole("textbox", { name: /제품명/ }).fill("로그인 복원 그래놀라");
    await setGuest(page);
    await page.getByRole("button", { name: "변경 내용 저장" }).click();

    await expect.poll(() => new URL(page.url()).pathname).toBe("/login");
    const loginUrl = new URL(page.url());
    const nextPath = decodeURIComponent(loginUrl.searchParams.get("next") ?? "");
    expect(nextPath).toContain("productId=owner-manual");
    expect(nextPath).toContain("productAction=edit");

    const storedContext = await page.evaluate(() => JSON.parse(
      window.sessionStorage.getItem("homecook.food-product-planner-return-context.v1") ?? "null",
    ));
    expect(storedContext).toMatchObject({
      kind: "create",
      source: "all",
      productId: "owner-manual",
      action: "edit",
      draft: {
        name: "로그인 복원 그래놀라",
      },
    });

    await setAuthenticated(page);
    await page.goto(nextPath);
    await expect(page.getByRole("heading", { name: "사용자 등록 제품 수정" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /제품명/ })).toHaveValue("로그인 복원 그래놀라");
    await expect(page.getByRole("button", { name: "변경 내용 저장" })).toBeVisible();

    await page.getByRole("button", { name: "변경 내용 저장" }).click();
    await expect(page.getByRole("heading", { name: "완제품 추가" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "사용자 등록 제품 수정" })).toHaveCount(0);
    expect(await page.evaluate(() => window.sessionStorage.getItem("homecook.food-product-planner-return-context.v1"))).toBeNull();
  });

  test("maps duplicate and not-allowed report errors to official copy", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chrome", "community slice runs once with exact checks");
    await gotoPickerReady(page, "reportDuplicate");

    await page.getByRole("button", { name: "공유 두유 신고" }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "신고 보내기" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("이미 신고한 제품이에요.");
    await page.goto("about:blank");
    await gotoPickerReady(page, "reportNotAllowed");
    await page.getByRole("button", { name: "공유 두유 신고" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "신고 보내기" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("이 제품은 지금 신고할 수 없어요.");
  });

  test("shows account deletion preservation copy in settings", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chrome", "community slice runs once with exact checks");
    await setAuthenticated(page);
    await installSettingsRoutes(page);
    await page.goto(SETTINGS_PATH);

    await expect(page.getByText("계정 삭제하기")).toBeVisible();
    await expect(
      page.getByText("개인 기록은 삭제되고, 공개한 사용자 등록 완제품은 등록자 정보 없이 읽기 전용으로 남아 다른 사용자의 기존 식단 기록을 보호해요."),
    ).toBeVisible();
    await page.getByText("계정 삭제하기").click();
    await expect(page.getByRole("alertdialog")).toContainText(
      "레시피북, 플래너, 장보기, 팬트리 등 개인 기록은 삭제되며 되돌릴 수 없어요. 공개한 사용자 등록 완제품은 등록자 정보 없이 읽기 전용으로 남아 다른 사용자의 기존 식단 기록을 보호해요.",
    );
  });

  test("delete/report dialogs keep focus inside, expose aria labels, close on Escape, and return focus to the trigger", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chrome", "community slice runs once with exact checks");
    await gotoPickerReady(page);

    const deleteTrigger = page.getByRole("button", { name: "내 그래놀라 삭제" });
    await deleteTrigger.click();
    const deleteDialog = page.getByRole("alertdialog");
    const deleteCancel = deleteDialog.getByRole("button", { name: "취소" });
    const deleteConfirm = deleteDialog.getByRole("button", { name: "삭제" });
    await expect(deleteDialog).toHaveAttribute("aria-labelledby", "food-product-delete-title");
    await expect(deleteDialog).toHaveAttribute("aria-describedby", "food-product-delete-description");
    await expect(deleteCancel).toBeFocused();
    await deleteConfirm.focus();
    await page.keyboard.press("Tab");
    await expect(deleteCancel).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(deleteConfirm).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(deleteDialog).toHaveCount(0);
    await expect(deleteTrigger).toBeFocused();

    const reportTrigger = page.getByRole("button", { name: "공유 두유 신고" });
    await reportTrigger.click();
    const reportDialog = page.getByRole("dialog");
    const firstReason = reportDialog.getByLabel("스팸·광고예요");
    const reportSubmit = reportDialog.getByRole("button", { name: "신고 보내기" });
    await expect(reportDialog).toHaveAttribute("aria-labelledby", "food-product-report-title");
    await expect(reportDialog).toHaveAttribute("aria-describedby", "food-product-report-description");
    await expect(firstReason).toBeFocused();
    await reportSubmit.focus();
    await page.keyboard.press("Tab");
    await expect(firstReason).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(reportDialog).toHaveCount(0);
    await expect(reportTrigger).toBeFocused();
  });

  test("keeps 320/390/1280 surfaces overflow-safe and 44px targets, and captures new community evidence", async ({ browser, page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chrome", "exact viewport matrix runs once");
    await mkdir(EVIDENCE_DIR, { recursive: true });

    for (const viewport of [
      { suffix: "390", width: 390, height: 844 },
      { suffix: "320", width: 320, height: 568 },
      { suffix: "1280", width: 1280, height: 900 },
    ] as const) {
      await captureViewportEvidence(browser, viewport);
    }

    await gotoPickerReady(page);
    await expectNoHorizontalOverflow(page);
    const filterButton = page.getByRole("button", { name: "사용자 등록" });
    const pickerCloseButton = page.getByLabel("완제품 선택 닫기");
    expect((await filterButton.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect((await pickerCloseButton.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

    await page.getByRole("button", { name: "공유 두유 선택" }).click();
    const quantityInput = page.getByRole("spinbutton", { name: "완제품 수량" });
    expect((await quantityInput.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

    await openCreateForm(page);
    await expectNoHorizontalOverflow(page);
    const createAction = page.getByRole("button", { name: "등록하고 선택" });
    expect((await createAction.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

    await page.goto(SETTINGS_PATH);
    await expectNoHorizontalOverflow(page);
    const deleteButton = page.getByText("계정 삭제하기");
    expect((await deleteButton.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  });
});
