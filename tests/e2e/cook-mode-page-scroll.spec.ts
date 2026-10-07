import { expect, test } from "@playwright/test";
import { setE2EAuthOverride } from "./helpers/mock-routes";
import type { SnapshotV2CookModeData } from "../../types/cooking";

// Loopback fixture only; no real cooking session is read or completed.
test("cooking title and actions scroll together without a second document scrollbar", async ({ page }, testInfo) => {
  const origin = new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100");
  if (!["localhost", "127.0.0.1"].includes(origin.hostname)) throw new Error("Local QA server required");
  await page.setViewportSize({ width: 375, height: 667 });
  await setE2EAuthOverride(page);
  await page.route("**/api/v1/**", route => route.fulfill({ status: 501, json: { success: false, data: null, error: { code: "QA_ONLY", message: "QA", fields: [] } } }));
  const data: SnapshotV2CookModeData = {
    session_id: "qa-scroll-session", contract_version: "snapshot_v2", mode: "standalone", status: "in_progress",
    recipe: {
      id: "qa-recipe", title: "네 가지 재료로 만드는 바스크 치즈케이크", cooking_servings: 2,
      ingredients: [{ ingredient_id: "qa-cheese", standard_name: "크림치즈", amount: 200, unit: "g", display_text: "크림치즈 200g", ingredient_type: "QUANT", scalable: true }],
      steps: Array.from({ length: 8 }, (_, index) => ({ step_number: index + 1, instruction: "크림치즈와 재료를 충분히 섞어주세요. 반죽을 팬에 넣고 고르게 펼쳐주세요.", cooking_method: { code: "BAKE", label: "굽기", color_key: "orange" }, ingredients_used: [], heat_level: null, duration_seconds: null, duration_text: null })),
    },
    pantry_candidates: [],
  };
  await page.route("**/api/v1/cooking/session-attempts/*/cook-mode", route => route.fulfill({ json: { success: true, data, error: null } }));
  await page.goto("/cooking/session-attempts/qa-scroll-session/cook-mode");
  const whole = page.getByRole("region", { name: "요리 화면", exact: true });
  const heading = page.getByRole("heading", { name: data.recipe.title });
  await expect(heading).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-mobile-fullscreen-page", "true");
  expect(await whole.evaluate(el => el.scrollTop)).toBe(0);
  expect((await heading.boundingBox())!.y).toBeLessThan(40);
  await page.screenshot({ path: testInfo.outputPath("cook-top.png") });
  await whole.evaluate(el => { el.scrollTop = el.scrollHeight; });
  expect((await heading.boundingBox())!.y).toBeLessThan(0);
  const complete = page.getByRole("button", { name: "요리 완료", exact: true });
  await expect(complete).toBeInViewport();
  await expect(page.getByRole("button", { name: "취소", exact: true })).toBeInViewport();
  expect(await page.getByRole("main", { name: "요리 내용" }).evaluate(el => getComputedStyle(el).overflowY)).toBe("visible");
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  const box = (await whole.boundingBox())!;
  expect(box.y).toBe(0);
  expect(box.height).toBe(667);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.screenshot({ path: testInfo.outputPath("cook-bottom.png") });
});
