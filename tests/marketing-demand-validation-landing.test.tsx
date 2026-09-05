// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
  default: ({ alt = "", priority, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) => {
    void priority;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img {...props} alt={alt} />
    );
  },
}));

const postMarketingValidation = vi.fn();
vi.mock("@/lib/api/marketing-validation", () => ({ postMarketingValidation: (...args: unknown[]) => postMarketingValidation(...args) }));

async function importScreen() { return import("@/components/marketing/marketing-demand-validation-screen"); }
async function importSession() { return import("@/lib/marketing/marketing-validation-client-session"); }
function ok(state: string, extra: Record<string, unknown> = {}) { return { success: true, data: { stage: state, state, ...extra }, error: null }; }
function installHappyApi() {
  postMarketingValidation.mockImplementation(async (body: { action: string }) => body.action === "quiz_completed"
    ? ok("quiz_completed", { quiz_result: "ingredient-tracker", target_qualified: null })
    : ok(body.action));
}

async function answerQuiz(user: ReturnType<typeof userEvent.setup>, { waitForResult = true } = {}) {
  await user.click(await screen.findByRole("button", { name: "내 집밥기록 유형 알아보기" }));
  for (const answer of ["거의 매일", "3~5끼", "딱 맞는 음식이 없어 비슷한 음식이나 1인분으로 기록", "딱 맞는 음식이 없어 비슷한 걸 찾아야 하는 것"]) {
    await user.click(screen.getByRole("button", { name: answer }));
  }
  if (waitForResult) await screen.findByRole("heading", { name: "성분 추적러" });
}

async function reachBeta(user: ReturnType<typeof userEvent.setup>) {
  await answerQuiz(user);
  await user.click(screen.getByRole("button", { name: "무먹으로 20초 체험하기" }));
  await user.click(screen.getByRole("button", { name: "무먹으로 가져오기" }));
  await user.click(await screen.findByRole("button", { name: "다음" }));
  await user.click(await screen.findByRole("button", { name: "돼지고기 600g → 520g" }));
  await user.click(screen.getByRole("button", { name: "다음" }));
  await user.click(screen.getByRole("button", { name: "저울로 재보니 1,180g" }));
  await user.click(await screen.findByRole("button", { name: "다음" }));
  await user.click(await screen.findByRole("button", { name: "320g 입력하기" }));
  await user.click(screen.getByRole("button", { name: "식단에 기록하기" }));
  await user.click(screen.getByRole("button", { name: "편의점 음식도 기록해보기" }));
  await user.click(screen.getByRole("button", { name: "+ 기록하기" }));
  await user.click(screen.getByRole("button", { name: "무료 베타 먼저 써보기" }));
  await screen.findByRole("textbox", { name: "이메일" });
}

describe("marketing demand validation v2 landing", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/beta");
    window.sessionStorage.clear();
    postMarketingValidation.mockReset();
    Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
  });
  afterEach(cleanup);

  it("shows loading and recovers a missing session through the empty restart state", async () => {
    postMarketingValidation.mockResolvedValue({ success: false, data: null, error: { code: "SESSION_NOT_FOUND", message: "진행 정보를 찾지 못했어요.", fields: [] } });
    const { MarketingDemandValidationScreen } = await importScreen();
    render(<MarketingDemandValidationScreen />);
    expect(screen.getByRole("status", { name: "테스트 불러오는 중" })).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "새 테스트로 다시 시작할게요." })).toBeTruthy();
    expect(screen.getByRole("button", { name: "새로 시작하기" })).toBeTruthy();
  });

  it.each([
    ["hook_reentry", "a", "레시피만 가져오면"],
    ["hook_cooked_weight", "b", "수분 빠진 제육볶음 300g"],
    ["hook_calorie_quiz", "c", "내 집밥에"],
    ["hook_workaround", "d", "내가 만든 집밥을"],
  ])("uses utm_content %s ahead of candidate variant %s", async (utm, variant, title) => {
    window.history.replaceState({}, "", `/beta?utm_content=${utm}&ad_variant=d`);
    installHappyApi();
    const { MarketingDemandValidationScreen } = await importScreen();
    render(<MarketingDemandValidationScreen />);
    expect((await screen.findByRole("heading")).textContent).toContain(title);
    expect(postMarketingValidation).toHaveBeenCalledWith(expect.objectContaining({ action: "view", ad_variant: variant, utm_content: utm }));
  });

  it("falls back to default Hero for unknown result and preserves allowlisted attribution", async () => {
    window.history.replaceState({}, "", "/beta?result=not-real&utm_source=campaign&ad_variant=z");
    installHappyApi();
    const { MarketingDemandValidationScreen } = await importScreen();
    render(<MarketingDemandValidationScreen />);
    expect(await screen.findByRole("heading", { name: "집밥도 정확하게 기록할 수 있을까?" })).toBeTruthy();
    expect(postMarketingValidation).toHaveBeenCalledWith({ action: "view", honeypot: "", ad_variant: "default", utm_source: "campaign" });
  });

  it("renders a known opaque result as read-only without recording quiz events", async () => {
    window.history.replaceState({}, "", "/beta?result=pro-measurer&utm_source=must-go");
    installHappyApi();
    const { MarketingDemandValidationScreen } = await importScreen();
    render(<MarketingDemandValidationScreen />);
    expect(await screen.findByRole("heading", { name: "프로 계량러" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "나도 테스트하기" })).toBeTruthy();
    expect(postMarketingValidation).not.toHaveBeenCalled();
  });

  it("shows four-question progress, preserves back answers, and exposes result before email", async () => {
    installHappyApi();
    const { MarketingDemandValidationScreen } = await importScreen();
    const user = userEvent.setup();
    render(<MarketingDemandValidationScreen />);
    await user.click(await screen.findByRole("button", { name: "내 집밥기록 유형 알아보기" }));
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("1");
    await user.click(screen.getByRole("button", { name: "거의 매일" }));
    expect((await screen.findByRole("progressbar")).getAttribute("aria-valuenow")).toBe("2");
    await user.click(screen.getByRole("button", { name: "이전 질문" }));
    expect(screen.getByRole("button", { name: "거의 매일" }).getAttribute("aria-pressed")).toBe("true");
    await user.click(screen.getByRole("button", { name: "거의 매일" }));
    for (const answer of ["3~5끼", "딱 맞는 음식이 없어 비슷한 음식이나 1인분으로 기록", "딱 맞는 음식이 없어 비슷한 걸 찾아야 하는 것"]) await user.click(screen.getByRole("button", { name: answer }));
    expect(await screen.findByRole("heading", { name: "성분 추적러" })).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "이메일" })).toBeNull();
  });

  it("keeps result_viewed queued, blocks result navigation, and offers retry/restart when the durable write fails", async () => {
    const { readMarketingQueue } = await importSession();
    postMarketingValidation.mockImplementation(async (body: { action: string }) => {
      if (body.action === "quiz_completed") {
        return ok("quiz_completed", { quiz_result: "ingredient-tracker", target_qualified: null });
      }
      if (body.action === "result_viewed") {
        const resultViewedCalls = postMarketingValidation.mock.calls.filter(([payload]) => payload.action === "result_viewed").length;
        return resultViewedCalls === 1
          ? { success: false, data: null, error: { code: "NETWORK_ERROR", message: "결과 화면을 열지 못했어요. 다시 시도해 주세요.", fields: [] } }
          : ok("result_viewed");
      }
      return ok(body.action);
    });
    const { MarketingDemandValidationScreen } = await importScreen();
    const user = userEvent.setup();
    render(<MarketingDemandValidationScreen />);

    await answerQuiz(user, { waitForResult: false });

    expect(screen.queryByRole("heading", { name: "성분 추적러" })).toBeNull();
    expect((await screen.findByRole("alert")).textContent).toContain("결과 화면을 열지 못했어요. 다시 시도해 주세요.");
    expect(readMarketingQueue()).toEqual([{ action: "result_viewed" }]);

    await user.click(screen.getByRole("button", { name: "다시 시도" }));

    expect(await screen.findByRole("heading", { name: "성분 추적러" })).toBeTruthy();
    expect(readMarketingQueue()).toEqual([]);
  });

  it("keeps both TomorrowPreview controls disabled and before their CTA", async () => {
    installHappyApi();
    const { MarketingDemandValidationScreen } = await importScreen();
    const user = userEvent.setup();
    render(<MarketingDemandValidationScreen />);
    await answerQuiz(user);
    await user.click(screen.getByRole("button", { name: "무먹으로 20초 체험하기" }));
    expect(screen.getByRole("heading", { name: "유튜브 레시피를 가져올게요." }).classList.contains("recipe-import-title")).toBe(true);
    await user.click(screen.getByRole("button", { name: "무먹으로 가져오기" }));
    await user.click(await screen.findByRole("button", { name: "다음" }));
    await user.click(await screen.findByRole("button", { name: "돼지고기 600g → 520g" }));
    await user.click(screen.getByRole("button", { name: "다음" }));
    await user.click(screen.getByRole("button", { name: "저울로 재보니 1,180g" }));
    await user.click(await screen.findByRole("button", { name: "다음" }));
    await user.click(await screen.findByRole("button", { name: "320g 입력하기" }));
    await user.click(screen.getByRole("button", { name: "식단에 기록하기" }));
    const firstPreview = screen.getByTestId("tomorrow-preview");
    expect(firstPreview.compareDocumentPosition(screen.getByRole("button", { name: "편의점 음식도 기록해보기" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const button of screen.getAllByRole("button", { name: /내일 .* 추가/ })) expect((button as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "편의점 음식도 기록해보기" }));
    expect(screen.getByText("제품 예시")).toBeTruthy();
    expect(screen.getByText(/특정 브랜드와 제휴하거나 추천하는 화면이 아닙니다/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "+ 기록하기" }));
    expect(screen.getByTestId("tomorrow-preview")).toBeTruthy();
    for (const button of screen.getAllByRole("button", { name: /내일 .* 추가/ })) expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("uses an opaque canonical share URL and ignores cancel", async () => {
    installHappyApi();
    Object.defineProperty(navigator, "share", { configurable: true, value: vi.fn().mockRejectedValue(new DOMException("cancel", "AbortError")) });
    const { MarketingDemandValidationScreen } = await importScreen();
    const user = userEvent.setup();
    render(<MarketingDemandValidationScreen />);
    await answerQuiz(user);
    await user.click(screen.getByRole("button", { name: "내 결과 공유하기" }));
    expect(navigator.share).toHaveBeenCalledWith(expect.objectContaining({ url: "http://localhost:3000/beta?result=ingredient-tracker" }));
    expect(navigator.share).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining("#무먹 #집밥기록 #제육볶음") }));
    expect(screen.getByRole("heading", { name: "성분 추적러" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps the result usable when Web Share is unsupported and clipboard copy fails", async () => {
    installHappyApi();
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    const { MarketingDemandValidationScreen } = await importScreen();
    const user = userEvent.setup();
    const writeText = vi.fn()
      .mockRejectedValueOnce(new Error("copy blocked"))
      .mockResolvedValueOnce(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<MarketingDemandValidationScreen />);
    await answerQuiz(user);
    await user.click(screen.getByRole("button", { name: "내 결과 공유하기" }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("/beta?result=ingredient-tracker"));
    expect(await screen.findByText("공유 링크를 준비하지 못했어요. 다시 시도해 주세요.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByText("링크를 복사해 뒀어요.")).toBeTruthy();
  });

  it("validates, submits once on rapid clicks, and shows done only after generic success", async () => {
    let release: ((value: unknown) => void) | undefined;
    installHappyApi();
    postMarketingValidation.mockImplementation(async (body: { action: string }) => {
      if (body.action === "quiz_completed") return ok("quiz_completed", { quiz_result: "ingredient-tracker", target_qualified: null });
      if (body.action === "lead_submitted") return new Promise((resolve) => { release = resolve; });
      return ok(body.action);
    });
    const { MarketingDemandValidationScreen } = await importScreen();
    const user = userEvent.setup();
    render(<MarketingDemandValidationScreen getTurnstileToken={async () => ({ ok: true, token: "test-token" })} />);
    await reachBeta(user);
    await user.click(screen.getByRole("button", { name: "무료 베타 초대받기" }));
    expect(screen.getByRole("alert").textContent).toContain("이메일을 입력해 주세요.");
    await user.type(screen.getByRole("textbox", { name: "이메일" }), "tester@example.com");
    await user.click(screen.getByRole("checkbox", { name: /이메일 수집·이용에 동의/ }));
    const submit = screen.getByRole("button", { name: "무료 베타 초대받기" });
    await user.click(submit);
    await user.click(submit);
    expect(await screen.findByText("신청 내용을 확인하고 있어요.")).toBeTruthy();
    expect(postMarketingValidation.mock.calls.filter(([body]) => body.action === "lead_submitted")).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: "신청이 완료됐어요!" })).toBeNull();
    release?.(ok("lead_submitted"));
    expect(await screen.findByRole("heading", { name: "신청이 완료됐어요!" })).toBeTruthy();
  });

  it("fails closed without a configured Turnstile site key and does not submit a lead", async () => {
    vi.unstubAllEnvs();
    vi.resetModules();
    installHappyApi();
    const { MarketingDemandValidationScreen } = await importScreen();
    const user = userEvent.setup();
    render(<MarketingDemandValidationScreen />);

    await reachBeta(user);
    expect(screen.getByText(/보유: 캠페인 종료 후 180일/)).toBeTruthy();
    await user.type(screen.getByRole("textbox", { name: "이메일" }), "tester@example.com");
    await user.click(screen.getByRole("checkbox", { name: /이메일 수집·이용에 동의/ }));
    await user.click(screen.getByRole("button", { name: "무료 베타 초대받기" }));

    expect((await screen.findByRole("alert")).textContent).toContain("보안 확인을 준비 중입니다. 잠시 후 다시 시도해 주세요.");
    expect(postMarketingValidation.mock.calls.filter(([body]) => body.action === "lead_submitted")).toHaveLength(0);
  });

  it("keeps experience_completed queued, blocks planner navigation, and offers retry/restart when the durable write fails", async () => {
    const { readMarketingQueue } = await importSession();
    postMarketingValidation.mockImplementation(async (body: { action: string }) => {
      if (body.action === "quiz_completed") {
        return ok("quiz_completed", { quiz_result: "ingredient-tracker", target_qualified: null });
      }
      if (body.action === "experience_completed") {
        const experienceCompletedCalls = postMarketingValidation.mock.calls.filter(([payload]) => payload.action === "experience_completed").length;
        return experienceCompletedCalls === 1
          ? { success: false, data: null, error: { code: "NETWORK_ERROR", message: "식단 화면을 열지 못했어요. 다시 시도해 주세요.", fields: [] } }
          : ok("experience_completed");
      }
      return ok(body.action);
    });
    const { MarketingDemandValidationScreen } = await importScreen();
    const user = userEvent.setup();
    render(<MarketingDemandValidationScreen />);

    await answerQuiz(user);
    await user.click(screen.getByRole("button", { name: "무먹으로 20초 체험하기" }));
    await user.click(screen.getByRole("button", { name: "무먹으로 가져오기" }));
    await user.click(await screen.findByRole("button", { name: "다음" }));
    await user.click(await screen.findByRole("button", { name: "돼지고기 600g → 520g" }));
    await user.click(screen.getByRole("button", { name: "다음" }));
    await user.click(screen.getByRole("button", { name: "저울로 재보니 1,180g" }));
    await user.click(await screen.findByRole("button", { name: "다음" }));
    await user.click(await screen.findByRole("button", { name: "320g 입력하기" }));
    await user.click(screen.getByRole("button", { name: "식단에 기록하기" }));

    expect(screen.queryByRole("heading", { name: "이번 주 식단" })).toBeNull();
    expect((await screen.findByRole("alert")).textContent).toContain("식단 화면을 열지 못했어요. 다시 시도해 주세요.");
    expect(readMarketingQueue()).toEqual([{ action: "experience_completed" }]);

    await user.click(screen.getByRole("button", { name: "다시 시도" }));

    expect(await screen.findByRole("heading", { name: "이번 주 식단" })).toBeTruthy();
    expect(readMarketingQueue()).toEqual([]);
  });

  it.each(["ORIGIN_NOT_ALLOWED", "INVALID_TRANSITION", "VALIDATION_ERROR", "TURNSTILE_FAILED", "LEAD_CAPTURE_NOT_READY", "LEAD_CAPTURE_UNAVAILABLE"])("keeps prior value and recovery visible for %s", async (code) => {
    installHappyApi();
    postMarketingValidation.mockImplementation(async (body: { action: string }) => {
      if (body.action === "quiz_completed") return ok("quiz_completed", { quiz_result: "ingredient-tracker", target_qualified: null });
      if (body.action === "lead_submitted") return { success: false, data: null, error: { code, message: "안전하게 다시 시도해 주세요.", fields: [] } };
      return ok(body.action);
    });
    const { MarketingDemandValidationScreen } = await importScreen();
    const user = userEvent.setup();
    render(<MarketingDemandValidationScreen getTurnstileToken={async () => ({ ok: true, token: "test-token" })} />);
    await reachBeta(user);
    await user.type(screen.getByRole("textbox", { name: "이메일" }), "retry@example.com");
    await user.click(screen.getByRole("checkbox", { name: /이메일 수집·이용에 동의/ }));
    await user.click(screen.getByRole("button", { name: "무료 베타 초대받기" }));
    expect((await screen.findByRole("alert")).textContent).toContain("안전하게 다시 시도해 주세요.");
    expect(screen.getByDisplayValue("retry@example.com")).toBeTruthy();
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeTruthy();
  });

  it("matches the frozen 3cf3336 interaction contract", async () => {
    window.history.replaceState({}, "", "/beta?ad_variant=a");
    installHappyApi();
    const { MarketingDemandValidationScreen } = await importScreen();
    const user = userEvent.setup();
    render(<MarketingDemandValidationScreen />);

    expect((await screen.findByRole("heading")).textContent).toContain("레시피만 가져오면");
    expect(screen.getByRole("button", { name: "내 집밥기록 유형 알아보기" })).toBeTruthy();

    await answerQuiz(user);
    expect(screen.getByText(/오늘도 재료를 하나씩 넣으며 앱과 씨름 중/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "무먹으로 20초 체험하기" }));
    await user.click(screen.getByRole("button", { name: "무먹으로 가져오기" }));
    const completedHeading = await screen.findByRole("heading", { name: "레시피를 가져왔어요" });
    expect(completedHeading.classList.contains("is-complete")).toBe(true);
    expect(document.querySelector(".success-banner")).toBeNull();
    expect(screen.getByTestId("recipe-title-check")).toBeTruthy();
    expect(screen.getByTestId("recipe-title-sparkle")).toBeTruthy();
    expect(screen.getByTestId("recipe-title-keyword").textContent).toBe("레시피");
    expect(screen.getByTestId("recipe-title-copy").textContent).toBe("레시피를 가져왔어요");
    expect(screen.getByRole("img", { name: "이 남자의 cook 채널 프로필" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "다음" }));
    expect(screen.getByText("돼지고기 목살")).toBeTruthy();
    expect(screen.getByText("신김치")).toBeTruthy();
    expect(screen.getByText("외 10개 재료")).toBeTruthy();
    expect(screen.getByText("오늘은 돼지고기를 조금 덜 넣었어요.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "돼지고기 600g → 520g" }));
    expect(await screen.findByText("돼지고기 양을 520g으로 수정했어요")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "다음" }));
    expect(screen.getByTestId("weight-helper").textContent).toBe("조리하면서 줄어드는 무게를고려한 예상값이에요.");
    await user.click(screen.getByRole("button", { name: "저울로 재보니 1,180g" }));
    expect(screen.getByTestId("weight-helper").textContent).toBe("증발한 수분 무게를 뺀정확한 무게를 입력했어요");
    expect(screen.queryByText("수분이 날아간 만큼까지 반영했어요.")).toBeNull();
    await user.click(screen.getByRole("button", { name: "다음" }));
    await user.click(screen.getByRole("button", { name: "320g 입력하기" }));
    expect(screen.getByText("제육볶음 320g")).toBeTruthy();
    expect(screen.getByTestId("nutrition-serving-line").textContent).toContain("제육볶음 320g");
    expect(screen.getByTestId("nutrition-serving-line").querySelector(".nutrition-calories")).toBeTruthy();
  });
});
