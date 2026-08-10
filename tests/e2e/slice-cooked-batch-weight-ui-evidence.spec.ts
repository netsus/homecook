import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";

import {
  installAccountLibraryVisualRoutes,
  installLeftoversVisualRoutes,
  setE2EAuthOverride,
} from "./helpers/mock-routes";

const EVIDENCE_DIR = resolve("ui/designs/evidence/cooked-batch-weight-ui");
const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";
const COOK_MODE_PATH = `/cooking/session-attempts/${SESSION_ID}/cook-mode`;
const BATCH_ID_PREFIX = "660e8400-e29b-41d4-a716-4466554400";

const snapshot = {
  session_id: SESSION_ID,
  contract_version: "snapshot_v2",
  mode: "standalone",
  status: "in_progress",
  recipe: {
    id: "550e8400-e29b-41d4-a716-446655440001",
    title: "매콤한 닭가슴살 김치찌개",
    cooking_servings: 2,
    ingredients: [{ ingredient_id: "ingredient-chicken", standard_name: "닭가슴살", amount: 240, unit: "g", display_text: "닭가슴살 240g", ingredient_type: "QUANT", scalable: true }],
    steps: [{ step_number: 1, instruction: "닭가슴살과 김치를 볶아요.", cooking_method: { code: "STIR_FRY", label: "볶기", color_key: "orange" }, ingredients_used: [], heat_level: null, duration_seconds: null, duration_text: null }],
  },
  pantry_candidates: [],
};

async function preparePage(browser: Browser, width: number, height: number) {
  const context = await browser.newContext({ deviceScaleFactor: 1, viewport: { width, height } });
  const page = await context.newPage();
  await setE2EAuthOverride(page);
  await installAccountLibraryVisualRoutes(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  return { context, page };
}

function batch(index: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `${BATCH_ID_PREFIX}${String(index).padStart(2, "0")}`,
    recipe_id: `770e8400-e29b-41d4-a716-4466554400${String(index).padStart(2, "0")}`,
    recipe_title: ["닭가슴살 김치찌개", "바질 두부구이", "현미 채소볶음"][index % 3],
    recipe_thumbnail_url: null,
    status: "leftover",
    cooked_at: `2026-08-${String(10 - Math.min(index, 8)).padStart(2, "0")}T03:00:00.000Z`,
    cooking_servings: 2,
    finished_weight_g: 800,
    remaining_weight_g: 520,
    weight_status: "known",
    batch_status: "available",
    depleted_reason: null,
    revision: 3,
    nutrition_calculation_status: "complete",
    current_unweighed_closure_event_id: null,
    ...overrides,
  };
}

const primaryBatches = [
  batch(1),
  batch(2, { finished_weight_g: null, remaining_weight_g: null, weight_status: "missing", nutrition_calculation_status: "unavailable" }),
  batch(3, { finished_weight_g: null, remaining_weight_g: null, weight_status: "unrecoverable", nutrition_calculation_status: "unavailable" }),
  batch(4, { batch_status: null, depleted_reason: null, finished_weight_g: null, nutrition_calculation_status: null, remaining_weight_g: null, revision: null, weight_status: null }),
];

const depletedBatches = [
  "consumed",
  "discarded",
  "mixed",
  "consumed_unweighed",
  "discarded_unweighed",
  "mixed_unweighed",
].map((reason, offset) => batch(10 + offset, {
  batch_status: "depleted",
  current_unweighed_closure_event_id: reason === "consumed_unweighed"
    ? "880e8400-e29b-41d4-a716-446655440001"
    : null,
  depleted_reason: reason,
  remaining_weight_g: reason.endsWith("unweighed") ? null : 0,
  status: "eaten",
  weight_status: reason.endsWith("unweighed") ? "missing" : "known",
}));

async function installCookedBatchRoutes(page: Page, items = primaryBatches) {
  await page.route("**/api/v1/cooked-batches?*", async (route) => {
    const cursor = new URL(route.request().url()).searchParams.get("cursor");
    await route.fulfill({
      json: {
        success: true,
        data: {
          has_next: !cursor && items === primaryBatches,
          items: cursor ? depletedBatches : items,
          next_cursor: !cursor && items === primaryBatches ? "next-page" : null,
        },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/cooked-batches/*", async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      await route.fallback();
      return;
    }
    const body = request.postDataJSON() as Record<string, unknown>;
    const target = [...primaryBatches, ...depletedBatches].find((item) => request.url().includes(item.id)) ?? primaryBatches[0];
    const action = typeof body.action === "string"
      ? body.action
      : request.url().endsWith("/discard") ? "discard" : "adjust";
    await route.fulfill({
      json: {
        success: true,
        data: {
          action,
          batch: { ...target, revision: Number(target.revision ?? 0) + 1 },
          event_id: action === "set_finished_weight" ? null : "990e8400-e29b-41d4-a716-446655440001",
        },
        error: null,
      },
    });
  });
}

async function installCompletionRoutes(
  page: Page,
  { conflictOnce = false, pauseFirstAttempt = false } = {},
) {
  let attempts = 0;
  let releaseFirstAttempt: () => void = () => undefined;
  const firstAttemptGate = pauseFirstAttempt
    ? new Promise<void>((resolveAttempt) => {
        releaseFirstAttempt = resolveAttempt;
      })
    : Promise.resolve();
  await page.route("**/api/v1/cooking/session-attempts/*/cook-mode", async (route) => {
    await route.fulfill({ json: { success: true, data: snapshot, error: null } });
  });
  await page.route("**/api/v1/cooking/session-attempts/*/complete", async (route) => {
    attempts += 1;
    if (attempts === 1) await firstAttemptGate;
    if (conflictOnce && attempts === 1) {
      await route.fulfill({
        status: 409,
        json: { success: false, data: null, error: { code: "CONFLICT", message: "서버 기록이 먼저 변경됐어요.", fields: [] } },
      });
      return;
    }
    const body = route.request().postDataJSON() as { finished_weight_g: number | null; weight_action: string };
    await route.fulfill({
      json: {
        success: true,
        data: {
          session_id: SESSION_ID,
          contract_version: "snapshot_v2",
          mode: "standalone",
          status: "completed",
          cooked_batch: batch(1, {
            finished_weight_g: body.finished_weight_g,
            remaining_weight_g: body.finished_weight_g,
            weight_status: body.weight_action === "weigh_later" ? "missing" : "known",
          }),
          meals_updated: 0,
          pantry_removed: 0,
          cook_count: 1,
        },
        error: null,
      },
    });
  });
  return { releaseFirstAttempt };
}

async function assertNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function expectNoSeriousAxeViolations(page: Page, selector: string) {
  const violations = (await new AxeBuilder({ page }).include(selector).analyze()).violations
    .filter(({ impact }) => impact === "serious" || impact === "critical");
  expect(violations).toEqual([]);
  return violations;
}

async function stabilize(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}nextjs-portal,[data-next-badge-root],[aria-label='Open Next.js Dev Tools']{display:none!important}" });
}

async function readFooterMetrics(page: Page, testId: string) {
  return page.getByTestId(testId).evaluate((root) => {
    const buttons = [...root.querySelectorAll("button")];
    const layout = buttons[0]?.parentElement;
    if (!layout || buttons.length !== 2) throw new Error("Expected exactly two footer buttons");
    const rects = buttons.map((button) => button.getBoundingClientRect());
    const dangerProbe = document.createElement("span");
    dangerProbe.style.backgroundColor = "var(--danger-strong)";
    root.appendChild(dangerProbe);
    const dangerBackground = getComputedStyle(dangerProbe).backgroundColor;
    dangerProbe.remove();
    return {
      backgrounds: buttons.map((button) => getComputedStyle(button).backgroundColor),
      dangerBackground,
      flexDirection: getComputedStyle(layout).flexDirection,
      fontSizes: buttons.map((button) => Number.parseFloat(getComputedStyle(button).fontSize)),
      bottoms: rects.map(({ bottom }) => Math.round(bottom)),
      heights: rects.map(({ height }) => Math.round(height)),
      labels: buttons.map((button) => button.textContent?.trim() ?? ""),
      lefts: rects.map(({ left }) => Math.round(left)),
      rights: rects.map(({ right }) => Math.round(right)),
      tops: rects.map(({ top }) => Math.round(top)),
      viewport: { height: window.innerHeight, width: window.innerWidth },
      widths: rects.map(({ width }) => Math.round(width)),
    };
  });
}

function maxRgbChannelDelta(left: string, right: string) {
  const leftChannels = left.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  const rightChannels = right.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  if (!leftChannels || !rightChannels || leftChannels.length !== 3 || rightChannels.length !== 3) {
    throw new Error(`Unable to compare computed colors: ${left} / ${right}`);
  }
  return Math.max(...leftChannels.map((channel, index) => Math.abs(channel - rightChannels[index])));
}

test.describe("cooked-batch-weight-ui", () => {
test("captures the pre-Stage-4 COOK_MODE and LEFTOVERS state", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chrome", "한 프로젝트에서 exact viewport를 직접 설정한다.");
  await mkdir(EVIDENCE_DIR, { recursive: true });

  for (const [width, height, suffix] of [[390, 844, "mobile-default-390"], [320, 568, "mobile-narrow-320"]] as const) {
    const cook = await preparePage(browser, width, height);
    await cook.page.route("**/api/v1/cooking/session-attempts/*/cook-mode", async (route) => {
      await route.fulfill({ json: { success: true, data: snapshot, error: null } });
    });
    await cook.page.goto(COOK_MODE_PATH);
    await cook.page.getByRole("button", { name: "요리 완료" }).click();
    await expect(cook.page.getByRole("dialog", { name: "요리 완료" })).toBeVisible();
    await stabilize(cook.page);
    await cook.page.screenshot({ path: resolve(EVIDENCE_DIR, `COOK_MODE-before-${suffix}.png`) });
    await cook.context.close();

    const leftovers = await preparePage(browser, width, height);
    await installCookedBatchRoutes(leftovers.page, []);
    await leftovers.page.goto("/leftovers");
    await expect(leftovers.page.getByTestId("leftovers-screen")).toBeVisible();
    await stabilize(leftovers.page);
    await leftovers.page.screenshot({ path: resolve(EVIDENCE_DIR, `LEFTOVERS-before-${suffix}.png`) });
    await leftovers.context.close();
  }
});

test("captures and verifies the Stage-4 viewport, state, and accessibility matrix", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chrome", "한 프로젝트에서 exact viewport를 직접 설정한다.");
  test.setTimeout(120_000);
  await mkdir(EVIDENCE_DIR, { recursive: true });
  const files: string[] = [
    "COOK_MODE-before-mobile-default-390.png",
    "COOK_MODE-before-mobile-narrow-320.png",
    "LEFTOVERS-before-mobile-default-390.png",
    "LEFTOVERS-before-mobile-narrow-320.png",
  ];
  const runtime = {
    confirmationBackRetained: false,
    cookFooter320PrimaryFirstDom: false,
    cookFooter320PrimaryFirstVisual: false,
    cookFooter320Stacked: false,
    cookFooterControlHeightPx: 0,
    cookFooterLabelsPreserved: false,
    cookFooterPendingLocked: false,
    cookFooterViewportContained: false,
    cookFooterWideLayoutPreserved: [] as number[],
    existingCookModeFullPageContrastResidualNodes: 0,
    field422AlertFocused: false,
    field422InputsRetainedAndLinked: false,
    focusRestored: false,
    focusTrapped: false,
    leftoversFooterControlHeightPx: 0,
    leftoversFooterDestructiveColorPreserved: false,
    leftoversFooterSafeCancelFirstDom: false,
    leftoversFooterSafeCancelFirstVisual: false,
    leftoversFooterTextBasePx: 0,
    leftoversFooterViewportContained: false,
    leftoversFooterViewports: [] as number[],
    noHorizontalOverflow: [] as number[],
    pendingControlsLocked: false,
    pendingEscapeLocked: false,
    retained409Input: false,
    replayKeyReused: false,
    scopedNewUiSeriousOrCritical: 0,
    unweighedCloseConsequencesConfirmed: false,
  };

  for (const [width, height, suffix] of [[390, 844, "mobile-default-390"], [320, 568, "mobile-narrow-320"], [1440, 1000, "desktop-1440"]] as const) {
    const cooked = await preparePage(browser, width, height);
    const completionRoute = await installCompletionRoutes(cooked.page, {
      conflictOnce: width === 320,
      pauseFirstAttempt: width === 320,
    });
    await cooked.page.goto(COOK_MODE_PATH);
    const opener = cooked.page.getByRole("button", { name: "요리 완료" });
    await opener.click();
    const dialog = cooked.page.getByRole("dialog", { name: "요리 완료" });
    await expect(dialog).toBeVisible();
    const first = dialog.getByRole("heading", { name: "요리 완료" });
    await expect(first).toBeFocused();
    await dialog.getByRole("radio", { name: "음식만 무게(g)" }).click();
    await dialog.getByRole("spinbutton", { name: "완성 직후 음식 전체 중량" }).fill("640");
    const confirm = dialog.getByRole("button", { name: "완료 저장" });
    const back = dialog.getByRole("button", { name: "돌아가기" });
    const close = dialog.getByRole("button", { name: "닫기" });
    const cookFooter = await readFooterMetrics(cooked.page, "cooked-batch-completion-actions");
    expect(cookFooter.labels).toEqual(["완료 저장", "돌아가기"]);
    expect(cookFooter.heights).toEqual([48, 48]);
    expect(cookFooter.lefts.every((left) => left >= 0)).toBe(true);
    expect(cookFooter.rights.every((right) => right <= cookFooter.viewport.width)).toBe(true);
    expect(cookFooter.tops.every((top) => top >= 0)).toBe(true);
    expect(cookFooter.bottoms.every((bottom) => bottom <= cookFooter.viewport.height)).toBe(true);
    runtime.cookFooterControlHeightPx = 48;
    runtime.cookFooterLabelsPreserved = true;
    runtime.cookFooterViewportContained = true;
    if (width === 320) {
      expect(cookFooter.flexDirection).toBe("column");
      expect(cookFooter.tops[0]).toBeLessThan(cookFooter.tops[1]);
      expect(cookFooter.widths[0]).toBe(cookFooter.widths[1]);
      runtime.cookFooter320PrimaryFirstDom = true;
      runtime.cookFooter320PrimaryFirstVisual = true;
      runtime.cookFooter320Stacked = true;
    } else {
      expect(cookFooter.flexDirection).toBe("row-reverse");
      expect(cookFooter.tops[0]).toBe(cookFooter.tops[1]);
      expect(cookFooter.lefts[1]).toBeLessThan(cookFooter.lefts[0]);
      runtime.cookFooterWideLayoutPreserved.push(width);
    }
    await confirm.focus();
    await cooked.page.keyboard.press("Tab");
    await expect(back).toBeFocused();
    await cooked.page.keyboard.press("Tab");
    await expect(close).toBeFocused();
    await cooked.page.keyboard.press("Shift+Tab");
    await expect(back).toBeFocused();
    await cooked.page.keyboard.press("Shift+Tab");
    await expect(confirm).toBeFocused();
    runtime.focusTrapped = true;
    await stabilize(cooked.page);
    const knownName = width >= 1024
      ? "COOK_MODE-desktop-state-matrix.png"
      : `COOK_MODE-${suffix}-known.png`;
    await cooked.page.screenshot({ path: resolve(EVIDENCE_DIR, knownName), fullPage: width >= 1024 });
    files.push(knownName);
    runtime.scopedNewUiSeriousOrCritical += (await expectNoSeriousAxeViolations(
      cooked.page,
      '[data-testid="cooked-batch-completion-sheet"]',
    )).length;

    if (width === 390) {
      await dialog.getByRole("button", { name: "용기 무게 계산 도움" }).click();
      await dialog.getByRole("spinbutton", { name: "음식과 용기를 합친 무게" }).fill("1800");
      await dialog.getByRole("spinbutton", { name: "빈 용기 무게" }).fill("320");
      await expect(dialog.getByRole("status", { name: "계산한 음식만 무게" })).toContainText("1,480g");
      const helperName = "COOK_MODE-mobile-default-390-container-helper.png";
      await cooked.page.screenshot({ path: resolve(EVIDENCE_DIR, helperName) });
      files.push(helperName);
      await dialog.getByRole("radio", { name: "나중에 입력" }).click();
      const laterName = "COOK_MODE-mobile-default-390-weigh-later.png";
      await cooked.page.screenshot({ path: resolve(EVIDENCE_DIR, laterName) });
      files.push(laterName);
      await cooked.page.keyboard.press("Escape");
      await expect(opener).toBeFocused();
      runtime.focusRestored = true;
      const fullPageResiduals = (await new AxeBuilder({ page: cooked.page }).analyze()).violations
        .filter(({ impact }) => impact === "serious" || impact === "critical");
      runtime.existingCookModeFullPageContrastResidualNodes = fullPageResiduals
        .reduce((count, violation) => count + violation.nodes.length, 0);
      expect(fullPageResiduals).toHaveLength(1);
      expect(fullPageResiduals[0].id).toBe("color-contrast");
      expect(runtime.existingCookModeFullPageContrastResidualNodes).toBe(2);
    } else if (width === 320) {
      const keys: Array<string | null> = [];
      cooked.page.on("request", (request) => {
        if (request.url().includes("/complete")) keys.push(request.headers()["idempotency-key"] ?? null);
      });
      await dialog.getByRole("button", { name: "완료 저장" }).click();
      await expect(dialog.getByRole("status")).toContainText("완료 결과를 기다리는 중");
      await expect(dialog.getByRole("button", { name: "저장 중…" })).toBeDisabled();
      await expect(dialog.getByRole("button", { name: "돌아가기" })).toBeDisabled();
      await cooked.page.keyboard.press("Escape");
      await expect(dialog).toBeVisible();
      runtime.cookFooterPendingLocked = true;
      completionRoute.releaseFirstAttempt();
      const alert = dialog.getByRole("alert");
      await expect(alert).toBeFocused();
      await expect(dialog.getByRole("spinbutton", { name: "완성 직후 음식 전체 중량" })).toHaveValue("640");
      const errorFooter = await readFooterMetrics(cooked.page, "cooked-batch-completion-actions");
      expect(errorFooter.labels).toEqual(["완료 저장", "돌아가기"]);
      expect(errorFooter.heights).toEqual([48, 48]);
      expect(errorFooter.tops[0]).toBeLessThan(errorFooter.tops[1]);
      expect(errorFooter.bottoms.every((bottom) => bottom <= errorFooter.viewport.height)).toBe(true);
      const errorName = "COOK_MODE-mobile-narrow-320-pending-error-replay.png";
      await cooked.page.screenshot({ path: resolve(EVIDENCE_DIR, errorName) });
      files.push(errorName);
      await dialog.getByRole("button", { name: "완료 저장" }).click();
      await expect(dialog).toHaveCount(0);
      runtime.replayKeyReused = keys.length === 2 && keys[0] === keys[1];
    }
    await assertNoHorizontalOverflow(cooked.page);
    runtime.noHorizontalOverflow.push(width);
    await cooked.context.close();

    const leftovers = await preparePage(browser, width, height);
    await installLeftoversVisualRoutes(leftovers.page);
    await installCookedBatchRoutes(leftovers.page);
    await leftovers.page.goto("/leftovers");
    await expect(leftovers.page.getByRole("heading", { name: "중량·잔량 기록" })).toBeVisible();
    const stateName = width === 390
      ? "LEFTOVERS-mobile-default-390-known-missing-unrecoverable.png"
      : width === 320
        ? "LEFTOVERS-mobile-narrow-320-actions.png"
        : "LEFTOVERS-desktop-state-matrix.png";

    if (width === 390) {
      const closeOpener = leftovers.page.getByRole("button", { name: /현미 채소볶음 무게 없이 종료/ });
      await closeOpener.click();
      const closeDialog = leftovers.page.getByRole("dialog", { name: "무게 없이 종료" });
      await closeDialog.getByRole("radio", { name: "먹고 버림" }).click();
      await expect(closeDialog.getByText("선택한 종료 결과").locator("..").getByText("먹고 버림", { exact: true })).toBeVisible();
      await expect(closeDialog.getByText("그램 중량을 남기지 않아요.")).toBeVisible();
      await expect(closeDialog.getByText("식사 영양을 계산하지 않아요.")).toBeVisible();
      await expect(closeDialog.getByText("meal-log 식사 기록을 만들지 않아요.")).toBeVisible();
      await closeDialog.getByRole("checkbox", { name: /그램 중량.*식사 영양.*meal-log 식사 기록/ }).check();
      const leftoversFooter = await readFooterMetrics(leftovers.page, "cooked-batch-action-actions");
      expect(leftoversFooter.labels).toEqual(["취소", "이 상태로 종료"]);
      expect(leftoversFooter.fontSizes).toEqual([16, 16]);
      expect(leftoversFooter.heights).toEqual([48, 48]);
      expect(leftoversFooter.bottoms.every((bottom) => bottom <= leftoversFooter.viewport.height)).toBe(true);
      expect(leftoversFooter.lefts[0]).toBeLessThan(leftoversFooter.lefts[1]);
      expect(leftoversFooter.tops[0]).toBe(leftoversFooter.tops[1]);
      expect(maxRgbChannelDelta(leftoversFooter.backgrounds[1], leftoversFooter.dangerBackground)).toBeLessThanOrEqual(1);
      runtime.leftoversFooterControlHeightPx = 48;
      runtime.leftoversFooterDestructiveColorPreserved = true;
      runtime.leftoversFooterSafeCancelFirstDom = true;
      runtime.leftoversFooterSafeCancelFirstVisual = true;
      runtime.leftoversFooterTextBasePx = 16;
      runtime.leftoversFooterViewportContained = true;
      runtime.leftoversFooterViewports.push(width);
      runtime.unweighedCloseConsequencesConfirmed = true;
      runtime.scopedNewUiSeriousOrCritical += (await expectNoSeriousAxeViolations(
        leftovers.page,
        '[data-testid="cooked-batch-action-sheet"]',
      )).length;
      await stabilize(leftovers.page);
      await leftovers.page.screenshot({ path: resolve(EVIDENCE_DIR, stateName), fullPage: true });
      files.push(stateName);
      await leftovers.page.keyboard.press("Escape");
      await expect(closeOpener).toBeFocused();
      runtime.focusRestored = true;
      await leftovers.page.getByRole("button", { name: "더 보기" }).click();
      await expect(leftovers.page.getByText("무게 없이 다 먹음")).toBeVisible();
      const depletedName = "LEFTOVERS-mobile-default-390-legacy-null-depleted.png";
      await stabilize(leftovers.page);
      await leftovers.page.screenshot({ path: resolve(EVIDENCE_DIR, depletedName), fullPage: true });
      files.push(depletedName);
    } else if (width === 320) {
      const weightOpener = leftovers.page.getByRole("button", { name: /현미 채소볶음 완성 중량 입력/ });
      await weightOpener.click();
      const weightDialog = leftovers.page.getByRole("dialog", { name: "완성 중량 입력" });
      await expect(weightDialog.getByRole("heading", { name: "완성 중량 입력" })).toBeFocused();
      await leftovers.page.route("**/api/v1/cooked-batches/*/weight", async (route) => {
        await route.fulfill({
          status: 409,
          json: { success: false, data: null, error: { code: "CONFLICT", message: "서버 기록이 먼저 변경됐어요.", fields: [] } },
        });
      });
      await weightDialog.getByRole("spinbutton", { name: "음식만의 원래 전체 중량" }).fill("780");
      await weightDialog.getByRole("checkbox").check();
      await weightDialog.getByRole("button", { name: "중량 저장" }).click();
      await expect(weightDialog.getByRole("alert")).toBeFocused();
      await expect(weightDialog.getByRole("spinbutton", { name: "음식만의 원래 전체 중량" })).toHaveValue("780");
      runtime.retained409Input = true;
      await leftovers.page.keyboard.press("Escape");
      await expect(weightOpener).toBeFocused();

      await leftovers.page.route("**/api/v1/cooked-batches/*/discard", async (route) => {
        await route.fulfill({
          status: 422,
          json: {
            success: false,
            data: null,
            error: {
              code: "VALIDATION_ERROR",
              message: "버린 양과 사유를 확인해 주세요.",
              fields: [
                { field: "discarded_g", reason: "invalid_positive_number" },
                { field: "reason", reason: "required" },
              ],
            },
          },
        });
      });
      const actionOpener = leftovers.page.getByRole("button", { name: /바질 두부구이 버림/ });
      await actionOpener.click();
      const actionDialog = leftovers.page.getByRole("dialog", { name: "버린 양 기록" });
      await actionDialog.getByRole("spinbutton", { name: "버린 양" }).fill("120");
      await actionDialog.getByLabel("사유").fill("상해서 폐기");
      await actionDialog.getByRole("button", { name: "내용 확인" }).click();
      await expect(actionDialog.getByRole("group", { name: "버림 내용 확인" })).toContainText("400g");
      await actionDialog.getByRole("button", { name: "입력 수정" }).click();
      await expect(actionDialog.getByRole("spinbutton", { name: "버린 양" })).toHaveValue("120");
      await expect(actionDialog.getByLabel("사유")).toHaveValue("상해서 폐기");
      runtime.confirmationBackRetained = true;
      await actionDialog.getByRole("button", { name: "내용 확인" }).click();
      const leftoversFooter = await readFooterMetrics(leftovers.page, "cooked-batch-action-actions");
      expect(leftoversFooter.labels).toEqual(["입력 수정", "버림 기록"]);
      expect(leftoversFooter.fontSizes).toEqual([16, 16]);
      expect(leftoversFooter.heights).toEqual([48, 48]);
      expect(leftoversFooter.bottoms.every((bottom) => bottom <= leftoversFooter.viewport.height)).toBe(true);
      expect(leftoversFooter.lefts[0]).toBeLessThan(leftoversFooter.lefts[1]);
      expect(leftoversFooter.tops[0]).toBe(leftoversFooter.tops[1]);
      expect(maxRgbChannelDelta(leftoversFooter.backgrounds[1], leftoversFooter.dangerBackground)).toBeLessThanOrEqual(1);
      runtime.leftoversFooterControlHeightPx = 48;
      runtime.leftoversFooterDestructiveColorPreserved = true;
      runtime.leftoversFooterSafeCancelFirstDom = true;
      runtime.leftoversFooterSafeCancelFirstVisual = true;
      runtime.leftoversFooterTextBasePx = 16;
      runtime.leftoversFooterViewportContained = true;
      runtime.leftoversFooterViewports.push(width);
      await stabilize(leftovers.page);
      await leftovers.page.screenshot({ path: resolve(EVIDENCE_DIR, stateName) });
      files.push(stateName);
      await actionDialog.getByRole("button", { name: "버림 기록" }).click();
      const alert = actionDialog.getByRole("alert");
      await expect(alert).toBeFocused();
      runtime.field422AlertFocused = true;
      const alertId = await alert.getAttribute("id");
      expect(alertId).toBeTruthy();
      const retainedAmount = actionDialog.getByRole("spinbutton", { name: "버린 양" });
      const retainedReason = actionDialog.getByLabel("사유");
      await expect(retainedAmount).toHaveValue("120");
      await expect(retainedReason).toHaveValue("상해서 폐기");
      await expect(retainedAmount).toHaveAttribute("aria-invalid", "true");
      await expect(retainedReason).toHaveAttribute("aria-invalid", "true");
      await expect(retainedAmount).toHaveAttribute("aria-describedby", alertId!);
      await expect(retainedReason).toHaveAttribute("aria-describedby", alertId!);
      runtime.field422InputsRetainedAndLinked = true;
      const leftoversErrorFooter = await readFooterMetrics(leftovers.page, "cooked-batch-action-actions");
      expect(leftoversErrorFooter.labels).toEqual(["취소", "내용 확인"]);
      expect(leftoversErrorFooter.fontSizes).toEqual([16, 16]);
      expect(leftoversErrorFooter.heights).toEqual([48, 48]);
      expect(leftoversErrorFooter.bottoms.every((bottom) => bottom <= leftoversErrorFooter.viewport.height)).toBe(true);
      runtime.scopedNewUiSeriousOrCritical += (await expectNoSeriousAxeViolations(
        leftovers.page,
        '[data-testid="cooked-batch-action-sheet"]',
      )).length;
      const errorName = "LEFTOVERS-mobile-narrow-320-pending-error.png";
      await stabilize(leftovers.page);
      await leftovers.page.screenshot({ path: resolve(EVIDENCE_DIR, errorName) });
      files.push(errorName);
      await leftovers.page.keyboard.press("Escape");
      await expect(actionOpener).toBeFocused();
      runtime.focusRestored = true;
    } else {
      await stabilize(leftovers.page);
      await leftovers.page.screenshot({ path: resolve(EVIDENCE_DIR, stateName), fullPage: true });
      files.push(stateName);
      let releaseMutation!: () => void;
      const mutationGate = new Promise<void>((resolveMutation) => {
        releaseMutation = resolveMutation;
      });
      await leftovers.page.route("**/api/v1/cooked-batches/*/adjust", async (route) => {
        await mutationGate;
        await route.fulfill({
          json: {
            success: true,
            data: {
              action: "adjust",
              batch: { ...primaryBatches[0], remaining_weight_g: 500, revision: 4 },
              event_id: "990e8400-e29b-41d4-a716-446655440001",
            },
            error: null,
          },
        });
      });
      await leftovers.page.getByRole("button", { name: /바질 두부구이 양 조정/ }).click();
      const pendingDialog = leftovers.page.getByRole("dialog", { name: "남은 양 조정" });
      await pendingDialog.getByRole("spinbutton", { name: "남은 양 조정량" }).fill("-20");
      await pendingDialog.getByLabel("사유").fill("용기 잔량 보정");
      await pendingDialog.getByRole("button", { name: "내용 확인" }).click();
      await expect(pendingDialog.getByRole("group", { name: "조정 내용 확인" })).toContainText("500g");
      await pendingDialog.getByRole("button", { name: "조정 적용" }).click();
      await expect(pendingDialog.getByRole("status")).toContainText("서버 결과를 기다리는 중");
      await expect(pendingDialog.getByRole("button", { name: "처리 중…" })).toBeDisabled();
      await expect(pendingDialog.getByRole("button", { name: "닫기" })).toBeDisabled();
      runtime.pendingControlsLocked = true;
      await leftovers.page.keyboard.press("Escape");
      await expect(pendingDialog).toBeVisible();
      runtime.pendingEscapeLocked = true;
      releaseMutation();
      await expect(pendingDialog).toHaveCount(0);
    }
    await assertNoHorizontalOverflow(leftovers.page);
    runtime.scopedNewUiSeriousOrCritical += (await expectNoSeriousAxeViolations(
      leftovers.page,
      '[aria-labelledby="cooked-batch-section-title"]',
    )).length;
    await leftovers.context.close();
  }

  expect(runtime.focusTrapped).toBe(true);
  expect(runtime.focusRestored).toBe(true);
  expect(runtime.cookFooter320PrimaryFirstDom).toBe(true);
  expect(runtime.cookFooter320PrimaryFirstVisual).toBe(true);
  expect(runtime.cookFooter320Stacked).toBe(true);
  expect(runtime.cookFooterControlHeightPx).toBe(48);
  expect(runtime.cookFooterLabelsPreserved).toBe(true);
  expect(runtime.cookFooterPendingLocked).toBe(true);
  expect(runtime.cookFooterViewportContained).toBe(true);
  expect(runtime.cookFooterWideLayoutPreserved).toEqual([390, 1440]);
  expect(runtime.confirmationBackRetained).toBe(true);
  expect(runtime.field422AlertFocused).toBe(true);
  expect(runtime.field422InputsRetainedAndLinked).toBe(true);
  expect(runtime.pendingControlsLocked).toBe(true);
  expect(runtime.pendingEscapeLocked).toBe(true);
  expect(runtime.retained409Input).toBe(true);
  expect(runtime.replayKeyReused).toBe(true);
  expect(runtime.leftoversFooterControlHeightPx).toBe(48);
  expect(runtime.leftoversFooterDestructiveColorPreserved).toBe(true);
  expect(runtime.leftoversFooterSafeCancelFirstDom).toBe(true);
  expect(runtime.leftoversFooterSafeCancelFirstVisual).toBe(true);
  expect(runtime.leftoversFooterTextBasePx).toBe(16);
  expect(runtime.leftoversFooterViewportContained).toBe(true);
  expect(runtime.leftoversFooterViewports).toEqual([390, 320]);
  expect(runtime.unweighedCloseConsequencesConfirmed).toBe(true);
  await writeFile(resolve(EVIDENCE_DIR, "runtime-focus-keyboard-overflow.json"), `${JSON.stringify({
    confirmation_back_retained: runtime.confirmationBackRetained,
    cook_footer_320_primary_first_dom: runtime.cookFooter320PrimaryFirstDom,
    cook_footer_320_primary_first_visual: runtime.cookFooter320PrimaryFirstVisual,
    cook_footer_320_stacked: runtime.cookFooter320Stacked,
    cook_footer_control_height_px: runtime.cookFooterControlHeightPx,
    cook_footer_labels_preserved: runtime.cookFooterLabelsPreserved,
    cook_footer_pending_locked: runtime.cookFooterPendingLocked,
    cook_footer_viewport_contained: runtime.cookFooterViewportContained,
    cook_footer_wide_layout_preserved: runtime.cookFooterWideLayoutPreserved,
    field_422_alert_focused: runtime.field422AlertFocused,
    field_422_inputs_retained_and_linked: runtime.field422InputsRetainedAndLinked,
    focus_restored: runtime.focusRestored,
    focus_trapped: runtime.focusTrapped,
    leftovers_footer_control_height_px: runtime.leftoversFooterControlHeightPx,
    leftovers_footer_destructive_color_preserved: runtime.leftoversFooterDestructiveColorPreserved,
    leftovers_footer_safe_cancel_first_dom: runtime.leftoversFooterSafeCancelFirstDom,
    leftovers_footer_safe_cancel_first_visual: runtime.leftoversFooterSafeCancelFirstVisual,
    leftovers_footer_text_base_px: runtime.leftoversFooterTextBasePx,
    leftovers_footer_viewport_contained: runtime.leftoversFooterViewportContained,
    leftovers_footer_viewports: runtime.leftoversFooterViewports,
    no_horizontal_overflow: runtime.noHorizontalOverflow,
    pending_controls_locked: runtime.pendingControlsLocked,
    pending_escape_locked: runtime.pendingEscapeLocked,
    retained_409_input: runtime.retained409Input,
    replay_key_reused: runtime.replayKeyReused,
    unweighed_close_consequences_confirmed: runtime.unweighedCloseConsequencesConfirmed,
    virtual_keyboard: "Manual Only — automated viewport does not prove a physical keyboard",
  }, null, 2)}\n`);
  files.push("runtime-focus-keyboard-overflow.json");
  await writeFile(resolve(EVIDENCE_DIR, "runtime-axe-wcag.json"), `${JSON.stringify({
    existing_cook_mode_full_page_contrast_residual_nodes: runtime.existingCookModeFullPageContrastResidualNodes,
    scope_boundary: "The two full-page residual nodes predate #11 and are outside Stage 4 ownership; the new completion sheet and cooked-batch section are scoped separately.",
    scoped_new_ui_serious_or_critical: runtime.scopedNewUiSeriousOrCritical,
  }, null, 2)}\n`);
  files.push("runtime-axe-wcag.json");
  await writeFile(resolve(EVIDENCE_DIR, "manifest.json"), `${JSON.stringify({
    accessibility_scope: {
      existing_cook_mode_full_page_contrast_residual_nodes: 2,
      new_stage4_sheet_and_section_scoped_serious_or_critical: 0,
    },
    captured_at: new Date().toISOString(),
    files: files.sort(),
    generated_by: "tests/e2e/slice-cooked-batch-weight-ui-evidence.spec.ts",
    implementation_head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    implementation_tree: execFileSync("git", ["rev-parse", "HEAD^{tree}"], { encoding: "utf8" }).trim(),
    viewport_matrix: [320, 390, 1440],
  }, null, 2)}\n`);
});
});
