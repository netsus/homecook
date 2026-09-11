// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarketingDemandValidationQuiz } from "@/components/marketing/marketing-demand-validation-quiz";

vi.mock("@/lib/api/marketing-validation", () => { throw new Error("Question presentation must not import legacy API"); });
vi.mock("@/lib/marketing/marketing-validation-client-session", () => { throw new Error("Question presentation must not import legacy storage"); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const props = { index: 0, answers: {}, locked: false, onBack: () => {}, onSelect: () => {}, presentation: "recording-entry" as const };
const choices = [["daily", "거의 매일"], ["3_5", "주 3~5일"], ["1_2", "주 1~2일"], ["none", "거의 안 함 / 안 함"]] as const;

describe("recording Q1 direct entry", () => {
  it("immediately shows the exact legacy Q1, four options and small beta context", () => {
    render(<MarketingDemandValidationQuiz {...props} />);
    expect(screen.getByText("무먹 / 베타 오픈 전 수요조사")).toBeTruthy();
    expect(screen.getByText("4문항 · 로그인 없이")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "평소 칼로리나 탄단지를 얼마나 자주 기록하나요?" })).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "1 / 4 진행" }).getAttribute("aria-valuenow")).toBe("1");
    expect(screen.getAllByRole("button").map(button => button.textContent)).toEqual(choices.map(([, label]) => label));
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByRole("button", { name: /테스트하기|유형 알아보기|이전 화면/ })).toBeNull();
  });

  it("emits no selection, start count, fetch or storage write from rendering or lifecycle events", async () => {
    const onSelect = vi.fn(); const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const storage = vi.spyOn(Storage.prototype, "setItem");
    const { rerender } = render(<MarketingDemandValidationQuiz {...props} onSelect={onSelect} />);
    await act(async () => { window.dispatchEvent(new Event("pageshow")); window.dispatchEvent(new Event("online")); });
    rerender(<MarketingDemandValidationQuiz {...props} onSelect={onSelect} />);
    expect(onSelect).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled(); expect(storage).not.toHaveBeenCalled();
  });

  it.each(choices)("delivers only the explicit q1/%s answer once, including rapid subsequent clicks", (value, label) => {
    const onSelect = vi.fn(); const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    render(<MarketingDemandValidationQuiz {...props} onSelect={onSelect} />);
    const button = screen.getByRole("button", { name: label });
    fireEvent.click(button); fireEvent.click(button);
    fireEvent.click(screen.getByRole("button", { name: choices.find(([candidate]) => candidate !== value)![1] }));
    expect(onSelect.mock.calls).toEqual([["q1", value]]);
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("1");
  });

  it("uses caller-controlled selection without automatically emitting a restored answer", () => {
    const onSelect = vi.fn();
    const { rerender } = render(<MarketingDemandValidationQuiz {...props} onSelect={onSelect} />);
    rerender(<MarketingDemandValidationQuiz {...props} answers={{ q1: "daily" }} onSelect={onSelect} />);
    expect(screen.getByRole("button", { name: "거의 매일" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "주 3~5일" }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("does not emit an answer while the caller has locked selection", () => {
    const onSelect = vi.fn(); render(<MarketingDemandValidationQuiz {...props} locked onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "거의 매일" }));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
