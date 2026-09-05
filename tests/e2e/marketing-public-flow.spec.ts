import { expect, test, type Page } from "@playwright/test";
import { completeMarketingQuiz, openMarketingLeadForm } from "./helpers/marketing-demand-validation";

// Explicit opt-in: actual anonymous records, no email submission and no mocked API.
test.skip(process.env.HOMECOOK_MARKETING_PUBLIC_SMOKE !== "1", "public smoke is opt-in");

async function ready(page: Page, path = "/beta") {
  const response = await page.goto(path);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("button", { name: "내 집밥기록 유형 알아보기" })).toBeVisible();
}

async function capture(page: Page, path: string) {
  await page.waitForFunction(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0));
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
}

for (const q3 of ["pass", "eyeball", "track", "measure"] as const) {
  test(`live ${q3}: full flow, returning visitor and shared-cookie new tab`, async ({ page, context }, testInfo) => {
    const apiFailures: number[] = [];
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];
    const privateRequests: string[] = [];
    const track = (current: Page) => {
      current.on("pageerror", (error) => pageErrors.push(error.name));
      current.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
      current.on("requestfailed", (request) => {
        const error = request.failure()?.errorText;
        if (error !== "net::ERR_ABORTED") failedRequests.push(error ?? "unknown");
      });
      current.on("response", (response) => {
        if (response.url().includes("/api/") && response.status() >= 400) apiFailures.push(response.status());
      });
      current.on("request", (request) => {
        if (request.url().includes("/users/me/youtube-extraction-jobs")) privateRequests.push("private-notification-request");
        if (request.url().endsWith("/marketing/validation")) expect(request.postDataJSON().action).not.toBe("lead_submitted");
      });
    };
    track(page);
    await ready(page, `/beta?ad_variant=${{ pass: "a", eyeball: "b", track: "c", measure: "d" }[q3]}`);
    const answers = { q1: "daily", q2: "3_5", q3, q4: "search" } as const;
    await openMarketingLeadForm(page, answers);
    await capture(page, testInfo.outputPath("first-beta-form.png"));
    await page.getByRole("button", { name: "무료 베타 초대받기" }).click();
    await expect(page.locator("#beta-error")).toContainText("이메일을 입력해 주세요");
    await ready(page);
    await completeMarketingQuiz(page, answers);
    await capture(page, testInfo.outputPath("returning-result.png"));
    await page.getByRole("button", { name: "마지막 질문으로 돌아가기" }).click();
    await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "4");
    await page.getByRole("button", { name: "별로 불편하지 않음", exact: true }).click();
    await expect(page.getByRole("button", { name: "무먹으로 20초 체험하기" })).toBeVisible();

    const newTab = await context.newPage();
    track(newTab);
    await ready(newTab);
    await openMarketingLeadForm(newTab, answers);
    await capture(newTab, testInfo.outputPath("new-tab-beta-form.png"));
    expect(await newTab.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(apiFailures).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(failedRequests).toEqual([]);
    expect(privateRequests).toEqual([]);
    await newTab.close();
  });
}

for (const width of [320, 1280]) {
  test(`live ${width}px: full flow and reload`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 320 ? 700 : 900 });
    await ready(page);
    await openMarketingLeadForm(page);
    await ready(page);
    await openMarketingLeadForm(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await capture(page, testInfo.outputPath(`beta-form-${width}.png`));
  });
}
