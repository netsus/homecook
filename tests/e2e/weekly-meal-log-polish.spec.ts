import { expect, test } from "@playwright/test";

for (const width of [375, 320, 1280]) {
  test.describe(`weekly planner polish ${width}px`, () => {
    test.use({ viewport: { width, height: 812 } });
    test.beforeEach(async ({ page, baseURL }) => {
      await page.context().addCookies([{ name: "homecook.e2e-auth-override", value: "guest", url: baseURL! }]);
      await page.addInitScript(() => localStorage.setItem("homecook.e2e-auth-override", "guest"));
    });

    test("opens the selected day in a seven-day meal log and keeps daily tiles and food text separate", async ({ page }) => {
      await page.goto("/planner?date=2026-09-06&segment=log");
      await expect(page.locator("#planner-log-panel [data-planner-date]")).toHaveCount(7);
      const today = page.locator('[data-planner-date="2026-09-06"]');
      await expect(today).toBeInViewport({ ratio: 0.5 });
      await expect(today.getByRole("region", { name: "하루 영양" }).locator("dl > div")).toHaveCount(4);
      await expect(today.getByRole("region", { name: "하루 영양" })).toContainText("1,607");
      await expect(today.getByRole("img")).toHaveCount(0);
      const selected = page.getByRole("radio", { name: /9\/6 일요일 선택/ });
      await expect(selected).toContainText("오늘");
      expect(await selected.evaluate(e => getComputedStyle(e).color)).toBe("rgb(255, 255, 255)");
      expect(await selected.evaluate(e => getComputedStyle(e).boxShadow)).toBe("none");
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    });

    test("scrolling a week updates the selected date without opening another day screen", async ({ page }) => {
      await page.goto("/planner?date=2026-09-06&segment=log");
      await expect(page.locator('[data-planner-date="2026-09-06"]')).toBeInViewport({ ratio: 0.5 });
      await page.mouse.wheel(0, -1);
      await page.locator('[data-planner-date="2026-09-02"]').evaluate(e => window.scrollTo({ top: scrollY + e.getBoundingClientRect().top - 84, behavior: "instant" }));
      await expect(page).toHaveURL(url => url.searchParams.get("date") === "2026-09-02");
      await expect(page.getByRole("radio", { name: /9\/2 수요일 선택/ })).toHaveAttribute("aria-checked", "true");
      await expect(page.locator("#planner-log-panel [data-planner-date]")).toHaveCount(7);
    });

    test("planned dishes show explicit total weight and calories with macro bars", async ({ page }) => {
      await page.goto("/planner?date=2026-09-06");
      const dish = page.getByRole("button", { name: "그릭요거트 볼", exact: true });
      await expect(dish).toBeInViewport();
      await expect(dish).toContainText(/250\s*g/);
      await expect(dish).toContainText("420 kcal");
      await expect(dish).not.toContainText("인분");
      await expect(dish.getByRole("img", { name: /탄단지 열량 비율/ })).toBeVisible();
    });
  });
}

test("home YouTube preparation returns to home and social registration stays closed", async ({ page, request, baseURL }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /유튜브 가져오기/ }).click();
  await expect(page).toHaveURL(/\/recipes\/new\/youtube$/, { timeout: 15000 });
  await expect(page.getByRole("heading", { name: "준비 중인 기능이에요" })).toBeVisible();
  await page.getByRole("link", { name: "돌아가기" }).click();
  await expect(page).toHaveURL(url => url.pathname === "/");
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "정식 출시를 준비하고 있어요" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Google|구글|카카오|네이버|Apple/ })).toHaveCount(0);
  const response = await request.post("/auth/flow/start", { headers: { origin: baseURL! }, data: { flow_kind: "login", provider: "google" } });
  expect(response.status()).toBe(503);
  expect((await response.json()).error.code).toBe("AUTH_FLOW_UNAVAILABLE");
});
