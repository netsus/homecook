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

async function installCompletionRoutes(page: Page, conflictOnce = false) {
  let attempts = 0;
  await page.route("**/api/v1/cooking/session-attempts/*/cook-mode", async (route) => {
    await route.fulfill({ json: { success: true, data: snapshot, error: null } });
  });
  await page.route("**/api/v1/cooking/session-attempts/*/complete", async (route) => {
    attempts += 1;
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
  const files: string[] = [];
  const runtime = {
    existingCookModeFullPageContrastResidualNodes: 0,
    focusRestored: false,
    focusTrapped: false,
    noHorizontalOverflow: [] as number[],
    pendingEscapeLocked: false,
    replayKeyReused: false,
    scopedNewUiSeriousOrCritical: 0,
  };

  for (const [width, height, suffix] of [[390, 844, "mobile-default-390"], [320, 568, "mobile-narrow-320"], [1440, 1000, "desktop-1440"]] as const) {
    const cooked = await preparePage(browser, width, height);
    await installCompletionRoutes(cooked.page, width === 320);
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
    const close = dialog.getByRole("button", { name: "닫기" });
    await confirm.focus();
    await cooked.page.keyboard.press("Tab");
    await expect(close).toBeFocused();
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
      const alert = dialog.getByRole("alert");
      await expect(alert).toBeFocused();
      await expect(dialog.getByRole("spinbutton", { name: "완성 직후 음식 전체 중량" })).toHaveValue("640");
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
    await stabilize(leftovers.page);
    const stateName = width === 390
      ? "LEFTOVERS-mobile-default-390-known-missing-unrecoverable.png"
      : width === 320
        ? "LEFTOVERS-mobile-narrow-320-actions.png"
        : "LEFTOVERS-desktop-state-matrix.png";
    await leftovers.page.screenshot({ path: resolve(EVIDENCE_DIR, stateName), fullPage: true });
    files.push(stateName);

    if (width === 390) {
      await leftovers.page.getByRole("button", { name: "더 보기" }).click();
      await expect(leftovers.page.getByText("무게 없이 다 먹음")).toBeVisible();
      const depletedName = "LEFTOVERS-mobile-default-390-legacy-null-depleted.png";
      await leftovers.page.screenshot({ path: resolve(EVIDENCE_DIR, depletedName), fullPage: true });
      files.push(depletedName);
    } else if (width === 320) {
      const actionOpener = leftovers.page.getByRole("button", { name: /현미 채소볶음 완성 중량 입력/ });
      await actionOpener.click();
      const actionDialog = leftovers.page.getByRole("dialog", { name: "완성 중량 입력" });
      await expect(actionDialog.getByRole("heading", { name: "완성 중량 입력" })).toBeFocused();
      await leftovers.page.route("**/api/v1/cooked-batches/*/weight", async (route) => {
        await route.fulfill({
          status: 409,
          json: { success: false, data: null, error: { code: "CONFLICT", message: "서버 기록이 먼저 변경됐어요.", fields: [] } },
        });
      });
      await actionDialog.getByRole("spinbutton", { name: "음식만의 원래 전체 중량" }).fill("780");
      await actionDialog.getByRole("checkbox").check();
      await actionDialog.getByRole("button", { name: "중량 저장" }).click();
      await expect(actionDialog.getByRole("alert")).toBeFocused();
      runtime.scopedNewUiSeriousOrCritical += (await expectNoSeriousAxeViolations(
        leftovers.page,
        '[data-testid="cooked-batch-action-sheet"]',
      )).length;
      const errorName = "LEFTOVERS-mobile-narrow-320-pending-error.png";
      await leftovers.page.screenshot({ path: resolve(EVIDENCE_DIR, errorName) });
      files.push(errorName);
      await leftovers.page.keyboard.press("Escape");
      await expect(actionOpener).toBeFocused();
      runtime.focusRestored = true;
    } else {
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
      await pendingDialog.getByRole("checkbox").check();
      await pendingDialog.getByRole("button", { name: "조정 적용" }).click();
      await expect(pendingDialog.getByRole("status")).toContainText("서버 결과를 기다리는 중");
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
  expect(runtime.pendingEscapeLocked).toBe(true);
  expect(runtime.replayKeyReused).toBe(true);
  await writeFile(resolve(EVIDENCE_DIR, "runtime-focus-keyboard-overflow.json"), `${JSON.stringify({
    focus_restored: runtime.focusRestored,
    focus_trapped: runtime.focusTrapped,
    no_horizontal_overflow: runtime.noHorizontalOverflow,
    pending_escape_locked: runtime.pendingEscapeLocked,
    replay_key_reused: runtime.replayKeyReused,
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
    viewport_matrix: [320, 390, 1440],
  }, null, 2)}\n`);
});
});
