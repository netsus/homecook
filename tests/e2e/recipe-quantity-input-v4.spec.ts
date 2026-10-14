import { expect, test } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { mkdirSync, openSync, closeSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { installAccountLibraryVisualRoutes, setE2EAuthOverride } from "./helpers/mock-routes";
import { PRODUCT_UI_CATALOG, PRODUCT_UI_DETAIL, PRODUCT_UI_DRAFT, PRODUCT_UI_IDS } from "./helpers/recipe-product-ui-fixture";

const repo = process.cwd();
const out = process.env.HOMECOOK_RECIPE_QUANTITY_UI_ARTIFACTS ?? "/tmp/mumeok-c04-recipe-browser";
const owner = PRODUCT_UI_IDS.owner;
const hash = "a".repeat(64);
const milk = { type: "ingredient", id: PRODUCT_UI_IDS.generic, standard_name: "일반 우유", category: "유제품", default_unit: "ml",
  quantity_options: { policy_version: "ingredient-units-v4", profile_id: PRODUCT_UI_IDS.generic, preparation_state: "raw", default_unit: "mL", choices: [
    { unit: "mL", normalized: null, quality: "unavailable", reason: "DENSITY_REQUIRED" },
    { unit: "L", normalized: null, quality: "unavailable", reason: "DENSITY_REQUIRED" },
    { unit: "g", normalized: { amount: 1, unit: "g" }, quality: "direct", reason: null },
    { unit: "kg", normalized: { amount: 1000, unit: "g" }, quality: "direct", reason: null } ] }, quantity_context_sha256: hash };
const raw = { schema_version: "quantity-v4", raw_value: "1/3", raw_unit: "package", expected_context_sha256: hash, expected_product_nutrition_version_id: PRODUCT_UI_IDS.versionA };
const draft = { ...PRODUCT_UI_DRAFT, ingredients: [{ ...PRODUCT_UI_DRAFT.ingredients[0], amount: 1 / 3, unit: "package", quantity_input: raw }] };
const detail = { ...PRODUCT_UI_DETAIL, ingredients: [{ ...PRODUCT_UI_DETAIL.ingredients[0], amount: 1 / 3, unit: "package", quantity_input: {
  schema_version: "quantity-v4", raw_value: "1/3", raw_unit: "package", numerator: "1", denominator: "3", normalized: { amount: 40, unit: "g" },
  display_quantity: { amount: 1 / 3, unit: "package" }, quality: "direct", reason: null, evidence_ids: [], source_versions: [PRODUCT_UI_IDS.versionA], batch_basis: null, context_sha256: hash } }],
  edit_context: { ...PRODUCT_UI_DETAIL.edit_context, base_recipe_revision: 1, image_object_id: null, draft } };

async function freePort() {
  const server = createServer(); await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Owned loopback port unavailable");
  const port = address.port; await new Promise<void>(resolve => server.close(() => resolve())); return port;
}
async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (!child.pid) throw new Error("Owned Next PID missing");
  process.kill(-child.pid, "SIGTERM"); await Promise.race([new Promise(resolve => child.once("exit", resolve)), new Promise(resolve => setTimeout(resolve, 8000))]);
  if (child.exitCode === null && child.signalCode === null) { process.kill(-child.pid, "SIGKILL"); await new Promise(resolve => child.once("exit", resolve)); }
}
function environment(port: number) {
  const env: NodeJS.ProcessEnv = { NODE_ENV: "development" };
  for (const key of ["HOME", "PATH", "TMPDIR", "LANG", "LC_ALL", "USER", "LOGNAME", "SHELL"]) if (process.env[key]) env[key] = process.env[key];
  return { ...env, NEXT_TELEMETRY_DISABLED: "1", HOMECOOK_ENABLE_QA_FIXTURES: "1", NEXT_PUBLIC_HOMECOOK_ENABLE_QA_FIXTURES: "1",
    HOMECOOK_AUTH_AUTHORITY: "local", HOMECOOK_DATA_AUTHORITY: "local", NEXT_PUBLIC_AUTH_SUPABASE_URL: "http://127.0.0.1:9",
    NEXT_PUBLIC_AUTH_SUPABASE_PUBLISHABLE_KEY: "qa-local-publishable-key", AUTH_SUPABASE_EXPECTED_ISSUER: "http://127.0.0.1:9/auth/v1",
    AUTH_SUPABASE_JWKS_URL: "http://127.0.0.1:9/auth/v1/.well-known/jwks.json", LOCAL_SUPABASE_INTERNAL_URL: "http://127.0.0.1:9",
    DATA_SUPABASE_URL: "http://127.0.0.1:9", DATA_SUPABASE_PUBLISHABLE_KEY: "qa-local-publishable-key", DATA_SUPABASE_SECRET_KEY: "qa-test-only-not-a-real-data-secret",
    HOMECOOK_SESSION_ATTESTATION_HMAC_KEY_V1: "qa-test-only-attestation-hmac-key-0001", HOMECOOK_SESSION_GENERATION_HMAC_KEY_V1: "qa-test-only-generation-hmac-key-0001",
    NEXT_PUBLIC_ENABLED_AUTH_PROVIDERS: "kakao,naver,google", NEXT_PUBLIC_NAVER_SUPABASE_PROVIDER: "custom:naver", NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${port}`,
    MUMEOK_ROUND2_ENABLED: "false", MUMEOK_QUANTITY_V4_ENABLED: "true", NEXT_PUBLIC_PRELAUNCH_UI: "false", MUMEOK_ROUND2_LEADS_ENABLED: "false",
    MUMEOK_FIXTURE_PORT: String(port), NODE_OPTIONS: "--require=/tmp/mumeok-c04-recipe-network.cjs" };
}

test("recipe quantity fixtures preserve raw/version/draft at 320/375/1440", async ({ browser }) => {
  mkdirSync(out, { recursive: true }); const port = await freePort(); const origin = `http://127.0.0.1:${port}`;
  const log = openSync(join(out, "server.log"), "w", 0o600);
  const child = spawn(process.execPath, [join(repo, "node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: repo, env: environment(port), detached: true, stdio: ["ignore", log, log] });
  writeFileSync(join(out, "server-owner.json"), JSON.stringify({ pid: child.pid, port, origin, owned: true }));
  const report: unknown[] = [];
  try {
    let ready = false;
    for (let count = 0; count < 160; count++) { if (child.exitCode !== null) throw new Error("Owned fixture server exited"); if (readFileSync(join(out, "server.log"), "utf8").includes("Ready in")) { ready = true; break; } await new Promise(resolve => setTimeout(resolve, 250)); }
    expect(ready).toBe(true);
    for (const width of [320, 375, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: "block", reducedMotion: "reduce" }); const page = await context.newPage();
      const errors: string[] = []; const consoleErrors: string[] = []; const failed: string[] = []; const unknownApis: string[] = [];
      const calls: Array<{ method: string; path: string; body: unknown }> = []; const writes: Array<{ body: Record<string, unknown>; header: string | undefined }> = [];
      let unauthorized = false;
      page.on("pageerror", error => errors.push(error.message)); page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
      page.on("requestfailed", request => failed.push(`${request.method()} ${request.url()}`));
      await installAccountLibraryVisualRoutes(page);
      await page.route("**/*", async route => {
        const request = route.request(); const url = new URL(request.url()); const path = url.pathname;
        if (url.origin !== origin) { await route.abort(); return; }
        if (!path.startsWith("/api/")) { await route.continue(); return; }
        const body = request.postData() ? request.postDataJSON() : null; calls.push({ method: request.method(), path, body });
        const ok = (data: unknown) => route.fulfill({ json: { success: true, data, error: null } });
        if (path === "/api/v1/users/me") return ok({ id: owner, account_generation: 3, nickname: "격리 수량 확인", email: null, profile_image_url: null, social_provider: "kakao", settings: { screen_wake_lock: false } });
        if (path === "/api/v1/food-catalog/search") return ok({ items: [milk, ...PRODUCT_UI_CATALOG], has_next: false, next_cursor: null });
        if (path === "/api/v1/cooking-methods") return ok({ methods: [{ id: PRODUCT_UI_IDS.generic, code: "prep", label: "준비", color_key: "gray", is_system: true }] });
        if (path.includes("tag-suggestions")) return ok({ suggested_tags: [], tags: [] });
        if (path === `/api/v1/recipes/${PRODUCT_UI_IDS.recipe}` && request.method() === "GET") return ok(detail);
        if (path === "/api/v1/recipes/quantity-input-context") {
          if (unauthorized) { unauthorized = false; return route.fulfill({ status: 401, json: { success: false, data: null, error: { code: "UNAUTHORIZED", message: "로그인이 필요해요.", fields: [] } } }); }
          return ok({ subject: { owner_uuid: owner, account_generation: 3 }, items: body.sources.map((source: Record<string, unknown>) => ({ ...source, context: source.food_product_id
            ? { ready: true, context_sha256: hash, product: { id: source.food_product_id, nutrition_version_id: source.food_product_nutrition_version_id, basis_unit: "g", basis_relations: PRODUCT_UI_CATALOG[0].basis_relations } }
            : { ready: true, context_sha256: hash, options: milk.quantity_options } })) });
        }
        if (path === "/api/v1/recipes" && request.method() === "POST") { writes.push({ body, header: request.headers()["x-homecook-quantity-contract"] }); return route.fulfill({ status: 409, json: { success: false, data: null, error: { code: "UNIT_POLICY_INACTIVE", message: "지금은 새 수량 정보를 저장할 수 없어요. 원입력은 유지돼요.", fields: [] } } }); }
        if (path.startsWith("/api/v1/gamification/") || path === "/api/v1/users/me/progress" || path === "/api/v1/users/me/gamification") return route.fallback();
        if (path.startsWith("/api/v1/users/me/action-notifications") || path.startsWith("/api/v1/users/me/youtube-extraction-jobs")) return ok({ items: [], unread_count: 0, next_cursor: null, has_next: false });
        if (path === "/api/v1/auth/providers") return ok({ providers: [] });
        unknownApis.push(`${request.method()} ${path}`); return route.fulfill({ status: 501, json: { success: false, data: null, error: { code: "QA_UNKNOWN_ROUTE", message: "fixture missing", fields: [] } } });
      });
      await setE2EAuthOverride(page, "authenticated");
      await page.goto(`${origin}/menu/add/manual?date=2026-10-14&columnId=${PRODUCT_UI_IDS.rowB}&slot=아침`);
      await page.getByPlaceholder("예: 김치찌개").fill("원문 수량 확인"); await page.getByRole("button", { name: "+ 재료 추가하기" }).click();
      await page.getByRole("checkbox", { name: "일반 우유", exact: true }).check(); await page.getByRole("button", { name: "선택한 재료 1개 추가", exact: true }).click();
      const amount = page.getByLabel("일반 우유 수량", { exact: true }); const unit = page.getByLabel("일반 우유 단위", { exact: true });
      await expect(amount).toHaveValue(""); await expect(unit).toHaveValue("mL");
      await page.getByRole("button", { name: "일반 우유 1/3", exact: true }).click(); await expect(amount).toHaveValue("1/3");
      await unit.selectOption("g"); await expect(unit).toHaveValue("mL"); await expect(amount).toHaveValue("1/3");
      await expect(page.getByRole("alert").filter({ hasText: "기존 분량과 단위를 유지" })).toBeVisible();
      await page.screenshot({ path: join(out, `manual-fraction-${width}.png`), fullPage: true });
      await amount.locator("xpath=../../..").screenshot({ path: join(out, `manual-target-${width}.png`) });
      await page.getByRole("button", { name: "준비", exact: true }).click(); await page.getByLabel("만들기 1 설명").fill("0.5팩 원문 그대로"); await page.getByRole("button", { name: "+ 만들기 추가", exact: true }).click();
      await page.getByRole("button", { name: "저장", exact: true }).click();
      await expect(page.getByRole("alert").filter({ hasText: "원입력은 유지돼요" })).toBeVisible(); await expect(amount).toHaveValue("1/3");
      expect(writes).toHaveLength(1); expect(writes[0].header).toBe("quantity-v4"); const row = (writes[0].body.ingredients as Array<Record<string, unknown>>)[0];
      expect(row.quantity_input).toEqual({ schema_version: "quantity-v4", raw_value: "1/3", raw_unit: "mL", expected_context_sha256: hash }); expect(row.amount).toBe(1 / 3);
      expect((writes[0].body.steps as Array<Record<string, unknown>>)[0].instruction).toBe("0.5팩 원문 그대로");
      await page.screenshot({ path: join(out, `manual-failure-${width}.png`), fullPage: true });
      const before = calls.filter(call => call.method !== "GET" && !call.path.endsWith("tag-suggestions")).length; await page.reload(); await expect(amount).toHaveValue("1/3");
      expect(calls.filter(call => call.method !== "GET" && !call.path.endsWith("tag-suggestions"))).toHaveLength(before); await page.getByRole("button", { name: "일반 우유 수량 정보 다시 확인", exact: true }).click();
      await expect(page.getByRole("button", { name: "일반 우유 1/3", exact: true })).toBeVisible();
      await page.goto(`${origin}/recipe/${PRODUCT_UI_IDS.recipe}?qaFutureImpact=1`);
      await expect(page.locator(".web-ingredient-amount").filter({ hasText: "1/3팩" }).or(page.locator("li").filter({ hasText: "원입력 1/3팩" })).first()).toBeVisible();
      expect(await page.getByText(/0\.3333333333333333package/).count()).toBe(0);
      await page.getByRole("button", { name: "편집", exact: true }).click();
      const productAmount = page.getByLabel("재료 1 수량", { exact: true }); await expect(productAmount).toHaveValue("1/3");
      await page.getByRole("button", { name: "재료 1 수량 정보 다시 확인", exact: true }).click();
      await page.getByLabel("재료 1 단위", { exact: true }).selectOption("g"); await expect(productAmount).toHaveValue("40");
      await expect(page.getByTestId("recipe-editor-ingredient-1").getByText("원입력 1/3팩", { exact: true })).toBeVisible();
      await page.screenshot({ path: join(out, `product-converted-${width}.png`), fullPage: true });
      await productAmount.locator("xpath=../../..").screenshot({ path: join(out, `product-target-${width}.png`) });
      unauthorized = true; await page.getByRole("button", { name: "재료 1 수량 정보 다시 확인", exact: true }).click();
      await expect(page.getByRole("dialog", { name: /로그인/ })).toBeVisible();
      await page.getByRole("dialog", { name: "로그인이 필요한 작업이에요", exact: true }).getByRole("button", { name: "로그인", exact: true }).click();
      await page.waitForURL(/\/login\?/);
      const action = await page.evaluate(() => JSON.parse(sessionStorage.getItem("homecook.pending-recipe-action") ?? "null"));
      expect(action.resumeEditor).toEqual({ mode: "edit", rowKey: PRODUCT_UI_IDS.rowA, source: "quantity" });
      expect(action.editContext.draft.ingredients[0]).toMatchObject({ row_key: PRODUCT_UI_IDS.rowA, amount: 40, unit: "g", quantity_input: raw });
      const prior = calls.filter(call => call.method !== "GET" && !call.path.endsWith("tag-suggestions")).length; await page.goto(`${origin}/recipe/${PRODUCT_UI_IDS.recipe}?qaFutureImpact=1`);
      await expect(page.getByText("원입력과 분량을 복원했어요. ‘수량 정보 재확인’을 누른 뒤 저장해 주세요.", { exact: true })).toBeVisible();
      await expect(productAmount).toHaveValue("40"); expect(calls.filter(call => call.method !== "GET" && !call.path.endsWith("tag-suggestions"))).toHaveLength(prior);
      expect(await page.getByRole("dialog", { name: /재료 추가|재료 선택/ }).count()).toBe(0);
      await page.screenshot({ path: join(out, `quantity-resume-${width}.png`), fullPage: true });
      expect(unknownApis).toEqual([]); expect(errors).toEqual([]);
      report.push({ width, writes, calls, pageErrors: errors, consoleErrors, failedRequests: failed, unknownApis, horizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth) });
      await context.close();
    }
  } finally { await stop(child); closeSync(log); writeFileSync(join(out, "runtime.json"), JSON.stringify(report, null, 2)); writeFileSync(join(out, "server-cleanup.json"), JSON.stringify({ pid: child.pid, exitCode: child.exitCode, signalCode: child.signalCode, stopped: child.exitCode !== null || child.signalCode !== null })); }
});
