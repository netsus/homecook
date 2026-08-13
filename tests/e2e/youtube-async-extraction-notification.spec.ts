import { mkdir } from "node:fs/promises";
import path from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

import { installDiscoveryRoutes, setE2EAuthOverride } from "./helpers/mock-routes";

const EVIDENCE_ROOT = path.resolve(
  process.cwd(),
  "ui/designs/evidence/youtube-async-extraction-notification",
);
const IMPORT_EVIDENCE = path.join(EVIDENCE_ROOT, "YT_IMPORT_BACKGROUND");
const SHELL_EVIDENCE = path.join(EVIDENCE_ROOT, "APP_SHELL_YOUTUBE_NOTIFICATIONS");
const YOUTUBE_URL = "https://www.youtube.com/watch?v=abcdefghijk";
const JOB_ID = "11111111-1111-4111-8111-111111111111";
const RETRY_JOB_ID = "44444444-4444-4444-8444-444444444444";
const EXTRACTION_ID = "22222222-2222-4222-8222-222222222222";
const THUMBNAIL = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='180'%3E%3Crect width='320' height='180' fill='%23dff5ff'/%3E%3Ctext x='160' y='98' text-anchor='middle' font-size='64'%3E🍲%3C/text%3E%3C/svg%3E";

type ImportMode =
  | "accepted"
  | "accepted-retry"
  | "duplicate"
  | "initial"
  | "offline"
  | "policy-changed"
  | "review"
  | "submitting";

function notificationItem({
  code,
  consumed = false,
  status,
  title,
}: {
  code?: "EXTRACTION_EXPIRED" | "NOT_RECIPE_VIDEO" | "QUOTA_EXCEEDED";
  consumed?: boolean;
  status: "expired" | "failed" | "succeeded";
  title: string | null;
}) {
  const terminalId = code === "EXTRACTION_EXPIRED"
    ? "22222222-2222-4222-8222-222222222222"
    : "33333333-3333-4333-8333-333333333333";
  return {
    job_id: status === "succeeded" ? JOB_ID : terminalId,
    status,
    submitted_at: "2026-08-14T01:00:00.000Z",
    completed_at: "2026-08-14T01:03:00.000Z",
    video_title_snapshot: title,
    thumbnail_url: THUMBNAIL,
    delivery_key: status === "succeeded" ? "delivery-success" : `delivery-${code ?? "failed"}`,
    delivered_at: null,
    seen_at: null,
    result: status === "succeeded"
      ? {
          extraction_id: EXTRACTION_ID,
          review_path: consumed ? null : `/menu/add/youtube?extractionId=${EXTRACTION_ID}`,
          recipe_id: consumed ? "recipe-potato-soup" : null,
          recipe_path: consumed ? "/recipes/recipe-potato-soup" : null,
        }
      : null,
    error: status === "failed" || status === "expired"
      ? {
          code: code ?? "NOT_RECIPE_VIDEO",
          message: code === "QUOTA_EXCEEDED"
            ? "오늘 추출 한도를 모두 사용했어요. 나중에 다시 시도해 주세요."
            : code === "EXTRACTION_EXPIRED"
              ? "결과가 만료됐어요. 다시 추출해 주세요."
              : "레시피 영상으로 확인되지 않았어요.",
          retryable: code === "QUOTA_EXCEEDED" || code === "EXTRACTION_EXPIRED",
        }
      : null,
    can_retry: code === "QUOTA_EXCEEDED" || code === "EXTRACTION_EXPIRED",
  };
}

async function installNotificationRoutes(
  page: Page,
  unseenItems = [notificationItem({ status: "succeeded", title: null })],
) {
  const archiveFirstPage = Array.from({ length: 8 }, (_, index) => ({
    ...notificationItem({ status: "succeeded", title: index === 0 ? "감자 수프" : `지난 레시피 ${index + 1}` }),
    job_id: `66666666-6666-4666-8666-${String(index).padStart(12, "0")}`,
    delivery_key: `delivery-archive-${index}`,
    seen_at: "2026-08-14T01:04:00.000Z",
  }));
  const archiveSecondPage = [
    archiveFirstPage[0],
    {
      ...notificationItem({ code: "QUOTA_EXCEEDED", status: "failed", title: "두부조림" }),
      job_id: "55555555-5555-4555-8555-555555555555",
      seen_at: "2026-08-14T01:05:00.000Z",
    },
  ];
  await page.route("**/api/v1/users/me/youtube-extraction-jobs**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith("/delivered")) {
      await route.fulfill({ json: { success: true, data: { delivered_count: unseenItems.length }, error: null } });
      return;
    }
    if (url.pathname.endsWith("/seen")) {
      await route.fulfill({ json: { success: true, data: { seen_count: unseenItems.length }, error: null } });
      return;
    }
    const archive = url.searchParams.get("view") === "archive";
    const cursor = url.searchParams.get("cursor");
    await route.fulfill({
      json: {
        success: true,
        data: archive
          ? {
              items: cursor === "archive-cursor-2" ? archiveSecondPage : archiveFirstPage,
              next_cursor: cursor === "archive-cursor-2" ? null : "archive-cursor-2",
            }
          : { items: unseenItems, next_cursor: null },
        error: null,
      },
    });
  });
}

async function installNotificationFailureRoute(
  page: Page,
  code: "NETWORK_ERROR" | "UNAUTHORIZED",
) {
  await page.route("**/api/v1/users/me/youtube-extraction-jobs**", async (route) => {
    await route.fulfill({
      status: code === "UNAUTHORIZED" ? 401 : 503,
      json: {
        success: false,
        data: null,
        error: {
          code,
          message: code === "UNAUTHORIZED"
            ? "로그인이 필요해요."
            : "인터넷 연결을 확인한 뒤 다시 시도해 주세요.",
          fields: [],
        },
      },
    });
  });
}

async function installImportRoutes(page: Page, mode: ImportMode) {
  await installNotificationRoutes(page, []);
  let releaseValidation = () => {};
  const validationGate = mode === "submitting"
    ? new Promise<void>((resolve) => { releaseValidation = resolve; })
    : Promise.resolve();
  await page.route("**/api/v1/cooking-methods", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          methods: [{
            id: "method-boil",
            code: "boil",
            label: "끓이기",
            color_key: "red",
            is_system: true,
          }],
        },
        error: null,
      },
    });
  });
  await page.route("**/api/v1/recipes/youtube/validate", async (route) => {
    await validationGate;
    await route.fulfill({
      json: {
        success: true,
        data: {
          is_valid_url: true,
          is_recipe_video: true,
          classification_status: "recipe",
          classification_reasons: [],
          video_info: {
            video_id: "abcdefghijk",
            title: "부드러운 감자 수프",
            channel: "오늘의 주방",
            duration: "PT6M",
            thumbnail_url: THUMBNAIL,
          },
        },
        error: null,
      },
    });
  });
  await page.route("**/api/v1/recipes/youtube/extraction-jobs", async (route) => {
    if (mode === "offline") {
      await route.abort("internetdisconnected");
      return;
    }
    if (mode === "policy-changed") {
      await route.fulfill({
        status: 409,
        json: {
          success: false,
          data: null,
          error: {
            code: "POLICY_CHANGED",
            message: "추출 설정이 바뀌었어요. 다시 시도해 주세요.",
            fields: [],
          },
        },
      });
      return;
    }
    const retry = route.request().postDataJSON()?.retry_job_id === JOB_ID;
    await route.fulfill({
      status: 202,
      json: {
        success: true,
        data: {
          job_id: retry ? RETRY_JOB_ID : JOB_ID,
          status: "queued",
          deduplicated: mode === "duplicate",
          submitted_at: "2026-08-14T01:00:00.000Z",
        },
        error: null,
      },
    });
  });
  await page.route(`**/api/v1/recipes/youtube/extraction-jobs/${JOB_ID}`, async (route) => {
    const retryableFailure = mode === "accepted-retry";
    await route.fulfill({
      json: {
        success: true,
        data: {
          job_id: JOB_ID,
          status: retryableFailure ? "failed" : "queued",
          submitted_at: "2026-08-14T01:00:00.000Z",
          started_at: retryableFailure ? "2026-08-14T01:00:01.000Z" : null,
          completed_at: retryableFailure ? "2026-08-14T01:03:00.000Z" : null,
          result: null,
          error: retryableFailure ? {
            code: "QUOTA_EXCEEDED",
            message: "오늘 추출 한도를 모두 사용했어요. 나중에 다시 시도해 주세요.",
            retryable: true,
          } : null,
          can_retry: retryableFailure,
        },
        error: null,
      },
    });
  });
  await page.route(`**/api/v1/recipes/youtube/extraction-jobs/${RETRY_JOB_ID}`, async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          job_id: RETRY_JOB_ID,
          status: "queued",
          submitted_at: "2026-08-14T01:05:00.000Z",
          started_at: null,
          completed_at: null,
          result: null,
          error: null,
          can_retry: false,
        },
        error: null,
      },
    });
  });
  if (mode === "review") {
    await page.route(`**/api/v1/recipes/youtube/extractions/${EXTRACTION_ID}`, async (route) => {
      await route.fulfill({
        json: {
          success: true,
          data: {
            status: "draft",
            draft: {
              extraction_id: EXTRACTION_ID,
              title: "부드러운 감자 수프",
              base_servings: 2,
              thumbnail_url: THUMBNAIL,
              tags: ["유튜브레시피"],
              suggested_tags: [],
              extraction_methods: ["description"],
              draft_warnings: [],
              blocking_issues: [],
              ingredients: [{
                draft_ingredient_id: "draft-potato",
                ingredient_id: "ingredient-potato",
                standard_name: "감자",
                amount: 2,
                unit: "개",
                ingredient_type: "QUANT",
                display_text: "감자 2개",
                sort_order: 1,
                scalable: true,
                confidence: 0.96,
                resolution_status: "resolved",
                candidates: [],
                raw_text: "감자 2개",
              }],
              steps: [{
                step_number: 1,
                instruction: "감자를 부드럽게 끓인다",
                cooking_method: {
                  id: "method-boil",
                  code: "boil",
                  label: "끓이기",
                  color_key: "red",
                  is_new: false,
                },
                duration_text: "20분",
                is_incomplete: false,
                missing_fields: [],
                raw_text: "감자를 부드럽게 끓인다",
              }],
              new_cooking_methods: [],
            },
            recipe_id: null,
            recipe_path: null,
          },
          error: null,
        },
      });
    });
    await page.route("**/api/v1/recipes/youtube/register", async (route) => {
      await route.fulfill({
        status: 201,
        json: {
          success: true,
          data: { recipe_id: "recipe-potato-soup", title: "부드러운 감자 수프" },
          error: null,
        },
      });
    });
  }

  return { releaseValidation };
}

async function openImport(page: Page, mode: ImportMode, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await setE2EAuthOverride(page);
  const controls = await installImportRoutes(page, mode);
  const path = mode === "review"
    ? `/menu/add/youtube?extractionId=${EXTRACTION_ID}`
    : mode === "initial" || mode === "submitting"
      ? "/menu/add/youtube"
      : `/menu/add/youtube?youtubeUrl=${encodeURIComponent(YOUTUBE_URL)}`;
  await page.goto(path);
  return controls;
}

async function captureEvidence(page: Page, testInfo: TestInfo, filePath: string, fullPage = false) {
  if (testInfo.project.name !== "desktop-chrome") return;
  await page.screenshot({ path: filePath, fullPage });
}

test.beforeAll(async () => {
  await mkdir(IMPORT_EVIDENCE, { recursive: true });
  await mkdir(SHELL_EVIDENCE, { recursive: true });
});

test("import initial and submitting states are visually explicit", async ({ page }, testInfo) => {
  const controls = await openImport(page, "submitting", 390, 844);
  await expect(page.getByLabel("유튜브 URL")).toBeVisible();
  await expect(page.getByRole("button", { name: "가져오기" })).toBeDisabled();
  await captureEvidence(page, testInfo, path.join(IMPORT_EVIDENCE, "mobile-390-initial.png"), true);

  await page.getByLabel("유튜브 URL").fill(YOUTUBE_URL);
  await page.getByRole("button", { name: "가져오기" }).click();
  await expect(page.getByRole("button", { name: "확인 중..." })).toBeDisabled();
  await expect(page.getByLabel("유튜브 URL")).toBeDisabled();
  await captureEvidence(page, testInfo, path.join(IMPORT_EVIDENCE, "mobile-390-submitting.png"), true);
  controls.releaseValidation();
});

test("policy change preserves the URL in a safe import error state", async ({ page }, testInfo) => {
  await openImport(page, "policy-changed", 390, 844);
  await expect(page.locator(".web-menu-add-error")).toContainText("추출 설정이 바뀌었어요. 다시 시도해 주세요.");
  await expect(page.getByLabel("유튜브 URL")).toHaveValue(YOUTUBE_URL);
  await captureEvidence(page, testInfo, path.join(IMPORT_EVIDENCE, "mobile-390-policy-changed.png"), true);
});

test("async enqueue is immediately escapable and visually stable at 390", async ({ page }, testInfo) => {
  await openImport(page, "accepted", 390, 844);
  await expect(page.getByText("추출을 시작했어요. 완료되면 알려드릴게요.")).toBeVisible();
  const leave = page.getByRole("button", { name: "나가기" });
  const jobs = page.getByRole("button", { name: "작업 보기" });
  await expect(leave).toHaveClass(/bg-\[var\(--wave1-mint-contrast\)\]/);
  await expect(leave).toHaveAttribute("style", /color: var\(--foreground\)/);
  await expect(jobs).toHaveClass(/bg-\[var\(--wave1-surface-fill\)\]/);
  const results = await new AxeBuilder({ page })
    .include("[data-youtube-extraction-accepted]")
    .analyze();
  expect(results.violations).toEqual([]);
  await page.getByRole("button", { name: "YouTube 추출 알림 없음" }).click();
  await expect(page.getByText("추출 대기 중")).toBeVisible();
  await page.getByRole("button", { name: "알림 닫기" }).click();
  await captureEvidence(page, testInfo, path.join(IMPORT_EVIDENCE, "mobile-390-accepted.png"), true);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("offline keeps the URL and gives a retryable 320 state", async ({ page }, testInfo) => {
  await openImport(page, "offline", 320, 568);
  await expect(page.locator(".web-menu-add-error")).toContainText("인터넷 연결을 확인한 뒤 다시 시도해 주세요.");
  await expect(page.getByLabel("유튜브 URL")).toHaveValue(YOUTUBE_URL);
  await captureEvidence(page, testInfo, path.join(IMPORT_EVIDENCE, "mobile-320-offline.png"), true);
});

test("accepted retry uses quota copy and projects the replacement job before exit", async ({ page }, testInfo) => {
  await openImport(page, "accepted-retry", 390, 844);
  const retry = page.getByRole("button", { name: "나중에 다시 시도" });
  await expect(retry).toBeVisible();
  await expect(page.getByRole("button", { name: "다시 시도", exact: true })).toHaveCount(0);
  await captureEvidence(
    page,
    testInfo,
    path.join(IMPORT_EVIDENCE, "mobile-390-quota-retry.png"),
    true,
  );

  await retry.click();
  await page.getByRole("button", { name: "작업 보기" }).click();
  await expect(page.getByText("추출 대기 중")).toBeVisible();
  await expect(page.locator(`[data-youtube-active-job-id='${RETRY_JOB_ID}']`)).toBeVisible();
  await captureEvidence(
    page,
    testInfo,
    path.join(IMPORT_EVIDENCE, "mobile-390-retry-active-projection.png"),
    true,
  );
  await page.getByRole("button", { name: "알림 닫기" }).click();
  await page.getByRole("button", { name: "나가기" }).click();
  await expect(page).toHaveURL(/\/planner$/);
});

test("duplicate active work is explicit on desktop", async ({ page }, testInfo) => {
  await openImport(page, "duplicate", 1280, 800);
  await expect(page.getByText("같은 영상의 작업이 이미 진행 중이에요. 이 화면을 나가도 계속 처리돼요.")).toBeVisible();
  await captureEvidence(page, testInfo, path.join(IMPORT_EVIDENCE, "desktop-1280-active-duplicate.png"), true);
});

test("completed session re-entry can register the reviewed recipe", async ({ page }) => {
  await openImport(page, "review", 390, 844);
  await expect(page.getByRole("heading", { name: "추출 결과 확인" })).toBeVisible();
  await page.getByRole("button", { name: "등록" }).click();
  await expect(page.getByText("레시피가 등록됐어요")).toBeVisible();
});

test("app shell groups terminal outcomes and keeps the badge until list exposure", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await setE2EAuthOverride(page);
  await installDiscoveryRoutes(page);
  await installNotificationRoutes(page, [
    notificationItem({ status: "succeeded", title: "감자 수프" }),
    notificationItem({ code: "QUOTA_EXCEEDED", status: "failed", title: "두부조림" }),
  ]);
  await page.goto("/");
  await expect(page.getByText("레시피 추출 2건이 끝났어요")).toBeVisible();
  const stableTrigger = page.locator(
    "[data-youtube-extraction-trigger='header'], [data-youtube-extraction-trigger='global']",
  );
  await expect(stableTrigger).toBeVisible();
  const results = await new AxeBuilder({ page })
    .include("[data-youtube-notification-toast]")
    .analyze();
  expect(results.violations).toEqual([]);
  await captureEvidence(page, testInfo, path.join(SHELL_EVIDENCE, "mobile-390-success-toast.png"));
  await page.getByRole("button", { name: "알림 보기" }).click();
  await page.waitForTimeout(6_100);
  await page.getByRole("button", { name: "알림 닫기" }).click();
  await expect(stableTrigger).toBeFocused();
});

test("consumed notification shows the registered-recipe meaning and destination", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setE2EAuthOverride(page);
  await installDiscoveryRoutes(page);
  await installNotificationRoutes(page, [
    notificationItem({ consumed: true, status: "succeeded", title: "이미 등록한 감자 수프" }),
  ]);
  await page.goto("/");
  await page.getByRole("button", { name: "YouTube 추출 알림 1개" }).click();
  await expect(page.getByText("이미 등록한 레시피예요")).toBeVisible();
  await expect(page.getByTestId("youtube-notification-list").getByRole("link", { name: "레시피 보기" })).toHaveAttribute(
    "href",
    "/recipes/recipe-potato-soup",
  );
  await captureEvidence(page, testInfo, path.join(SHELL_EVIDENCE, "mobile-390-consumed.png"));
});

test("expired and non-retryable outcomes remain distinguishable", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setE2EAuthOverride(page);
  await installDiscoveryRoutes(page);
  await installNotificationRoutes(page, [
    notificationItem({ code: "EXTRACTION_EXPIRED", status: "expired", title: "만료된 감자 수프" }),
    notificationItem({ code: "NOT_RECIPE_VIDEO", status: "failed", title: "레시피가 아닌 영상" }),
  ]);
  await page.goto("/");
  await page.getByRole("button", { name: "YouTube 추출 알림 2개" }).click();
  await expect(page.getByText("결과가 만료됐어요. 다시 추출해 주세요.")).toBeVisible();
  await expect(page.getByRole("button", { name: "다시 추출" })).toBeVisible();
  await expect(page.getByText("레시피 영상으로 확인되지 않았어요.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "레시피가 아닌 영상" })).toBeVisible();
  await expect(page.getByRole("button", { name: "다시 시도", exact: true })).toHaveCount(0);
  await captureEvidence(page, testInfo, path.join(SHELL_EVIDENCE, "mobile-390-expired-non-retryable.png"));
});

test("shell empty state is explicit", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setE2EAuthOverride(page);
  await installDiscoveryRoutes(page);
  await installNotificationRoutes(page, []);
  await page.goto("/");
  await page.getByRole("button", { name: "YouTube 추출 알림 없음" }).click();
  await expect(page.getByText("표시할 알림이 없어요.")).toBeVisible();
  await captureEvidence(page, testInfo, path.join(SHELL_EVIDENCE, "mobile-390-empty.png"));
});

test("shell offline state offers an inline retry without guessing success", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setE2EAuthOverride(page);
  await installDiscoveryRoutes(page);
  await installNotificationFailureRoute(page, "NETWORK_ERROR");
  await page.goto("/");
  await page.getByRole("button", { name: "YouTube 추출 알림 없음" }).click();
  await expect(page.getByText("인터넷 연결을 확인한 뒤 다시 시도해 주세요.")).toBeVisible();
  await expect(page.getByRole("button", { name: "다시 불러오기" })).toBeVisible();
  await captureEvidence(page, testInfo, path.join(SHELL_EVIDENCE, "mobile-390-offline.png"));
});

test("shell unauthorized state keeps a return-to-login action", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setE2EAuthOverride(page);
  await installDiscoveryRoutes(page);
  await installNotificationFailureRoute(page, "UNAUTHORIZED");
  await page.goto("/");
  await expect(page.getByText("로그인이 필요해요")).toBeVisible();
  await expect(page.getByRole("link", { name: "로그인하고 돌아오기" })).toBeVisible();
  await captureEvidence(page, testInfo, path.join(SHELL_EVIDENCE, "mobile-390-unauthorized.png"));
});

test("failure panel reflows at 200% text with non-zero safe areas at 320", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await setE2EAuthOverride(page);
  await installDiscoveryRoutes(page);
  await installNotificationRoutes(page, [notificationItem({ code: "QUOTA_EXCEEDED", status: "failed", title: "두부조림" })]);
  await page.goto("/");
  await page.getByRole("button", { name: "YouTube 추출 알림 1개" }).click();
  await page.addStyleTag({ content: ":root { --youtube-notification-safe-area-top: 24px; --youtube-notification-safe-area-bottom: 34px; font-size: 200%; }" });
  const dialog = page.getByRole("dialog", { name: "YouTube 추출 알림" });
  const overlay = page.getByTestId("youtube-notification-overlay");
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("button", { name: "알림 닫기" })).toBeFocused();
  await expect(page.getByRole("heading", { name: "두부조림" })).toBeVisible();
  await expect(page.getByText("오늘 추출 한도를 모두 사용했어요. 나중에 다시 시도해 주세요.")).toBeVisible();
  await captureEvidence(page, testInfo, path.join(SHELL_EVIDENCE, "mobile-320-failure-panel.png"));
  const retry = page.getByRole("button", { name: "나중에 다시 시도" });
  await retry.scrollIntoViewIfNeeded();
  await expect(retry).toBeVisible();
  await page.keyboard.press("Shift+Tab");
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  const results = await new AxeBuilder({ page })
    .include("[role='dialog']")
    .analyze();
  expect(results.violations).toEqual([]);
  const overlayBox = await overlay.boundingBox();
  const dialogBox = await dialog.boundingBox();
  expect(overlayBox?.y).toBeGreaterThanOrEqual(24);
  expect((dialogBox?.y ?? 0) + (dialogBox?.height ?? 0)).toBeLessThanOrEqual(844);
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("desktop archive remains internally scrollable without page overlap", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setE2EAuthOverride(page);
  await installDiscoveryRoutes(page);
  await installNotificationRoutes(page);
  await page.goto("/");
  const trigger = page.locator('button[aria-label^="YouTube 추출 알림"]');
  await trigger.click();
  const overlay = page.getByTestId("youtube-notification-overlay");
  expect(Number(await overlay.evaluate((element) => getComputedStyle(element).zIndex)))
    .toBeGreaterThan(Number(await page.locator(".web-topnav").evaluate((element) => getComputedStyle(element).zIndex)));
  await expect(page.getByRole("heading", { name: "YouTube 추출 알림" })).toBeVisible();
  await expect(page.getByRole("button", { name: "알림 닫기" })).toBeVisible();
  await page.getByRole("tab", { name: "지난 알림" }).click();
  await expect(page.getByRole("heading", { name: "감자 수프" })).toBeVisible();
  await expect(page.getByLabel("완료 시각 2026년 8월 14일 오전 10:03").first()).toBeVisible();
  const list = page.getByTestId("youtube-notification-list");
  await list.evaluate((element) => { element.scrollTop = 40; });
  await page.getByRole("button", { name: "알림 더 보기" }).click();
  await expect(page.getByRole("heading", { name: "두부조림" })).toBeVisible();
  expect(await list.evaluate((element) => element.scrollTop)).toBeGreaterThanOrEqual(40);
  await expect(page.getByRole("button", { name: "나중에 다시 시도" })).toBeVisible();
  await captureEvidence(page, testInfo, path.join(SHELL_EVIDENCE, "desktop-1440-archive.png"));
  await page.getByRole("button", { name: "알림 닫기" }).click();
  await expect(trigger).toBeFocused();
});
