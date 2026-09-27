import { expect, test } from "@playwright/test";
import { installMenuAddVisualRoutes, setE2EAuthOverride } from "./helpers/mock-routes";

test("ingredient search keeps its header still and scrolls only the results", async ({ page }, testInfo) => {
  const mobile = testInfo.project.name !== "desktop-chrome";
  await page.setViewportSize(mobile ? { width: 375, height: 812 } : { width: 1280, height: 900 });
  await setE2EAuthOverride(page);
  await installMenuAddVisualRoutes(page);
  await page.route("**/api/v1/food-catalog/search**", async route => {
    const query = new URL(route.request().url()).searchParams.get("q");
    await route.fulfill({ json: { success: true, data: {
      items: query === "없음" ? [] : Array.from({ length: 40 }, (_, i) => ({ type: "ingredient", id: `modal-ingredient-${i}`, standard_name: `재료 ${i + 1}`, category: "기타", default_unit: "g" })),
      next_cursor: null, has_next: false,
    }, error: null } });
  });
  await page.goto("/menu/add/manual");
  const add = page.getByRole("button", { name: /재료 추가/ }).first();
  await expect(add).toBeVisible();
  await add.click();
  const dialog = page.getByRole("dialog", { name: "제품·재료 선택" });
  const input = dialog.getByRole("searchbox");
  const results = dialog.locator(".ingredient-search-results");
  await expect(dialog.getByRole("checkbox")).toHaveCount(40);
  const original = await input.boundingBox();
  expect(original).not.toBeNull();
  expect(await input.evaluate(el => getComputedStyle(el).fontSize)).toBe("16px");
  const bodyY = await page.evaluate(() => window.scrollY);
  await results.hover();
  await page.mouse.wheel(0, 550);
  await expect.poll(() => results.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  expect((await input.boundingBox())!.y).toBeCloseTo(original!.y, 0);
  expect(await page.evaluate(() => window.scrollY)).toBe(bodyY);
  expect(await dialog.evaluate(el => [el, ...el.querySelectorAll<HTMLElement>("*")].filter(node => {
    const style = getComputedStyle(node);
    return /auto|scroll/.test(style.overflowY) && node.scrollHeight > node.clientHeight;
  }).length)).toBe(1);
  await input.fill("없음");
  await expect(dialog.getByText("검색 결과가 없어요. 다른 이름으로 찾아보세요.")).toBeVisible();
  expect((await input.boundingBox())!.y).toBeCloseTo(original!.y, 0);
  await input.fill("재료");
  await expect(dialog.getByRole("checkbox")).toHaveCount(40);
  await page.screenshot({ path: testInfo.outputPath(`ingredient-search-${mobile ? "375" : "desktop"}.png`) });
  if (mobile) {
    await page.setViewportSize({ width: 375, height: 420 });
    await expect.poll(async () => (await dialog.boundingBox())!.height).toBeLessThanOrEqual(412);
    const bounds = await dialog.boundingBox();
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(420);
    await expect(input).toBeVisible();
    await expect(dialog.getByRole("button", { name: "선택한 재료 0개 추가" })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("ingredient-search-375-short-viewport.png") });
  }
  await dialog.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(add).toBeFocused();
});
