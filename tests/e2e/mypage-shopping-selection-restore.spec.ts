import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { installAccountLibraryVisualRoutes } from "./helpers/mock-routes";
import { installEmptyYoutubeNotificationRoutes } from "./helpers/youtube-background-extraction";

const OFF_PAGE_ID = "history-not-in-first-page";
const ORIGIN = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:35417";

for (const viewport of [{ width: 375, height: 812 }, { width: 1440, height: 1000 }]) {
  test(`restores shopping selection after reload at ${viewport.width}px`, async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await page.setViewportSize(viewport);
    const consoleMessages: Array<{ type: string; text: string }> = [];
    const pageErrors: string[] = [];
    const failedRequests: Array<{ url: string; error: string | null }> = [];
    const unexpectedApiRequests: string[] = [];
    const shoppingWrites: string[] = [];
    page.on("console", (message) => consoleMessages.push({ type: message.type(), text: message.text() }));
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("requestfailed", (request) => failedRequests.push({ url: request.url(), error: request.failure()?.errorText ?? null }));
    page.on("request", (request) => {
      if (request.url().includes("/api/v1/shopping/") && request.method() !== "GET") shoppingWrites.push(request.method());
    });
    // Unknown API requests cannot reach the local Supabase or operating application.
    await page.route("**/api/v1/**", (route) => {
      unexpectedApiRequests.push(route.request().url());
      return route.fulfill({ status: 503,
        json: { success: false, data: null, error: { code: "FIXTURE_UNEXPECTED", message: "unmocked fixture API", fields: [] } } });
    });
    await installAccountLibraryVisualRoutes(page);
    await installEmptyYoutubeNotificationRoutes(page);
    await page.route("**/api/v1/planner?**", (route) => route.fulfill({ json: {
      success: true, data: { columns: [], meals: [] }, error: null,
    } }));
    await page.route("**/api/v1/users/me/action-notifications?**", (route) => route.fulfill({ json: {
      success: true, data: { items: [], next_cursor: null, has_next: false, unread_count: 0 }, error: null,
    } }));
    await page.route("**/api/v1/shopping/lists/*", async (route) => {
      expect(route.request().method()).toBe("GET");
      const id = new URL(route.request().url()).pathname.split("/").at(-1);
      await route.fulfill({ json: { success: true, error: null, data: {
        id, title: "새로고침 보존 장보기", date_range_start: "2026-04-30", date_range_end: "2026-05-06",
        is_completed: true, completed_at: "2026-05-01T09:30:00.000Z", created_at: "2026-04-30T00:00:00.000Z",
        updated_at: "2026-05-01T09:30:00.000Z", recipes: [], items: [{ id: "item-1", ingredient_id: "ing-1",
          display_text: "두부 1모", amounts_json: [{ amount: 1, unit: "모" }], is_checked: true,
          is_pantry_excluded: false, added_to_pantry: false, sort_order: 0 }],
      } } });
    });
    await page.context().addCookies([{ name: "homecook.e2e-auth-override", value: "authenticated", url: ORIGIN, sameSite: "Lax" }]);
    await page.addInitScript(() => window.localStorage.setItem("homecook.e2e-auth-override", "authenticated"));

    await page.goto(`/mypage?tab=shopping&shoppingListId=${OFF_PAGE_ID}`);
    const mobile = viewport.width < 1024;
    const detail = page.getByTestId(mobile ? "shopping-detail-mobile" : "shopping-detail-embedded");
    await expect(detail).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText("완료된 장보기 기록은 수정할 수 없어요")).toBeVisible();
    await page.reload();
    await expect(detail).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`shoppingListId=${OFF_PAGE_ID}`));
    await expect(page.getByText("두부", { exact: true })).toBeVisible();
    await expect(page.getByText("1모", { exact: true })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: testInfo.outputPath("full-page.png"), fullPage: true });
    await detail.screenshot({ path: testInfo.outputPath("shopping-detail.png") });
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(hasOverflow).toBe(false);

    await page.getByRole("button", { name: mobile ? "뒤로 가기" : "목록으로", exact: true }).first().click();
    await expect(detail).toHaveCount(0);
    await expect(page).not.toHaveURL(/shoppingListId=/);
    await page.reload();
    await expect(page.getByTestId("shopping-card-list-account-1")).toBeVisible();
    await expect(detail).toHaveCount(0);
    await page.getByTestId("shopping-card-list-account-1").click();
    await expect(detail).toBeVisible();
    if (mobile) await expect(page).toHaveURL(/\/shopping\/lists\/list-account-1/);
    await page.goBack();
    await expect(detail).toHaveCount(0);
    await page.goForward();
    await expect(detail).toBeVisible();
    await expect(page).toHaveURL(mobile ? /\/shopping\/lists\/list-account-1/ : /shoppingListId=list-account-1/);
    const signalsPath = testInfo.outputPath("runtime-signals.json");
    await writeFile(signalsPath, JSON.stringify({ consoleMessages, pageErrors, failedRequests, shoppingWrites, unexpectedApiRequests }, null, 2));
    await testInfo.attach("runtime-signals.json", { path: signalsPath, contentType: "application/json" });
    expect(pageErrors).toEqual([]);
    expect(shoppingWrites).toEqual([]);
    expect(unexpectedApiRequests).toEqual([]);
    expect(consoleMessages.filter((message) => message.type === "error")).toEqual([]);
  });
}
