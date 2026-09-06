import { expect, test } from "@playwright/test";
import { installMarketingDemandValidationRoutes } from "./helpers/marketing-demand-validation";

for (const [candidate, expected] of [[null, "a"], ["d", "a"], ["a", "a"], ["b", "b"], ["c", "c"]] as const) {
  test(`landing ${candidate ?? "plain beta"} operates as ${expected}`, async ({ page }) => {
    await installMarketingDemandValidationRoutes(page);
    const views: Array<Record<string, unknown>> = [];
    page.on("request", request => {
      if (request.url().includes("/api/v1/marketing/validation") && request.method() === "POST") {
        const body = request.postDataJSON();
        if (body.action === "view") views.push(body);
      }
    });
    const params = new URLSearchParams({ utm_source: "ui-regression" });
    if (candidate) params.set("ad_variant", candidate);
    await page.goto(`/beta?${params}`);
    await expect(page).toHaveURL(url => url.searchParams.get("ad_variant") === expected && url.searchParams.get("utm_source") === "ui-regression");
    await expect(page.locator(`.hero-screen--${expected}`)).toBeVisible();
    await expect.poll(() => views.length).toBeGreaterThan(0);
    expect(views.every(view => view.ad_variant === expected)).toBe(true);
    await expect(page.locator(".hero-screen--d, .hero-screen--default")).toHaveCount(0);
  });
}

test("guide connects the current service explanation to the active landing", async ({ page }) => {
  await installMarketingDemandValidationRoutes(page);
  await page.goto("/about#how-to");
  const banner = page.getByRole("link", { name: "집밥 기록 테스트 해보기" });
  await expect(banner).toHaveAttribute("href", "/beta?ad_variant=a");
  await expect(page.getByLabel("현재 이용 안내")).toContainText("식사 상세·수정은 준비 중");
  await banner.click();
  await expect(page.locator(".hero-screen--a")).toBeVisible();
});

test("food name leads straight to login while plan cards include the per-serving macros", async ({ page, baseURL }) => {
  await page.context().addCookies([{ name: "homecook.e2e-auth-override", value: "guest", url: baseURL! }]);
  await page.addInitScript(() => localStorage.setItem("homecook.e2e-auth-override", "guest"));
  await page.goto("/planner?date=2026-09-06");
  const meal = page.getByRole("button", { name: "그릭요거트 볼", exact: true });
  await expect(meal).toContainText("420 kcal");
  await expect(meal.getByLabel("탄수화물 48 g", { exact: true })).toBeAttached();
  await expect(meal.getByLabel("단백질 22 g", { exact: true })).toBeAttached();
  await expect(meal.getByLabel("지방 16 g", { exact: true })).toBeAttached();
  await page.goto("/planner?date=2026-09-06&segment=log");
  await page.getByRole("button", { name: /그릭요거트 볼 식사 기록 상세/ }).click();
  await expect(page).toHaveURL(url => url.pathname === "/login" && new URL(url.searchParams.get("next")!, url.origin).searchParams.get("segment") === "log");
});
