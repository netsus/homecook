import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import {
  COOK_MODE_VISUAL_PATH,
  COOK_READY_VISUAL_PATH,
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
  }: {
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
  expect(results.violations).toEqual([]);
}

function isMobileViewport(page: Page) {
  return (page.viewportSize()?.width ?? 1280) < 1024;
}

function visibleSearchInput(page: Page) {
  return page
    .getByPlaceholder(
      isMobileViewport(page) ? "김치볶음밥, 된장찌개…" : "레시피 제목 검색",
    )
    .first();
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

async function expectMatchingControlTypography(
  reference: import("@playwright/test").Locator,
  candidate: import("@playwright/test").Locator,
) {
  const [referenceMetrics, candidateMetrics] = await Promise.all([
    readTypographyMetrics(reference),
    readTypographyMetrics(candidate),
  ]);

  expect(candidateMetrics.fontSize).toBe(referenceMetrics.fontSize);
  expect(candidateMetrics.fontWeight).toBe(referenceMetrics.fontWeight);
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
  test("home and recipe detail are axe-clean", async ({ page }) => {
    await installDiscoveryRoutes(page);
    await installRecipeDetailRoutes(page);

    await page.goto("/");
    await expect(visibleSearchInput(page)).toBeVisible();
    await expectNoAxeViolations(page, {
      allowPrototypeDesktopColorContrast: true,
    });
    const ingredientSearchButton = visibleTextButton(page, "재료로 검색");
    const sortButton = visibleSortButton(page);

    await expectReadableTouchTarget(ingredientSearchButton);
    if (isMobileViewport(page)) {
      await expectMatchingControlTypography(ingredientSearchButton, sortButton);
    }
    await expectCompactToolbarControl(sortButton);
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
      allowPrototypeDesktopColorContrast: true,
    });
    await expectReadableTouchTarget(plannerOption);

    await page.goto(RECIPE_PATH);
    await expect(
      page.getByRole("heading", { name: "집밥 김치찌개" }),
    ).toBeVisible();
    await expectNoAxeViolations(page, {
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

  test("ingredient filter and login gate dialogs are axe-clean", async ({
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
      allowPrototypeDesktopColorContrast: true,
    });
    await expectReadableTouchTarget(
      page.getByRole("button", { name: /적용/ }),
    );
    await expectSingleLineControlLabel(
      page.getByRole("button", { name: "초기화" }),
    );
    await expectSingleLineControlLabel(
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
      allowPrototypeDesktopColorContrast: true,
    });
    await expectReadableTouchTarget(getLoginActionButton(page));
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
      .locator(".web-meal-rail .web-stepper")
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
      page.getByRole("heading", { name: "어떤 방식으로 메뉴를 추가할까요?" }),
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
      page.getByRole("heading", { name: "새 레시피를 직접 입력해요" }),
    ).toBeVisible();
    await expectNoAxeViolations(page, {
      allowPrototypeDesktopColorContrast: true,
    });

    await page.getByRole("button", { name: /재료 추가/ }).click();
    await expect(
      page.getByRole("dialog", { name: "재료 선택" }),
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

    await visibleTextButton(page, "번들로 추가").click();
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
    await expectNoAxeViolations(page, {
      allowPrototypeDesktopColorContrast: true,
    });

    await page.goto(SHOPPING_DETAIL_VISUAL_PATH);
    await expect(
      page.getByRole("heading", { name: "이번 주 장보기" }),
    ).toBeVisible();
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
      page.getByRole("heading", { name: "지난 주 장보기" }),
    ).toBeVisible();
    await expectNoAxeViolations(page, {
      allowPrototypeDesktopColorContrast: true,
    });
  });

  test("login, mypage, recipebooks, and settings desktop slice screens are axe-clean", async ({
    page,
  }) => {
    test.skip(isMobileViewport(page), "desktop-only account/library parity smoke");

    await page.goto(LOGIN_VISUAL_PATH);
    await expect(
      page.getByRole("heading", { name: "집밥 루틴을 이어가려면 로그인하세요" }),
    ).toBeVisible();
    await expectNoAxeViolations(page, {
      allowPrototypeDesktopColorContrast: true,
    });

    await setE2EAuthOverride(page);
    await installAccountLibraryVisualRoutes(page);

    await page.goto(MYPAGE_VISUAL_PATH);
    await expect(page.getByRole("heading", { name: "저장한 레시피" })).toBeVisible();
    await expectNoAxeViolations(page, {
      allowPrototypeDesktopColorContrast: true,
    });
    await expectReadableTouchTarget(
      page.getByRole("button", { name: /레시피북 관리/ }),
    );

    await page.getByRole("button", { name: /레시피북 관리/ }).click();
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
    await page.getByRole("button", { name: /장보기 내역/ }).click();
    await expect(page.getByRole("heading", { name: "장보기 내역" })).toBeVisible();
    await expectNoAxeViolations(page, {
      allowPrototypeDesktopColorContrast: true,
    });

    await page.goto(SETTINGS_VISUAL_PATH);
    await expect(page.getByRole("heading", { name: "설정" })).toBeVisible();
    await expectNoAxeViolations(page, {
      allowPrototypeDesktopColorContrast: true,
    });

    await page.getByTestId("nickname-row").click();
    await expect(page.getByRole("dialog", { name: "닉네임 변경" })).toBeVisible();
    await expectNoAxeViolations(page, {
      allowPrototypeDesktopColorContrast: true,
    });
  });

  test("cooking desktop ready, notice, and cook modes are axe-clean", async ({
    page,
  }) => {
    test.skip(isMobileViewport(page), "desktop-only cooking parity smoke");
    await setE2EAuthOverride(page);
    await installCookingVisualRoutes(page);

    await page.goto(COOK_READY_VISUAL_PATH);
    await expect(page.getByRole("heading", { name: "요리 준비" })).toBeVisible();
    await expectNoAxeViolations(page, {
      allowPrototypeDesktopColorContrast: true,
    });

    await page.getByRole("button", { name: "요리모드 안내" }).click();
    await expect(
      page.getByRole("dialog", { name: "데스크탑 요리모드" }),
    ).toBeVisible();
    await expectNoAxeViolations(page, {
      allowPrototypeDesktopColorContrast: true,
    });

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
    await expect(page.getByRole("heading", { name: "다먹은 목록" })).toBeVisible();
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
