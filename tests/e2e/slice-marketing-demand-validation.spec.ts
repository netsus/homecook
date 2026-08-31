import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { expect, test, type Browser } from "@playwright/test";

import {
  completeMarketingQuiz,
  installMarketingDemandValidationRoutes,
  MARKETING_BETA_PATH,
  MARKETING_CONTROL_ANSWERS,
  openMarketingIntent,
  openMarketingLeadForm,
} from "./helpers/marketing-demand-validation";

const EVIDENCE_DIR = resolve(
  process.cwd(),
  "ui/designs/evidence/marketing-demand-validation",
);

function leadErrorAlert(page: import("@playwright/test").Page) {
  return page.getByRole("alert").filter({ hasText: "베타 신청은 아직 열리지 않았어요." }).first();
}

async function expectInViewport(locator: import("@playwright/test").Locator) {
  await expect(locator).toBeVisible();
  await expect(locator).toBeInViewport();
  const box = await locator.boundingBox();

  expect(box).not.toBeNull();
  expect(box?.y ?? 0).toBeGreaterThanOrEqual(0);
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(844);
}

async function expectVisibleInsideScrollRegion(
  region: import("@playwright/test").Locator,
  targetText: string,
  position: "start" | "target",
) {
  const geometry = await region.evaluate((node, { position: targetPosition, text }) => {
    const target = Array.from(node.querySelectorAll("label, legend"))
      .find((candidate) => candidate.textContent?.trim() === text);
    if (targetPosition === "start") {
      node.scrollTop = 0;
    } else if (target) {
      const regionBefore = node.getBoundingClientRect();
      const targetBefore = target.getBoundingClientRect();
      node.scrollTop += targetBefore.top - regionBefore.top;
    }
    const regionBox = node.getBoundingClientRect();
    const targetBox = target?.getBoundingClientRect();

    return {
      found: Boolean(targetBox),
      regionBottom: regionBox.bottom,
      regionTop: regionBox.top,
      scrollTop: node.scrollTop,
      targetBottom: targetBox?.bottom ?? 0,
      targetTop: targetBox?.top ?? 0,
    };
  }, { position, text: targetText });

  expect(geometry.found).toBe(true);
  expect(geometry.targetTop).toBeGreaterThanOrEqual(geometry.regionTop);
  expect(geometry.targetBottom).toBeLessThanOrEqual(geometry.regionBottom);
}

async function assertEqualIntentButtons() {
  return async (page: import("@playwright/test").Page) => {
    const needed = page.getByRole("button", { name: "써보고 싶어요" });
    const enough = page.getByRole("button", { name: "지금은 필요하지 않아요" });
    const [neededBox, enoughBox] = await Promise.all([
      needed.boundingBox(),
      enough.boundingBox(),
    ]);

    expect(neededBox).not.toBeNull();
    expect(enoughBox).not.toBeNull();
    expect(Math.abs((neededBox?.width ?? 0) - (enoughBox?.width ?? 0))).toBeLessThanOrEqual(2);
    expect(Math.abs((neededBox?.height ?? 0) - (enoughBox?.height ?? 0))).toBeLessThanOrEqual(2);
  };
}

async function captureHeroAndFlow(browser: Browser) {
  await mkdir(EVIDENCE_DIR, { recursive: true });
  const captures: Array<{ file: string; note: string; viewport: string }> = [];

  const heroViewports = [
    { file: "beta-hero-390.png", height: 844, label: "390x844", width: 390 },
    { file: "beta-hero-320.png", height: 693, label: "320x693", width: 320 },
    { file: "beta-hero-1280.png", height: 900, label: "1280x900", width: 1280 },
  ] as const;

  for (const viewport of heroViewports) {
    const context = await browser.newContext({
      deviceScaleFactor: 1,
      viewport: { height: viewport.height, width: viewport.width },
    });
    const page = await context.newPage();
    await installMarketingDemandValidationRoutes(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(MARKETING_BETA_PATH);
    await expect(page.getByRole("button", { name: "30초 식단 기록 테스트" })).toBeVisible();
    await expect(page.locator(".marketing-beta-loading")).toHaveCount(0);
    await page.screenshot({
      fullPage: viewport.width >= 1024,
      path: resolve(EVIDENCE_DIR, viewport.file),
    });
    captures.push({ file: viewport.file, note: "hero", viewport: viewport.label });
    await context.close();
  }

  const flowContext = await browser.newContext({
    deviceScaleFactor: 1,
    viewport: { height: 844, width: 390 },
  });
  const flowPage = await flowContext.newPage();
  await installMarketingDemandValidationRoutes(flowPage);
  await flowPage.emulateMedia({ reducedMotion: "reduce" });
  await flowPage.goto(MARKETING_BETA_PATH);

  await flowPage.getByRole("button", { name: "30초 식단 기록 테스트" }).click();
  await expect(flowPage.getByText("1/5")).toBeVisible();
  await expectInViewport(flowPage.locator(".marketing-beta-quiz"));
  await flowPage.screenshot({ path: resolve(EVIDENCE_DIR, "beta-quiz-390.png") });
  captures.push({ file: "beta-quiz-390.png", note: "quiz-flow", viewport: "390x844" });

  await completeMarketingQuiz(flowPage, {
    q1: "시작했지만 중단함",
    q2: "2~3일",
    q3: "재료를 하나씩 검색해 입력",
    q4: "하루 합계와 주간 흐름을 한눈에 못 볼 때",
    q5: "레시피 기준 자동 계산",
  });
  await expect(flowPage.getByRole("heading", { name: "주간 흐름 실종형" })).toBeVisible();
  await expectInViewport(flowPage.locator(".marketing-beta-result"));
  await flowPage.screenshot({ path: resolve(EVIDENCE_DIR, "beta-result-390.png") });
  captures.push({ file: "beta-result-390.png", note: "result-flow", viewport: "390x844" });

  await flowPage.getByRole("button", { name: "이렇게 기록할 수 있다면 어떨까요?" }).click();
  await flowPage.getByRole("button", { name: "써보고 싶어요" }).click();
  await expect(flowPage.getByRole("textbox", { name: "이메일" })).toBeVisible();
  await expectInViewport(flowPage.locator(".marketing-beta-email"));
  await flowPage.screenshot({ path: resolve(EVIDENCE_DIR, "beta-email-390.png") });
  captures.push({ file: "beta-email-390.png", note: "email-flow", viewport: "390x844" });

  await flowPage.getByRole("textbox", { name: "이메일" }).fill("playwright@example.com");
  await flowPage.getByRole("checkbox", {
    name: "베타 초대와 관련 안내를 이메일로 받는 데 동의합니다.",
  }).click();
  await flowPage.getByRole("button", { name: "베타 우선 초대받기" }).click();
  await expect(flowPage.getByRole("heading", { name: "조금만 더 알려주세요" })).toBeVisible();
  await expectInViewport(flowPage.locator(".marketing-beta-followup"));
  const followupScrollRegion = flowPage.getByTestId("marketing-beta-followup-scroll-region");
  const followupCue = flowPage.getByTestId("marketing-beta-followup-scroll-cue");
  expect(await followupScrollRegion.evaluate((node) => node.scrollTop)).toBe(0);
  expect(await followupCue.isVisible()).toBe(true);
  expect(await followupScrollRegion.evaluate((node) => node.scrollTop)).toBe(0);
  await flowPage.screenshot({ path: resolve(EVIDENCE_DIR, "beta-followup-390.png") });
  captures.push({ file: "beta-followup-390.png", note: "followup-flow", viewport: "390x844" });
  await expectVisibleInsideScrollRegion(followupScrollRegion, "필요하지 않음", "start");
  await expectVisibleInsideScrollRegion(followupScrollRegion, "가장 먼저 보고 싶은 정보는?", "target");
  await flowPage.screenshot({ path: resolve(EVIDENCE_DIR, "beta-followup-scrolled-390.png") });
  captures.push({ file: "beta-followup-scrolled-390.png", note: "followup-flow-scrolled", viewport: "390x844" });
  await followupScrollRegion.evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  await expect(followupCue).toBeHidden();
  await flowPage.screenshot({ path: resolve(EVIDENCE_DIR, "beta-followup-end-390.png") });
  captures.push({ file: "beta-followup-end-390.png", note: "followup-flow-end", viewport: "390x844" });
  await flowContext.close();

  const failClosedContext = await browser.newContext({
    deviceScaleFactor: 1,
    viewport: { height: 844, width: 390 },
  });
  const failClosedPage = await failClosedContext.newPage();
  await installMarketingDemandValidationRoutes(failClosedPage, { leadMode: "fail_closed" });
  await failClosedPage.emulateMedia({ reducedMotion: "reduce" });
  await failClosedPage.goto(MARKETING_BETA_PATH);
  await openMarketingLeadForm(failClosedPage);
  await failClosedPage.getByRole("textbox", { name: "이메일" }).fill("retry@example.com");
  await failClosedPage.getByRole("checkbox", {
    name: "베타 초대와 관련 안내를 이메일로 받는 데 동의합니다.",
  }).click();
  await failClosedPage.getByRole("button", { name: "베타 우선 초대받기" }).click();
  await expect(leadErrorAlert(failClosedPage)).toContainText("베타 신청은 아직 열리지 않았어요.");
  await expectInViewport(failClosedPage.locator(".marketing-beta-email"));
  await failClosedPage.screenshot({ path: resolve(EVIDENCE_DIR, "beta-turnstile-fail-closed-390.png") });
  captures.push({ file: "beta-turnstile-fail-closed-390.png", note: "turnstile-fail-closed", viewport: "390x844" });
  await failClosedContext.close();

  await writeFile(
    resolve(EVIDENCE_DIR, "pending-state-manifest.json"),
    `${JSON.stringify({
      captured_at: new Date().toISOString(),
      captures,
      generated_by: "tests/e2e/slice-marketing-demand-validation.spec.ts",
    }, null, 2)}\n`,
  );
}

test.describe("marketing demand validation /beta", () => {
  test("happy path reveals result before email, keeps equal intent CTAs, and ends with optional followup @smoke-core", async ({ page }) => {
    await installMarketingDemandValidationRoutes(page);
    await page.goto(MARKETING_BETA_PATH);
    await expect(page.getByRole("textbox", { name: "이메일" })).toHaveCount(0);

    await openMarketingIntent(page);
    await expect(page.getByRole("heading", { name: "주간 흐름 실종형" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "이메일" })).toHaveCount(0);
    await (await assertEqualIntentButtons())(page);

    await page.getByRole("button", { name: "써보고 싶어요" }).click();
    await page.getByRole("textbox", { name: "이메일" }).fill("playwright@example.com");
    await page.getByRole("checkbox", {
      name: "베타 초대와 관련 안내를 이메일로 받는 데 동의합니다.",
    }).click();
    await page.getByRole("button", { name: "베타 우선 초대받기" }).click();
    await expect(page.getByRole("heading", { name: "조금만 더 알려주세요" })).toBeVisible();
    await page.getByRole("button", { name: "건너뛰기" }).click();
    await expect(page.getByRole("heading", { name: "응답을 저장했어요." })).toBeVisible();
  });

  test("negative path stays neutral and skips the email gate", async ({ page }) => {
    await installMarketingDemandValidationRoutes(page);
    await page.goto(MARKETING_BETA_PATH);
    await openMarketingIntent(page, MARKETING_CONTROL_ANSWERS);
    await page.getByRole("button", { name: "지금은 필요하지 않아요" }).click();

    await expect(page.getByRole("heading", { name: "지금 방식도 괜찮은 편" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "이메일" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "지금은 필요하지 않아요 응답까지 기록했어요." })).toBeVisible();
  });

  test("fail-closed lead keeps the result and retryable email form", async ({ page }) => {
    await installMarketingDemandValidationRoutes(page, { leadMode: "fail_closed" });
    await page.goto(MARKETING_BETA_PATH);
    await openMarketingLeadForm(page);

    await page.getByRole("textbox", { name: "이메일" }).fill("retry@example.com");
    await page.getByRole("checkbox", {
      name: "베타 초대와 관련 안내를 이메일로 받는 데 동의합니다.",
    }).click();
    await page.getByRole("button", { name: "베타 우선 초대받기" }).click();

    await expect(leadErrorAlert(page)).toContainText("베타 신청은 아직 열리지 않았어요.");
    await expect(page.getByRole("heading", { name: "주간 흐름 실종형" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "이메일" })).toHaveValue("retry@example.com");
  });

  test("captures stage4 runtime evidence for 390, 320, and 1280", async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chrome", "evidence capture runs once from desktop-chrome");
    test.setTimeout(180_000);

    await captureHeroAndFlow(browser);
  });
});
