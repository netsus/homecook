import { mkdir } from "node:fs/promises";
import path from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

import {
  installDiscoveryRoutes,
  setE2EAuthOverride as setBaseE2EAuthOverride,
} from "./helpers/mock-routes";
import { captureEvidenceScreenshot } from "./helpers/evidence-capture";

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
  | "planner-success"
  | "review"
  | "submitting";

async function setE2EAuthOverride(
  page: Page,
  value: "authenticated" | "guest" = "authenticated",
) {
  await setBaseE2EAuthOverride(page, value, {
    notificationRouteOwner: "caller",
  });
}

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

async function installGrowthToastRoute(
  page: Page,
  options: { count?: number; seenRequests?: string[][] } = {},
) {
  const count = options.count ?? 1;
  await page.route("**/api/v1/users/me/gamification/notifications/seen", async (route) => {
    const body = route.request().postDataJSON() as { notification_ids?: string[] };
    const ids = body.notification_ids ?? [];
    options.seenRequests?.push(ids);
    await route.fulfill({
      json: {
        success: true,
        data: { seen_notification_ids: ids },
        error: null,
      },
    });
  });
  await page.route(
    (url) => url.pathname === "/api/v1/users/me/gamification",
    async (route) => {
      await route.fulfill({
        json: {
          success: true,
          data: {
            achievement_album: { categories: [], summary: { completed_category_count: 0, earned_count: 0, total_count: 0 } },
            badges: { earned: [], locked: [] },
            featured_badges: [],
            grade: { grade_key: "clay", label: "새싹 집밥러", level_max: 4, level_min: 1 },
            last_updated_at: "2026-08-14T01:05:00.000Z",
            level: { current_level: 2, progress_percent: 20, total_xp: 120, xp_to_next_level: 80 },
            notifications: {
              archive_preview: [],
              priority_unseen: Array.from({ length: count }, (_, index) => ({
                body: `${index + 1}번째 요리를 기록해 15 XP를 받았어요.`,
                category: "cooking",
                created_at: `2026-08-14T01:0${5 + index}:00.000Z`,
                delivery_channel: "toast",
                group_key: null,
                id: `growth-toast-simultaneous-${index + 1}`,
                notification_type: "xp_awarded",
                payload: { event_type: "cooking_completed", xp_delta: 15 },
                priority: 3,
                seen_at: null,
                title: `집밥 경험치 획득 ${index + 1}`,
                toast_eligible: true,
              })),
              unseen: [],
            },
            quests: { active: [], completed_recent: [] },
            tutorial: { active_steps: [], category_key: "tutorial", completed_count: 0, total_count: 6 },
          },
          error: null,
        },
      });
    },
  );
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
    const plannerSuccess = mode === "planner-success";
    await route.fulfill({
      json: {
        success: true,
        data: {
          job_id: JOB_ID,
          status: retryableFailure ? "failed" : plannerSuccess ? "succeeded" : "queued",
          submitted_at: "2026-08-14T01:00:00.000Z",
          started_at: retryableFailure || plannerSuccess ? "2026-08-14T01:00:01.000Z" : null,
          completed_at: retryableFailure || plannerSuccess ? "2026-08-14T01:03:00.000Z" : null,
          result: plannerSuccess ? {
            extraction_id: EXTRACTION_ID,
            review_path: `/menu/add/youtube?extractionId=${EXTRACTION_ID}`,
            recipe_id: null,
            recipe_path: null,
          } : null,
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
  if (mode === "review" || mode === "planner-success") {
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

async function openImport(
  page: Page,
  mode: ImportMode,
  width: number,
  height: number,
  surface: "planner" | "standalone" = "planner",
) {
  await page.setViewportSize({ width, height });
  await setE2EAuthOverride(page);
  const controls = await installImportRoutes(page, mode);
  const path = surface === "standalone"
    ? mode === "initial" || mode === "submitting"
      ? "/recipes/new/youtube"
      : `/recipes/new/youtube?youtubeUrl=${encodeURIComponent(YOUTUBE_URL)}`
    : mode === "review"
    ? `/menu/add/youtube?extractionId=${EXTRACTION_ID}`
    : mode === "initial" || mode === "submitting"
      ? "/menu/add/youtube"
      : `/menu/add/youtube?youtubeUrl=${encodeURIComponent(YOUTUBE_URL)}`;
  await page.goto(path);
  return controls;
}

async function captureEvidence(page: Page, testInfo: TestInfo, filePath: string, fullPage = false) {
  if (testInfo.project.name !== "desktop-chrome") return;
  await captureEvidenceScreenshot(page, testInfo, filePath, { fullPage });
}

function rectanglesAreDisjoint(
  first: { x: number; y: number; width: number; height: number } | null,
  second: { x: number; y: number; width: number; height: number } | null,
) {
  if (!first || !second) return false;
  return first.x >= second.x + second.width
    || first.x + first.width <= second.x
    || first.y >= second.y + second.height
    || first.y + first.height <= second.y;
}

test.beforeAll(async () => {
  await mkdir(IMPORT_EVIDENCE, { recursive: true });
  await mkdir(SHELL_EVIDENCE, { recursive: true });
});

test("import initial and submitting states are visually explicit", async ({ page }, testInfo) => {
  const controls = await openImport(page, "submitting", 390, 844);
  await expect(page.getByLabel("유튜브 URL")).toBeVisible();
  const importButton = page.getByRole("button", { name: "가져오기" });
  await expect(importButton).toBeDisabled();
  const initialStyle = await importButton.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      borderColor: style.borderColor,
      color: style.color,
      opacity: style.opacity,
      transform: style.transform,
    };
  });
  expect(initialStyle.opacity).toBe("1");
  expect(initialStyle.transform).toBe("none");
  await captureEvidence(page, testInfo, path.join(IMPORT_EVIDENCE, "mobile-390-initial.png"), true);

  await page.getByLabel("유튜브 URL").fill(YOUTUBE_URL);
  await expect(importButton).toBeEnabled();
  const enabledStyle = await importButton.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      borderColor: style.borderColor,
      color: style.color,
    };
  });
  expect(enabledStyle.backgroundColor).not.toBe(initialStyle.backgroundColor);
  expect(enabledStyle.borderColor).not.toBe(initialStyle.borderColor);
  expect(enabledStyle.color).not.toBe(initialStyle.color);
  await captureEvidence(page, testInfo, path.join(IMPORT_EVIDENCE, "mobile-390-enabled-url.png"), true);
  await importButton.click();
  const submittingButton = page.getByRole("button", { name: "확인 중..." });
  await expect(submittingButton).toBeDisabled();
  const submittingStyle = await submittingButton.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      borderColor: style.borderColor,
      color: style.color,
      opacity: style.opacity,
      transform: style.transform,
    };
  });
  expect(submittingStyle).toEqual(initialStyle);
  await expect(page.getByLabel("유튜브 URL")).toBeDisabled();
  await captureEvidence(page, testInfo, path.join(IMPORT_EVIDENCE, "mobile-390-submitting.png"), true);
  controls.releaseValidation();
});

for (const viewport of [
  { file: "mobile-390-global-toast-coordination.png", height: 844, width: 390 },
  { file: "mobile-320-global-toast-coordination.png", height: 568, width: 320 },
  { file: "desktop-1440-global-toast-coordination.png", height: 900, width: 1440 },
]) {
  test(`global toast presentation arbitrates simultaneous channels at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await setE2EAuthOverride(page);
    await installDiscoveryRoutes(page);
    const growthSeenRequests: string[][] = [];
    await installGrowthToastRoute(page, { count: 3, seenRequests: growthSeenRequests });
    await installNotificationRoutes(page, [
      notificationItem({ status: "succeeded", title: "감자 수프" }),
    ]);
    await page.goto("/");

    const layer = page.getByTestId("global-toast-presentation-slot");
    const youtubeToast = page.locator("[data-youtube-notification-toast]");
    const growthToast = page.getByTestId("growth-toast");
    await expect(layer).toHaveAttribute("aria-live", "polite");
    await expect(youtubeToast).toBeVisible();
    const expectedGrowthCount = viewport.width === 320 ? 0 : viewport.width === 390 ? 2 : 3;
    if (viewport.width === 320) {
      await expect(growthToast).toHaveCount(0);
    } else {
      await expect(growthToast).toHaveCount(expectedGrowthCount);
    }

    const [youtubeBox, growthBoxes, searchBox, filterBox, bottomNavBox] = await Promise.all([
      youtubeToast.boundingBox(),
      growthToast.evaluateAll((elements) => elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return { height: rect.height, width: rect.width, x: rect.x, y: rect.y };
      })),
      page.getByPlaceholder("레시피 제목 검색").first().boundingBox(),
      page.getByRole("button", { name: "재료로 검색" }).first().boundingBox(),
      viewport.width === 1440
        ? Promise.resolve(null)
        : page.getByRole("navigation", { name: "홈 하단 탭" }).boundingBox(),
    ]);
    expect(
      rectanglesAreDisjoint(youtubeBox, searchBox),
      JSON.stringify({ searchBox, youtubeBox }),
    ).toBe(true);
    expect(
      rectanglesAreDisjoint(youtubeBox, filterBox),
      JSON.stringify({ filterBox, youtubeBox }),
    ).toBe(true);
    for (const growthBox of growthBoxes) {
      expect(rectanglesAreDisjoint(youtubeBox, growthBox)).toBe(true);
      expect(rectanglesAreDisjoint(growthBox, searchBox)).toBe(true);
      expect(rectanglesAreDisjoint(growthBox, filterBox)).toBe(true);
      if (bottomNavBox) {
        expect(rectanglesAreDisjoint(growthBox, bottomNavBox)).toBe(true);
      }
    }
    for (const box of [youtubeBox, ...growthBoxes]) {
      expect(box).not.toBeNull();
      expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(viewport.width);
      expect(box?.y ?? -1).toBeGreaterThanOrEqual(0);
      expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(viewport.height);
    }

    const readingOrder = await layer.locator(
      "[data-youtube-notification-toast], [data-testid='growth-toast']",
    ).evaluateAll((elements) => elements.map((element) =>
      element.hasAttribute("data-youtube-notification-toast") ? "youtube" : "growth"));
    expect(readingOrder).toEqual([
      "youtube",
      ...Array.from({ length: expectedGrowthCount }, () => "growth"),
    ]);

    await captureEvidence(page, testInfo, path.join(SHELL_EVIDENCE, viewport.file));

    if (viewport.width === 320) {
      await expect(page.getByRole("button", { name: "YouTube 추출 알림 1개" })).toBeVisible();
      await youtubeToast.getByRole("button", { name: "toast 닫기" }).click();
      await expect(youtubeToast).toHaveCount(0);
      await expect(growthToast).toHaveCount(1);
      await expect(growthToast).toContainText("집밥 경험치 획득 1");
      await expect(page.getByTestId("growth-toast-collapsed")).toContainText("+2개의 새 소식 확인");
      await expect(page.getByText("집밥 경험치 획득 2")).toHaveCount(0);
      expect(growthSeenRequests).toEqual([]);
      const handoffOrder = await layer.locator(
        "[data-youtube-notification-toast], [data-testid='growth-toast']",
      ).evaluateAll((elements) => elements.map((element) =>
        element.hasAttribute("data-youtube-notification-toast") ? "youtube" : "growth"));
      expect(handoffOrder).toEqual(["growth"]);
      await captureEvidence(
        page,
        testInfo,
        path.join(SHELL_EVIDENCE, "mobile-320-global-toast-handoff.png"),
      );
      await growthToast.getByRole("button", { name: "알림 닫기" }).click();
      await expect(growthToast).toHaveCount(1);
      await expect(growthToast).toContainText("집밥 경험치 획득 2");
      await expect(page.getByTestId("growth-toast-collapsed")).toContainText("+1개의 새 소식 확인");
      expect(growthSeenRequests).toEqual([["growth-toast-simultaneous-1"]]);
      await captureEvidence(
        page,
        testInfo,
        path.join(SHELL_EVIDENCE, "mobile-320-growth-toast-sequential-handoff.png"),
      );
      await growthToast.getByRole("button", { name: "알림 닫기" }).click();
      await expect(growthToast).toHaveCount(1);
      await expect(growthToast).toContainText("집밥 경험치 획득 3");
      expect(growthSeenRequests).toEqual([
        ["growth-toast-simultaneous-1"],
        ["growth-toast-simultaneous-2"],
      ]);

      const [growthBox, searchAfterBox, filterAfterBox, navAfterBox] = await Promise.all([
        growthToast.boundingBox(),
        page.getByPlaceholder("레시피 제목 검색").first().boundingBox(),
        page.getByRole("button", { name: "재료로 검색" }).first().boundingBox(),
        page.getByRole("navigation", { name: "홈 하단 탭" }).boundingBox(),
      ]);
      expect(rectanglesAreDisjoint(growthBox, searchAfterBox)).toBe(true);
      expect(rectanglesAreDisjoint(growthBox, filterAfterBox)).toBe(true);
      expect(rectanglesAreDisjoint(growthBox, navAfterBox)).toBe(true);
      await page.getByRole("button", { name: "YouTube 추출 알림 1개" }).click();
      await expect(page.getByTestId("youtube-notification-list").getByText("감자 수프")).toBeVisible();
      return;
    }

    await growthToast.first().getByRole("button", { name: "알림 닫기" }).click();
    await expect(growthToast).toHaveCount(Math.min(expectedGrowthCount, 2));
    await expect(youtubeToast).toBeVisible();
    await youtubeToast.getByRole("button", { name: "toast 닫기" }).click();
    await expect(youtubeToast).toHaveCount(0);
  });
}

test("simultaneous toast actions keep YouTube and Growth ownership separate", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setE2EAuthOverride(page);
  await installDiscoveryRoutes(page);
  await installGrowthToastRoute(page);
  await installNotificationRoutes(page, [
    notificationItem({ status: "succeeded", title: "감자 수프" }),
  ]);
  await page.goto("/");

  const youtubeToast = page.locator("[data-youtube-notification-toast]");
  const growthToast = page.getByTestId("growth-toast");
  await expect(youtubeToast).toBeVisible();
  await expect(growthToast).toBeVisible();

  await growthToast.click();
  await expect(page.getByRole("dialog", { name: "알림 기록" })).toBeVisible();
  await expect(page).toHaveURL(/\/$/u);
  await page.getByRole("dialog", { name: "알림 기록" }).getByRole("button", { name: "닫기" }).click();
  await expect(youtubeToast).toBeVisible();

  await youtubeToast.getByRole("link", { name: "결과 확인" }).click();
  await expect(page).toHaveURL(new RegExp(`extractionId=${EXTRACTION_ID}`, "u"));
  await expect(page.getByRole("dialog", { name: "알림 기록" })).toHaveCount(0);
});

test("policy change preserves the URL in a safe import error state", async ({ page }, testInfo) => {
  await openImport(page, "policy-changed", 390, 844);
  await expect(page.locator(".web-menu-add-error")).toContainText("추출 설정이 바뀌었어요. 다시 시도해 주세요.");
  await expect(page.getByLabel("유튜브 URL")).toHaveValue(YOUTUBE_URL);
  await captureEvidence(page, testInfo, path.join(IMPORT_EVIDENCE, "mobile-390-policy-changed.png"), true);
});

test("async enqueue is immediately escapable and visually stable at 390", async ({ page }, testInfo) => {
  await openImport(page, "accepted", 390, 844, "standalone");
  await expect(page.getByText("추출을 시작했어요. 완료되면 알려드릴게요.")).toBeVisible();
  const leave = page.getByRole("button", { name: "나가기" });
  const jobs = page.getByRole("button", { name: "작업 보기" });
  await expect(leave).toHaveClass(/bg-\[var\(--wave1-mint-contrast\)\]/);
  await expect(leave).toHaveAttribute("style", /color: var\(--foreground\)/);
  await expect(jobs).toHaveClass(/bg-\[var\(--wave1-surface-fill\)\]/);
  const [bellBox, backBox] = await Promise.all([
    page.locator("[data-youtube-extraction-trigger='global']").boundingBox(),
    page.getByRole("button", { name: "뒤로 가기" }).boundingBox(),
  ]);
  expect(rectanglesAreDisjoint(bellBox, backBox)).toBe(true);
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
  await leave.click();
  await expect(page).toHaveURL(/\/$/u);
});

test("accepted actions remain reachable at 320 and 200% in a keyboard-reduced safe area", async ({ page }, testInfo) => {
  await openImport(page, "accepted", 320, 568, "standalone");
  await page.addStyleTag({
    content: ":root { --youtube-import-safe-area-top: 24px; --youtube-import-safe-area-bottom: 34px; font-size: 200%; }",
  });
  const scroll = page.locator(".yt-mobile-import-scroll");
  const screenTitle = page.getByRole("heading", { name: "유튜브 가져오기" });
  const leave = page.getByRole("button", { name: "나가기" });
  const jobs = page.getByRole("button", { name: "작업 보기" });
  await expect(page.getByRole("heading", { name: "추출을 시작했어요. 완료되면 알려드릴게요." })).toBeVisible();
  await leave.scrollIntoViewIfNeeded();
  await expect(leave).toBeVisible();
  await expect(jobs).toBeVisible();
  await expect(leave).toHaveCSS("white-space", "nowrap");
  await expect(jobs).toHaveCSS("white-space", "nowrap");
  expect(await screenTitle.evaluate((element) => (
    element.scrollWidth <= element.clientWidth && element.scrollHeight <= element.clientHeight
  ))).toBe(true);
  const [titleBox, notificationTriggerBox] = await Promise.all([
    screenTitle.boundingBox(),
    page.locator("[data-youtube-extraction-trigger='global']").boundingBox(),
  ]);
  expect((titleBox?.x ?? 0) + (titleBox?.width ?? 0)).toBeLessThanOrEqual(
    notificationTriggerBox?.x ?? 0,
  );
  const [leaveBox, jobsBox] = await Promise.all([leave.boundingBox(), jobs.boundingBox()]);
  expect(leaveBox?.y).toBeGreaterThanOrEqual(24);
  expect((jobsBox?.y ?? 0) + (jobsBox?.height ?? 0)).toBeLessThanOrEqual(568 - 34);
  expect(await scroll.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  expect(await scroll.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await captureEvidence(
    page,
    testInfo,
    path.join(IMPORT_EVIDENCE, "mobile-320-accepted-200-keyboard.png"),
  );
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
  await openImport(page, "duplicate", 1280, 800, "standalone");
  await expect(page.getByRole("link", { name: "홈" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: "플래너" })).not.toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "이미 추출 중이에요" })).toBeVisible();
  await expect(page.getByText("같은 영상의 작업이 이미 진행 중이에요. 이 화면을 나가도 계속 처리돼요.")).toBeVisible();
  const [bellBox, backBox] = await Promise.all([
    page.locator("[data-youtube-extraction-trigger='global']").boundingBox(),
    page.getByRole("button", { name: "뒤로", exact: true }).boundingBox(),
  ]);
  expect(rectanglesAreDisjoint(bellBox, backBox)).toBe(true);
  await captureEvidence(page, testInfo, path.join(IMPORT_EVIDENCE, "desktop-1280-active-duplicate.png"), true);
});

test("completed session re-entry can register the reviewed recipe", async ({ page }) => {
  await openImport(page, "review", 390, 844);
  await expect(page.getByRole("heading", { name: "추출 결과 확인" })).toBeVisible();
  await page.getByRole("button", { name: "등록" }).click();
  await expect(page.getByText("레시피가 등록됐어요")).toBeVisible();
});

test("polling success preserves planner context into review and its meal CTA", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setE2EAuthOverride(page);
  await installImportRoutes(page, "planner-success");
  await page.goto(
    `/menu/add/youtube?youtubeUrl=${encodeURIComponent(YOUTUBE_URL)}&date=2026-08-21&columnId=dinner-column&slot=dinner`,
  );

  await expect(page).toHaveURL(new RegExp(
    `extractionId=${EXTRACTION_ID}.*date=2026-08-21.*columnId=dinner-column.*slot=dinner`,
  ));
  await expect(page.getByLabel("식사 추가 대상 8/21 저녁")).toBeVisible();
  await page.getByRole("button", { name: "등록" }).click();
  await expect(page.getByRole("heading", { name: "레시피가 등록됐어요" })).toBeVisible();
  await expect(page.getByRole("button", { name: "이 끼니에 추가" })).toBeVisible();
  await captureEvidence(
    page,
    testInfo,
    path.join(IMPORT_EVIDENCE, "mobile-390-planner-context-review.png"),
    true,
  );
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
  await expect(page.getByTestId("youtube-notification-toast-icon")).toHaveAttribute("data-outcome", "mixed");
  await expect(page.getByTestId("youtube-notification-toast-icon")).toHaveText("•");
  const stableTrigger = page.locator(
    "[data-youtube-extraction-trigger='header'], [data-youtube-extraction-trigger='global']",
  );
  await expect(stableTrigger).toBeVisible();
  const [mobileBellBox, mobileToastCloseBox] = await Promise.all([
    stableTrigger.boundingBox(),
    page.getByRole("button", { name: "toast 닫기" }).boundingBox(),
  ]);
  expect(rectanglesAreDisjoint(mobileBellBox, mobileToastCloseBox)).toBe(true);
  const toastBox = await page.getByTestId("youtube-notification-toast-stack").boundingBox();
  const searchBox = await page.locator(".home-mobile-discovery-search").boundingBox();
  expect((toastBox?.y ?? 0) >= (searchBox?.y ?? 0) + (searchBox?.height ?? 0)
    || (toastBox?.y ?? 0) + (toastBox?.height ?? 0) <= (searchBox?.y ?? 0)).toBe(true);
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
  const toast = page.locator("[data-youtube-notification-toast]");
  await expect(toast.locator("p").first()).toHaveText("이미 등록한 레시피예요");
  await expect(toast.getByRole("link", { name: "레시피 보기" })).toHaveAttribute(
    "href",
    "/recipes/recipe-potato-soup",
  );
  await captureEvidence(page, testInfo, path.join(SHELL_EVIDENCE, "mobile-390-consumed-toast.png"));
  await page.getByRole("button", { name: "YouTube 추출 알림 1개" }).click();
  await expect(page.getByTestId("youtube-notification-list").getByText("이미 등록한 레시피예요")).toBeVisible();
  await expect(page.getByTestId("youtube-notification-list").getByRole("link", { name: "레시피 보기" })).toHaveAttribute(
    "href",
    "/recipes/recipe-potato-soup",
  );
  await captureEvidence(page, testInfo, path.join(SHELL_EVIDENCE, "mobile-390-consumed.png"));
});

test("individual draft and failed toasts include exact state body copy", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setE2EAuthOverride(page);
  await installDiscoveryRoutes(page);
  await installNotificationRoutes(page, [notificationItem({ status: "succeeded", title: "감자 수프" })]);
  await page.goto("/");
  await expect(page.getByText("레시피 추출이 끝났어요")).toBeVisible();
  await expect(page.getByText("추출 결과를 확인하고 레시피로 등록할 수 있어요.")).toBeVisible();
  await captureEvidence(page, testInfo, path.join(SHELL_EVIDENCE, "mobile-390-draft-toast.png"));

  await page.unroute("**/api/v1/users/me/youtube-extraction-jobs**");
  await installNotificationRoutes(page, [
    notificationItem({ code: "NOT_RECIPE_VIDEO", status: "failed", title: "레시피가 아닌 영상" }),
  ]);
  await page.reload();
  await expect(page.getByText("레시피 영상으로 확인되지 않았어요.")).toBeVisible();
  await captureEvidence(page, testInfo, path.join(SHELL_EVIDENCE, "mobile-390-failed-toast.png"));
});

test("real reload and logout-login restore badge list and exact destination", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setE2EAuthOverride(page);
  await installImportRoutes(page, "review");
  await installDiscoveryRoutes(page);
  await installNotificationRoutes(page, [notificationItem({ status: "succeeded", title: "감자 수프" })]);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "YouTube 추출 알림 1개" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: "YouTube 추출 알림 1개" })).toBeVisible();
  await setE2EAuthOverride(page, "guest");
  await page.reload();
  await expect(page.locator("[data-youtube-extraction-trigger]")).toHaveCount(0);

  await setE2EAuthOverride(page, "authenticated");
  await page.reload();
  await page.getByRole("button", { name: "YouTube 추출 알림 1개" }).click();
  const destination = page.getByTestId("youtube-notification-list").getByRole("link", { name: "결과 확인" });
  await expect(destination).toHaveAttribute(
    "href",
    `/menu/add/youtube?extractionId=${EXTRACTION_ID}`,
  );
  await captureEvidence(page, testInfo, path.join(SHELL_EVIDENCE, "mobile-390-relogin-recovery.png"));
  await destination.click();
  await expect(page).toHaveURL(new RegExp(`extractionId=${EXTRACTION_ID}`));
  const reviewHeading = page.getByRole("heading", { name: "추출 결과를 확인해 주세요" });
  await expect(reviewHeading).toBeVisible();
  await expect(reviewHeading).toBeFocused();
});

test("notification tabs wrap in both directions and support Home and End", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setE2EAuthOverride(page);
  await installDiscoveryRoutes(page);
  await installNotificationRoutes(page, [notificationItem({ status: "succeeded", title: null })]);
  await page.goto("/");
  await page.getByRole("button", { name: "YouTube 추출 알림 1개" }).click();

  const unseenTab = page.getByRole("tab", { name: "새 알림" });
  const archiveTab = page.getByRole("tab", { name: "지난 알림" });
  await unseenTab.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(archiveTab).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(unseenTab).toBeFocused();
  await page.keyboard.press("End");
  await expect(archiveTab).toBeFocused();
  await page.keyboard.press("Home");
  await expect(unseenTab).toBeFocused();
});

test("an open notification panel hands focus to unauthorized guidance", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setE2EAuthOverride(page);
  await installDiscoveryRoutes(page);
  const item = notificationItem({ status: "succeeded", title: "감자 수프" });
  await page.route("**/api/v1/users/me/youtube-extraction-jobs**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/delivered") || url.pathname.endsWith("/seen")) {
      await route.fulfill({
        json: { success: true, data: { delivered_count: 1, seen_count: 1 }, error: null },
      });
      return;
    }
    if (url.searchParams.get("view") === "archive") {
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
    await route.fulfill({
      json: { success: true, data: { items: [item], next_cursor: null }, error: null },
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "YouTube 추출 알림 1개" }).click();
  await expect(page.getByRole("button", { name: "알림 닫기" })).toBeFocused();
  await page.getByRole("tab", { name: "지난 알림" }).click();

  const guidanceHeading = page.getByRole("heading", { name: "로그인이 필요해요" });
  await expect(guidanceHeading).toBeVisible();
  await expect(guidanceHeading).toBeFocused();
  await expect(page.getByRole("link", { name: "로그인하고 돌아오기" })).toBeVisible();
  await captureEvidence(
    page,
    testInfo,
    path.join(SHELL_EVIDENCE, "mobile-390-unauthorized.png"),
  );
});

test("archive stays visible while online recovery discovers new unseen work", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setE2EAuthOverride(page);
  await installDiscoveryRoutes(page);
  const unseenItems: ReturnType<typeof notificationItem>[] = [
    notificationItem({ status: "succeeded", title: "기존 감자 수프" }),
  ];
  await installNotificationRoutes(page, unseenItems);
  await page.goto("/");
  await page.getByRole("button", { name: "YouTube 추출 알림 1개" }).click();
  await page.getByRole("tab", { name: "지난 알림" }).click();
  await expect(page.getByRole("heading", { name: "감자 수프" })).toBeVisible();

  unseenItems.push(notificationItem({
    code: "QUOTA_EXCEEDED",
    status: "failed",
    title: "새로 끝난 두부조림",
  }));
  await page.evaluate(() => window.dispatchEvent(new Event("online")));

  await expect(page.getByRole("tab", { name: "지난 알림" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "감자 수프" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "새로 끝난 두부조림" })).toHaveCount(0);
  await expect(page.locator(
    '[data-youtube-extraction-trigger="header"], [data-youtube-extraction-trigger="global"]',
  )).toHaveAttribute(
    "aria-label",
    "YouTube 추출 알림 2개",
  );
  await captureEvidence(
    page,
    testInfo,
    path.join(SHELL_EVIDENCE, "mobile-390-archive-background-unseen.png"),
  );
});

test("desktop toast remains clear of discovery controls", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setE2EAuthOverride(page);
  await installDiscoveryRoutes(page);
  await installNotificationRoutes(page, [notificationItem({ status: "succeeded", title: "감자 수프" })]);
  await page.goto("/");
  await expect(page.getByText("추출 결과를 확인하고 레시피로 등록할 수 있어요.")).toBeVisible();
  const bell = page.locator("[data-youtube-extraction-trigger='global']");
  const toastClose = page.getByRole("button", { name: "toast 닫기" });
  const bellHitOwned = await bell.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return hit === element || element.contains(hit);
  });
  expect(bellHitOwned).toBe(true);
  const [bellBox, toastCloseBox] = await Promise.all([bell.boundingBox(), toastClose.boundingBox()]);
  expect(rectanglesAreDisjoint(bellBox, toastCloseBox)).toBe(true);
  const toastBox = await page.getByTestId("youtube-notification-toast-stack").boundingBox();
  for (const control of [
    page.getByPlaceholder("레시피 제목 검색"),
    page.getByRole("button", { name: "재료로 검색" }),
  ]) {
    const controlBox = await control.boundingBox();
    expect((toastBox?.x ?? 0) >= (controlBox?.x ?? 0) + (controlBox?.width ?? 0)
      || (toastBox?.x ?? 0) + (toastBox?.width ?? 0) <= (controlBox?.x ?? 0)
      || (toastBox?.y ?? 0) >= (controlBox?.y ?? 0) + (controlBox?.height ?? 0)
      || (toastBox?.y ?? 0) + (toastBox?.height ?? 0) <= (controlBox?.y ?? 0)).toBe(true);
  }
  await captureEvidence(page, testInfo, path.join(SHELL_EVIDENCE, "desktop-1440-draft-toast.png"));
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

test("shell unauthorized state keeps a return-to-login action", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setE2EAuthOverride(page);
  await installDiscoveryRoutes(page);
  await installNotificationFailureRoute(page, "UNAUTHORIZED");
  await page.goto("/");
  await expect(page.getByText("로그인이 필요해요")).toBeVisible();
  await expect(page.getByRole("link", { name: "로그인하고 돌아오기" })).toBeVisible();
  await expect(page.getByRole("button", { name: "로그인 안내 닫기" })).toBeVisible();
  const notice = page.getByRole("complementary", { name: "로그인 안내" });
  const search = page.locator(".home-mobile-discovery-search");
  const [noticeBox, searchBox] = await Promise.all([notice.boundingBox(), search.boundingBox()]);
  expect((noticeBox?.y ?? 0) >= (searchBox?.y ?? 0) + (searchBox?.height ?? 0)
    || (noticeBox?.y ?? 0) + (noticeBox?.height ?? 0) <= (searchBox?.y ?? 0)).toBe(true);
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
  const failureMessage = page.getByText(
    "오늘 추출 한도를 모두 사용했어요. 나중에 다시 시도해 주세요.",
  );
  await expect(failureMessage).toBeVisible();
  const wrapping = await failureMessage.evaluate((element) => {
    const style = getComputedStyle(element);
    const textNode = Array.from(element.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
    const text = textNode?.textContent ?? "";
    const phraseLineCounts = ["한도를", "사용했어요", "주세요"].map((phrase) => {
      const start = text.indexOf(phrase);
      if (!textNode || start < 0) return 0;
      const range = document.createRange();
      range.setStart(textNode, start);
      range.setEnd(textNode, start + phrase.length);
      return new Set(Array.from(range.getClientRects()).map((rect) => Math.round(rect.top))).size;
    });
    return {
      overflowWrap: style.overflowWrap,
      phraseLineCounts,
      wordBreak: style.wordBreak,
    };
  });
  expect(wrapping.wordBreak).toBe("keep-all");
  expect(wrapping.overflowWrap).toBe("anywhere");
  expect(wrapping.phraseLineCounts).toEqual([1, 1, 1]);
  const retry = page.getByRole("button", { name: "나중에 다시 시도" });
  await retry.scrollIntoViewIfNeeded();
  await expect(retry).toBeVisible();
  const [retryBox, dialogBoxAfterScroll] = await Promise.all([
    retry.boundingBox(),
    dialog.boundingBox(),
  ]);
  expect(retryBox).not.toBeNull();
  expect(dialogBoxAfterScroll).not.toBeNull();
  expect(retryBox!.x).toBeGreaterThanOrEqual(dialogBoxAfterScroll!.x);
  expect(retryBox!.x + retryBox!.width).toBeLessThanOrEqual(
    dialogBoxAfterScroll!.x + dialogBoxAfterScroll!.width,
  );
  expect(retryBox!.y).toBeGreaterThanOrEqual(dialogBoxAfterScroll!.y);
  expect(retryBox!.y + retryBox!.height).toBeLessThanOrEqual(
    dialogBoxAfterScroll!.y + dialogBoxAfterScroll!.height,
  );
  expect(retryBox!.height).toBeGreaterThanOrEqual(44);
  expect(await retry.evaluate((element) => (
    element.scrollWidth <= element.clientWidth && element.scrollHeight <= element.clientHeight
  ))).toBe(true);
  await captureEvidence(page, testInfo, path.join(SHELL_EVIDENCE, "mobile-320-failure-panel.png"));
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
