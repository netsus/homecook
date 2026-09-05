import { mkdir, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { completeMarketingExperience, completeMarketingQuiz, installMarketingDemandValidationRoutes, MARKETING_BETA_PATH, openMarketingLeadForm } from "./helpers/marketing-demand-validation";

const EVIDENCE_DIR = resolve(process.env.HOMECOOK_MARKETING_EVIDENCE_DIR ?? "ui/designs/evidence/marketing-demand-validation-v2");

async function expectNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

async function capture(browser: Browser, width: number, height: number, name: string, action?: (page: Page) => Promise<void>, routePath = MARKETING_BETA_PATH) {
  const context = await browser.newContext({ deviceScaleFactor: 1, viewport: { width, height } });
  const page = await context.newPage();
  await installMarketingDemandValidationRoutes(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(routePath);
  if (action) await action(page);
  await page.waitForFunction(() => Array.from(document.images).every((image) => image.complete && image.naturalWidth > 0));
  await page.evaluate(() => new Promise<void>((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame()))));
  await expectNoHorizontalOverflow(page);
  const filePath = resolve(EVIDENCE_DIR, name);
  await page.screenshot({ path: filePath, fullPage: true });
  await context.close();
  return filePath;
}

test.describe("marketing demand validation v2 /beta", () => {
  test("Hero variants enter the same exact q1..q4 flow @smoke-core", async ({ page }) => {
    await installMarketingDemandValidationRoutes(page);
    for (const [query, heading] of [["?utm_content=hook_reentry&ad_variant=d", "레시피만 가져오면"], ["?ad_variant=b", "수분 빠진 제육볶음 300g"], ["?ad_variant=c", "내 집밥에"], ["?ad_variant=d", "내가 만든 집밥을"], ["", "집밥도 정확하게 기록할 수 있을까"]]) {
      await page.goto(`${MARKETING_BETA_PATH}${query}`);
      await expect(page.getByRole("heading").first()).toContainText(heading);
      await page.getByRole("button", { name: "내 집밥기록 유형 알아보기" }).click();
      await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuemax", "4");
    }
  });

  test("result, five experiences, planners, product, beta and done remain in order", async ({ page }) => {
    await installMarketingDemandValidationRoutes(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(MARKETING_BETA_PATH);
    await completeMarketingQuiz(page);
    await expect(page.getByRole("textbox", { name: "이메일" })).toHaveCount(0);
    await completeMarketingExperience(page);
    await page.getByRole("button", { name: "편의점 음식도 기록해보기" }).click();
    await expect(page.getByText("제품 예시")).toBeVisible();
    await page.getByRole("button", { name: "+ 기록하기" }).click();
    await page.getByRole("button", { name: "무료 베타 먼저 써보기" }).click();
    await page.getByRole("textbox", { name: "이메일" }).fill("qa@example.com");
    await page.getByRole("checkbox", { name: /이메일 수집·이용에 동의/ }).check();
    await page.getByRole("button", { name: "무료 베타 초대받기" }).click();
    await expect(page.getByRole("heading", { name: "신청이 완료됐어요!" })).toBeVisible();
  });

  test("reduced motion presents final demo and planner values without count-up transitions", async ({ page }) => {
    await installMarketingDemandValidationRoutes(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(MARKETING_BETA_PATH);
    await completeMarketingQuiz(page);

    await page.getByRole("button", { name: "무먹으로 20초 체험하기" }).click();
    await page.getByRole("button", { name: "무먹으로 가져오기" }).click();
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await page.getByRole("button", { name: "돼지고기 600g → 520g" }).click();
    await expect(page.getByRole("button", { name: "다음", exact: true })).toBeVisible();
    expect(await page.getByTestId("pork-amount").textContent()).toBe("520g");

    await page.getByRole("button", { name: "다음", exact: true }).click();
    await page.getByRole("button", { name: "저울로 재보니 1,180g" }).click();
    expect(await page.getByTestId("cooked-weight-metric").textContent()).toBe("1,180g");
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await page.getByRole("button", { name: "320g 입력하기" }).click();
    await page.getByRole("button", { name: "식단에 기록하기" }).click();

    await expect(page.getByTestId("planner-summary")).toHaveAttribute("data-highlight", "meal");
    expect(await page.getByTestId("planner-summary").textContent()).toContain("1,607 kcal");

    await page.getByRole("button", { name: "편의점 음식도 기록해보기" }).click();
    await page.getByRole("button", { name: "+ 기록하기" }).click();
    await expect(page.getByTestId("planner-summary")).toHaveAttribute("data-highlight", "product");
    expect(await page.getByTestId("planner-summary").textContent()).toContain("1,712 kcal");
  });

  test("known result is read-only and canonical share strips all other query data", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "share", { configurable: true, value: (data: ShareData) => { (window as Window & { __shared?: ShareData }).__shared = data; return Promise.resolve(); } });
    });
    await page.goto("/beta?result=ingredient-tracker&utm_source=secret&email=hidden@example.com");
    await expect(page.getByRole("heading", { name: "성분 추적러" })).toBeVisible();
    await page.getByRole("button", { name: "내 결과 공유하기" }).click();
    expect(await page.evaluate(() => (window as Window & { __shared?: ShareData }).__shared?.url)).toMatch(/\/beta\?result=ingredient-tracker$/);
  });

  test("unknown result recovers to default Hero", async ({ page }) => {
    await installMarketingDemandValidationRoutes(page);
    await page.goto("/beta?result=unknown");
    await expect(page.getByRole("heading", { name: "집밥도 정확하게 기록할 수 있을까?" })).toBeVisible();
  });

  test("403/409/422/Turnstile/503 stay retryable without hiding prior value", async ({ browser }) => {
    for (const leadMode of ["403", "409", "422", "turnstile", "503"] as const) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await context.newPage();
      await installMarketingDemandValidationRoutes(page, { leadMode });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(MARKETING_BETA_PATH);
      await openMarketingLeadForm(page);
      await page.getByRole("textbox", { name: "이메일" }).fill("retry@example.com");
      await page.getByRole("checkbox", { name: /이메일 수집·이용에 동의/ }).check();
      await page.getByRole("button", { name: "무료 베타 초대받기" }).click();
      await expect(page.locator("#beta-error")).toContainText("다시 시도");
      await expect(page.getByRole("textbox", { name: "이메일" })).toHaveValue("retry@example.com");
      await context.close();
    }
  });

  test("only the result screen scrolls while planner CTA floats over a clipped tomorrow preview", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 });
    await installMarketingDemandValidationRoutes(page);
    await page.goto(MARKETING_BETA_PATH);
    await expect(page.getByRole("button", { name: "내 집밥기록 유형 알아보기" })).toBeVisible();

    const heroPolicy = await page.locator('[data-stage="hero"]').evaluate((screen) => ({
      clientHeight: screen.clientHeight,
      overflowY: getComputedStyle(screen).overflowY,
      scrollHeight: screen.scrollHeight,
    }));
    expect(heroPolicy.overflowY).toBe("hidden");
    expect(heroPolicy.scrollHeight).toBeLessThanOrEqual(heroPolicy.clientHeight + 1);
    await page.screenshot({ path: resolve(EVIDENCE_DIR, "no-scroll-hero-390x700.png") });

    await completeMarketingQuiz(page);
    const resultPolicy = await page.locator('[data-stage="result"]').evaluate((screen) => ({
      clientHeight: screen.clientHeight,
      overflowY: getComputedStyle(screen).overflowY,
      scrollHeight: screen.scrollHeight,
    }));
    expect(resultPolicy.overflowY).toBe("auto");
    expect(resultPolicy.scrollHeight).toBeGreaterThan(resultPolicy.clientHeight);

    await completeMarketingExperience(page);
    await expect(page.getByRole("button", { name: "편의점 음식도 기록해보기" })).toBeVisible();
    await page.waitForFunction(() => document.querySelector('[data-stage="planner-homecook"] .planner-summary')?.getAttribute("data-highlight") === "meal");
    await page.waitForTimeout(570);
    const plannerPolicy = await page.locator('[data-stage="planner-homecook"]').evaluate((screen) => {
      const preview = screen.querySelector<HTMLElement>('[data-testid="tomorrow-preview"]');
      const cta = screen.querySelector<HTMLElement>(".planner-floating-cta");
      const today = screen.querySelector<HTMLElement>(".meal-day-card");
      const previewRect = preview?.getBoundingClientRect();
      const ctaRect = cta?.getBoundingClientRect();
      const todayRect = today?.getBoundingClientRect();
      return {
        clientHeight: screen.clientHeight,
        documentScrollHeight: document.documentElement.scrollHeight,
        overflowY: getComputedStyle(screen).overflowY,
        previewGap: previewRect && todayRect ? previewRect.top - todayRect.bottom : -1,
        previewClipped: Boolean(previewRect && previewRect.bottom > screen.getBoundingClientRect().bottom),
        previewTop: previewRect?.top ?? -1,
        previewUnderCta: Boolean(previewRect && ctaRect && previewRect.top < ctaRect.bottom && previewRect.bottom > ctaRect.top),
        scrollHeight: screen.scrollHeight,
        viewportHeight: window.innerHeight,
      };
    });
    expect(plannerPolicy.overflowY).toBe("hidden");
    expect(plannerPolicy.documentScrollHeight).toBeLessThanOrEqual(plannerPolicy.viewportHeight + 1);
    expect(plannerPolicy.previewGap).toBeGreaterThanOrEqual(6);
    expect(plannerPolicy.previewGap).toBeLessThanOrEqual(10);
    expect(plannerPolicy.previewClipped).toBe(true);
    expect(plannerPolicy.previewUnderCta).toBe(true);
    await page.screenshot({ path: resolve(EVIDENCE_DIR, "no-scroll-planner-homecook-390x700.png") });

    await page.getByRole("button", { name: "편의점 음식도 기록해보기" }).click();
    await page.getByRole("button", { name: "+ 기록하기" }).click();
    await expect(page.getByRole("button", { name: "무료 베타 먼저 써보기" })).toBeVisible();
    await page.waitForFunction(() => document.querySelector('[data-stage="planner-complete"] .planner-summary')?.getAttribute("data-highlight") === "product");
    await page.waitForTimeout(570);
    const completePlannerPolicy = await page.locator('[data-stage="planner-complete"]').evaluate((screen) => {
      const preview = screen.querySelector<HTMLElement>('[data-testid="tomorrow-preview"]');
      const cta = screen.querySelector<HTMLElement>(".planner-floating-cta");
      const today = screen.querySelector<HTMLElement>(".meal-day-card");
      const previewRect = preview?.getBoundingClientRect();
      const ctaRect = cta?.getBoundingClientRect();
      const todayRect = today?.getBoundingClientRect();
      return {
        documentScrollHeight: document.documentElement.scrollHeight,
        overflowY: getComputedStyle(screen).overflowY,
        previewGap: previewRect && todayRect ? previewRect.top - todayRect.bottom : -1,
        previewClipped: Boolean(previewRect && previewRect.bottom > screen.getBoundingClientRect().bottom),
        previewTop: previewRect?.top ?? -1,
        previewUnderCta: Boolean(previewRect && ctaRect && previewRect.top < ctaRect.bottom && previewRect.bottom > ctaRect.top),
        viewportHeight: window.innerHeight,
      };
    });
    expect(completePlannerPolicy.overflowY).toBe("hidden");
    expect(completePlannerPolicy.documentScrollHeight).toBeLessThanOrEqual(completePlannerPolicy.viewportHeight + 1);
    expect(completePlannerPolicy.previewGap).toBeCloseTo(plannerPolicy.previewGap, 0);
    expect(completePlannerPolicy.previewTop).toBeGreaterThan(plannerPolicy.previewTop);
    expect(completePlannerPolicy.previewClipped).toBe(true);
    expect(completePlannerPolicy.previewUnderCta).toBe(true);
    await page.screenshot({ path: resolve(EVIDENCE_DIR, "no-scroll-planner-complete-390x700.png") });
  });

  test("mobile demo pages lock document scroll and keep the bottom action stationary", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 });
    await installMarketingDemandValidationRoutes(page);
    await page.goto(MARKETING_BETA_PATH);
    await completeMarketingQuiz(page);
    await page.getByRole("button", { name: "무먹으로 20초 체험하기" }).click();

    const action = page.getByRole("button", { name: "무먹으로 가져오기" });
    await expect(action).toBeVisible();
    const beforeTop = await action.evaluate((element) => element.getBoundingClientRect().top);
    await page.evaluate(() => window.scrollTo(0, 160));
    const after = await action.evaluate((element) => ({
      bodyOverflow: getComputedStyle(document.body).overflowY,
      bodyPosition: getComputedStyle(document.body).position,
      documentOverflow: getComputedStyle(document.documentElement).overflowY,
      scrollY: window.scrollY,
      top: element.getBoundingClientRect().top,
    }));

    expect(after.bodyOverflow).toBe("hidden");
    expect(after.bodyPosition).toBe("static");
    expect(after.documentOverflow).toBe("auto");
    expect(after.scrollY).toBe(0);
    expect(after.top).toBeCloseTo(beforeTop, 0);
  });

  test("captures 320/390/393/desktop evidence and both read-only TomorrowPreview states", async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chrome", "capture once");
    test.setTimeout(240_000);
    await mkdir(EVIDENCE_DIR, { recursive: true });
    const captures = [];
    for (const variant of ["default", "a", "b", "c", "d"] as const) {
      for (const [width, height, suffix] of [[320, 568, "320x568"], [390, 844, "390x844"], [1280, 900, "1280x900"]] as const) {
        const query = variant === "default" ? "" : `?ad_variant=${variant}`;
        captures.push(await capture(browser, width, height, `hero-${variant}-${suffix}.png`, undefined, `${MARKETING_BETA_PATH}${query}`));
      }
    }
    captures.push(await capture(browser, 393, 852, "hero-default-393x852.png"));
    for (const result of ["homecook-passer", "eyeballing-master", "ingredient-tracker", "pro-measurer"] as const) {
      captures.push(await capture(browser, 390, 844, `result-${result}-390x844.png`, undefined, `${MARKETING_BETA_PATH}?result=${result}`));
    }

    const flowContext = await browser.newContext({ deviceScaleFactor: 1, viewport: { width: 390, height: 844 } });
    const flowPage = await flowContext.newPage();
    await installMarketingDemandValidationRoutes(flowPage);
    await flowPage.goto(MARKETING_BETA_PATH);
    await flowPage.getByRole("button", { name: "내 집밥기록 유형 알아보기" }).click();
    for (const [index, answer] of ["거의 매일", "3~5끼", "먹은 양을 눈대중으로 기록", "딱 맞는 음식이 없어 비슷한 걸 찾아야 하는 것"].entries()) {
      await expect(flowPage.getByRole("progressbar")).toHaveAttribute("aria-valuenow", String(index + 1));
      const quizPath = resolve(EVIDENCE_DIR, `quiz-q${index + 1}-390x844.png`);
      await flowPage.screenshot({ path: quizPath, fullPage: true });
      captures.push(quizPath);
      await flowPage.getByRole("button", { name: answer }).click();
    }
    await expect(flowPage.getByRole("heading", { name: "눈대중 장인" })).toBeVisible();
    await flowPage.waitForTimeout(760);
    const normalResult = resolve(EVIDENCE_DIR, "result-normal-eyeballing-master-390x844.png");
    await flowPage.screenshot({ path: normalResult, fullPage: true }); captures.push(normalResult);
    await flowPage.getByRole("button", { name: "무먹으로 20초 체험하기" }).click();
    await expect(flowPage.getByRole("button", { name: "무먹으로 가져오기" })).toBeVisible();
    const experience1 = resolve(EVIDENCE_DIR, "experience-1-390x844.png");
    await flowPage.screenshot({ path: experience1, fullPage: true }); captures.push(experience1);
    await flowPage.getByRole("button", { name: "무먹으로 가져오기" }).click();
    const experience1Loading = resolve(EVIDENCE_DIR, "experience-1-loading-390x844.png");
    await flowPage.screenshot({ path: experience1Loading, fullPage: true }); captures.push(experience1Loading);
    await expect(flowPage.getByRole("button", { name: "다음", exact: true })).toBeVisible();
    const completedImportHeading = flowPage.getByRole("heading", { name: "레시피를 가져왔어요" });
    await expect(completedImportHeading).toBeVisible();
    await expect(completedImportHeading).toHaveAttribute("data-state", "complete");
    const completedHeadingStyle = await completedImportHeading.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        animationName: style.animationName,
        borderStyle: style.borderStyle,
        borderWidth: style.borderWidth,
        fontWeight: style.fontWeight,
      };
    });
    expect(completedHeadingStyle.animationName).toContain("recipe-title-complete");
    expect(completedHeadingStyle.borderWidth).toBe("0px");
    expect(Number(completedHeadingStyle.fontWeight)).toBeGreaterThanOrEqual(800);
    await expect(flowPage.getByTestId("recipe-title-check")).toBeVisible();
    await expect(flowPage.getByTestId("recipe-title-sparkle")).toBeVisible();
    await expect(flowPage.getByTestId("recipe-title-keyword")).toHaveCSS("color", "rgb(0, 161, 255)");
    await expect(flowPage.getByTestId("recipe-title-copy")).toHaveCSS("color", "rgb(47, 52, 56)");
    await expect(flowPage.getByRole("img", { name: "이 남자의 cook 채널 프로필" })).toBeVisible();
    await expect(flowPage.locator(".success-banner")).toHaveCount(0);
    const experience1Done = resolve(EVIDENCE_DIR, "experience-1-done-390x844.png");
    await flowPage.screenshot({ path: experience1Done, fullPage: true }); captures.push(experience1Done);
    await flowPage.getByRole("button", { name: "다음", exact: true }).click();
    const experience2 = resolve(EVIDENCE_DIR, "experience-2-390x844.png");
    expect(Number(await flowPage.getByRole("heading", { name: "영상 속 레시피를 자동으로 정리했어요." }).evaluate((element) => getComputedStyle(element).fontWeight))).toBeGreaterThanOrEqual(800);
    await expect(flowPage.getByText("오늘은 돼지고기를 조금 덜 넣었어요.")).toBeVisible();
    await flowPage.screenshot({ path: experience2, fullPage: true }); captures.push(experience2);
    await flowPage.getByRole("button", { name: "돼지고기 600g → 520g" }).click();
    await expect(flowPage.getByRole("button", { name: "다음", exact: true })).toBeVisible();
    await expect(flowPage.getByText("돼지고기 양을 520g으로 수정했어요")).toBeVisible();
    await expect(flowPage.getByTestId("pork-amount")).toHaveText("520g");
    await flowPage.waitForTimeout(600);
    const experience2Adjusted = resolve(EVIDENCE_DIR, "experience-2-adjusted-390x844.png");
    await flowPage.screenshot({ path: experience2Adjusted, fullPage: true }); captures.push(experience2Adjusted);
    await flowPage.getByRole("button", { name: "다음", exact: true }).click();
    const experience3 = resolve(EVIDENCE_DIR, "experience-3-390x844.png");
    await expect(flowPage.getByTestId("weight-helper")).toHaveText("조리하면서 줄어드는 무게를고려한 예상값이에요.");
    await flowPage.screenshot({ path: experience3, fullPage: true }); captures.push(experience3);
    await flowPage.getByRole("button", { name: "저울로 재보니 1,180g" }).click();
    await expect(flowPage.getByTestId("weight-helper")).toHaveText("증발한 수분 무게를 뺀정확한 무게를 입력했어요");
    await expect(flowPage.getByText("수분이 날아간 만큼까지 반영했어요.")).toHaveCount(0);
    await flowPage.waitForTimeout(760);
    const experience3Confirmed = resolve(EVIDENCE_DIR, "experience-3-confirmed-390x844.png");
    await flowPage.screenshot({ path: experience3Confirmed, fullPage: true }); captures.push(experience3Confirmed);
    await flowPage.getByRole("button", { name: "다음", exact: true }).click();
    const experience4 = resolve(EVIDENCE_DIR, "experience-4-390x844.png");
    await flowPage.screenshot({ path: experience4, fullPage: true }); captures.push(experience4);
    await flowPage.getByRole("button", { name: "320g 입력하기" }).click();
    await flowPage.waitForTimeout(600);
    const experience5 = resolve(EVIDENCE_DIR, "experience-5-390x844.png");
    await flowPage.screenshot({ path: experience5, fullPage: true }); captures.push(experience5);
    await flowPage.getByRole("button", { name: "식단에 기록하기" }).click();
    await expect(flowPage.getByRole("button", { name: "편의점 음식도 기록해보기" })).toBeVisible();
    await flowPage.waitForFunction(() => document.querySelector('[data-stage="planner-homecook"] .planner-summary')?.getAttribute("data-highlight") === "meal");
    await flowPage.waitForTimeout(570);
    const plannerHomecook = resolve(EVIDENCE_DIR, "planner-homecook-390x844.png");
    await flowPage.screenshot({ path: plannerHomecook, fullPage: true }); captures.push(plannerHomecook);
    await flowPage.getByRole("button", { name: "편의점 음식도 기록해보기" }).click();
    await flowPage.waitForFunction(() => Array.from(document.images).every((image) => image.complete && image.naturalWidth > 0));
    const packaged = resolve(EVIDENCE_DIR, "packaged-food-390x844.png");
    await flowPage.screenshot({ path: packaged, fullPage: true }); captures.push(packaged);
    await flowPage.getByRole("button", { name: "+ 기록하기" }).click();
    await expect(flowPage.getByRole("button", { name: "무료 베타 먼저 써보기" })).toBeVisible();
    await flowPage.waitForFunction(() => document.querySelector('[data-stage="planner-complete"] .planner-summary')?.getAttribute("data-highlight") === "product");
    await flowPage.waitForTimeout(570);
    const plannerComplete = resolve(EVIDENCE_DIR, "planner-complete-390x844.png");
    await flowPage.screenshot({ path: plannerComplete, fullPage: true }); captures.push(plannerComplete);
    await flowPage.getByRole("button", { name: "무료 베타 먼저 써보기" }).click();
    await expect(flowPage.getByRole("textbox", { name: "이메일" })).toBeVisible();
    await flowPage.waitForFunction(() => Array.from(document.images).every((image) => image.complete && image.naturalWidth > 0));
    const beta = resolve(EVIDENCE_DIR, "beta-form-390x844.png");
    await flowPage.screenshot({ path: beta, fullPage: true }); captures.push(beta);
    await flowPage.getByRole("button", { name: "무료 베타 초대받기" }).click();
    const betaError = resolve(EVIDENCE_DIR, "beta-form-validation-error-390x844.png");
    await flowPage.screenshot({ path: betaError, fullPage: true }); captures.push(betaError);
    await flowPage.getByRole("textbox", { name: "이메일" }).fill("evidence@example.com");
    await flowPage.getByRole("checkbox", { name: /이메일 수집·이용에 동의/ }).check();
    await flowPage.getByRole("button", { name: "무료 베타 초대받기" }).click();
    await expect(flowPage.getByRole("heading", { name: "신청이 완료됐어요!" })).toBeVisible();
    await flowPage.waitForFunction(() => Array.from(document.images).every((image) => image.complete && image.naturalWidth > 0));
    await flowPage.waitForTimeout(900);
    const done = resolve(EVIDENCE_DIR, "done-390x844.png");
    await flowPage.screenshot({ path: done, fullPage: true }); captures.push(done);
    await flowContext.close();
    const narrowQuizContext = await browser.newContext({ deviceScaleFactor: 1, viewport: { width: 320, height: 568 } });
    const narrowQuizPage = await narrowQuizContext.newPage();
    await installMarketingDemandValidationRoutes(narrowQuizPage);
    await narrowQuizPage.emulateMedia({ reducedMotion: "reduce" });
    await narrowQuizPage.goto(MARKETING_BETA_PATH);
    await narrowQuizPage.getByRole("button", { name: "내 집밥기록 유형 알아보기" }).click();
    for (const [index, answer] of ["거의 매일", "3~5끼", "먹은 양을 눈대중으로 기록", "딱 맞는 음식이 없어 비슷한 걸 찾아야 하는 것"].entries()) {
      await expect(narrowQuizPage.getByRole("progressbar")).toHaveAttribute("aria-valuenow", String(index + 1));
      const narrowPath = resolve(EVIDENCE_DIR, `quiz-q${index + 1}-320x568.png`);
      await narrowQuizPage.screenshot({ path: narrowPath, fullPage: true });
      captures.push(narrowPath);
      await narrowQuizPage.getByRole("button", { name: answer }).click();
    }
    await narrowQuizContext.close();
    const failClosedContext = await browser.newContext({ deviceScaleFactor: 1, viewport: { width: 390, height: 844 } });
    const failClosedPage = await failClosedContext.newPage();
    await installMarketingDemandValidationRoutes(failClosedPage, { leadMode: "turnstile" });
    await failClosedPage.emulateMedia({ reducedMotion: "reduce" });
    await failClosedPage.goto(MARKETING_BETA_PATH);
    await openMarketingLeadForm(failClosedPage);
    await failClosedPage.getByRole("textbox", { name: "이메일" }).fill("retry@example.com");
    await failClosedPage.getByRole("checkbox", { name: /이메일 수집·이용에 동의/ }).check();
    await failClosedPage.getByRole("button", { name: "무료 베타 초대받기" }).click();
    await expect(failClosedPage.locator("#beta-error")).toBeVisible();
    const failClosedPath = resolve(EVIDENCE_DIR, "turnstile-fail-closed-390x844.png");
    await failClosedPage.screenshot({ path: failClosedPath, fullPage: true });
    captures.push(failClosedPath);
    await failClosedContext.close();
    captures.push(await capture(browser, 390, 844, "reduced-motion-and-visible-focus.png", async (page) => {
      const startButton = page.getByRole("button", { name: "내 집밥기록 유형 알아보기" });
      await startButton.focus();
      await expect(startButton).toBeFocused();
    }));
    for (const [width, height, suffix] of [[320, 568, "320x568"], [393, 852, "393x852"]] as const) {
      captures.push(await capture(browser, width, height, `planner-homecook-${suffix}.png`, async (page) => {
        await openMarketingLeadForm(page);
        await page.getByRole("button", { name: "이전 화면" }).click();
        await page.getByRole("button", { name: "이전 화면" }).click();
        await page.getByRole("button", { name: "이전 화면" }).click();
        await expect(page.getByTestId("tomorrow-preview")).toBeVisible();
        for (const control of await page.getByRole("button", { name: /내일 .* 추가/ }).all()) await expect(control).toBeDisabled();
      }));
      captures.push(await capture(browser, width, height, `planner-complete-${suffix}.png`, async (page) => {
        await openMarketingLeadForm(page);
        await page.getByRole("button", { name: "이전 화면" }).click();
        await expect(page.getByTestId("tomorrow-preview")).toBeVisible();
        for (const control of await page.getByRole("button", { name: /내일 .* 추가/ }).all()) await expect(control).toBeDisabled();
      }));
    }
    const repositoryCaptures = captures.map((capturePath) =>
      relative(process.cwd(), capturePath).replaceAll("\\", "/"),
    );
    await writeFile(
      resolve(EVIDENCE_DIR, "stage4-capture-manifest.json"),
      `${JSON.stringify({ source_commit: "0aaa282552256ac9e77a5c134bb45a52e42ade33", captures: repositoryCaptures }, null, 2)}\n`,
    );
  });
});
