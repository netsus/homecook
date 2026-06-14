import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import {
  COOK_MODE_VISUAL_PATH,
  ATE_LIST_VISUAL_PATH,
  installAccountLibraryVisualRoutes,
  installCookingVisualRoutes,
  installDiscoveryRoutes,
  installLeftoversVisualRoutes,
  installMenuAddVisualRoutes,
  installMealDetailRoutes,
  installPantryShoppingVisualRoutes,
  installPlannerWeekRoutes,
  installRecipeDetailRoutes,
  LOGIN_VISUAL_PATH,
  LEFTOVERS_VISUAL_PATH,
  installYoutubeImportVisualRoutes,
  MANUAL_CREATE_VISUAL_PATH,
  MEAL_VISUAL_PATH,
  MENU_ADD_VISUAL_PATH,
  MYPAGE_VISUAL_PATH,
  PANTRY_VISUAL_PATH,
  RECIPE_PATH,
  RECIPEBOOK_DETAIL_VISUAL_PATH,
  setE2EAuthOverride,
  SETTINGS_VISUAL_PATH,
  SHOPPING_DETAIL_COMPLETED_VISUAL_PATH,
  SHOPPING_DETAIL_VISUAL_PATH,
  SHOPPING_FLOW_VISUAL_PATH,
  STANDALONE_COOK_MODE_VISUAL_PATH,
  YOUTUBE_IMPORT_VISUAL_PATH,
} from "./helpers/mock-routes";

async function expectNoAxeViolations(
  page: import("@playwright/test").Page,
  {
    allowPrototypeDesktopColorContrast = false,
    allowBrightBrandColorContrast = false,
  }: {
    allowBrightBrandColorContrast?: boolean;
    allowPrototypeDesktopColorContrast?: boolean;
  } = {},
) {
  const builder = new AxeBuilder({ page });

  if (allowPrototypeDesktopColorContrast && !isMobileViewport(page)) {
    // Desktop prototype parity intentionally keeps the locked visual color tokens.
    // Keep all non-color axe rules active so semantic/accessibility regressions
    // still fail this smoke test.
    builder.disableRules(["color-contrast"]);
  }

  const results = await builder.analyze();
  const violations = allowBrightBrandColorContrast
    ? results.violations
        .map((violation) =>
          violation.id === "color-contrast"
            ? {
                ...violation,
                nodes: violation.nodes.filter(
                  (node) => !isAllowedBrightBrandContrastNode(node),
                ),
              }
            : violation,
        )
        .filter((violation) => violation.nodes.length > 0)
    : results.violations;

  expect(violations).toEqual([]);
}

function isMobileViewport(page: Page) {
  return (page.viewportSize()?.width ?? 1280) < 1024;
}

function isAllowedBrightBrandContrastNode(
  node: Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"][number]["nodes"][number],
) {
  const brightBrandColors = new Set(["#00a1ff", "#ebf7ff"]);

  return [...node.all, ...node.any, ...node.none].some((check) => {
    if (check.id !== "color-contrast") {
      return false;
    }

    const data = check.data as { bgColor?: string; fgColor?: string } | undefined;

    return Boolean(
      data
        && (brightBrandColors.has(data.fgColor ?? "")
          || brightBrandColors.has(data.bgColor ?? "")),
    );
  });
}

function visibleSearchInput(page: Page) {
  return page.locator('input[placeholder="레시피 제목 검색"]:visible').first();
}

function visibleTextButton(page: Page, text: string | RegExp) {
  return page.locator("button:visible").filter({ hasText: text }).first();
}

function visibleSortButton(page: Page) {
  return visibleTextButton(
    page,
    /조회수순|최신순|저장순|플래너 등록순|정렬 기준/i,
  );
}

async function installMypageGrowthA11yRoutes(page: Page) {
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
            cooking_completed: 5,
            shopping_completed: 3,
            recipe_saved_distinct_ever: 9,
            custom_book_created: 2,
            planner_registered_first: 1,
            planner_registered_repeat: 4,
          },
          last_updated_at: "2026-06-12T00:00:00.000Z",
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
          grade: {
            grade_key: "homecook_runner",
            label: "집밥 러너",
            level_min: 4,
            level_max: 7,
          },
          featured_badges: [
            {
              badge_key: "first_cook_done",
              label: "첫 집밥 완성",
              description: "첫 요리 완료를 기록했어요.",
              category: "cooking",
              shape_key: "pot",
              locked_hint: null,
              earned_at: "2026-06-12T00:00:00.000Z",
              is_new: false,
            },
          ],
          badges: { earned: [], locked: [] },
          quests: { active: [], completed_recent: [] },
          tutorial: {
            category_key: "tutorial",
            completed_count: 0,
            total_count: 0,
            active_steps: [],
          },
          achievement_album: {
            summary: {
              earned_count: 1,
              total_count: 1,
              completed_category_count: 0,
            },
            categories: [],
          },
          notifications: { unseen: [], priority_unseen: [], archive_preview: [] },
          last_updated_at: "2026-06-12T00:00:00.000Z",
        },
        error: null,
      },
    });
  });
}

async function expectDesktopMypageNavLabel(page: Page) {
  const nav = page.getByRole("navigation", { name: "데스크탑 주요 메뉴" });

  await expect(nav.getByRole("link", { name: "마이페이지" })).toBeVisible();
  await expect(
    nav.getByRole("link", { exact: true, name: "마이" }),
  ).toHaveCount(0);
}

function getLoginActionButton(
  page: import("@playwright/test").Page,
) {
  return page
    .getByRole("dialog", { name: "로그인이 필요한 작업이에요" })
    .getByRole("button", { name: "로그인" });
}

async function expectReadableTouchTarget(
  locator: import("@playwright/test").Locator,
  {
    minimumFontSize = 14,
    minimumHeight = 44,
  }: {
    minimumFontSize?: number;
    minimumHeight?: number;
  } = {},
) {
  await expect(locator).toBeVisible();

  const metrics = await locator.evaluate((element) => {
    const target = element as HTMLElement;
    const style = window.getComputedStyle(target);
    const rect = target.getBoundingClientRect();

    return {
      fontSize: Number.parseFloat(style.fontSize),
      height: rect.height,
    };
  });

  expect(metrics.fontSize).toBeGreaterThanOrEqual(minimumFontSize);
  expect(metrics.height).toBeGreaterThanOrEqual(minimumHeight);
}

async function readTypographyMetrics(
  locator: import("@playwright/test").Locator,
) {
  await expect(locator).toBeVisible();

  return locator.evaluate((element) => {
    const style = window.getComputedStyle(element as HTMLElement);

    return {
      fontSize: Number.parseFloat(style.fontSize),
      fontWeight: style.fontWeight,
      letterSpacing: style.letterSpacing,
    };
  });
}

async function expectCompatibleControlTypography(
  reference: import("@playwright/test").Locator,
  candidate: import("@playwright/test").Locator,
) {
  const [referenceMetrics, candidateMetrics] = await Promise.all([
    readTypographyMetrics(reference),
    readTypographyMetrics(candidate),
  ]);

  expect(
    Math.abs(candidateMetrics.fontSize - referenceMetrics.fontSize),
  ).toBeLessThanOrEqual(2);
  const referenceWeight = Number.parseInt(referenceMetrics.fontWeight, 10);
  const candidateWeight = Number.parseInt(candidateMetrics.fontWeight, 10);
  expect(referenceWeight).toBeGreaterThanOrEqual(400);
  expect(candidateWeight).toBeGreaterThanOrEqual(400);
  expect(Math.abs(candidateWeight - referenceWeight)).toBeLessThanOrEqual(200);
  expect(candidateMetrics.letterSpacing).toBe(referenceMetrics.letterSpacing);
}

async function expectSingleLineControlLabel(
  locator: import("@playwright/test").Locator,
) {
  await expect(locator).toBeVisible();

  const metrics = await locator.evaluate((element) => {
    const target = element as HTMLElement;
    const style = window.getComputedStyle(target);
    const rect = target.getBoundingClientRect();

    return {
      height: rect.height,
      whiteSpace: style.whiteSpace,
      writingMode: style.writingMode,
    };
  });

  expect(metrics.whiteSpace).toBe("nowrap");
  expect(metrics.writingMode).toBe("horizontal-tb");
  expect(metrics.height).toBeLessThanOrEqual(52);
}

async function expectCompactToolbarControl(
  locator: import("@playwright/test").Locator,
) {
  await expect(locator).toBeVisible();

  const metrics = await locator.evaluate((element) => {
    const target = element as HTMLElement;
    const style = window.getComputedStyle(target);
    const rect = target.getBoundingClientRect();

    return {
      height: rect.height,
      whiteSpace: style.whiteSpace,
    };
  });

  expect(metrics.whiteSpace).toBe("nowrap");
  expect(metrics.height).toBeLessThanOrEqual(48);
}

test.describe("QA accessibility smoke", () => {
  test("home and recipe detail are axe-clean @a11y-core", async ({ page }) => {
    await installDiscoveryRoutes(page);
    await installRecipeDetailRoutes(page);

    await page.goto("/");
    await expect(visibleSearchInput(page)).toBeVisible();
    await expectNoAxeViolations(page, {
      allowBrightBrandColorContrast: true,
      allowPrototypeDesktopColorContrast: true,
    });
    const ingredientSearchButton = visibleTextButton(page, "재료로 검색");
    const sortButton = visibleSortButton(page);

    await expectReadableTouchTarget(ingredientSearchButton);
    await expectReadableTouchTarget(sortButton);
    await sortButton.click();
    const plannerOption = page
      .locator('[role="option"]:visible')
      .filter({ hasText: "플래너 등록순" })
      .first();
    await expect(
      plannerOption,
    ).toBeVisible();
    await expectNoAxeViolations(page, {
      allowBrightBrandColorContrast: true,
      allowPrototypeDesktopColorContrast: true,
    });
    await expectReadableTouchTarget(plannerOption);

    await page.goto(RECIPE_PATH);
    await expect(
      page.getByRole("heading", { name: "집밥 김치찌개" }),
    ).toBeVisible();
    await expectNoAxeViolations(page, {
      allowBrightBrandColorContrast: true,
      allowPrototypeDesktopColorContrast: true,
    });
    await expectReadableTouchTarget(
      visibleTextButton(page, "플래너에 추가"),
    );
    await expectReadableTouchTarget(
      page.locator('button:visible[aria-label*="좋아요"]').first(),
      { minimumHeight: isMobileViewport(page) ? 44 : 36 },
    );
  });

  test("ingredient filter and login gate dialogs are axe-clean @a11y-core", async ({
    page,
  }) => {
    await installDiscoveryRoutes(page);
    await installRecipeDetailRoutes(page);

    await page.goto("/");
    await visibleTextButton(page, "재료로 검색").click();
    await expect(
      page.getByRole("dialog", { name: "재료로 검색" }),
    ).toBeVisible();
    await expectNoAxeViolations(page, {
      allowBrightBrandColorContrast: true,
      allowPrototypeDesktopColorContrast: true,
    });
    await expectReadableTouchTarget(
      page.getByRole("button", { name: /적용/ }),
    );
    await expectReadableTouchTarget(
      page.getByRole("button", { name: "닫기" }),
      { minimumHeight: isMobileViewport(page) ? 44 : 40 },
    );

    await page.goto(RECIPE_PATH);
    await visibleTextButton(page, "플래너에 추가").click();
    await expect(
      page.getByRole("dialog", { name: "로그인이 필요한 작업이에요" }),
    ).toBeVisible();
    await expectNoAxeViolations(page, {
      allowBrightBrandColorContrast: true,
      allowPrototypeDesktopColorContrast: true,
    });
    await expectReadableTouchTarget(getLoginActionButton(page));
  });

  test("home toolbar and ingredient dialog controls keep design lock metrics", async ({
    page,
  }) => {
    await installDiscoveryRoutes(page);

    await page.goto("/");
    await expect(visibleSearchInput(page)).toBeVisible();
    const ingredientSearchButton = visibleTextButton(page, "재료로 검색");
    const sortButton = visibleSortButton(page);

    if (isMobileViewport(page)) {
      await expectCompatibleControlTypography(ingredientSearchButton, sortButton);
    }
    await expectCompactToolbarControl(sortButton);

    await ingredientSearchButton.click();
    await expect(
      page.getByRole("dialog", { name: "재료로 검색" }),
    ).toBeVisible();
    await expectSingleLineControlLabel(
      page.getByRole("button", { name: "초기화" }),
    );
    await expectSingleLineControlLabel(
      page.getByRole("button", { name: /적용/ }),
    );
  });

  test("planner and meal desktop screens are axe-clean", async ({ page }) => {
    test.skip(isMobileViewport(page), "desktop-only planner/meal parity smoke");
    await setE2EAuthOverride(page);
    await installPlannerWeekRoutes(page);
    await installMealDetailRoutes(page);

    await page.goto("/planner");
    await expect(
      page.getByRole("heading", { name: "주간 플래너" }),
    ).toBeVisible();
    await expectNoAxeViolations(page, {
      allowPrototypeDesktopColorContrast: true,
    });

    await page.goto(MEAL_VISUAL_PATH);
    await expect(
      page.locator('[data-testid="meal-recipe-link-meal-visual-1"]:visible'),
    ).toBeVisible();
    await expectNoAxeViolations(page, {
      allowPrototypeDesktopColorContrast: true,
    });

    await page
      .getByRole("article", { name: "김치찌개 끼니 음식" })
      .getByRole("button", { name: "인분 증가" })
      .click();
    await expect(
      page.getByRole("dialog", { name: "인분 변경" }),
    ).toBeVisible();
    await expectNoAxeViolations(page, {
      allowPrototypeDesktopColorContrast: true,
    });
  });

  test("menu add desktop slice screens are axe-clean", async ({ page }) => {
    test.skip(isMobileViewport(page), "desktop-only menu add parity smoke");
    await setE2EAuthOverride(page);
    await installMenuAddVisualRoutes(page);

    await page.goto(MENU_ADD_VISUAL_PATH);
    await expect(
      page.getByRole("heading", { name: "식사 추가" }),
    ).toBeVisible();
    await expectNoAxeViolations(page, {
      allowPrototypeDesktopColorContrast: true,
    });

    await page.locator('[data-testid="menu-add-option-recipebook"]:visible').click();
    await expect(
      page.getByRole("button", { name: /평일 저녁 빠른요리/ }),
    ).toBeVisible();
    await expectNoAxeViolations(page, {
      allowPrototypeDesktopColorContrast: true,
    });

    await page.goto(`${MENU_ADD_VISUAL_PATH}&source=pantry`);
    await expect(page.getByRole("heading", { name: "팬트리 추천" })).toBeVisible();
    await expectNoAxeViolations(page, {
      allowPrototypeDesktopColorContrast: true,
    });

    await page.goto(MANUAL_CREATE_VISUAL_PATH);
    await expect(
      page.getByRole("heading", { name: "새 레시피를 직접 등록해요" }),
    ).toBeVisible();
    await expectNoAxeViolations(page, {
      allowPrototypeDesktopColorContrast: true,
    });

    await page.getByRole("button", { name: /재료 추가/ }).click();
    await expect(
      page.getByRole("dialog", { name: "재료로 검색" }),
    ).toBeVisible();
    await expectNoAxeViolations(page, {
      allowPrototypeDesktopColorContrast: true,
    });
  });

  test("youtube import desktop flow is axe-clean", async ({ page }) => {
    test.skip(isMobileViewport(page), "desktop-only youtube import parity smoke");
    await setE2EAuthOverride(page);
    await installYoutubeImportVisualRoutes(page);

    await page.goto(YOUTUBE_IMPORT_VISUAL_PATH);
    await expect(
      page.getByRole("heading", { name: "영상 링크에서 레시피를 추출해요" }),
    ).toBeVisible();
    await expectNoAxeViolations(page, {
      allowPrototypeDesktopColorContrast: true,
    });

    await page
      .locator('input[type="url"]')
      .fill("https://www.youtube.com/watch?v=recipe12345");
    await page.getByRole("button", { name: "가져오기" }).click();
    await expect(
      page.getByRole("heading", { name: "추출 결과를 확인해주세요" }),
    ).toBeVisible();
    await expectNoAxeViolations(page, {
      allowPrototypeDesktopColorContrast: true,
    });
  });

  test("pantry and shopping desktop slice screens are axe-clean", async ({
    page,
  }) => {
    test.skip(isMobileViewport(page), "desktop-only pantry/shopping parity smoke");
    await setE2EAuthOverride(page);
    await installPantryShoppingVisualRoutes(page);

    await page.goto(PANTRY_VISUAL_PATH);
    await expect(page.getByRole("heading", { name: "나의 팬트리" })).toBeVisible();
    await expectNoAxeViolations(page, {
      allowPrototypeDesktopColorContrast: true,
    });

    await visibleTextButton(page, "+ 재료 추가").click();
    const addDialog = page.getByRole("dialog", {
      name: "재료 추가",
    });
    await expect(addDialog).toBeVisible();
    await expectNoAxeViolations(page, {
      allowPrototypeDesktopColorContrast: true,
    });
    await addDialog.getByRole("button", { name: "닫기" }).click();

    await visibleTextButton(page, "묶음 추가").click();
    const bundleDialog = page.getByRole("dialog", {
      name: "묶음으로 재료 추가",
    });
    await expect(bundleDialog).toBeVisible();
    await expectNoAxeViolations(page, {
      allowPrototypeDesktopColorContrast: true,
    });

    await page.goto(SHOPPING_FLOW_VISUAL_PATH);
    await expect(
      page.getByRole("heading", { name: "장보기 준비" }),
    ).toBeVisible();
    await expectDesktopMypageNavLabel(page);
    await expectNoAxeViolations(page, {
      allowPrototypeDesktopColorContrast: true,
    });

    await page.goto(SHOPPING_DETAIL_VISUAL_PATH);
    await expect(
      page.getByRole("heading", { name: "5월 18일 장보기" }),
    ).toBeVisible();
    await expectDesktopMypageNavLabel(page);
    await expectNoAxeViolations(page, {
      allowPrototypeDesktopColorContrast: true,
    });

    await page.getByRole("button", { name: "장보기 완료" }).click();
    await expect(
      page.getByRole("dialog", { name: /팬트리에 반영할까요/ }),
    ).toBeVisible();
    await expectNoAxeViolations(page, {
      allowPrototypeDesktopColorContrast: true,
    });

    await page.goto(SHOPPING_DETAIL_COMPLETED_VISUAL_PATH);
    await expect(
      page.getByRole("heading", { name: "5월 18일 장보기" }),
    ).toBeVisible();
    await expectDesktopMypageNavLabel(page);
    await expectNoAxeViolations(page, {
      allowPrototypeDesktopColorContrast: true,
    });
  });

  test("login, mypage, recipebooks, and settings desktop slice screens are axe-clean", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    test.skip(isMobileViewport(page), "desktop-only account/library parity smoke");

    await page.goto(LOGIN_VISUAL_PATH);
    await expect(
      page.getByRole("heading", { name: "로그인이 필요해요" }),
    ).toBeVisible();
    await expectNoAxeViolations(page, {
      allowPrototypeDesktopColorContrast: true,
    });

    await setE2EAuthOverride(page);
    await installAccountLibraryVisualRoutes(page);
    await installMypageGrowthA11yRoutes(page);

    await page.goto(MYPAGE_VISUAL_PATH);
    await expect(page.getByRole("heading", { name: "저장한 레시피" })).toBeVisible();
    await expectNoAxeViolations(page, {
      allowPrototypeDesktopColorContrast: true,
    });
    const profileEditButton = page.getByTestId("mypage-profile-edit-button");
    await expect(profileEditButton).toBeVisible({ timeout: 15_000 });
    await profileEditButton.click();
    await expect(page.getByRole("dialog", { name: "닉네임 변경" })).toBeVisible();
    await expectNoAxeViolations(page, {
      allowPrototypeDesktopColorContrast: true,
    });
    await page.getByRole("button", { name: "취소" }).click();
    await expect(page.getByRole("dialog", { name: "닉네임 변경" })).toHaveCount(0);

    const recipebookTab = page.getByRole("tab", { name: /레시피북/ });
    await expectReadableTouchTarget(recipebookTab);

    await recipebookTab.click();
    await expect(page.getByRole("heading", { name: "레시피북" })).toBeVisible();
    await expectNoAxeViolations(page, {
      allowPrototypeDesktopColorContrast: true,
    });

    await page.goto(RECIPEBOOK_DETAIL_VISUAL_PATH);
    await expect(page.getByRole("heading", { name: "주말 파티" })).toBeVisible();
    await expectNoAxeViolations(page, {
      allowPrototypeDesktopColorContrast: true,
    });

    await page.goto(MYPAGE_VISUAL_PATH);
    await page.getByRole("tab", { name: /장보기 기록/ }).click();
    await expect(page.getByRole("heading", { name: "장보기 기록" })).toBeVisible();
    await expectNoAxeViolations(page, {
      allowPrototypeDesktopColorContrast: true,
    });

    await page.goto(SETTINGS_VISUAL_PATH);
    await expect(page.getByRole("heading", { name: "설정" })).toBeVisible();
    await expectNoAxeViolations(page, {
      allowPrototypeDesktopColorContrast: true,
    });
  });

  test("cooking desktop cook modes are axe-clean", async ({
    page,
  }) => {
    test.skip(isMobileViewport(page), "desktop-only cooking parity smoke");
    await setE2EAuthOverride(page);
    await installCookingVisualRoutes(page);

    await page.goto(COOK_MODE_VISUAL_PATH);
    await expect(page.getByTestId("cook-mode-title")).toBeVisible();
    await expectNoAxeViolations(page, {
      allowPrototypeDesktopColorContrast: true,
    });

    await page.goto(STANDALONE_COOK_MODE_VISUAL_PATH);
    await expect(page.getByTestId("standalone-cook-mode-title")).toBeVisible();
    await expectNoAxeViolations(page, {
      allowPrototypeDesktopColorContrast: true,
    });
  });

  test("leftovers desktop ready and empty states are axe-clean", async ({
    page,
  }) => {
    test.skip(isMobileViewport(page), "desktop-only leftovers parity smoke");
    await setE2EAuthOverride(page);
    await installLeftoversVisualRoutes(page);

    await page.goto(LEFTOVERS_VISUAL_PATH);
    await expect(page.getByRole("heading", { name: "남은 요리" })).toBeVisible();
    await expectNoAxeViolations(page, {
      allowPrototypeDesktopColorContrast: true,
    });

    await page.goto(ATE_LIST_VISUAL_PATH);
    await expect(page.getByRole("heading", { name: "다먹은 요리" })).toBeVisible();
    await expectNoAxeViolations(page, {
      allowPrototypeDesktopColorContrast: true,
    });

    await page.unroute("**/api/v1/leftovers?*");
    await installLeftoversVisualRoutes(page, { ateItems: [], leftoverItems: [] });

    await page.goto(LEFTOVERS_VISUAL_PATH);
    await expect(page.getByText("남은 요리가 없어요")).toBeVisible();
    await expectNoAxeViolations(page, {
      allowPrototypeDesktopColorContrast: true,
    });

    await page.goto(ATE_LIST_VISUAL_PATH);
    await expect(page.getByText("아직 다먹은 요리가 없어요")).toBeVisible();
    await expectNoAxeViolations(page, {
      allowPrototypeDesktopColorContrast: true,
    });
  });
});
