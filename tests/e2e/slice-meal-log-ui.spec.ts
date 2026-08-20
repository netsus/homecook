import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";

import {
  installAccountLibraryVisualRoutes,
} from "./helpers/mock-routes";
import { installEmptyYoutubeNotificationRoutes } from "./helpers/youtube-background-extraction";

const EVIDENCE_DIR = resolve("ui/designs/evidence/meal-log-ui");
const DATE = "2026-08-10";
const ENTRY_ID = "10000000-0000-4000-8000-000000000001";
const DELETED_ENTRY_ID = "10000000-0000-4000-8000-000000000002";
const BREAKFAST_ID = "20000000-0000-4000-8000-000000000001";
const LUNCH_ID = "20000000-0000-4000-8000-000000000002";
const SOURCE_ID = "30000000-0000-4000-8000-000000000001";
const BATCH_ID = "40000000-0000-4000-8000-000000000001";

const states = [
  "default",
  "loading",
  "empty",
  "error",
  "unauthorized",
  "partial",
  "unavailable",
  "deleted-column",
  "add-sheet-recent",
  "add-sheet-search",
  "missing-batch",
  "unrecoverable-batch",
  "edit",
  "delete-confirm",
  "pending",
  "replay",
  "conflict",
] as const;
type FixtureState = typeof states[number];

const addSheetStates = new Set<FixtureState>([
  "add-sheet-recent",
  "add-sheet-search",
  "missing-batch",
  "unrecoverable-batch",
  "pending",
  "replay",
]);

const viewports = [
  { label: "mobile-default", width: 390, height: 844 },
  { label: "mobile-narrow", width: 320, height: 693 },
  { label: "desktop", width: 1280, height: 900 },
] as const;

function nutrition(state: FixtureState) {
  if (state === "unavailable") {
    return { calculation_status: "unavailable", calories_kcal: null, carbohydrate_g: null, protein_g: null, fat_g: null, sodium_mg: null };
  }
  return {
    calculation_status: state === "partial" ? "partial" : "complete",
    calories_kcal: 210,
    carbohydrate_g: 18,
    protein_g: 14,
    fat_g: 9,
    sodium_mg: 330,
  };
}

function entry(state: FixtureState, deleted = false) {
  return {
    id: deleted ? DELETED_ENTRY_ID : ENTRY_ID,
    revision: 3,
    consumed_at: null,
    consumed_local_date: DATE,
    timezone_name_snapshot: "Asia/Seoul",
    meal_plan_column_id: deleted ? null : BREAKFAST_ID,
    slot_name_snapshot: deleted ? "야식" : "아침",
    source: { type: "ingredient", id: SOURCE_ID },
    quantity: { amount: 2, unit: "개" },
    display_name: deleted ? "플레인 요거트" : "달걀 샐러드",
    display_brand: deleted ? "무먹 식품" : null,
    nutrition: nutrition(state),
    created_at: "2026-08-10T00:00:00.000Z",
    updated_at: "2026-08-10T00:00:00.000Z",
  };
}

function day(state: FixtureState, date = DATE) {
  const isEmpty = state === "empty" || date !== DATE;
  const visible = isEmpty ? [] : [entry(state)];
  const deleted = state === "deleted-column" || state === "edit" ? [entry(state, true)] : [];
  const zero = { calculation_status: "complete", calories_kcal: 0, carbohydrate_g: 0, protein_g: 0, fat_g: 0, sodium_mg: 0 };
  return {
    date,
    active_columns: [
      { id: BREAKFAST_ID, name: "아침", sort_order: 0 },
      { id: LUNCH_ID, name: "점심", sort_order: 1 },
    ],
    active_sections: [
      { meal_plan_column_id: BREAKFAST_ID, slot_name_snapshot: "아침", sort_order: 0, entries: visible, subtotal: isEmpty ? zero : nutrition(state), incomplete_count: ["partial", "unavailable"].includes(state) ? 1 : 0 },
      { meal_plan_column_id: LUNCH_ID, slot_name_snapshot: "점심", sort_order: 1, entries: [], subtotal: zero, incomplete_count: 0 },
    ],
    deleted_column_sections: deleted.length ? [{ slot_name_snapshot: "야식", entries: deleted, subtotal: nutrition(state), incomplete_count: 0 }] : [],
    entries: [...visible, ...deleted],
    day_total: { ...(isEmpty ? zero : nutrition(state)), incomplete_count: ["partial", "unavailable"].includes(state) ? 1 : 0 },
  };
}

function success(data: unknown) {
  return { success: true, data, error: null };
}

async function fulfillMealLog(route: Route, state: FixtureState) {
  const url = new URL(route.request().url());
  if (state === "loading" && url.searchParams.get("date") === DATE) {
    await new Promise(() => undefined);
    return;
  }
  if (state === "error" && url.searchParams.get("date") === DATE) {
    await route.fulfill({ status: 500, json: { success: false, data: null, error: { code: "INTERNAL_ERROR", message: "식사 기록을 불러오지 못했어요.", fields: [] } } });
    return;
  }
  await route.fulfill({ json: success(day(state, url.searchParams.get("date") ?? DATE)) });
}

async function stabilize(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}nextjs-portal,[data-next-badge-root],[aria-label='Open Next.js Dev Tools']{display:none!important}" });
}

async function prepareInteractiveMealLogPage(page: Page) {
  const mutation = { outcome: "success" as "conflict" | "failure" | "success" };
  await installEmptyYoutubeNotificationRoutes(page);
  await page.context().addCookies([{ name: "homecook.e2e-auth-override", value: "authenticated", url: "http://127.0.0.1:3100", sameSite: "Lax" }]);
  await page.addInitScript(() => window.localStorage.setItem("homecook.e2e-auth-override", "authenticated"));
  await installAccountLibraryVisualRoutes(page);
  await page.route("**/api/v1/meal-log?*", async (route) => fulfillMealLog(route, "deleted-column"));
  await page.route("**/api/v1/meal-log/entries/**", async (route) => {
    if (mutation.outcome === "conflict") {
      await route.fulfill({ status: 409, json: { success: false, data: null, error: { code: "CONFLICT", message: "현재 기록이 먼저 변경됐어요.", fields: [] } } });
      return;
    }
    if (mutation.outcome === "failure") {
      await route.fulfill({ status: 500, json: { success: false, data: null, error: { code: "INTERNAL_ERROR", message: "요청을 처리하지 못했어요.", fields: [] } } });
      return;
    }
    await route.fulfill({ json: success({ entry: entry("deleted-column", true) }) });
  });
  await page.goto(`/planner?segment=log&date=${DATE}`);
  await expect(page.getByRole("heading", { name: "8월 10일 월요일 식사 기록" })).toBeVisible();
  return mutation;
}

test.describe("meal-log-ui Stage 4", () => {
  test("meal-log-ui date rail uses a single-selection keyboard radiogroup without moving the page", async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chrome", "exact 320px rail 검증을 한 프로젝트에서 수행한다.");
    const context = await browser.newContext({ deviceScaleFactor: 1, viewport: { width: 320, height: 693 } });
    const page = await context.newPage();
    await prepareInteractiveMealLogPage(page);

    const rail = page.getByRole("radiogroup", { name: "식사 기록 날짜 선택" });
    const radios = rail.getByRole("radio");
    await expect(radios).toHaveCount(7);
    await rail.evaluate((element) => {
      element.style.scrollSnapType = "none";
    });
    await expect(rail.locator("[role='radio'][aria-checked='true']")).toHaveCount(1);
    const selected = radios.nth(0);
    await expect(selected).toHaveAttribute("tabindex", "0");
    await expect(radios.nth(1)).toHaveAttribute("tabindex", "-1");

    await selected.focus();
    const pageScroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
    await page.keyboard.press("End");
    await expect(radios.nth(6)).toHaveAttribute("aria-checked", "true");
    await expect(radios.nth(6)).toBeFocused();
    expect(await rail.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    expect(await rail.evaluate(async (element) => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const railRect = element.getBoundingClientRect();
      const selectedRect = element.querySelector<HTMLElement>("[role='radio'][aria-checked='true']")?.getBoundingClientRect();
      return selectedRect !== undefined
        && selectedRect.left >= railRect.left
        && selectedRect.right <= railRect.right;
    })).toBe(true);
    expect(await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }))).toEqual(pageScroll);

    const endUrl = page.url();
    await page.keyboard.press("ArrowRight");
    await expect(radios.nth(6)).toBeFocused();
    expect(page.url()).toBe(endUrl);
    await page.keyboard.press("Home");
    await expect(radios.nth(0)).toHaveAttribute("aria-checked", "true");
    await expect(radios.nth(0)).toBeFocused();
    expect(await rail.evaluate(async (element) => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const railRect = element.getBoundingClientRect();
      const selectedRect = element.querySelector<HTMLElement>("[role='radio'][aria-checked='true']")?.getBoundingClientRect();
      return selectedRect !== undefined
        && selectedRect.left >= railRect.left
        && selectedRect.right <= railRect.right;
    })).toBe(true);
    expect(await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }))).toEqual(pageScroll);
    await page.keyboard.press("ArrowLeft");
    await expect(radios.nth(0)).toHaveAttribute("aria-checked", "true");
    await expect(radios.nth(0)).toBeFocused();
    await expect(page).toHaveURL(new RegExp(`date=${DATE}`));
    expect(await rail.evaluate((element) => {
      const railRect = element.getBoundingClientRect();
      const selectedRect = element.querySelector<HTMLElement>("[role='radio'][aria-checked='true']")?.getBoundingClientRect();
      return selectedRect !== undefined
        && selectedRect.left >= railRect.left
        && selectedRect.right <= railRect.right;
    })).toBe(true);
    expect(await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }))).toEqual(pageScroll);

    await radios.nth(1).focus();
    await page.keyboard.press("Space");
    await expect(radios.nth(1)).toHaveAttribute("aria-checked", "true");
    await radios.nth(0).focus();
    await page.keyboard.press("Enter");
    await expect(radios.nth(0)).toHaveAttribute("aria-checked", "true");
    expect(await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }))).toEqual(pageScroll);
    await context.close();
  });

  test("meal-log-ui edit and delete dialogs preserve focus across every exit", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chrome", "keyboard focus lifecycle을 desktop Chromium에서 수행한다.");
    const mutation = await prepareInteractiveMealLogPage(page);
    const editInvoker = page.getByRole("button", { name: /야식의 플레인 요거트 식사 기록 수정/u });

    await editInvoker.click();
    let editDialog = page.getByRole("dialog", { name: "식사 기록 수정" });
    let selector = editDialog.getByRole("combobox", { name: "옮길 끼니 (필수)" });
    await expect(selector).toBeFocused();
    const saveButton = editDialog.getByRole("button", { name: "수정 저장" });
    await expect(saveButton).toBeDisabled();
    await expect(saveButton).toHaveCSS("opacity", "0.5");
    await page.keyboard.press("Shift+Tab");
    await expect(editDialog.getByRole("button", { name: "취소" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(selector).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(editDialog).toHaveCount(0);
    await expect(editInvoker).toBeFocused();

    await editInvoker.click();
    editDialog = page.getByRole("dialog", { name: "식사 기록 수정" });
    await editDialog.getByRole("button", { name: "취소" }).click();
    await expect(editInvoker).toBeFocused();

    mutation.outcome = "failure";
    await editInvoker.click();
    editDialog = page.getByRole("dialog", { name: "식사 기록 수정" });
    selector = editDialog.getByRole("combobox", { name: "옮길 끼니 (필수)" });
    await selector.selectOption(LUNCH_ID);
    await editDialog.getByRole("button", { name: "수정 저장" }).click();
    await expect(editDialog.getByRole("alert")).toBeFocused();
    await editDialog.getByRole("button", { name: "취소" }).click();
    await expect(editInvoker).toBeFocused();

    mutation.outcome = "conflict";
    await editInvoker.click();
    editDialog = page.getByRole("dialog", { name: "식사 기록 수정" });
    selector = editDialog.getByRole("combobox", { name: "옮길 끼니 (필수)" });
    await selector.selectOption(LUNCH_ID);
    await editDialog.getByRole("button", { name: "수정 저장" }).click();
    await expect(editDialog.getByRole("alert")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(editDialog).toHaveCount(0);
    await expect(editInvoker).toBeFocused();

    mutation.outcome = "success";
    await editInvoker.click();
    editDialog = page.getByRole("dialog", { name: "식사 기록 수정" });
    await editDialog.getByRole("combobox", { name: "옮길 끼니 (필수)" }).selectOption(LUNCH_ID);
    await editDialog.getByRole("button", { name: "수정 저장" }).click();
    await expect(editDialog).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "점심" })).toBeFocused();

    const deleteInvoker = page.getByRole("button", { name: /야식의 플레인 요거트 식사 기록 삭제/u });
    await deleteInvoker.click();
    const deleteDialog = page.getByRole("alertdialog", { name: "식사 기록 삭제 확인" });
    await expect(deleteDialog.getByRole("button", { name: "취소" })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(deleteDialog.getByRole("button", { name: "삭제" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(deleteDialog.getByRole("button", { name: "취소" })).toBeFocused();
    await deleteDialog.getByRole("button", { name: "삭제" }).click();
    await expect(deleteDialog).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "삭제된 끼니의 기록 · 야식" })).toBeFocused();
  });

  test("meal-log-ui captures the contracted viewport and state matrix", async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chrome", "한 프로젝트에서 exact viewport를 직접 설정한다.");
    test.setTimeout(360_000);
    const implementationHead = process.env.HOMECOOK_PLAYWRIGHT_CLEAN_HEAD ?? "";
    const implementationTree = process.env.HOMECOOK_PLAYWRIGHT_CLEAN_TREE ?? "";
    expect(implementationHead, "canonical meal-log evidence requires Playwright to start from a clean worktree").not.toBe("");
    expect(implementationHead).toMatch(/^[0-9a-f]{40}$/u);
    expect(implementationTree).toMatch(/^[0-9a-f]{40}$/u);
    await mkdir(EVIDENCE_DIR, { recursive: true });
    const captured: Array<{ file: string; state: FixtureState; viewport: string; captured_at: string }> = [];
    const runtime: {
      axeSeriousOrCritical: number;
      axeViolations: Array<{ id: string; impact: string | null; nodes: string[]; viewport: string }>;
      horizontalOverflow: number;
      targetsBelow44: number;
      replayKeyReused: boolean;
    } = { axeSeriousOrCritical: 0, axeViolations: [], horizontalOverflow: 0, targetsBelow44: 0, replayKeyReused: false };

    for (const viewport of viewports) {
      const context = await browser.newContext({ deviceScaleFactor: 1, viewport: { width: viewport.width, height: viewport.height } });
      const page = await context.newPage();
      await installEmptyYoutubeNotificationRoutes(page);
      await context.addCookies([{ name: "homecook.e2e-auth-override", value: "authenticated", url: "http://127.0.0.1:3100", sameSite: "Lax" }]);
      await context.addInitScript(() => {
        const state = new URLSearchParams(window.location.search).get("fixtureState");
        window.localStorage.setItem("homecook.e2e-auth-override", state === "unauthorized" ? "guest" : "authenticated");
      });
      await installAccountLibraryVisualRoutes(page);
      await page.emulateMedia({ reducedMotion: "reduce" });
      let currentState: FixtureState = "default";
      let mutationAttempts = 0;
      const idempotencyKeys: Array<string | undefined> = [];

      await page.route("**/api/v1/meal-log/recent?*", async (route) => route.fulfill({ json: success({ items: [{ source: { type: "ingredient", id: SOURCE_ID }, display_name: "달걀 샐러드", display_brand: null, last_quantity: { amount: 2, unit: "개" }, frequency: 4 }], next_cursor: null, has_next: false }) }));
      await page.route("**/api/v1/meal-log?*", async (route) => fulfillMealLog(route, currentState));
      await page.route("**/api/v1/cooked-batches?*", async (route) => {
        const weight = currentState === "unrecoverable-batch" ? "unrecoverable" : currentState === "missing-batch" ? "missing" : "known";
        await route.fulfill({ json: success({ items: [{ id: BATCH_ID, recipe_id: SOURCE_ID, recipe_title: "김치찌개", recipe_thumbnail_url: null, status: "leftover", cooked_at: "2026-08-09T03:00:00.000Z", cooking_servings: 2, finished_weight_g: weight === "known" ? 800 : null, remaining_weight_g: weight === "known" ? 520 : null, weight_status: weight, batch_status: "available", depleted_reason: null, revision: 2, nutrition_calculation_status: weight === "known" ? "complete" : "unavailable", current_unweighed_closure_event_id: null }], next_cursor: null, has_next: false }) });
      });
      await page.route("**/api/v1/food-catalog/search?*", async (route) => route.fulfill({ json: success({ items: [{ type: "ingredient", id: SOURCE_ID, standard_name: "달걀", category: "난류", default_unit: "개" }], next_cursor: null, has_next: false }) }));
      await page.route("**/api/v1/meal-log/entries/**", async (route) => {
        mutationAttempts += 1;
        idempotencyKeys.push(route.request().headers()["idempotency-key"]);
        if (currentState === "pending") {
          await new Promise(() => undefined);
          return;
        }
        if (currentState === "conflict") {
          await route.fulfill({ status: 409, json: { success: false, data: null, error: { code: "CONFLICT", message: "현재 기록이 먼저 변경됐어요.", fields: [] } } });
          return;
        }
        if (currentState === "replay" && mutationAttempts === 1) {
          await route.abort("connectionreset");
          return;
        }
        await route.fulfill({ json: success({ entry: entry(currentState) }) });
      });
      await page.route("**/api/v1/meal-log/entries", async (route) => {
        mutationAttempts += 1;
        idempotencyKeys.push(route.request().headers()["idempotency-key"]);
        if (currentState === "pending") {
          await new Promise(() => undefined);
          return;
        }
        if (currentState === "replay" && mutationAttempts === 1) {
          await route.abort("connectionreset");
          return;
        }
        await route.fulfill({ json: success({ entry: entry(currentState) }) });
      });

      for (const state of states) {
        currentState = state;
        mutationAttempts = 0;
        idempotencyKeys.length = 0;
        await page.goto(`/planner?segment=log&date=${DATE}&fixtureState=${state}`);
        if (state === "unauthorized") {
          await expect(page.getByRole("heading", { name: "이 화면은 로그인이 필요해요" })).toBeVisible();
        } else {
          await expect(page.getByRole("heading", { name: "8월 10일 월요일 식사 기록" })).toBeVisible();
          if (state === "loading") {
            await expect(page.locator("[aria-busy='true']").first()).toBeVisible();
          } else if (state === "error") {
            await expect(page.locator("#planner-log-panel").getByRole("alert")).toBeVisible();
          } else if (state === "empty") {
            await expect(page.getByText("이날 기록한 음식이 없어요. 끼니에서 먹은 음식을 추가해 보세요.")).toBeVisible();
            await expect(page.getByText("0 kcal")).toHaveCount(0);
          } else {
            await expect(page.getByText("오늘 먹은 영양")).toBeVisible();
          }
        }

        if (addSheetStates.has(state)) {
          await page.getByRole("button", { name: "아침에 먹은 음식 추가" }).click();
          const dialog = page.getByRole("dialog", { name: "먹은 음식 추가" });
          await expect(dialog).toBeVisible();
          await expect(dialog.getByRole("heading", { name: "먹은 음식 추가" })).toBeVisible();
          await expect(dialog.getByText("8월 10일 · 아침")).toBeVisible();
          await expect(dialog.getByRole("button", { name: "닫기" })).toBeVisible();
          if (viewport.label !== "desktop") {
            const box = await dialog.boundingBox();
            expect(box).not.toBeNull();
            expect(box?.y).toBe(0);
            expect(box?.height).toBe(viewport.height);
          }
          if (state === "add-sheet-recent" || state === "add-sheet-search") {
            await dialog.getByRole("tab", { name: "제품·재료" }).click();
            if (state === "add-sheet-search") {
              await dialog.getByLabel("제품·재료 검색").fill("달걀");
              await dialog.getByRole("button", { name: "검색" }).click();
              await expect(dialog.getByText("재료 · 기본 단위 제안 개")).toBeVisible();
            } else {
              await expect(dialog.getByText("최근·자주 먹은 음식")).toBeVisible();
            }
          } else if (state === "pending" || state === "replay") {
            await dialog.getByRole("tab", { name: "제품·재료" }).click();
            await dialog.getByText("달걀 샐러드", { exact: true }).click();
            await dialog.getByLabel("실제 양").focus();
            await dialog.getByLabel("실제 양").blur();
            await dialog.getByRole("button", { name: "기록 저장" }).click();
            if (state === "pending") {
              await expect(dialog.getByRole("button", { name: "저장 중…" })).toBeDisabled();
            } else {
              await expect(dialog.getByRole("alert")).toBeVisible();
              await dialog.getByRole("button", { name: "기록 저장" }).click();
              await expect(dialog).toHaveCount(0);
              runtime.replayKeyReused ||= idempotencyKeys.length === 2 && idempotencyKeys[0] === idempotencyKeys[1];
            }
          } else {
            await expect(dialog.getByText(state === "missing-batch" ? /무게 입력 필요/u : /원래 무게 확인 불가/u)).toBeVisible();
          }
        } else if (state === "deleted-column") {
          const deletedSection = page.getByRole("region", { name: "삭제된 끼니의 기록 · 야식" });
          await deletedSection.scrollIntoViewIfNeeded();
          await expect(deletedSection.getByRole("heading", { name: "삭제된 끼니의 기록 · 야식" })).toBeVisible();
          await expect(deletedSection.getByRole("button", { name: /먹은 음식 추가/u })).toHaveCount(0);
          await expect(deletedSection.getByRole("button", { name: /식사 기록 수정/u })).toHaveCount(1);
          await expect(deletedSection.getByRole("button", { name: /식사 기록 삭제/u })).toHaveCount(1);
        } else if (state === "edit") {
          await page.getByRole("button", { name: /야식의 플레인 요거트 식사 기록 수정/u }).click();
          const dialog = page.getByRole("dialog", { name: "식사 기록 수정" });
          await expect(dialog.getByText("기존 위치: 삭제된 끼니 야식")).toBeVisible();
          const selector = dialog.getByRole("combobox", { name: "옮길 끼니 (필수)" });
          await expect(selector).toHaveValue("");
          await expect(selector).toBeFocused();
          const saveButton = dialog.getByRole("button", { name: "수정 저장" });
          await expect(saveButton).toBeDisabled();
          await expect(saveButton).toHaveCSS("opacity", "0.5");
        } else if (state === "delete-confirm" || state === "conflict") {
          await page.getByRole("button", { name: /달걀 샐러드 식사 기록 삭제/u }).click();
          const dialog = page.getByRole("alertdialog", { name: "식사 기록 삭제 확인" });
          if (state === "conflict") {
            await dialog.getByRole("button", { name: "삭제" }).click();
            await expect(dialog.getByRole("alert")).toContainText("최신 기록");
          }
        }

        await stabilize(page);
        const file = `MEAL_LOG-${viewport.label}-${state}.png`;
        await page.screenshot({
          path: resolve(EVIDENCE_DIR, file),
          fullPage: viewport.label === "desktop",
        });
        captured.push({ captured_at: new Date().toISOString(), file, state, viewport: viewport.label });
        if (state === "default") {
          const violations = (await new AxeBuilder({ page }).include("#planner-log-panel").analyze()).violations.filter(({ impact }) => impact === "serious" || impact === "critical");
          runtime.axeSeriousOrCritical += violations.length;
          runtime.axeViolations.push(...violations.map((violation) => ({ id: violation.id, impact: violation.impact ?? null, nodes: violation.nodes.map((node) => node.html), viewport: viewport.label })));
          runtime.horizontalOverflow += await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth));
          runtime.targetsBelow44 += await page.locator("#planner-log-panel button").evaluateAll((buttons) => buttons.filter((button) => { const rect = button.getBoundingClientRect(); return rect.width < 44 || rect.height < 44; }).length);
        }
      }
      await context.close();
    }

    expect(captured).toHaveLength(51);
    const capturedAt = new Date().toISOString();
    await writeFile(resolve(EVIDENCE_DIR, "runtime-accessibility-layout.json"), `${JSON.stringify(runtime, null, 2)}\n`);
    await writeFile(resolve(EVIDENCE_DIR, "manifest.json"), `${JSON.stringify({ captured_at: capturedAt, generated_by: "tests/e2e/slice-meal-log-ui.spec.ts", implementation_head: implementationHead, implementation_tree: implementationTree, viewport_matrix: viewports, required_states: states, captures: captured, limitations: ["Deterministic local mocked routes only.", "Mobile PNGs are viewport-bound captures; desktop PNGs use full-page capture.", "Physical device, screen reader, virtual keyboard, server-Mac, OAuth, AT, R/R+1/R+2 and production remain pending."] }, null, 2)}\n`);
    expect(runtime).toEqual({ axeSeriousOrCritical: 0, axeViolations: [], horizontalOverflow: 0, targetsBelow44: 0, replayKeyReused: true });
  });
});
