import { expect, test } from "@playwright/test";

import { PENDING_ACTION_KEY } from "../../lib/auth/pending-action";
import { installAccountLibraryVisualRoutes } from "./helpers/mock-routes";
import { PRODUCT_UI_DETAIL, PRODUCT_UI_IDS } from "./helpers/recipe-product-ui-fixture";

test.skip(process.env.HOMECOOK_COOK_LOGIN_LOCAL_FIXTURE !== "1", "Owned local snapshot-v2 fixture only");

for (const width of [320, 375, 1440]) {
  test(`guest cooking resumes explicitly with selected servings at ${width}px`, async ({ browser, baseURL }, testInfo) => {
    if (!baseURL || new URL(baseURL).hostname !== "127.0.0.1") throw new Error("Owned loopback fixture required");
    const origin = new URL(baseURL).origin;
    const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: "block", reducedMotion: "reduce" });
    const page = await context.newPage();
    const starts: unknown[] = [];
    const unexpectedApis: string[] = [];
    const externalOrigins: string[] = [];
    const pageErrors: string[] = [];
    let authenticated = false;
    let revision = 12;
    const sessionId = "550e8400-e29b-41d4-a716-446655440099";
    page.on("pageerror", error => pageErrors.push(error.message));
    await installAccountLibraryVisualRoutes(page);
    await page.addInitScript(() => localStorage.setItem("homecook.e2e-auth-override", "guest"));
    await context.addCookies([{ name: "homecook.e2e-auth-override", value: "guest", url: origin, sameSite: "Lax" }]);
    await page.route("**/*", async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== origin) {
        externalOrigins.push(url.origin);
        return route.abort();
      }
      if (url.pathname.startsWith(`/cooking/session-attempts/${sessionId}/cook-mode`)) {
        return route.fulfill({ contentType: "text/html", body: "<main>격리 요리 세션 이동 확인</main>" });
      }
      if (!url.pathname.startsWith("/api/")) return route.continue();
      const ok = (data: unknown) => route.fulfill({ json: { success: true, data, error: null } });
      if (url.pathname === `/api/v1/recipes/${PRODUCT_UI_IDS.recipe}` && request.method() === "GET") {
        return ok({ ...PRODUCT_UI_DETAIL, title: "공개 제품 요리 로그인 확인", visibility: "public", base_servings: 2,
          revision, edit_context: null });
      }
      if (url.pathname === "/api/v1/cooking/session-attempts" && request.method() === "POST") {
        expect(authenticated).toBe(true);
        starts.push(request.postDataJSON());
        await new Promise(resolve => setTimeout(resolve, 250));
        return ok({ session_id: sessionId, contract_version: "snapshot_v2", mode: "standalone", status: "in_progress",
          content_summary: { recipe_id: PRODUCT_UI_IDS.recipe, title: "공개 제품 요리 로그인 확인", cooking_servings: 3 } });
      }
      if (url.pathname === "/api/v1/users/me") return ok({ id: PRODUCT_UI_IDS.owner, nickname: "격리 로그인 확인", email: null,
        profile_image_url: null, social_provider: "naver", settings: { screen_wake_lock: false } });
      if (url.pathname.endsWith("/view")) return ok({ view_count: 1 });
      if (url.pathname.includes("action-notifications")) return ok({ items: [], unread_count: 0, has_next: false, next_cursor: null });
      if (url.pathname.includes("youtube-extraction-jobs")) return ok({ items: [], next_cursor: null });
      if (request.method() === "GET" && ["/api/v1/users/me/progress", "/api/v1/users/me/gamification"].includes(url.pathname)) return route.fallback();
      unexpectedApis.push(`${request.method()} ${url.pathname}`);
      return route.fulfill({ status: 501, json: { success: false, data: null, error: { code: "QA_MISSING_ROUTE", message: "Fixture missing", fields: [] } } });
    });
    try {
      await page.goto(`/recipe/${PRODUCT_UI_IDS.recipe}`);
      await page.getByRole("button", { name: "인분 늘리기" }).click();
      await page.getByRole("button", { name: "요리하기", exact: true }).click();
      const gate = page.getByRole("dialog", { name: "로그인이 필요한 작업이에요" });
      await expect(gate).toContainText("선택한 3인분으로 돌아가요. 요리하기를 다시 눌러 시작해 주세요.");
      expect(starts).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`guest-gate-${width}.png`) });
      await gate.getByRole("button", { name: "로그인", exact: true }).click();
      await expect(page).toHaveURL(/\/login\?/);
      const pending = await page.evaluate(key => JSON.parse(sessionStorage.getItem(key) ?? "null"), PENDING_ACTION_KEY);
      expect(pending).toMatchObject({ type: "cook", recipeId: PRODUCT_UI_IDS.recipe, cookingServings: 3, recipeRevision: 12 });
      const next = new URL(page.url()).searchParams.get("next");
      expect(next).toBe(`/recipe/${PRODUCT_UI_IDS.recipe}`);
      authenticated = true;
      revision = 13;
      await page.addInitScript(() => localStorage.setItem("homecook.e2e-auth-override", "authenticated"));
      await context.addCookies([{ name: "homecook.e2e-auth-override", value: "authenticated", url: origin, sameSite: "Lax" }]);
      await page.goto(next!);
      await expect(page.getByText("레시피가 변경됐어요. 선택한 3인분은 유지했어요. 현재 내용을 확인한 뒤 요리하기를 다시 눌러 주세요.")).toBeVisible();
      expect(starts).toEqual([]);
      expect(await page.evaluate(key => sessionStorage.getItem(key), PENDING_ACTION_KEY)).toBeNull();
      const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(documentWidth).toBeLessThanOrEqual(width);
      await page.screenshot({ path: testInfo.outputPath(`explicit-return-${width}.png`) });
      await page.getByRole("button", { name: "요리하기", exact: true }).dblclick();
      await expect(page).toHaveURL(new RegExp(`/cooking/session-attempts/${sessionId}/cook-mode`));
      expect(starts).toEqual([{ mode: "standalone", recipe_id: PRODUCT_UI_IDS.recipe, expected_recipe_revision: 13, cooking_servings: 3 }]);
      expect(unexpectedApis).toEqual([]);
      expect(externalOrigins).toEqual([]);
      expect(pageErrors).toEqual([]);
      await testInfo.attach("fixture-boundary", { body: JSON.stringify({ width, starts, documentWidth, unexpectedApis, externalOrigins, pageErrors }), contentType: "application/json" });
    } finally {
      await context.close();
    }
  });
}
