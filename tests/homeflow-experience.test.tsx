// @vitest-environment jsdom
import React, { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomeflowExperience } from "@/components/marketing/homeflow-experience";
import { INITIAL_HOMEFLOW_DEMO, type HomeflowDemoState } from "@/lib/marketing/homeflow-content";
vi.mock("@/components/marketing/homeflow-experience.module.css", () => ({ default: new Proxy({}, { get: (_target, key) => String(key) }) }));
afterEach(() => { cleanup(); vi.useRealTimers(); });
function Demo({ step = 3, initial = INITIAL_HOMEFLOW_DEMO, onNext = vi.fn() }: {
    step?: 1 | 2 | 3 | 4 | 5 | 6;
    initial?: HomeflowDemoState;
    onNext?: () => void;
}) {
    const [demo, onDemoChange] = useState(initial);
    return <><HomeflowExperience step={step} demo={demo} onDemoChange={onDemoChange} onNext={onNext} onBack={vi.fn()}/><output data-testid="state">{JSON.stringify(demo)}</output></>;
}
describe("homeflow interactive experience", () => {
    it("reveals the unweighted egg without restoring redundant recipe headings", () => {
        render(<Demo step={1}/>);
        expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
        expect(screen.getByRole("heading", { name: "유튜브에서 레시피를 가져왔어요" })).toBeTruthy();
        expect(screen.queryByText("계란후라이")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "외 4가지 재료" }));
        expect(screen.getByText("계란후라이")).toBeTruthy();
        expect(screen.getByText("1개")).toBeTruthy();
    });
    it("requires an actual purchase selection and removes its check when moved to pantry exclusion", () => {
        const onNext = vi.fn();
        render(<Demo onNext={onNext} initial={{...INITIAL_HOMEFLOW_DEMO, purchased: []}}/>);
        const next = screen.getByRole("button", { name: "체크하고 장보기 완료하기" });
        expect((next as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(screen.getByRole("checkbox", { name: "삼겹살 구매" }));
        expect((next as HTMLButtonElement).disabled).toBe(false);
        fireEvent.click(screen.getByRole("button", { name: "삼겹살 집에 있어요" }));
        expect((next as HTMLButtonElement).disabled).toBe(true);
        expect(screen.queryByRole("checkbox", { name: "삼겹살 구매" })).toBeNull();
        expect(JSON.parse(screen.getByTestId("state").textContent!).purchased).toEqual([]);
        fireEvent.click(screen.getByRole("button", { name: "삼겹살 구매 목록으로 이동" }));
        expect((screen.getByRole("checkbox", { name: "삼겹살 구매" }) as HTMLInputElement).checked).toBe(false);
        fireEvent.click(next);
        expect(onNext).not.toHaveBeenCalled();
    });
    it("freezes purchases after completion even when returning to the shopping screen", () => {
        const initial = { ...INITIAL_HOMEFLOW_DEMO, purchased: ["pork"], shoppingCompleted: true };
        render(<Demo initial={initial}/>);
        expect((screen.getByRole("checkbox", { name: "삼겹살 구매" }) as HTMLInputElement).disabled).toBe(true);
        fireEvent.click(screen.getByRole("button", { name: "삼겹살 집에 있어요" }));
        expect(JSON.parse(screen.getByTestId("state").textContent!)).toEqual(initial);
        expect(screen.getByRole("button", { name: "팬트리 확인하기" })).toBeTruthy();
    });
    it("returns to the planner with a temporary pantry completion notice", () => {
        vi.useFakeTimers();
        render(<Demo step={4} initial={{...INITIAL_HOMEFLOW_DEMO, shoppingCompleted: true}}/>);
        expect(screen.getByText("✓ 구매한 재료를 팬트리에 추가했어요")).toBeTruthy();
        expect(screen.getByText("토요일 · 9/12")).toBeTruthy();
        expect(screen.getByText("지금 요리할 메뉴")).toBeTruthy();
        expect(screen.getByRole("button", {name:"김치볶음밥 요리하기"})).toBeTruthy();
        expect(screen.getByText("일요일 · 9/13")).toBeTruthy();
        expect(screen.queryByRole("list", {name:/팬트리에 추가된 재료/})).toBeNull();
        act(() => vi.advanceTimersByTime(2400));
        expect(screen.queryByText("✓ 구매한 재료를 팬트리에 추가했어요")).toBeNull();
        vi.useRealTimers();
    });
    it("shows all three meal slots per day with compact square add controls", () => {
        render(<Demo step={2}/>);
        expect(screen.getAllByText("아침")).toHaveLength(2);
        expect(screen.getAllByText("점심")).toHaveLength(2);
        expect(screen.getAllByText("저녁")).toHaveLength(2);
        expect(screen.getByRole("button", {name:"토요일 아침 요리 추가"})).toBeTruthy();
        expect(screen.getByText("장보기 완료")).toBeTruthy();
    });
    it("waits for the food image and starts the new planned meal after a brief pause", async () => {
        vi.useFakeTimers();
        render(<Demo step={2}/>);
        expect(screen.getByRole("heading", {name:"요리계획"})).toBeTruthy();
        const image = screen.getByRole("img", {name:"김치볶음밥"});
        const row = image.closest("[data-entry-phase]")!;
        expect(row.getAttribute("data-entry-phase")).toBe("waiting");
        await act(async () => { fireEvent.load(image); });
        act(() => vi.advanceTimersByTime(300));
        expect(row.getAttribute("data-entry-phase")).toBe("waiting");
        act(() => vi.advanceTimersByTime(150));
        expect(row.getAttribute("data-entry-phase")).toBe("entering");
        act(() => vi.advanceTimersByTime(900));
        expect(row.getAttribute("data-entry-phase")).toBe("complete");
    });
    it("confirms the 300g record through the cooking action and shows no invented heat or timer", () => {
        const onNext = vi.fn();
        render(<Demo step={5} onNext={onNext}/>);
        expect(screen.getAllByRole("img")).toHaveLength(1);
        expect(screen.getByText("구성 예시")).toBeTruthy();
        expect(screen.queryByText(/중불|약불|분 타이머/)).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "요리완료! 식단기록하기" }));
        expect(JSON.parse(screen.getByTestId("state").textContent!).recorded).toBe(true);
        expect(onNext).toHaveBeenCalledTimes(1);
    });
    it("counts from existing meals to the provided totals while the 300g meal appears", async () => {
        vi.useFakeTimers();
        render(<Demo step={6} initial={{ ...INITIAL_HOMEFLOW_DEMO, recorded: true }}/>);
        expect(screen.getByText("250g · 420 kcal")).toBeTruthy();
        expect(screen.getByText("400g · 700 kcal")).toBeTruthy();
        expect(screen.getByText("300g · 608 kcal")).toBeTruthy();
        expect(screen.getByRole("button", {name:"무료 베타 초대받기"})).toBeTruthy();
        expect(screen.queryByText(/남은 음식|절반 보관|6 \/ 5/)).toBeNull();
        expect(screen.getByText("1,120")).toBeTruthy();
        const image = screen.getByRole("img", {name:"김치볶음밥"});
        await act(async () => { fireEvent.load(image); });
        act(() => vi.advanceTimersByTime(450));
        act(() => vi.advanceTimersByTime(600));
        const number = screen.getByLabelText("칼로리 1,728 kcal").querySelector("b")!;
        expect(Number(number.textContent!.replace(",", ""))).toBeGreaterThan(1120);
        expect(Number(number.textContent!.replace(",", ""))).toBeLessThan(1728);
        act(() => vi.advanceTimersByTime(800));
        expect(image.closest("[data-entry-phase]")!.getAttribute("data-entry-phase")).toBe("complete");
        expect(screen.getByText("1,728")).toBeTruthy();
        expect(screen.getByText("202")).toBeTruthy();
        expect(screen.getByText("97")).toBeTruthy();
        expect(screen.getByText("70")).toBeTruthy();
        expect(screen.getByText("영양정보 · 체험 예시")).toBeTruthy();
        expect(screen.queryByText(/600g|추정|약 608/)).toBeNull();
        expect(screen.getByText("김치볶음밥 300g의 영양정보를 반영했어요.")).toBeTruthy();
    });
});
