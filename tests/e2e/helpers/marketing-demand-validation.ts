import { expect, type Page, type Route } from "@playwright/test";
import type { MarketingValidationQuizAnswers, MarketingValidationQuizResult } from "@/types/marketing-validation";

export const MARKETING_BETA_PATH = "/beta";
export const MARKETING_QA_TURNSTILE_TOKEN_KEY = "homecook.marketing-beta.turnstile-token";
export const MARKETING_HAPPY_ANSWERS: MarketingValidationQuizAnswers = { q1: "daily", q2: "3_5", q3: "track", q4: "search" };
export const MARKETING_CONTROL_ANSWERS: MarketingValidationQuizAnswers = { q1: "none", q2: "none", q3: "pass", q4: "none" };

const LABELS: Record<keyof MarketingValidationQuizAnswers, Record<string, string>> = {
  q1: { daily: "거의 매일", "3_5": "주 3~5일", "1_2": "주 1~2일", none: "거의 안 함 / 안 함" },
  q2: { none: "거의 안 먹음", "1_2": "1~2끼", "3_5": "3~5끼", "6_plus": "6끼 이상" },
  q3: { pass: "집밥은 기록하지 않음", eyeball: "먹은 양을 눈대중으로 기록", track: "딱 맞는 음식이 없어 비슷한 음식이나 1인분으로 기록", measure: "재료와 음식 무게까지 재서 기록" },
  q4: { ingredients: "재료와 양을 하나씩 입력하는 것", weight: "완성된 음식과 먹은 양을 재는 것", search: "딱 맞는 음식이 없어 비슷한 걸 찾아야 하는 것", none: "별로 불편하지 않음" },
};

function resultFor(q3: MarketingValidationQuizAnswers["q3"]): MarketingValidationQuizResult {
  return { pass: "homecook-passer", eyeball: "eyeballing-master", track: "ingredient-tracker", measure: "pro-measurer" }[q3] as MarketingValidationQuizResult;
}

function success(state: string, extra: Record<string, unknown> = {}) {
  return { success: true, data: { stage: state, state, ...extra }, error: null };
}

type LeadMode = "accepted" | "duplicate" | "403" | "409" | "422" | "turnstile" | "503";

export async function installMarketingDemandValidationRoutes(page: Page, { leadMode = "accepted", turnstileToken = "qa-turnstile-token" }: { leadMode?: LeadMode; turnstileToken?: string } = {}) {
  let state = "view";
  await page.addInitScript(({ key, token }) => window.sessionStorage.setItem(key, token), { key: MARKETING_QA_TURNSTILE_TOKEN_KEY, token: turnstileToken });
  await page.route("**/api/v1/marketing/validation", async (route: Route) => {
    const body = JSON.parse(route.request().postData() ?? "{}") as { action?: string; answers?: MarketingValidationQuizAnswers };
    if (body.action === "quiz_completed") {
      state = body.action;
      await route.fulfill({ json: success(state, { quiz_result: resultFor(body.answers?.q3 ?? "eyeball"), target_qualified: null }) });
      return;
    }
    if (body.action === "lead_submitted" && leadMode !== "accepted" && leadMode !== "duplicate") {
      const status = leadMode === "403" ? 403 : leadMode === "409" ? 409 : leadMode === "503" ? 503 : 422;
      const code = leadMode === "403" ? "ORIGIN_NOT_ALLOWED" : leadMode === "409" ? "INVALID_TRANSITION" : leadMode === "turnstile" ? "TURNSTILE_FAILED" : leadMode === "503" ? "LEAD_CAPTURE_NOT_READY" : "VALIDATION_ERROR";
      await route.fulfill({ status, json: { success: false, data: null, error: { code, message: "안전하게 다시 시도해 주세요.", fields: [] } } });
      return;
    }
    state = body.action ?? state;
    await route.fulfill({ json: success(state) });
  });
}

export async function completeMarketingQuiz(page: Page, answers = MARKETING_HAPPY_ANSWERS) {
  await page.getByRole("button", { name: "테스트 시작하기" }).click();
  for (const key of ["q1", "q2", "q3", "q4"] as const) {
    await page.getByRole("button", { name: LABELS[key][answers[key]], exact: true }).click();
  }
  await expect(page.getByRole("heading", { name: { pass: "집밥 패스형", eyeball: "눈대중 장인", track: "성분 추적러", measure: "프로 계량러" }[answers.q3] })).toBeVisible();
}

export async function completeMarketingExperience(page: Page) {
  await page.getByRole("button", { name: "무먹으로 20초 체험하기" }).click();
  await page.getByRole("button", { name: "무먹으로 가져오기" }).click();
  await page.getByRole("button", { name: "돼지고기 양을 520g으로 바꾸기" }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "저울로 재보니 1,180g" }).click();
  await page.getByRole("button", { name: "320g 입력하기" }).click();
  await page.getByRole("button", { name: "식단에 기록하기" }).click();
}

export async function openMarketingLeadForm(page: Page, answers = MARKETING_HAPPY_ANSWERS) {
  await completeMarketingQuiz(page, answers);
  await completeMarketingExperience(page);
  await page.getByRole("button", { name: "편의점 음식도 기록해보기" }).click();
  await page.getByRole("button", { name: "더:단백 드링크 초코 기록하기" }).click();
  await page.getByRole("button", { name: "무료 베타 먼저 써보기" }).click();
  await expect(page.getByRole("textbox", { name: "이메일" })).toBeVisible();
}

export async function openMarketingIntent(page: Page, answers = MARKETING_HAPPY_ANSWERS) {
  await completeMarketingQuiz(page, answers);
}
