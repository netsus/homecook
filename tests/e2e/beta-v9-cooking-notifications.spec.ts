import { expect, test } from "@playwright/test";
import { COOK_MODE_VISUAL_PATH, installCookingVisualRoutes, installAccountLibraryVisualRoutes, setE2EAuthOverride } from "./helpers/mock-routes";
import { installEmptyYoutubeNotificationRoutes } from "./helpers/youtube-background-extraction";

const instruction = "물 400mL와 고춧가루 2스푼을 넣고 10분간 끓여요. 180도로 2번 나누어 조리해요.";
const guidance = "재료표는 선택한 인분으로 환산됩니다. 조리법의 수량은 원문 그대로입니다";
const recipe = {
  id: "qa-v9-recipe", title: "두부와 다양한 채소를 곁들인 조리법 원문 확인 요리", cooking_servings: 3,
  ingredients: [{ ingredient_id: "water", standard_name: "물", amount: 600, unit: "mL", display_text: "물 600mL", ingredient_type: "QUANT", scalable: true }],
  steps: Array.from({ length: 12 }, (_, i) => ({ step_number: i + 1, instruction, cooking_method: { code: "BOIL", label: "끓이기", color_key: "orange" }, ingredients_used: [{ ingredient_id: "water", amount: 400, unit: "mL" }], heat_level: null, duration_seconds: 600, duration_text: "10분" })),
};

test.beforeEach(async ({ page }) => {
  const origin = new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100");
  if (!["127.0.0.1", "localhost"].includes(origin.hostname)) throw new Error("Local mock QA only");
  await setE2EAuthOverride(page);
});

for (const width of [320, 375, 1280, 1440]) {
  test(`snapshot cooking preserves the original instructions at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/api/v1/**", route => route.fulfill({ status: 501, json: { success: false, data: null, error: { code: "QA_ONLY", message: "QA", fields: [] } } }));
    await page.route("**/api/v1/cooking/session-attempts/*/cook-mode", route => route.fulfill({ json: { success: true, error: null, data: { session_id: "qa-v9", contract_version: "snapshot_v2", mode: "standalone", status: "in_progress", recipe, pantry_candidates: [] } } }));
    await page.goto("/cooking/session-attempts/qa-v9/cook-mode");
    const whole = page.getByTestId("snapshot-v2-cook-mode");
    await expect(whole).toBeVisible();
    await expect(page.getByTestId("cook-mode-servings-note")).toHaveText(guidance);
    await expect(page.getByTestId("cook-mode-step-copy-1")).toHaveText(instruction);
    await expect(page.getByText("600mL", { exact: true })).toBeVisible();
    await expect(page.getByRole("spinbutton")).toHaveCount(0);
    if (width >= 1024) {
      // Existing class names outside a local cooking root retain their original layout.
      const unrelated = await page.evaluate(() => {
        const probe = document.createElement("div");
        probe.style.position = "fixed";
        probe.style.visibility = "hidden";
        probe.innerHTML = '<div class="web-cooking-shell"><div class="web-container-wide"></div></div><div class="cook-mobile-whole-screen max-w-[430px]"><main><div class="cook-whole-board cook-whole-board-mobile"></div></main></div>';
        document.body.append(probe);
        const wide = probe.querySelector(".web-container-wide")!;
        const mobile = probe.querySelector(".cook-mobile-whole-screen")!;
        const main = mobile.querySelector("main")!;
        const board = mobile.querySelector(".cook-whole-board")!;
        const result = {
          wideMaxWidth: getComputedStyle(wide).maxWidth,
          originalWideMaxWidth: getComputedStyle(wide).getPropertyValue("--web-content-wide").trim(),
          mobileMaxWidth: getComputedStyle(mobile).maxWidth,
          mainOverflow: getComputedStyle(main).overflowY,
          columns: getComputedStyle(board).gridTemplateColumns.split(" ").length,
        };
        probe.remove();
        return result;
      });
      expect(unrelated.wideMaxWidth).toBe(unrelated.originalWideMaxWidth);
      expect(unrelated.mobileMaxWidth).toBe("430px");
      expect(unrelated.mainOverflow).toBe("visible");
      expect(unrelated.columns).toBe(1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const ingredients = await page.getByRole("region", { name: "전체 재료", exact: true }).boundingBox();
    const steps = await page.getByRole("region", { name: "전체 조리순서", exact: true }).boundingBox();
    if (width >= 1024) {
      expect((await whole.boundingBox())!.width).toBeGreaterThan(width * 0.9);
      expect(steps!.x).toBeGreaterThan(ingredients!.x + ingredients!.width);
      await expect(page.getByRole("button", { name: "요리 완료", exact: true })).toBeInViewport();
      await page.getByRole("main", { name: "요리 내용" }).evaluate(el => { el.scrollTop = el.scrollHeight; });
      await expect(page.getByText("600mL", { exact: true })).toBeInViewport();
    } else {
      expect(steps!.y).toBeGreaterThan(ingredients!.y + ingredients!.height);
      await whole.evaluate(el => { el.scrollTop = el.scrollHeight; });
    }
    await expect(page.getByTestId("cook-mode-step-copy-12")).toBeInViewport();
    await expect(page.getByRole("button", { name: "요리 완료", exact: true })).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath(`snapshot-${width}-bottom.png`) });
    await whole.evaluate(el => { el.scrollTop = 0; });
    if (width >= 1024) await page.getByRole("main", { name: "요리 내용" }).evaluate(el => { el.scrollTop = 0; });
    await page.screenshot({ path: testInfo.outputPath(`snapshot-${width}-top.png`) });
  });

  test(`YouTube results appear before activity in both tabs at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await installAccountLibraryVisualRoutes(page);
    await installEmptyYoutubeNotificationRoutes(page);
    const result = { job_id: "11000000-0000-4000-8000-000000000011", status: "succeeded", submitted_at: "2026-10-13T01:00:00Z", completed_at: "2026-10-13T01:03:00Z", video_title_snapshot: "유튜브 두부찌개 결과", thumbnail_url: "/brand/app-icon-192.png", delivery_key: "qa-v9-delivery", delivered_at: "2026-10-13T01:04:00Z", seen_at: null, result: { extraction_id: "qa-v9-result", review_path: "/menu/add/youtube?extractionId=qa-v9-result", recipe_id: null, recipe_path: null }, error: null, can_retry: false };
    await page.route("**/api/v1/users/me/youtube-extraction-jobs**", route => {
      const path = new URL(route.request().url()).pathname;
      const data = path.endsWith("/seen") ? { seen_count: 1 } : path.endsWith("/delivered") ? { delivered_count: 1 } : { items: [result], next_cursor: null };
      return route.fulfill({ json: { success: true, data, error: null } });
    });
    const activity = { id: "11000000-0000-4000-8000-000000000012", event_type: "cooking_completed", title: "요리를 완성했어요", message: "식사 기록에서 확인해 주세요", target_path: "/leftovers", created_at: "2026-10-13T09:00:00Z", seen_at: null };
    await page.route("**/api/v1/users/me/action-notifications**", route => route.fulfill({ json: { success: true, data: route.request().method() === "POST" ? { seen_ids: [activity.id], unread_count: 0 } : { items: [activity], next_cursor: null, has_next: false, unread_count: 1 }, error: null } }));
    await page.goto("/planner?date=2026-10-13");
    await page.getByRole("button", { name: /^알림 [0-9]+개$/ }).click();
    const dialog = page.getByRole("dialog", { name: "알림", exact: true });
    for (const tab of ["새 알림", "지난 알림"]) {
      await dialog.getByRole("tab", { name: tab, exact: true }).click();
      const resultRow = dialog.locator("[data-youtube-job-id]");
      const activityRow = dialog.locator("[data-app-action-notification-id]");
      await expect(resultRow).toBeVisible();
      await expect(activityRow).toBeVisible();
      expect((await resultRow.boundingBox())!.y).toBeLessThan((await activityRow.boundingBox())!.y);
      expect(await dialog.locator("article").evaluateAll(rows => rows.map(row => row.getAttribute("data-youtube-job-id") ?? row.getAttribute("data-app-action-notification-id")))).toEqual([result.job_id, activity.id]);
      await expect(resultRow.getByRole("link", { name: "결과 확인", exact: true })).toHaveAttribute("href", result.result.review_path);
      await expect(activityRow.getByRole("link", { name: activity.title })).toHaveAttribute("href", "/leftovers");
      await page.screenshot({ path: testInfo.outputPath(`notifications-${width}-${tab}.png`) });
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}

for (const width of [1280, 1440]) test(`legacy planner boards keep ingredients, steps and actions visible at ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 900 });
  await installCookingVisualRoutes(page);
  await page.goto(COOK_MODE_VISUAL_PATH);
  const board = page.getByTestId("cook-mode-whole-board");
  await expect(board).toBeVisible();
  expect((await board.boundingBox())!.width).toBeGreaterThan(width * 0.9);
  await expect(page.getByRole("region", { name: "전체 재료", exact: true })).toBeInViewport();
  await expect(page.getByTestId("cook-mode-servings-note")).toHaveText(guidance);
  await expect(page.getByRole("button", { name: "요리 완료", exact: true })).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath(`legacy-planner-${width}.png`) });
});
