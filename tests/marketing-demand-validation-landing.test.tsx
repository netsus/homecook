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
function ok(state: string, extra: Record<string, unknown> = {}) { return { success: true, data: { stage: state, state, ...extra }, error: null }; }
function installHappyApi() {
  postMarketingValidation.mockImplementation(async (body: { action: string }) => body.action === "quiz_completed"
    ? ok("quiz_completed", { quiz_result: "ingredient-tracker", target_qualified: null })
    : ok(body.action));
}

async function answerQuiz(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "테스트 시작하기" }));
  for (const answer of ["거의 매일", "3~5끼", "딱 맞는 음식이 없어 비슷한 음식이나 1인분으로 기록", "딱 맞는 음식이 없어 비슷한 걸 찾아야 하는 것"]) {
    await user.click(screen.getByRole("button", { name: answer }));
  }
  await screen.findByRole("heading", { name: "성분 추적러" });
}

async function reachBeta(user: ReturnType<typeof userEvent.setup>) {
  await answerQuiz(user);
  await user.click(screen.getByRole("button", { name: "무먹으로 20초 체험하기" }));
  await user.click(screen.getByRole("button", { name: "무먹으로 가져오기" }));
  await user.click(await screen.findByRole("button", { name: "돼지고기 양을 520g으로 바꾸기" }));
  await user.click(screen.getByRole("button", { name: "다음" }));
  await user.click(screen.getByRole("button", { name: "저울로 재보니 1,180g" }));
  await user.click(await screen.findByRole("button", { name: "320g 입력하기" }));
  await user.click(screen.getByRole("button", { name: "식단에 기록하기" }));
  await user.click(screen.getByRole("button", { name: "편의점 음식도 기록해보기" }));
  await user.click(screen.getByRole("button", { name: "더:단백 드링크 초코 기록하기" }));
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
    ["hook_reentry", "a", "왜 레시피에 다 있는데"],
    ["hook_cooked_weight", "b", "요리 전 1,420g"],
    ["hook_calorie_quiz", "c", "이 제육볶음 300g"],
    ["hook_workaround", "d", "식단은 꼼꼼히 기록하는데"],
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
    await user.click(await screen.findByRole("button", { name: "테스트 시작하기" }));
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("1");
    await user.click(screen.getByRole("button", { name: "거의 매일" }));
    expect(await screen.findByText("2 / 4")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "이전 질문" }));
    expect(screen.getByRole("button", { name: "거의 매일" }).getAttribute("aria-pressed")).toBe("true");
    await user.click(screen.getByRole("button", { name: "거의 매일" }));
    for (const answer of ["3~5끼", "딱 맞는 음식이 없어 비슷한 음식이나 1인분으로 기록", "딱 맞는 음식이 없어 비슷한 걸 찾아야 하는 것"]) await user.click(screen.getByRole("button", { name: answer }));
    expect(await screen.findByRole("heading", { name: "성분 추적러" })).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "이메일" })).toBeNull();
  });

  it("keeps both TomorrowPreview controls disabled and before their CTA", async () => {
    installHappyApi();
    const { MarketingDemandValidationScreen } = await importScreen();
    const user = userEvent.setup();
    render(<MarketingDemandValidationScreen />);
    await answerQuiz(user);
    await user.click(screen.getByRole("button", { name: "무먹으로 20초 체험하기" }));
    await user.click(screen.getByRole("button", { name: "무먹으로 가져오기" }));
    await user.click(await screen.findByRole("button", { name: "돼지고기 양을 520g으로 바꾸기" }));
    await user.click(screen.getByRole("button", { name: "다음" }));
    await user.click(screen.getByRole("button", { name: "저울로 재보니 1,180g" }));
    await user.click(await screen.findByRole("button", { name: "320g 입력하기" }));
    await user.click(screen.getByRole("button", { name: "식단에 기록하기" }));
    const firstPreview = screen.getByTestId("tomorrow-preview");
    expect(firstPreview.compareDocumentPosition(screen.getByRole("button", { name: "편의점 음식도 기록해보기" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const button of screen.getAllByRole("button", { name: /내일 .* 추가/ })) expect((button as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "편의점 음식도 기록해보기" }));
    expect(screen.getByText("제품 예시")).toBeTruthy();
    expect(screen.getByText(/특정 브랜드와 제휴하거나 추천하는 화면이 아닙니다/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "더:단백 드링크 초코 기록하기" }));
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
    expect(screen.getByRole("heading", { name: "성분 추적러" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps the result usable when Web Share is unsupported and clipboard copy fails", async () => {
    installHappyApi();
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    const { MarketingDemandValidationScreen } = await importScreen();
    const user = userEvent.setup();
    const writeText = vi.fn().mockRejectedValue(new Error("copy blocked"));
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<MarketingDemandValidationScreen />);
    await answerQuiz(user);
    await user.click(screen.getByRole("button", { name: "내 결과 공유하기" }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("/beta?result=ingredient-tracker"));
    expect(screen.getByRole("heading", { name: "성분 추적러" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
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
    expect(screen.getByRole("alert").textContent).toContain("이메일을 입력해주세요.");
    await user.type(screen.getByRole("textbox", { name: "이메일" }), "tester@example.com");
    await user.click(screen.getByRole("checkbox", { name: /이메일 수집·이용에 동의/ }));
    const submit = screen.getByRole("button", { name: "무료 베타 초대받기" });
    await user.click(submit);
    await user.click(submit);
    expect(postMarketingValidation.mock.calls.filter(([body]) => body.action === "lead_submitted")).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: "신청이 완료됐어요!" })).toBeNull();
    release?.(ok("lead_submitted"));
    expect(await screen.findByRole("heading", { name: "신청이 완료됐어요!" })).toBeTruthy();
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
});
