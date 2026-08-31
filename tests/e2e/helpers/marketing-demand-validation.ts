import { expect, type Page, type Route } from "@playwright/test";

import { buildQuizOutcome } from "@/lib/marketing/demand-validation";
import type { MarketingValidationIntentChoice, MarketingValidationQuizAnswers } from "@/types/marketing-validation";

export const MARKETING_BETA_PATH = "/beta";
export const MARKETING_QA_TURNSTILE_TOKEN_KEY =
  "homecook.marketing-beta.turnstile-token";

export const MARKETING_HAPPY_ANSWERS: MarketingValidationQuizAnswers = {
  q1: "시작했지만 중단함",
  q2: "2~3일",
  q3: "재료를 하나씩 검색해 입력",
  q4: "하루 합계와 주간 흐름을 한눈에 못 볼 때",
  q5: "레시피 기준 자동 계산",
};

export const MARKETING_CONTROL_ANSWERS: MarketingValidationQuizAnswers = {
  q1: "가끔 기록 중",
  q2: "4~7일",
  q3: "저장한 레시피를 재사용",
  q4: "특별히 불편하지 않음",
  q5: "현재 방식으로 충분함",
};

function success(data: unknown) {
  return {
    success: true,
    data,
    error: null,
  };
}

type LeadMode = "accepted" | "duplicate" | "fail_closed";

export async function installMarketingDemandValidationRoutes(
  page: Page,
  {
    leadMode = "accepted",
    turnstileToken = "qa-turnstile-token",
  }: {
    leadMode?: LeadMode;
    turnstileToken?: string;
  } = {},
) {
  let state: "followup_submitted" | "intent_selected" | "lead_submitted" | "quiz_completed" | "quiz_started" | "solution_viewed" | "view" = "view";
  let intentChoice: MarketingValidationIntentChoice | null = null;

  await page.addInitScript(
    ({ storageKey, token }) => {
      window.sessionStorage.setItem(storageKey, token);
      window.localStorage.setItem(storageKey, token);
    },
    {
      storageKey: MARKETING_QA_TURNSTILE_TOKEN_KEY,
      token: turnstileToken,
    },
  );

  await page.route("**/api/v1/marketing/validation", async (route: Route) => {
    const body = JSON.parse(route.request().postData() ?? "{}") as {
      action?: string;
      answers?: MarketingValidationQuizAnswers;
      intent_choice?: MarketingValidationIntentChoice;
    };

    switch (body.action) {
      case "view":
        await route.fulfill({ json: success({ stage: "view", state }) });
        return;
      case "quiz_started":
        state = "quiz_started";
        await route.fulfill({ json: success({ stage: "quiz_started", state }) });
        return;
      case "quiz_completed": {
        const outcome = buildQuizOutcome(body.answers ?? MARKETING_HAPPY_ANSWERS);
        state = "quiz_completed";
        await route.fulfill({
          json: success({
            quiz_result: outcome.quiz_result,
            stage: "quiz_completed",
            state,
            target_qualified: outcome.target_qualified,
          }),
        });
        return;
      }
      case "solution_viewed":
        state = "solution_viewed";
        await route.fulfill({ json: success({ stage: "solution_viewed", state }) });
        return;
      case "intent_selected":
        intentChoice = body.intent_choice ?? null;
        state = "intent_selected";
        await route.fulfill({ json: success({ stage: "intent_selected", state }) });
        return;
      case "lead_submitted":
        if (intentChoice !== "needed") {
          await route.fulfill({
            status: 409,
            json: {
              success: false,
              data: null,
              error: {
                code: "INVALID_TRANSITION",
                message: "허용되지 않은 접근이에요.",
                fields: [],
              },
            },
          });
          return;
        }

        if (leadMode === "fail_closed") {
          await route.fulfill({
            status: 503,
            json: {
              success: false,
              data: null,
              error: {
                code: "LEAD_CAPTURE_NOT_READY",
                message: "베타 신청은 아직 열리지 않았어요.",
                fields: [],
              },
            },
          });
          return;
        }

        state = "lead_submitted";
        await route.fulfill({
          json: success({
            stage: "lead_submitted",
            state,
          }),
        });
        return;
      case "followup_submitted":
        state = "followup_submitted";
        await route.fulfill({
          json: success({
            stage: "followup_submitted",
            state,
          }),
        });
        return;
      default:
        await route.fulfill({
          status: 422,
          json: {
            success: false,
            data: null,
            error: {
              code: "VALIDATION_ERROR",
              message: "요청 값을 확인해 주세요.",
              fields: [],
            },
          },
        });
    }
  });
}

export async function completeMarketingQuiz(
  page: Page,
  answers: MarketingValidationQuizAnswers,
) {
  await page.getByRole("button", { name: "30초 식단 기록 테스트" }).click();

  for (const [index, answer] of Object.values(answers).entries()) {
    await page.getByRole("radio", { name: answer, exact: true }).click();
    await page.getByRole("button", {
      name: index === 4 ? "결과 보기" : "다음 질문",
    }).click();
  }
}

export async function openMarketingIntent(page: Page, answers = MARKETING_HAPPY_ANSWERS) {
  await completeMarketingQuiz(page, answers);
  await expect(page.getByRole("heading", { name: buildQuizOutcome(answers).quiz_result === "weekly_blindspot" ? "주간 흐름 실종형" : "지금 방식도 괜찮은 편" })).toBeVisible();
  await page.getByRole("button", { name: "이렇게 기록할 수 있다면 어떨까요?" }).click();
}

export async function openMarketingLeadForm(page: Page) {
  await openMarketingIntent(page, MARKETING_HAPPY_ANSWERS);
  await page.getByRole("button", { name: "써보고 싶어요" }).click();
  await expect(page.getByRole("textbox", { name: "이메일" })).toBeVisible();
}
