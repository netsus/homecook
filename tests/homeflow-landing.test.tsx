// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomeflowLanding } from "@/components/marketing/homeflow-landing";
import type { Round2SuccessData } from "@/lib/marketing-round2";

const sessionMocks = vi.hoisted(() => ({ prepare: vi.fn(), restart: vi.fn() }));

vi.mock("@/components/marketing/homeflow-landing.module.css", () => ({ default: {} }));
vi.mock("@/components/marketing/homeflow-experience.module.css", () => ({ default: {} }));
vi.mock("next/image", () => ({ default: ({ priority, unoptimized, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean; unoptimized?: boolean }) => { void priority; void unoptimized; return React.createElement("img", { ...props, alt: props.alt ?? "" }); } }));
vi.mock("@/lib/marketing/round2-session", () => ({
  prepareRound2Bootstrap: (...args: unknown[]) => sessionMocks.prepare(...args),
  restartRound2Bootstrap: (...args: unknown[]) => sessionMocks.restart(...args),
  buildRound2BootstrapRequest: () => ({ action: "bootstrap", topic: "homeflow", event_id: "22222222-2222-4222-8222-222222222222", round_version: "r2.1", honeypot: "", bootstrap_intent: "cookie_resume" }),
  confirmRound2Bootstrap: async () => true,
  markRound2ParticipationExpired: async () => true,
}));
vi.mock("@/components/marketing/marketing-turnstile", () => ({ MarketingTurnstile: ({ onControllerChange }: { onControllerChange: (controller: unknown) => void }) => {
  React.useEffect(() => { onControllerChange({ getToken: async () => ({ ok: true, token: "fixture-turnstile-token" }), reset: () => {} }); return () => onControllerChange(null); }, [onControllerChange]);
  return <div data-testid="r2-challenge" />;
} }));
const direct = { first_channel: "direct" as const, utm_source: null, utm_medium: null, utm_campaign: null, utm_content: null };
async function quiz(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "4문항 테스트하기" }));
  for (const answer of ["1~2일", "1회", "미리 정하고 머릿속에 기억", "집에 있는 재료 빼고 장보기 목록 만들기"]) {
    await user.click(await screen.findByRole("button", { name: answer }));
  }
  await screen.findByRole("heading", { name: "머릿속 플래너형" });
}
async function experience(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "무먹 체험하러 가기" }));
  await user.click(await screen.findByRole("button", { name: /요리 계획에 추가하기/ }));
  await user.click(screen.getByRole("button", { name: /장보기 목록 만들기/ }));
  for (const name of ["삼겹살", "대파", "잘 익은 김치", "즉석밥", "버터", "계란"]) { const checkbox = screen.getByRole("checkbox", { name: `${name} 구매` }) as HTMLInputElement; if (!checkbox.checked) await user.click(checkbox); }
  await user.click(screen.getByRole("button", { name: /체크하고 장보기 완료하기/ }));
  await user.click(screen.getByRole("button", { name: /요리하기/ }));
  await user.click(screen.getByRole("button", { name: "요리완료! 식단기록하기" }));
  expect(await screen.findByText("300g · 608 kcal")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: /무료 베타 초대받기/ }));
  await screen.findByRole("textbox", { name: "이메일 주소" });
}
describe("homeflow linear landing", () => {
  beforeEach(() => { window.scrollTo = vi.fn(); localStorage.clear(); window.history.replaceState({}, "", "/beta/r2/homeflow"); sessionMocks.prepare.mockReset().mockResolvedValue({ kind: "cookie_resume", topic: "homeflow", event_id: "22222222-2222-4222-8222-222222222222", bootstrap_intent: "cookie_resume" }); sessionMocks.restart.mockReset(); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  it("runs the complete preview without API requests, persistent storage or real email collection", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const user = userEvent.setup(); render(<HomeflowLanding preview pageContext={null} attribution={direct} sharedResult={null} />);
    await quiz(user); await experience(user);
    expect((screen.getByRole("textbox", { name: "이메일 주소" }) as HTMLInputElement).value).toBe("preview@example.com");
    expect(screen.queryByRole("link", { name: "개인정보 처리방침" })).toBeNull();
    expect(screen.queryByText(/만 14세/)).toBeNull();
    const disclosure = screen.getByText("수집 목적과 보유 기간 보기").closest("details") as HTMLDetailsElement;
    expect(disclosure.open).toBe(false);
    await user.click(screen.getByText("수집 목적과 보유 기간 보기"));
    expect(disclosure.open).toBe(true);
    expect(screen.getByText("2026년 11월 30일까지. 철회 시 해당 정보를 삭제해요.")).toBeTruthy();
    await user.click(screen.getByRole("checkbox", { name: /이메일 수집·이용에 동의/ }));
    await user.click(screen.getByRole("button", { name: "베타오픈 신청하기" }));
    expect(await screen.findByRole("heading", { name: "신청이 완료됐어요!" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "처음으로 돌아가기" }));
    expect(screen.getByRole("heading", { name: "베타 오픈 전 수요조사" })).toBeTruthy();
    expect(fetcher).not.toHaveBeenCalled(); expect(localStorage.length).toBe(0);
  });
  it("shows a shared result without collecting a participation or copying unrelated query into share", () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    render(<HomeflowLanding preview={false} pageContext="signed" attribution={direct} sharedResult="memo" />);
    expect(screen.getByRole("heading", { name: "알뜰 메모형" })).toBeTruthy(); expect(fetcher).not.toHaveBeenCalled();
  });
  it("opens with the compact research journey instead of a YouTube recipe", () => {
    render(<HomeflowLanding preview pageContext={null} attribution={direct} sharedResult={null} />);
    expect(screen.getByRole("heading", { name: "베타 오픈 전 수요조사" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "4문항 테스트하기" })).toBeTruthy();
    expect(screen.getByText("테스트")).toBeTruthy();
    expect(screen.getByText("무먹체험")).toBeTruthy();
    expect(screen.getByText("베타신청")).toBeTruthy();
    expect(screen.queryByAltText("추추의 한끼식사 김치볶음밥 레시피")).toBeNull();
  });
  it("lets visitors see public content while collection is off without accepting a lead", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const user = userEvent.setup(); render(<HomeflowLanding preview={false} pageContext={null} attribution={direct} sharedResult={null} />);
    await quiz(user); await experience(user);
    expect((screen.getByRole("button", { name: "베타 신청 준비 중" }) as HTMLButtonElement).disabled).toBe(true);
    expect(fetcher).not.toHaveBeenCalled(); expect(localStorage.length).toBe(0);
  });
  it("offers explicit restart instead of refreshing an expired participation forever", async () => {
    sessionMocks.prepare.mockResolvedValue({ kind: "restart_required", topic: "homeflow" });
    sessionMocks.restart.mockResolvedValue({ kind: "cookie_resume", topic: "homeflow" });
    const user = userEvent.setup(); render(<HomeflowLanding preview={false} pageContext="signed" attribution={direct} sharedResult={null} />);
    await user.click(await screen.findByRole("button", { name: "새 참여 시작" }));
    expect(sessionMocks.restart).toHaveBeenCalledWith(expect.objectContaining({ topic: "homeflow" }));
    expect(await screen.findByText("브라우저 저장을 허용한 뒤 다시 시도해 주세요.")).toBeTruthy();
  });
  it("resumes the server's completed survey after another tab wins instead of retrying forever", async () => {
    let completed = false; let submissions = 0;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, options: RequestInit) => {
      const body = JSON.parse(String(options.body));
      if (body.action === "survey_submit") { completed = true; submissions++; return { ok: false, status: 409, json: async () => ({ success: false, data: null, error: { code: "ACTIVITY_ALREADY_COMPLETED" } }) }; }
      return { ok: true, json: async () => ({ success: true, data: { round_version: "r2.1", topic: "homeflow", participation_id: "11111111-1111-4111-8111-111111111111", event_id: body.event_id, revision: completed ? 3 : 1, consent_generation: 1, state: { survey: completed ? "completed" : "started", example: "not_started", lead: "not_started" }, receipt: null, participation_expires_at: "2026-10-01T00:00:00Z", retention_until: "2026-11-30T15:00:00Z" }, error: null }) };
    }));
    const user = userEvent.setup(); render(<HomeflowLanding preview={false} pageContext="signed" attribution={direct} sharedResult={null} />);
    await user.click(screen.getByRole("button", { name: "4문항 테스트하기" }));
    for (const answer of ["1~2일", "1회", "메모·캡처로 대략 정리", "별로 불편하지 않음"]) await user.click(await screen.findByRole("button", { name: answer }));
    expect(await screen.findByRole("heading", { name: "이미 의견을 남겨주셨어요." })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "알뜰 메모형" })).toBeNull(); expect(submissions).toBe(1);
    await user.click(screen.getByRole("button", { name: "무먹 체험하러 가기" }));
    await user.click(await screen.findByRole("button", { name: "이전 화면" }));
    expect(screen.getByRole("heading", { name: "이미 의견을 남겨주셨어요." })).toBeTruthy();
  });
  it("locks an uncertain lead and reuses its exact request until the receipt is confirmed", async () => {
    const state = { survey: "not_started", example: "not_started", lead: "not_started" };
    const leads: Record<string, unknown>[] = []; let revision = 1;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, options: RequestInit) => {
      const body = JSON.parse(String(options.body));
      if (body.action === "activity_start") state[body.activity as keyof typeof state] = "started";
      if (body.action === "survey_submit") state.survey = "completed";
      if (body.action === "example_complete") state.example = "completed";
      if (body.action === "lead_submit") { state.lead = "completed"; leads.push(body); if (leads.length === 1) throw Error("response lost after commit"); }
      return { ok: true, json: async () => ({ success: true, data: { round_version: "r2.1", topic: "homeflow", participation_id: "11111111-1111-4111-8111-111111111111", event_id: body.event_id, revision: revision++, consent_generation: 1, state: { ...state }, receipt: state.lead === "completed" ? { event_id: body.event_id, status: "received" } : null, participation_expires_at: "2026-10-01T00:00:00Z", retention_until: "2026-11-30T15:00:00Z" }, error: null }) };
    }));
    const user = userEvent.setup(); render(<HomeflowLanding preview={false} pageContext="signed" attribution={direct} sharedResult={null} />);
    await quiz(user); await experience(user);
    await user.type(screen.getByRole("textbox", { name: "이메일 주소" }), "test@example.com");
    await user.click(screen.getByRole("checkbox", { name: /이메일 수집·이용에 동의/ }));
    await user.click(screen.getByRole("button", { name: "베타오픈 신청하기" })); await screen.findByRole("alert");
    expect((screen.getByRole("textbox", { name: "이메일 주소" }) as HTMLInputElement).readOnly).toBe(true);
    expect((screen.getByRole("button", { name: "식사 기록으로 돌아가기" }) as HTMLButtonElement).disabled).toBe(true);
    expect(localStorage.getItem("mumeok:homeflow:r2.2-homeflow:ui")).not.toContain("test@example.com");
    await user.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByRole("heading", { name: "신청이 완료됐어요!" })).toBeTruthy(); expect(leads).toHaveLength(2); expect(leads[0]).toEqual(leads[1]);
  });
  it("uses current consent and email when retrying a definitively failed lead", async () => {
    const state = { survey: "not_started", example: "not_started", lead: "not_started" }; let leadCalls = 0; let revision = 1; const leadEmails: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, options: RequestInit) => {
      const body = JSON.parse(String(options.body));
      if (body.action === "activity_start") state[body.activity as keyof typeof state] = "started";
      if (body.action === "survey_submit") state.survey = "completed";
      if (body.action === "example_complete") state.example = "completed";
      if (body.action === "lead_submit") { leadCalls++; leadEmails.push(body.email); return { ok: false, status: 422, json: async () => ({ success: false, data: null, error: { code: "TURNSTILE_FAILED" } }) }; }
      return { ok: true, json: async () => ({ success: true, data: { round_version: "r2.1", topic: "homeflow", participation_id: "11111111-1111-4111-8111-111111111111", event_id: body.event_id, revision: revision++, consent_generation: 1, state: { ...state }, receipt: null, participation_expires_at: "2026-10-01T00:00:00Z", retention_until: "2026-11-30T15:00:00Z" }, error: null }) };
    }));
    const user = userEvent.setup(); render(<HomeflowLanding preview={false} pageContext="signed" attribution={direct} sharedResult={null} />);
    await quiz(user); await experience(user);
    await user.type(screen.getByRole("textbox", { name: "이메일 주소" }), "test@example.com");
    await user.click(screen.getByRole("checkbox", { name: /이메일 수집·이용에 동의/ }));
    await user.click(screen.getByRole("button", { name: "베타오픈 신청하기" })); await screen.findByRole("alert");
    await user.click(screen.getByRole("checkbox", { name: /이메일 수집·이용에 동의/ }));
    await user.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect((screen.getByRole("button", { name: "다시 시도" }) as HTMLButtonElement).disabled).toBe(false));
    expect(leadCalls).toBe(1);
    await user.clear(screen.getByRole("textbox", { name: "이메일 주소" }));
    await user.type(screen.getByRole("textbox", { name: "이메일 주소" }), "updated@example.com");
    await user.click(screen.getByRole("checkbox", { name: /이메일 수집·이용에 동의/ }));
    await user.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(leadCalls).toBe(2));
    expect(leadEmails).toEqual(["test@example.com", "updated@example.com"]);
  });
  it("replays an uncertain survey request with the same event instead of claiming completion", async () => {
    const calls: Record<string, unknown>[] = [];
    const state: Round2SuccessData = { round_version: "r2.1", topic: "homeflow", participation_id: "11111111-1111-4111-8111-111111111111", event_id: "22222222-2222-4222-8222-222222222222", revision: 1, consent_generation: 1, state: { survey: "not_started", example: "not_started", lead: "not_started" }, receipt: null, participation_expires_at: "2026-10-01T00:00:00Z", retention_until: "2026-11-30T15:00:00Z" };
    let fail = true;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, options: RequestInit) => {
      const body = JSON.parse(String(options.body)); calls.push(body);
      if (body.action === "activity_start") state.state.survey = "started";
      if (body.action === "survey_submit") { if (fail) { fail = false; throw Error("network"); } state.state.survey = "completed"; }
      return { ok: true, json: async () => ({ success: true, data: { ...state, revision: ++state.revision, event_id: body.event_id, state: { ...state.state } }, error: null }) };
    }));
    const user = userEvent.setup(); render(<HomeflowLanding preview={false} pageContext="signed" attribution={direct} sharedResult={null} />);
    await user.click(screen.getByRole("button", { name: "4문항 테스트하기" }));
    for (const answer of ["1~2일", "1회", "미리 정하고 머릿속에 기억", "별로 불편하지 않음"]) await user.click(await screen.findByRole("button", { name: answer }));
    await screen.findByRole("alert"); expect(screen.queryByRole("heading", { name: "머릿속 플래너형" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "다시 시도" }));
    await screen.findByRole("heading", { name: "머릿속 플래너형" });
    await waitFor(() => expect(calls.filter(x => x.action === "survey_submit")).toHaveLength(2));
    const attempts = calls.filter(x => x.action === "survey_submit"); expect(attempts[0]).toEqual(attempts[1]);
  });
});
