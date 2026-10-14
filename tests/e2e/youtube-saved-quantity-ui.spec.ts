import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { YoutubeSavedRecipeResult, YoutubeSavedRecipeEditableContent } from "@/types/youtube-saved-recipe";

const draft = "11111111-1111-4111-8111-111111111111";
const row = "22222222-2222-4222-8222-222222222222";
const stamp = "a".repeat(64);
const artifactDir = process.env.HOMECOOK_C04_UI_ARTIFACT_DIR ?? "";
const enabled = artifactDir.startsWith("/tmp/mumeok-c04-youtube-ui-");
if (artifactDir && !enabled) throw new Error("An owned /tmp local-UI artifact directory is required");
if (enabled) mkdirSync(artifactDir, { recursive: true });
function fixture(): YoutubeSavedRecipeResult {
  return { draft_id: draft, revision: 1, created_at: "2026-10-14T00:00:00Z", updated_at: "2026-10-14T00:00:00Z",
    source: { extraction_id: "33333333-3333-4333-8333-333333333333", youtube_url: "", youtube_video_id: "", thumbnail_url: null },
    quantity_policy: "quantity-v4", quantity_contexts: { [row]: { fingerprint: stamp, options: null } },
    ingredient_links: { [row]: { ingredient_id: "44444444-4444-4444-8444-444444444444", resolution_status: "resolved", candidates: [] } },
    content: { title: "분수 원문 레시피", base_servings: 2, tags: [], steps: [], ingredients: [{ row_id: row, source_draft_ingredient_id: null,
      standard_name: "소금", quantity_mode: "quantity", amount: 1 / 3, unit: "g", display_text: "소금 1/3g", component_label: null,
      quantity_context_fingerprint: stamp, quantity_input: { schema_version: "quantity-v4", raw_value: "1/3", raw_unit: "g", numerator: "1", denominator: "3",
        normalized: { amount: 1 / 3, unit: "g" }, quality: "direct", reason: null, evidence_ids: [], source_versions: [], batch_basis: null } }] } };
}
for (const width of [375, 1440]) {
  test(`raw reopen, SI, retry, OFF and old-eight-key title save at ${width}px`, async ({ page, baseURL }) => {
    test.skip(!enabled, "Explicit owned local UI fixture only");
    if (!baseURL || new URL(baseURL).hostname !== "127.0.0.1" || new URL(baseURL).port !== "3417") throw new Error("Only the explicit owned local UI fixture is allowed");
    await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
    let saved = fixture();
    const writes: Array<{ content: YoutubeSavedRecipeEditableContent; key: string | undefined; contract: string | undefined }> = [];
    const logs = { pageErrors: [] as string[], consoleErrors: [] as string[], externalRequests: [] as string[],
      failedRequests: [] as Array<{ url: string; error: string }>, errorResponses: [] as string[] };
    page.on("pageerror", error => logs.pageErrors.push(error.message));
    page.on("console", message => { if (message.type() === "error") logs.consoleErrors.push(message.text()); });
    page.on("requestfailed", request => logs.failedRequests.push({ url: request.url(), error: request.failure()?.errorText ?? "unknown" }));
    page.on("response", response => { if (response.status() >= 400) logs.errorResponses.push(`${response.status()} ${response.url()}`); });
    await page.route("**/*", async route => {
      const request = route.request();const url = new URL(request.url());
      if (url.origin !== baseURL) { logs.externalRequests.push(url.href);await route.abort();return; }
      if (url.pathname.startsWith("/api/v1/recipes/youtube/saved-drafts/")) {
        if (request.method() === "GET") { expect(request.headers()["x-homecook-quantity-contract"]).toBe("quantity-v4");await route.fulfill({ json: { success: true, data: saved, error: null } });return; }
        if (request.method() === "PATCH") {
          const { content } = request.postDataJSON() as { content: YoutubeSavedRecipeEditableContent };
          writes.push({ content, key: request.headers()["idempotency-key"], contract: request.headers()["x-homecook-quantity-contract"] });
          if (writes.length === 1) { await route.fulfill({ status: 503, json: { success: false, data: null, error: { code: "NETWORK_ERROR", message: "합성 재시도 검사", fields: [] } } });return; }
          const previous = saved.content.ingredients[0];
          saved = { ...saved, revision: saved.revision + 1, content: { ...content, ingredients: content.ingredients.map(input => ({ ...input,
            quantity_input: { ...previous.quantity_input!, display_quantity: { amount: input.amount!, unit: input.unit! } }, quantity_context_fingerprint: stamp })) } };
          const data = content.ingredients.some(input => "quantity_input" in input) ? saved : { ...saved, quantity_policy: undefined, quantity_contexts: undefined,
            content: { ...saved.content, ingredients: saved.content.ingredients.map(ingredient => { const input = { ...ingredient };delete input.quantity_input;delete input.quantity_context_fingerprint;return input; }) } };
          await route.fulfill({ json: { success: true, data, error: null } });return;
        }
        throw new Error("Unexpected saved write method");
      }
      if (url.pathname === "/api/v1/cooking-methods") { await route.fulfill({ json: { success: true, data: { methods: [] }, error: null } });return; }
      if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/mock-auth")) throw new Error(`Unexpected API ${url.pathname}`);
      await route.continue();
    });
    const capture = async (state: string) => {
      const bounds = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
        controls: [...document.querySelectorAll<HTMLInputElement>('input[aria-label$="수량"],input[aria-label$="단위 직접 입력"]')]
          .map(input => { const box = input.getBoundingClientRect();return { label: input.getAttribute("aria-label"), left: box.left, right: box.right }; }) }));
      expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.width);
      for (const control of bounds.controls) { expect(control.left).toBeGreaterThanOrEqual(0);expect(control.right).toBeLessThanOrEqual(bounds.width); }
      await page.screenshot({ path: join(artifactDir, `${width}-${state}.png`), fullPage: true });
      return { state, bounds };
    };
    const views = [];
    await page.goto(`/recipes/youtube/saved/${draft}`);await expect(page.getByText("1/3g", { exact: true })).toBeVisible();views.push(await capture("reopen"));
    await page.getByRole("button", { name: "재료 수정", exact: true }).click();await expect(page.getByLabel("소금 수량")).toHaveValue("1/3");views.push(await capture("edit"));
    const units = page.getByLabel("소금 단위 직접 입력");await units.fill("kg");await units.blur();
    await expect(page.getByLabel("소금 수량")).toHaveValue(String(1 / 3000));await expect(page.getByText("원입력: 1/3 g")).toBeVisible();views.push(await capture("si"));
    await units.fill("개");await units.blur();await expect(units).toHaveValue("kg");await expect(page.getByRole("alert").filter({ hasText: "그 단위로 바꿀 근거가 없어요" })).toBeVisible();views.push(await capture("rejected-unit"));
    await units.fill("g");await units.blur();await expect(page.getByLabel("소금 수량")).toHaveValue("1/3");
    await units.fill("kg");await units.blur();await page.getByRole("button", { name: "변경사항 저장", exact: true }).click();
    await expect(page.getByRole("button", { name: "다시 시도", exact: true })).toBeVisible();views.push(await capture("retry"));
    await page.getByRole("button", { name: "다시 시도", exact: true }).click();await expect(page.getByRole("button", { name: "재료 수정", exact: true })).toBeVisible();
    expect(writes[0].content).toEqual(writes[1].content);expect(writes[0].key).toBe(writes[1].key);
    expect(writes[1].contract).toBe("quantity-v4");expect(writes[1].content.ingredients[0]).toMatchObject({ amount: 1 / 3000, unit: "kg",
      quantity_input: { schema_version: "quantity-v4", raw_value: "1/3", raw_unit: "g", expected_context_fingerprint: stamp } });
    await page.reload();await page.getByRole("button", { name: "재료 수정", exact: true }).click();await expect(page.getByText("원입력: 1/3 g")).toBeVisible();
    await units.fill("g");await units.blur();await expect(page.getByLabel("소금 수량")).toHaveValue("1/3");views.push(await capture("saved-reopen"));
    saved.quantity_policy = null;await page.reload();await page.getByRole("button", { name: "재료 수정", exact: true }).click();
    await expect(page.getByLabel("소금 수량")).toBeDisabled();await expect(page.getByLabel("소금 단위 직접 입력")).toBeDisabled();views.push(await capture("off"));
    await page.getByRole("button", { name: "기본 정보 수정", exact: true }).click();await page.getByLabel("레시피명").fill("제목만 수정");
    await page.getByRole("button", { name: "변경사항 저장", exact: true }).click();await expect(page.getByRole("heading", { name: "제목만 수정", exact: true })).toBeVisible();
    expect(Object.keys(writes[2].content.ingredients[0])).toHaveLength(8);expect(writes[2].contract).toBeUndefined();
    await page.getByRole("button", { name: "재료 수정", exact: true }).click();await expect(page.getByText("원입력: 1/3 g")).toBeVisible();views.push(await capture("off-title-saved"));
    writeFileSync(join(artifactDir, `${width}-report.json`), JSON.stringify({ views, writes, logs, actual_application_rows: 0, model_calls: 0 }, null, 2));
    expect(logs.pageErrors).toEqual([]);expect(logs.externalRequests).toEqual([]);
    // A deliberate same-page reload may cancel its prior Next navigation.
    // Preserve that raw evidence; API/static/other transport failures still fail.
    expect(logs.failedRequests.filter(failure => {
      const url = new URL(failure.url);return failure.error !== "net::ERR_ABORTED" || url.origin !== baseURL
        || url.pathname !== `/recipes/youtube/saved/${draft}` || !url.searchParams.has("_rsc");
    })).toEqual([]);
    // The intentional 503 retry response is the only expected console error.
    expect(logs.consoleErrors.filter(message => !message.includes("503"))).toEqual([]);
  });
}
