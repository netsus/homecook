import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import {
  E2E_APP_ORIGIN,
  E2E_AUTH_OVERRIDE_KEY,
  installAccountLibraryVisualRoutes,
  installMenuAddVisualRoutes,
  installRecipeDetailRoutes,
  MANUAL_CREATE_VISUAL_PATH,
  MYPAGE_VISUAL_PATH,
  RECIPEBOOK_DETAIL_VISUAL_PATH,
  RECIPE_PATH,
} from "./helpers/mock-routes";

const MANAGED_IMAGE_OBJECT_ID = "550e8400-e29b-41d4-a716-446655440505";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const PNG_FIXTURE = readFileSync(
  join(process.cwd(), "public/brand/og-image-1200x630.png"),
);
const MANAGED_PREVIEW_DATA_URI = `data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
    <rect width="640" height="360" fill="#FFF4E8"/>
    <circle cx="320" cy="185" r="126" fill="#FFFFFF"/>
    <circle cx="320" cy="185" r="104" fill="#F4865A"/>
    <path d="M240 168c52-38 112-38 160 0-28 50-130 60-160 0Z" fill="#FFD976"/>
    <circle cx="285" cy="150" r="18" fill="#6A9B61"/>
    <circle cx="360" cy="145" r="15" fill="#6A9B61"/>
    <text x="320" y="320" text-anchor="middle" font-size="34" font-family="sans-serif" font-weight="700" fill="#30343B">나의 집밥 레시피</text>
  </svg>
`)}`;
const EVIDENCE_DIRECTORY = join(
  process.cwd(),
  "ui/designs/evidence/personal-recipe-editor-decoupling",
);

function evidencePath(projectName: string, stem: string) {
  const viewport =
    projectName === "mobile-ios-small" ? "mobile-narrow" : "mobile-default";
  return join(EVIDENCE_DIRECTORY, `${stem}-${viewport}.png`);
}

async function captureEvidence(
  page: Page,
  projectName: string,
  stem: string,
) {
  if (process.env.HOMECOOK_CAPTURE_PERSONAL_EDITOR_EVIDENCE !== "1") {
    return;
  }

  mkdirSync(EVIDENCE_DIRECTORY, { recursive: true });
  await page.screenshot({
    animations: "disabled",
    fullPage: false,
    path: evidencePath(projectName, stem),
  });
}

async function setAuthenticated(page: Page) {
  await page.context().addCookies([
    {
      name: E2E_AUTH_OVERRIDE_KEY,
      sameSite: "Lax",
      url: E2E_APP_ORIGIN,
      value: "authenticated",
    },
  ]);
  await page.addInitScript(
    ({ key }) => {
      window.localStorage.setItem(key, "authenticated");
    },
    { key: E2E_AUTH_OVERRIDE_KEY },
  );
}

async function useRequiredMobileViewport(page: Page, projectName: string) {
  await page.setViewportSize(
    projectName === "mobile-ios-small"
      ? { width: 320, height: 568 }
      : { width: 390, height: 844 },
  );
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => ({
        body: document.body.scrollWidth - document.body.clientWidth,
        document:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      })),
    )
    .toEqual({ body: 0, document: 0 });
}

async function expectMinimumTarget(page: Page, accessibleName: string) {
  const target = page.getByRole("button", { name: accessibleName });
  await expect(target).toBeVisible();
  const box = await target.boundingBox();

  expect(box, `${accessibleName} 버튼의 크기를 측정할 수 있어야 해요`).not.toBeNull();
  expect(box!.width, `${accessibleName} 버튼 너비`).toBeGreaterThanOrEqual(44);
  expect(box!.height, `${accessibleName} 버튼 높이`).toBeGreaterThanOrEqual(44);
}

async function installManagedImageRoutes(
  page: Page,
  evidence: {
    cancelKeys: string[];
    uploadKeys: string[];
  },
  options: {
    cancelFails?: boolean;
    uploadFails?: boolean;
  } = {},
) {
  await page.route("**/api/v1/recipes/images", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    evidence.uploadKeys.push(route.request().headers()["idempotency-key"] ?? "");
    if (options.uploadFails) {
      await route.fulfill({
        headers: { "Retry-After": "30" },
        status: 503,
        json: {
          success: false,
          data: null,
          error: {
            code: "IMAGE_UPLOAD_LIMITED",
            message: "이미지 업로드가 잠시 제한됐어요.",
            fields: [],
          },
        },
      });
      return;
    }

    await route.fulfill({
      status: 201,
      json: {
        success: true,
        data: {
          image_object_id: MANAGED_IMAGE_OBJECT_ID,
          state: "uploaded_unlinked",
          read_url: MANAGED_PREVIEW_DATA_URI,
          read_url_expires_at: "2099-07-30T03:05:00.000Z",
        },
        error: null,
      },
    });
  });

  await page.route(
    `**/api/v1/recipes/images/${MANAGED_IMAGE_OBJECT_ID}/cancel`,
    async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }

      evidence.cancelKeys.push(
        route.request().headers()["idempotency-key"] ?? "",
      );
      if (options.cancelFails) {
        await route.fulfill({
          status: 503,
          json: {
            success: false,
            data: null,
            error: {
              code: "IMAGE_CANCEL_FAILED",
              message: "이미지 정리를 완료하지 못했어요.",
              fields: [],
            },
          },
        });
        return;
      }

      await route.fulfill({
        json: {
          success: true,
          data: {
            image_object_id: MANAGED_IMAGE_OBJECT_ID,
            state: "cancelled",
          },
          error: null,
        },
      });
    },
  );
}

test.describe("personal-recipe-editor-decoupling local fixtures", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      !["mobile-chrome", "mobile-ios-small"].includes(testInfo.project.name),
      "이 Stage 4 회귀는 390px 및 320px 모바일 경계를 검증해요.",
    );
    await useRequiredMobileViewport(page, testInfo.project.name);
    await setAuthenticated(page);
  });

  test("personal-recipe-editor-decoupling keeps RECIPE_DETAIL capability-off without disturbing primary actions", async ({
    page,
  }, testInfo) => {
    await installRecipeDetailRoutes(page);
    await page.goto(RECIPE_PATH);

    await expect(
      page.getByRole("heading", { name: "집밥 김치찌개" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "플래너에 추가" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "요리하기" })).toBeVisible();

    await expect(
      page.getByRole("button", { name: "내 레시피로 수정" }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "편집", exact: true })).toHaveCount(
      0,
    );
    await expect(page.getByRole("button", { name: "삭제", exact: true })).toHaveCount(
      0,
    );

    await expectMinimumTarget(page, "플래너에 추가");
    await expectNoHorizontalOverflow(page);
    await captureEvidence(page, testInfo.project.name, "RECIPE_DETAIL");
  });

  test("personal-recipe-editor-decoupling keeps planner-add shared controls touch-safe and guards dirty in-app back", async ({
    page,
  }, testInfo) => {
    await installMenuAddVisualRoutes(page);
    await page.goto(MANUAL_CREATE_VISUAL_PATH);

    await expect(page.getByRole("heading", { name: "직접 등록" })).toBeVisible();
    await expect(page.getByTestId("manual-mobile-target-tag")).toBeVisible();
    await expectMinimumTarget(page, "기준 인분 줄이기");
    await expectMinimumTarget(page, "기준 인분 늘리기");

    const title = page.getByLabel("요리 이름");
    await title.fill("버리지 않을 레시피");
    await page.goBack();

    const discardDialog = page.getByRole("dialog", {
      name: "변경사항을 버릴까요?",
    });
    await expect(discardDialog).toBeVisible();
    await expect(discardDialog).toHaveAttribute("aria-modal", "true");
    await expect(
      discardDialog.getByRole("button", { name: "계속 편집" }),
    ).toBeFocused();
    await captureEvidence(page, testInfo.project.name, "EDITOR_CONTEXTS");

    await discardDialog.getByRole("button", { name: "계속 편집" }).click();
    await expect(title).toHaveValue("버리지 않을 레시피");

    await page.getByRole("button", { name: "저장" }).click();
    const ingredientValidation = page.getByText(
      "재료를 1개 이상 추가해 주세요.",
    );
    await expect(ingredientValidation).toBeVisible();
    await ingredientValidation.scrollIntoViewIfNeeded();
    await captureEvidence(
      page,
      testInfo.project.name,
      "EDITOR_VALIDATION",
    );

    await page.getByRole("button", { name: "+ 재료 추가하기" }).click();
    const ingredientDialog = page.getByRole("dialog", { name: "재료로 검색" });
    await ingredientDialog
      .getByRole("checkbox", { name: "김치", exact: true })
      .click({ force: true });
    await ingredientDialog
      .getByRole("button", { name: "선택한 재료 1개 추가" })
      .click();

    const ingredientUnitGroup = page.getByRole("group", {
      name: "김치 단위",
    });
    await ingredientUnitGroup.scrollIntoViewIfNeeded();
    for (const unitButton of await ingredientUnitGroup
      .getByRole("button")
      .all()) {
      const box = await unitButton.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
    await expectMinimumTarget(page, "김치 삭제");
    await captureEvidence(page, testInfo.project.name, "EDITOR_CONTROLS");

    const stepComposer = page.getByTestId("manual-step-composer");
    await stepComposer.scrollIntoViewIfNeeded();
    await expectMinimumTarget(page, "손질");
    await expectMinimumTarget(page, "끓이기");
    await expectMinimumTarget(page, "볶기");
    await expectMinimumTarget(page, "+ 만들기 추가");
    const instruction = page.getByLabel("만들기 1 설명");
    await instruction.focus();
    await instruction.fill("재료를 먹기 좋게 손질해요.");
    await captureEvidence(
      page,
      testInfo.project.name,
      "EDITOR_KEYBOARD_FOCUS",
    );
    await expectNoHorizontalOverflow(page);
  });

  test("personal-recipe-editor-decoupling cancels a managed owner upload through the mocked server endpoint", async ({
    page,
  }, testInfo) => {
    const evidence = {
      cancelKeys: [] as string[],
      uploadKeys: [] as string[],
    };
    await installMenuAddVisualRoutes(page);
    await installManagedImageRoutes(page, evidence);
    await page.goto(MANUAL_CREATE_VISUAL_PATH);

    await page.getByTestId("manual-image-file-input").setInputFiles({
      buffer: PNG_FIXTURE,
      mimeType: "image/png",
      name: "personal-editor-managed.png",
    });
    await expect(page.getByTestId("manual-image-preview")).toBeVisible();
    await captureEvidence(page, testInfo.project.name, "EDITOR_STATES");
    await page.getByTestId("manual-image-remove-button").click();
    await expect(page.getByTestId("manual-image-preview")).toHaveCount(0);

    expect(evidence.uploadKeys).toHaveLength(1);
    expect(evidence.cancelKeys).toHaveLength(1);
    expect(evidence.uploadKeys[0]).toMatch(UUID_PATTERN);
    expect(evidence.cancelKeys[0]).toMatch(UUID_PATTERN);
    expect(evidence.cancelKeys[0]).not.toBe(evidence.uploadKeys[0]);
  });

  test("personal-recipe-editor-decoupling shows a recoverable managed upload error", async ({
    page,
  }, testInfo) => {
    const evidence = {
      cancelKeys: [] as string[],
      uploadKeys: [] as string[],
    };
    await installMenuAddVisualRoutes(page);
    await installManagedImageRoutes(page, evidence, { uploadFails: true });
    await page.goto(MANUAL_CREATE_VISUAL_PATH);

    await page.getByTestId("manual-image-file-input").setInputFiles({
      buffer: PNG_FIXTURE,
      mimeType: "image/png",
      name: "personal-editor-managed-error.png",
    });
    await expect(page.getByTestId("manual-image-error")).toContainText(
      "이미지 업로드가 잠시 제한됐어요.",
    );
    await expect(page.getByTestId("manual-image-retry-button")).toBeVisible();
    await page.getByTestId("manual-image-error").scrollIntoViewIfNeeded();
    await captureEvidence(page, testInfo.project.name, "EDITOR_UPLOAD_ERROR");
    await expectNoHorizontalOverflow(page);
  });

  test("personal-recipe-editor-decoupling keeps cleanup failure visible and retryable", async ({
    page,
  }, testInfo) => {
    const evidence = {
      cancelKeys: [] as string[],
      uploadKeys: [] as string[],
    };
    await installMenuAddVisualRoutes(page);
    await installManagedImageRoutes(page, evidence, { cancelFails: true });
    await page.goto(MANUAL_CREATE_VISUAL_PATH);

    await page.getByTestId("manual-image-file-input").setInputFiles({
      buffer: PNG_FIXTURE,
      mimeType: "image/png",
      name: "personal-editor-managed-cleanup.png",
    });
    await expect(page.getByTestId("manual-image-preview")).toBeVisible();
    await page.getByTestId("manual-image-remove-button").click();
    const cleanupAlert = page.getByRole("alert").filter({
      hasText: "이미지 정리를 완료하지 못했어요",
    });
    await expect(cleanupAlert).toContainText(
      "이미지 정리를 완료하지 못했어요.",
    );
    await expect(
      page.getByTestId("manual-editor-feedback-region").getByRole("alert"),
    ).toContainText("이미지 정리를 완료하지 못했어요.");
    await expect(
      page.getByRole("button", { name: "정리 다시 시도" }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.documentElement.scrollHeight -
            document.documentElement.clientHeight,
        ),
      )
      .toBe(0);
    await cleanupAlert.scrollIntoViewIfNeeded();
    await captureEvidence(page, testInfo.project.name, "EDITOR_CLEANUP_ERROR");
    await expectNoHorizontalOverflow(page);
  });

  test("personal-recipe-editor-decoupling leaves MYPAGE and RECIPEBOOK_DETAIL read-only while preserving detail links", async ({
    page,
  }, testInfo) => {
    await installAccountLibraryVisualRoutes(page);
    await page.goto(MYPAGE_VISUAL_PATH);

    const mypageRecipeLink = page
      .locator('a[href^="/recipe/recipe-doenjang"]')
      .filter({ visible: true })
      .first();
    await expect(mypageRecipeLink).toBeVisible();
    await expect(
      page.getByRole("button", { name: "내 레시피로 수정" }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "편집", exact: true })).toHaveCount(
      0,
    );
    await captureEvidence(page, testInfo.project.name, "MYPAGE-no-edit");

    await page.goto(RECIPEBOOK_DETAIL_VISUAL_PATH);
    const recipebookItem = page.getByTestId("recipe-item-recipe-doenjang");
    await expect(recipebookItem).toBeVisible();
    await expect(recipebookItem.getByRole("link", { name: "요리하기" })).toHaveAttribute(
      "href",
      /\/cooking\/recipes\/recipe-doenjang\/cook-mode/u,
    );
    await expect(
      page.getByRole("button", { name: "내 레시피로 수정" }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "편집", exact: true })).toHaveCount(
      0,
    );
    await expectNoHorizontalOverflow(page);
    await captureEvidence(
      page,
      testInfo.project.name,
      "MYPAGE_RECIPEBOOK-no-edit-regression",
    );
  });
});
