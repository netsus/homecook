// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BetaForm, Result } from "@/components/marketing/recording-flow-views";
vi.mock("@/components/marketing/round2/round2-turnstile", () => ({ Round2Turnstile: ({ topic, siteKey }: { topic: string; siteKey: string }) => <div data-testid="challenge" data-action={`mumeok_r2_${topic}`} data-site={siteKey} /> }));
afterEach(cleanup);
it("removes an unverified time promise only from the prepared R2 result", () => {
  render(<Result type="homecook-passer" onBack={vi.fn()} onNext={vi.fn()} preview={false} onPreviewStart={vi.fn()} onShare={vi.fn()} shareFeedback={null} preparedExample />);
  expect(screen.queryByText(/20초/)).toBeNull();
  expect(screen.getByRole("heading", { name: "그런데 무먹에서는 집밥을 어떻게 기록할까요?" })).toBeTruthy();
  expect(screen.queryByText("준비된 예시로 확인해보세요.")).toBeNull();
  expect(screen.getByRole("button", { name: "무먹 체험하기" })).toBeTruthy();
});
it("uses controlled R2 consent, challenge and immutable-attempt recovery", () => {
  const onChange = vi.fn(); const onRestore = vi.fn(); const onRetry = vi.fn();
  render(<BetaForm onBack={vi.fn()} onSubmit={vi.fn()} round2={{ email: "current@example.com", consent: false, busy: false, error: null, onChange, siteKey: "r2-site", challengeEpoch: 2, tokenReady: false, onToken: vi.fn(), pendingLeadEdited: true, onRestore, onRetry }} />);
  expect((screen.getByRole("textbox", { name: "이메일" }) as HTMLInputElement).value).toBe("current@example.com");
  fireEvent.change(screen.getByRole("textbox", { name: "이메일" }), { target: { value: "new@example.com" } });
  expect(onChange).toHaveBeenCalledWith({ email: "new@example.com" });
  expect(screen.getByTestId("challenge").getAttribute("data-action")).toBe("mumeok_r2_recording");
  expect(screen.getByRole("checkbox", { name: "[필수] 이메일 수집·이용에 동의해요." })).toBeTruthy();
  expect(screen.queryByText(/동의하지 않아도|14세|개인정보처리방침/)).toBeNull();
  expect(screen.getByText("수집 목적과 보유 기간 보기")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "이전 신청 정보 복원" })); expect(onRestore).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "이전 신청 접수 확인" })); expect(onRetry).toHaveBeenCalledOnce();
});
