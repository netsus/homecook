import { expect, test } from "@playwright/test";
import { completeMarketingQuiz, installMarketingDemandValidationRoutes, openMarketingLeadForm } from "./helpers/marketing-demand-validation";

test.beforeEach(async ({ page }) => {
  await installMarketingDemandValidationRoutes(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("a completed visitor can reload and replay the entire funnel without reverse requests", async ({ page }) => {
  const writes: string[] = [];
  const failures: number[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/v1/marketing/validation")) writes.push(request.postDataJSON().action);
  });
  page.on("response", (response) => {
    if (response.url().endsWith("/api/v1/marketing/validation") && response.status() >= 400) failures.push(response.status());
  });
  await page.goto("/beta");
  await completeMarketingQuiz(page);
  await page.reload();
  await openMarketingLeadForm(page);
  await page.reload();
  await openMarketingLeadForm(page);
  await page.getByRole("textbox", { name: "이메일" }).fill("qa@example.com");
  await page.getByRole("checkbox", { name: /이메일 수집·이용에 동의/ }).check();
  await page.getByRole("button", { name: "무료 베타 초대받기" }).click();
  await expect(page.getByRole("heading", { name: "신청이 완료됐어요!" })).toBeVisible();
  await page.getByRole("button", { name: "처음으로 돌아가기" }).click();
  await completeMarketingQuiz(page);
  expect(failures).toEqual([]);
  for (const action of ["quiz_started", "quiz_completed", "result_viewed", "experience_started", "experience_completed", "beta_form_viewed", "lead_submitted"]) {
    expect(writes.filter((value) => value === action), action).toHaveLength(1);
  }
});

test("result back navigation returns to Q4 and can replay the result", async ({ page }) => {
  await page.goto("/beta");
  await completeMarketingQuiz(page);
  await page.getByRole("button", { name: "마지막 질문으로 돌아가기" }).click();
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "4");
  await page.getByRole("button", { name: "별로 불편하지 않음", exact: true }).click();
  await expect(page.getByRole("heading", { name: "성분 추적러", exact: true })).toBeVisible();
});

test("a transient start failure recovers through the restart control", async ({ page }) => {
  let interrupted = false;
  await page.route("**/api/v1/marketing/validation", async (route) => {
    if (!interrupted && route.request().postDataJSON()?.action === "quiz_started") {
      interrupted = true;
      await route.abort("failed");
    } else await route.fallback();
  });
  await page.goto("/beta");
  await page.getByRole("button", { name: "내 집밥기록 유형 알아보기" }).click();
  await expect(page.getByRole("heading", { name: "새 테스트로 다시 시작할게요." })).toBeVisible();
  await page.getByRole("button", { name: "새로 시작하기" }).click();
  await completeMarketingQuiz(page);
});

for (const [q3, result] of [["pass", "집밥 패스형"], ["eyeball", "눈대중 장인"], ["track", "성분 추적러"], ["measure", "프로 계량러"]] as const) {
  test(`Q3 ${q3} reaches ${result}`, async ({ page }) => {
    await page.goto("/beta");
    await completeMarketingQuiz(page, { q1: "daily", q2: "3_5", q3, q4: "search" });
    await expect(page.getByRole("heading", { name: result, exact: true })).toBeVisible();
  });
}
