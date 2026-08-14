// @vitest-environment jsdom

import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { renderMealLogShell } from "@/tests/fixtures/meal-log-ui-harness";

describe("MEAL_LOG day-first screen", () => {
  afterEach(cleanup);

  it("replaces the placeholder with the selected-day intake surface", async () => {
    const { fetchMock } = renderMealLogShell();

    expect(await screen.findByRole("heading", { name: "8월 10일 월요일 식사 기록" }))
      .toBeTruthy();
    expect(screen.getByLabelText("식사 기록 날짜 선택")).toBeTruthy();
    expect(screen.queryByText("식사 기록은 준비 중이에요")).toBeNull();
    expect(screen.getAllByText("210 kcal").length).toBeGreaterThan(0);
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes("/meal-log?")))
      .toHaveLength(7);
  });

  it("preserves the selected entry when another day marker read fails", async () => {
    renderMealLogShell({ failDate: "2026-08-11" });

    expect(await screen.findByRole("heading", { name: "8월 10일 월요일 식사 기록" }))
      .toBeTruthy();
    expect(screen.getByText("달걀")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("날짜 표시를 확인하지 못했어요");
  });

  it("shows the contracted empty state without fake zero nutrition totals", async () => {
    renderMealLogShell({ empty: true });

    expect(await screen.findByText("이날 기록한 음식이 없어요. 끼니에서 먹은 음식을 추가해 보세요."))
      .toBeTruthy();
    expect(screen.queryByText("0 kcal")).toBeNull();
    expect(screen.queryByText(/탄수화물 0g/u)).toBeNull();
    expect(screen.queryByText(/단백질 0g/u)).toBeNull();
    expect(screen.queryByText(/지방 0g/u)).toBeNull();
  });

  it("exposes one selected date radio with roving keyboard navigation and no edge wrapping", async () => {
    const user = userEvent.setup();
    const { navigationMocks } = renderMealLogShell();

    const group = await screen.findByRole("radiogroup", { name: "식사 기록 날짜 선택" });
    const radios = screen.getAllByRole("radio");
    expect(group.contains(radios[0])).toBe(true);
    expect(radios.every((radio) => radio.parentElement?.getAttribute("role") === "none"))
      .toBe(true);
    expect(radios.filter((radio) => radio.getAttribute("aria-checked") === "true"))
      .toHaveLength(1);

    const selected = screen.getByRole("radio", { name: /8\/10 월요일 선택/u });
    expect(selected.getAttribute("aria-checked")).toBe("true");
    expect(selected.tabIndex).toBe(0);
    expect(radios.filter((radio) => radio !== selected).every((radio) => radio.tabIndex === -1))
      .toBe(true);

    selected.focus();
    await user.keyboard("{ArrowRight}");
    const next = screen.getByRole("radio", { name: /8\/11 화요일 선택/u });
    await waitFor(() => expect(next.getAttribute("aria-checked")).toBe("true"));
    expect(document.activeElement).toBe(next);

    await user.keyboard("{End}");
    const end = screen.getByRole("radio", { name: /8\/16 일요일 선택/u });
    await waitFor(() => expect(end.getAttribute("aria-checked")).toBe("true"));
    expect(document.activeElement).toBe(end);
    const callsAtEnd = navigationMocks.push.mock.calls.length;
    await user.keyboard("{ArrowRight}");
    expect(navigationMocks.push).toHaveBeenCalledTimes(callsAtEnd);
    expect(document.activeElement).toBe(end);

    await user.keyboard("{Home}");
    const start = screen.getByRole("radio", { name: /8\/10 월요일 선택/u });
    await waitFor(() => expect(start.getAttribute("aria-checked")).toBe("true"));
    expect(document.activeElement).toBe(start);
    const callsAtStart = navigationMocks.push.mock.calls.length;
    await user.keyboard("{ArrowLeft}");
    expect(navigationMocks.push).toHaveBeenCalledTimes(callsAtStart);
    expect(document.activeElement).toBe(start);

    next.focus();
    await user.keyboard(" ");
    await waitFor(() => expect(next.getAttribute("aria-checked")).toBe("true"));
    start.focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(start.getAttribute("aria-checked")).toBe("true"));
  });
});
