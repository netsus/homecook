// @vitest-environment jsdom
// Pure rendering/action wiring tests. This adapter fake is not API or persistence evidence.
import React, { StrictMode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { RecordingLanding } from "@/components/marketing/recording-landing";
const fake = vi.hoisted(() => ({ state: {} as Record<string, unknown>, connect: vi.fn(), selectAnswer: vi.fn(), next: vi.fn(), back: vi.fn(), retry: vi.fn(), restartLocal: vi.fn(), startTest: vi.fn(), dispose: vi.fn(), setLeadForm: vi.fn(), setTurnstileToken: vi.fn(), restoreLeadAttempt: vi.fn(), submitLead: vi.fn() }));
vi.mock("@/lib/marketing/recording-client", async importOriginal => ({ ...await importOriginal<object>(), createRecordingClient: () => ({ ...fake, getState: () => fake.state, subscribe: () => () => {} }) }));
const props = { topic: "recording" as const, pageContext: "signed-context", attribution: { utm_source: null, utm_medium: null, utm_campaign: null, utm_content: null, utm_term: null, first_channel: "unknown" as const }, preview: false, leadReady: true, turnstileSiteKey: "r2-site" };
beforeEach(() => {
  vi.clearAllMocks(); window.history.replaceState({}, "", "/beta/r2/recording?email=private&result=homecook-passer&utm_source=ig");
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  fake.state = { core: { busy: false, error: null, leadForm: { email: "", consent: false }, challengeEpoch: 0, preview: false }, screen: "quiz", question: 0, step: 1, answers: {}, result: null, shared: false, message: null };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("renders Q1 immediately and sends no answer on StrictMode mount", async () => {
  render(<StrictMode><RecordingLanding {...props} /></StrictMode>);
  expect(screen.getByRole("heading", { name: "평소 칼로리나 탄단지를 얼마나 자주 기록하나요?" })).toBeTruthy();
  expect(fake.selectAnswer).not.toHaveBeenCalled(); expect(fake.next).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "거의 매일" }));
  expect(fake.selectAnswer).toHaveBeenCalledExactlyOnceWith("q1", "daily");
  await Promise.resolve(); expect(fake.dispose).not.toHaveBeenCalled();
});
it("keeps shared result read only and sanitizes the share URL", async () => {
  fake.state = { ...fake.state, screen: "result", shared: true, result: "homecook-passer" };
  const writeText = vi.fn().mockResolvedValue(undefined); Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  render(<RecordingLanding {...props} sharedResult="homecook-passer" />);
  expect(screen.getByText("공유된 결과 · 읽기 전용")).toBeTruthy(); expect(fake.connect).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "내 결과 공유하기" }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${location.origin}/beta/r2/recording?result=homecook-passer`));
  fireEvent.click(screen.getByRole("button", { name: "나도 테스트하기" })); expect(fake.startTest).toHaveBeenCalledOnce();
});
it("shows an honest already-completed fallback without guessing a result", () => {
  fake.state = { ...fake.state, screen: "returning" };
  render(<RecordingLanding {...props} />);
  expect(screen.getByRole("heading", { name: "이미 의견을 남겨주셨어요" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "체험 이어가기" })); expect(fake.next).toHaveBeenCalledOnce();
});
it("preserves failed Q1 selection and exposes explicit retry", () => {
  fake.state = { ...fake.state, core: { ...(fake.state.core as object), error: { message: "연결을 확인해 주세요." } }, answers: { q1: "daily" }, message: "연결을 확인해 주세요." };
  render(<RecordingLanding {...props} />);
  expect(screen.getByRole("button", { name: "거의 매일" }).getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" })); expect(fake.retry).toHaveBeenCalledOnce();
});
it("does not lock preview answers because of an informational notice", () => {
  fake.state = { ...fake.state, message: "로컬 미리보기예요. 실제 응답이나 신청은 저장되지 않아요." };
  render(<RecordingLanding {...props} preview />);
  expect((screen.getByRole("button", { name: "거의 매일" }) as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "거의 매일" })); expect(fake.selectAnswer).toHaveBeenCalledExactlyOnceWith("q1", "daily");
});
it("never presents an actual receipt or lead form in local preview", () => {
  fake.state = { ...fake.state, screen: "done" };
  render(<RecordingLanding {...props} preview />);
  expect(screen.queryByText("신청이 완료됐어요!")).toBeNull();
  expect(screen.queryByRole("textbox", { name: "이메일" })).toBeNull();
  expect(screen.getByRole("heading", { name: "체험 예시를 모두 확인했어요" })).toBeTruthy();
});
it("keeps the failed Q1 heading above its selected answer in a real 320px CSS viewport", async () => {
  fake.state = { ...fake.state, core: { ...(fake.state.core as object), error: { message: "저장 결과를 확인하지 못했어요. 연결을 확인한 뒤 같은 요청을 다시 시도해 주세요." } }, answers: { q1: "daily" } };
  const { container } = render(<RecordingLanding {...props} />);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 568 } });
    await page.route("**/*", route => route.abort());
    await page.setContent(`<style>${await readFile("app/globals.css", "utf8")}</style>${container.innerHTML}`, { waitUntil: "domcontentloaded" });
    const bounds = await page.evaluate(() => {
      const heading = document.querySelector("h2")!.getBoundingClientRect();
      const answer = document.querySelector(".choice-button")!.getBoundingClientRect();
      const retry = document.querySelector('[role="alert"] button')!.getBoundingClientRect();
      return { headingBottom: heading.bottom, answerTop: answer.top, retryBottom: retry.bottom, height: innerHeight };
    });
    expect(bounds.headingBottom).toBeLessThanOrEqual(bounds.answerTop);
    expect(bounds.retryBottom).toBeLessThanOrEqual(bounds.height);
  } finally { await browser.close(); }
}, 15000);
