// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) => {
    const { priority, ...imageProps } = props;
    void priority;

    // eslint-disable-next-line @next/next/no-img-element
    return <img alt="" {...imageProps} />;
  },
}));

const postMarketingValidation = vi.fn();

vi.mock("@/lib/api/marketing-validation", () => ({
  postMarketingValidation: (...args: unknown[]) => postMarketingValidation(...args),
}));

async function importScreen() {
  return import("@/components/marketing/marketing-demand-validation-screen");
}

async function openHappyPathIntent(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "30초 식단 기록 테스트" }));
  await user.click(screen.getByRole("radio", { name: "시작했지만 중단함" }));
  await user.click(screen.getByRole("button", { name: "다음 질문" }));
  await user.click(screen.getByRole("radio", { name: "2~3일" }));
  await user.click(screen.getByRole("button", { name: "다음 질문" }));
  await user.click(screen.getByRole("radio", { name: "재료를 하나씩 검색해 입력" }));
  await user.click(screen.getByRole("button", { name: "다음 질문" }));
  await user.click(screen.getByRole("radio", { name: "하루 합계와 주간 흐름을 한눈에 못 볼 때" }));
  await user.click(screen.getByRole("button", { name: "다음 질문" }));
  await user.click(screen.getByRole("radio", { name: "레시피 기준 자동 계산" }));
  await user.click(screen.getByRole("button", { name: "결과 보기" }));
  await user.click(await screen.findByRole("button", { name: "이렇게 기록할 수 있다면 어떨까요?" }));
}

async function openHappyPathFollowup(user: ReturnType<typeof userEvent.setup>) {
  await openHappyPathIntent(user);
  await user.click(screen.getByRole("button", { name: "써보고 싶어요" }));
  await user.type(screen.getByLabelText("이메일"), "tester@example.com");
  await user.click(screen.getByRole("checkbox", { name: /베타 초대와 관련 안내를 이메일로 받는 데 동의합니다\./ }));
  await user.click(screen.getByRole("button", { name: "베타 우선 초대받기" }));
  await screen.findByRole("heading", { name: "조금만 더 알려주세요" });
}

describe("marketing demand validation landing", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    postMarketingValidation.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("moves focus and scroll handoff to the active section heading when the flow advances", async () => {
    postMarketingValidation
      .mockResolvedValueOnce({
        error: null,
        success: true,
        data: { stage: "view", state: "view" },
      })
      .mockResolvedValueOnce({
        error: null,
        success: true,
        data: { stage: "quiz_started", state: "quiz_started" },
      })
      .mockResolvedValueOnce({
        error: null,
        success: true,
        data: {
          quiz_result: "weekly_blindspot",
          stage: "quiz_completed",
          state: "quiz_completed",
          target_qualified: true,
        },
      })
      .mockResolvedValueOnce({
        error: null,
        success: true,
        data: { stage: "solution_viewed", state: "solution_viewed" },
      })
      .mockResolvedValueOnce({
        error: null,
        success: true,
        data: { stage: "intent_selected", state: "intent_selected" },
      })
      .mockResolvedValueOnce({
        error: null,
        success: true,
        data: { stage: "lead_submitted", state: "lead_submitted" },
      });

    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
      writable: true,
    });

    const { MarketingDemandValidationScreen } = await importScreen();
    const user = userEvent.setup();
    render(<MarketingDemandValidationScreen />);

    await openHappyPathIntent(user);

    const intentHeading = screen.getByRole("heading", {
      name: "이렇게 기록할 수 있다면 어떨까요?",
    });

    expect(intentHeading.getAttribute("tabindex")).toBe("-1");
    expect(scrollIntoView).toHaveBeenCalled();
    expect(document.activeElement).toBe(intentHeading);

    await user.click(screen.getByRole("button", { name: "써보고 싶어요" }));
    const emailHeading = await screen.findByRole("heading", {
      name: "이런 앱이라면 써보고 싶나요?",
    });
    expect(emailHeading.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(emailHeading);

    await user.type(screen.getByLabelText("이메일"), "tester@example.com");
    await user.click(screen.getByRole("checkbox", { name: /베타 초대와 관련 안내를 이메일로 받는 데 동의합니다\./ }));
    await user.click(screen.getByRole("button", { name: "베타 우선 초대받기" }));

    const followupHeading = await screen.findByRole("heading", { name: "조금만 더 알려주세요" });
    expect(followupHeading.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(followupHeading);
  });

  it("shows the locked hero copy and restores the quiz/result flow from the server view state", async () => {
    postMarketingValidation.mockResolvedValueOnce({
      error: null,
      success: true,
      data: {
        stage: "view",
        state: "quiz_started",
      },
    });

    const { MarketingDemandValidationScreen } = await importScreen();
    render(<MarketingDemandValidationScreen />);

    expect(await screen.findByText("레시피도, 편의점도")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "하루·한 주 영양을 한눈에" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "30초 식단 기록 테스트" })).toBeTruthy();
    expect(screen.getByText("무료 · 로그인 없이 참여")).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText("1/5")).toBeTruthy();
    });
  });

  it("keeps the result visible when lead submission fails closed and allows email retry", async () => {
    postMarketingValidation
      .mockResolvedValueOnce({
        error: null,
        success: true,
        data: { stage: "view", state: "view" },
      })
      .mockResolvedValueOnce({
        error: null,
        success: true,
        data: { stage: "quiz_started", state: "quiz_started" },
      })
      .mockResolvedValueOnce({
        error: null,
        success: true,
        data: {
          quiz_result: "weekly_blindspot",
          stage: "quiz_completed",
          state: "quiz_completed",
          target_qualified: true,
        },
      })
      .mockResolvedValueOnce({
        error: null,
        success: true,
        data: { stage: "solution_viewed", state: "solution_viewed" },
      })
      .mockResolvedValueOnce({
        error: null,
        success: true,
        data: { stage: "intent_selected", state: "intent_selected" },
      })
      .mockResolvedValue({
        success: false,
        data: null,
        error: {
          code: "LEAD_CAPTURE_NOT_READY",
          message: "베타 신청은 아직 열리지 않았어요.",
          fields: [],
        },
      });

    const { MarketingDemandValidationScreen } = await importScreen();
    const user = userEvent.setup();
    render(<MarketingDemandValidationScreen />);

    await user.click(await screen.findByRole("button", { name: "30초 식단 기록 테스트" }));
    await user.click(screen.getByRole("radio", { name: "시작했지만 중단함" }));
    await user.click(screen.getByRole("button", { name: "다음 질문" }));
    await user.click(screen.getByRole("radio", { name: "2~3일" }));
    await user.click(screen.getByRole("button", { name: "다음 질문" }));
    await user.click(screen.getByRole("radio", { name: "재료를 하나씩 검색해 입력" }));
    await user.click(screen.getByRole("button", { name: "다음 질문" }));
    await user.click(screen.getByRole("radio", { name: "하루 합계와 주간 흐름을 한눈에 못 볼 때" }));
    await user.click(screen.getByRole("button", { name: "다음 질문" }));
    await user.click(screen.getByRole("radio", { name: "레시피 기준 자동 계산" }));
    await user.click(screen.getByRole("button", { name: "결과 보기" }));
    await user.click(await screen.findByRole("button", { name: "이렇게 기록할 수 있다면 어떨까요?" }));
    await user.click(screen.getByRole("button", { name: "써보고 싶어요" }));
    await user.type(screen.getByLabelText("이메일"), "tester@example.com");
    await user.click(screen.getByRole("checkbox", { name: /베타 초대와 관련 안내를 이메일로 받는 데 동의합니다\./ }));
    await user.click(screen.getByRole("button", { name: "베타 우선 초대받기" }));

    expect(await screen.findByText("주간 흐름 실종형")).toBeTruthy();
    expect(screen.getByDisplayValue("tester@example.com")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("베타 신청은 아직 열리지 않았어요.");
  });

  it("keeps the negative branch neutral and ends without the email form", async () => {
    postMarketingValidation
      .mockResolvedValueOnce({
        error: null,
        success: true,
        data: { stage: "view", state: "view" },
      })
      .mockResolvedValueOnce({
        error: null,
        success: true,
        data: { stage: "quiz_started", state: "quiz_started" },
      })
      .mockResolvedValueOnce({
        error: null,
        success: true,
        data: {
          quiz_result: "satisfied_control",
          stage: "quiz_completed",
          state: "quiz_completed",
          target_qualified: false,
        },
      })
      .mockResolvedValueOnce({
        error: null,
        success: true,
        data: { stage: "solution_viewed", state: "solution_viewed" },
      })
      .mockResolvedValueOnce({
        error: null,
        success: true,
        data: { stage: "intent_selected", state: "intent_selected" },
      });

    const { MarketingDemandValidationScreen } = await importScreen();
    const user = userEvent.setup();
    render(<MarketingDemandValidationScreen />);

    await user.click(await screen.findByRole("button", { name: "30초 식단 기록 테스트" }));
    await user.click(screen.getByRole("radio", { name: "가끔 기록 중" }));
    await user.click(screen.getByRole("button", { name: "다음 질문" }));
    await user.click(screen.getByRole("radio", { name: "4~7일" }));
    await user.click(screen.getByRole("button", { name: "다음 질문" }));
    await user.click(screen.getByRole("radio", { name: "저장한 레시피를 재사용" }));
    await user.click(screen.getByRole("button", { name: "다음 질문" }));
    await user.click(screen.getByRole("radio", { name: "특별히 불편하지 않음" }));
    await user.click(screen.getByRole("button", { name: "다음 질문" }));
    await user.click(screen.getByRole("radio", { name: "현재 방식으로 충분함" }));
    await user.click(screen.getByRole("button", { name: "결과 보기" }));
    await user.click(await screen.findByRole("button", { name: "이렇게 기록할 수 있다면 어떨까요?" }));
    await user.click(screen.getByRole("button", { name: "지금은 필요하지 않아요" }));

    expect(await screen.findByText("지금 방식도 괜찮은 편")).toBeTruthy();
    expect(screen.queryByLabelText("이메일")).toBeNull();
    expect(screen.getByText("이 응답도 제품 우선순위를 정하는 데 중요합니다.")).toBeTruthy();
  });

  it("does not render followup or done beside the restore-gap empty state", async () => {
    postMarketingValidation.mockResolvedValueOnce({
      error: null,
      success: true,
      data: { stage: "view", state: "lead_submitted" },
    });

    const { MarketingDemandValidationScreen } = await importScreen();
    render(<MarketingDemandValidationScreen />);

    expect(await screen.findByText("이전 결과를 바로 복원하지 못했어요")).toBeTruthy();
    expect(screen.queryByText("조금만 더 알려주세요")).toBeNull();
    expect(screen.queryByText("참여해 주셔서 고마워요")).toBeNull();
  });

  it("removes a stale queued head after INVALID_TRANSITION resync and does not block the next lead submission", async () => {
    const { MARKETING_VALIDATION_CLIENT_STORAGE_KEY, readMarketingQueue } = await import(
      "@/lib/marketing/marketing-validation-client-session"
    );

    window.sessionStorage.setItem(
      MARKETING_VALIDATION_CLIENT_STORAGE_KEY,
      JSON.stringify({
        queue: [
          { action: "solution_viewed" },
          { action: "intent_selected", intent_choice: "needed" },
        ],
        snapshot: {
          intentChoice: "needed",
          quizAnswers: {
            q1: "시작했지만 중단함",
            q2: "2~3일",
            q3: "재료를 하나씩 검색해 입력",
            q4: "하루 합계와 주간 흐름을 한눈에 못 볼 때",
            q5: "레시피 기준 자동 계산",
          },
          quizResult: "weekly_blindspot",
          serverState: "quiz_completed",
          stage: "email",
          targetQualified: true,
        },
        version: 1,
      }),
    );

    postMarketingValidation
      .mockResolvedValueOnce({
        error: null,
        success: true,
        data: { stage: "view", state: "quiz_completed" },
      })
      .mockResolvedValueOnce({
        success: false,
        data: null,
        error: {
          code: "INVALID_TRANSITION",
          message: "허용되지 않은 접근이에요.",
          fields: [],
        },
      })
      .mockResolvedValueOnce({
        error: null,
        success: true,
        data: { stage: "view", state: "solution_viewed" },
      })
      .mockResolvedValueOnce({
        error: null,
        success: true,
        data: { stage: "intent_selected", state: "intent_selected" },
      })
      .mockResolvedValueOnce({
        error: null,
        success: true,
        data: { stage: "lead_submitted", state: "lead_submitted" },
      });

    const { MarketingDemandValidationScreen } = await importScreen();
    const user = userEvent.setup();
    render(<MarketingDemandValidationScreen />);

    await waitFor(() => {
      expect(readMarketingQueue()).toEqual([]);
    });
    expect(await screen.findByLabelText("이메일")).toBeTruthy();

    await user.type(screen.getByLabelText("이메일"), "tester@example.com");
    await user.click(screen.getByRole("checkbox", { name: /베타 초대와 관련 안내를 이메일로 받는 데 동의합니다\./ }));
    await user.click(screen.getByRole("button", { name: "베타 우선 초대받기" }));

    expect(await screen.findByRole("heading", { name: "조금만 더 알려주세요" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(readMarketingQueue()).toEqual([]);
    expect(
      postMarketingValidation.mock.calls.map(([payload]) => (
        payload as { action?: string }
      ).action),
    ).toEqual([
      "view",
      "solution_viewed",
      "view",
      "intent_selected",
      "lead_submitted",
    ]);
  });

  it("renders both followup questions as named radio groups", async () => {
    postMarketingValidation
      .mockResolvedValueOnce({
        error: null,
        success: true,
        data: { stage: "view", state: "view" },
      })
      .mockResolvedValueOnce({
        error: null,
        success: true,
        data: { stage: "quiz_started", state: "quiz_started" },
      })
      .mockResolvedValueOnce({
        error: null,
        success: true,
        data: {
          quiz_result: "weekly_blindspot",
          stage: "quiz_completed",
          state: "quiz_completed",
          target_qualified: true,
        },
      })
      .mockResolvedValueOnce({
        error: null,
        success: true,
        data: { stage: "solution_viewed", state: "solution_viewed" },
      })
      .mockResolvedValueOnce({
        error: null,
        success: true,
        data: { stage: "intent_selected", state: "intent_selected" },
      })
      .mockResolvedValueOnce({
        error: null,
        success: true,
        data: { stage: "lead_submitted", state: "lead_submitted" },
      });

    const { MarketingDemandValidationScreen } = await importScreen();
    const user = userEvent.setup();
    render(<MarketingDemandValidationScreen />);

    await openHappyPathFollowup(user);

    expect(screen.getByRole("radiogroup", { name: "이 주간 화면이 있다면 써볼 의향은?" })).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: "가장 먼저 보고 싶은 정보는?" })).toBeTruthy();
  });

  it("keeps followup questions inside a localized scroll region and leaves actions in a separate compact footer", async () => {
    postMarketingValidation
      .mockResolvedValueOnce({
        error: null,
        success: true,
        data: { stage: "view", state: "view" },
      })
      .mockResolvedValueOnce({
        error: null,
        success: true,
        data: { stage: "quiz_started", state: "quiz_started" },
      })
      .mockResolvedValueOnce({
        error: null,
        success: true,
        data: {
          quiz_result: "weekly_blindspot",
          stage: "quiz_completed",
          state: "quiz_completed",
          target_qualified: true,
        },
      })
      .mockResolvedValueOnce({
        error: null,
        success: true,
        data: { stage: "solution_viewed", state: "solution_viewed" },
      })
      .mockResolvedValueOnce({
        error: null,
        success: true,
        data: { stage: "intent_selected", state: "intent_selected" },
      })
      .mockResolvedValueOnce({
        error: null,
        success: true,
        data: { stage: "lead_submitted", state: "lead_submitted" },
      });

    const { MarketingDemandValidationScreen } = await importScreen();
    const user = userEvent.setup();
    const { container } = render(<MarketingDemandValidationScreen />);

    await openHappyPathFollowup(user);

    const followupPanel = container.querySelector(".marketing-beta-followup");
    const scrollRegion = container.querySelector("[data-testid='marketing-beta-followup-scroll-region']");
    const actions = container.querySelector("[data-testid='marketing-beta-followup-actions']");

    expect(followupPanel?.getAttribute("data-compact-panel")).toBe("true");
    expect(scrollRegion?.getAttribute("data-local-scroll")).toBe("true");
    expect(actions?.getAttribute("data-sticky-actions")).toBe("true");
    expect(actions?.previousElementSibling?.contains(scrollRegion)).toBe(true);
  });

  it("shows a visible followup scroll cue before the second question is reached", async () => {
    postMarketingValidation
      .mockResolvedValueOnce({
        error: null,
        success: true,
        data: { stage: "view", state: "view" },
      })
      .mockResolvedValueOnce({
        error: null,
        success: true,
        data: { stage: "quiz_started", state: "quiz_started" },
      })
      .mockResolvedValueOnce({
        error: null,
        success: true,
        data: {
          quiz_result: "weekly_blindspot",
          stage: "quiz_completed",
          state: "quiz_completed",
          target_qualified: true,
        },
      })
      .mockResolvedValueOnce({
        error: null,
        success: true,
        data: { stage: "solution_viewed", state: "solution_viewed" },
      })
      .mockResolvedValueOnce({
        error: null,
        success: true,
        data: { stage: "intent_selected", state: "intent_selected" },
      })
      .mockResolvedValueOnce({
        error: null,
        success: true,
        data: { stage: "lead_submitted", state: "lead_submitted" },
      });

    const { MarketingDemandValidationScreen } = await importScreen();
    const user = userEvent.setup();
    render(<MarketingDemandValidationScreen />);

    await openHappyPathFollowup(user);

    const cue = screen.queryByText("아래로 더 보기")
      ?? document.querySelector("[data-testid='marketing-beta-followup-scroll-cue']");

    expect(cue).toBeTruthy();
  });
});
