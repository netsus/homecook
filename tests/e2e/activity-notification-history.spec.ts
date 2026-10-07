import { expect, test } from "@playwright/test";
import { installAccountLibraryVisualRoutes, setE2EAuthOverride } from "./helpers/mock-routes";
import { installEmptyYoutubeNotificationRoutes } from "./helpers/youtube-background-extraction";

for (const width of [375, 1280]) test(`activity history persists after reload ${width}px`, async ({ page }, testInfo) => {
  const origin = new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100");
  if (!["127.0.0.1", "localhost"].includes(origin.hostname)) throw new Error("Local QA only");
  await page.setViewportSize({ width, height: 812 });
  await setE2EAuthOverride(page);
  await installAccountLibraryVisualRoutes(page);
  await installEmptyYoutubeNotificationRoutes(page);
  const items = [
    { id: "11000000-0000-4000-8000-000000000001", event_type: "cooking_completed", title: "요리를 완성했어요", message: "김치찌개 2인분을 완성했어요", target_path: "/leftovers", created_at: "2026-09-28T10:00:00Z", seen_at: null as string | null },
    { id: "11000000-0000-4000-8000-000000000002", event_type: "pantry_deducted", title: "팬트리 재료를 차감했어요", message: "김치, 두부", target_path: "/pantry", created_at: "2026-09-28T09:59:00Z", seen_at: null as string | null },
  ];
  await page.route("**/api/v1/users/me/action-notifications**", async route => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === "POST") {
      const ids = req.postDataJSON().ids as string[];
      items.forEach(item => { if (ids.includes(item.id)) item.seen_at = "2026-09-28T10:01:00Z"; });
      await route.fulfill({ json: { success: true, data: { seen_ids: ids, unread_count: items.filter(item => !item.seen_at).length }, error: null } });
    } else {
      const archive = url.searchParams.get("view") === "archive";
      await route.fulfill({ json: { success: true, data: { items: items.filter(item => archive ? item.seen_at : !item.seen_at), next_cursor: null, has_next: false, unread_count: items.filter(item => !item.seen_at).length }, error: null } });
    }
  });
  await page.goto("/planner?date=2026-09-28");
  await page.getByRole("button", { name: "알림 2개", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "알림", exact: true });
  await expect(dialog.getByText("김치찌개 2인분을 완성했어요")).toBeVisible();
  await expect(dialog.getByText("김치, 두부")).toBeVisible();
  await expect.poll(() => items.filter(item => !item.seen_at).length).toBe(0);
  await page.screenshot({ path: testInfo.outputPath("activity-new.png") });
  await page.reload();
  await page.getByRole("button", { name: "알림 없음", exact: true }).click();
  await dialog.getByRole("tab", { name: "지난 알림" }).click();
  await expect(dialog.getByText("김치찌개 2인분을 완성했어요")).toBeVisible();
  await expect(dialog.getByRole("link", { name: "팬트리 재료를 차감했어요" })).toHaveAttribute("href", "/pantry");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await page.screenshot({ path: testInfo.outputPath("activity-archive.png") });
});
