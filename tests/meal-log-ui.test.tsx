// @vitest-environment jsdom

import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderMealLogShell } from "@/tests/fixtures/meal-log-ui-harness";

describe("MEAL_LOG day-first screen", () => {
  afterEach(cleanup);

  it("keeps all date headings and loads only the record bodies with skeletons", () => {
    renderMealLogShell();
    expect(document.querySelectorAll("[data-planner-date]")).toHaveLength(7);
    expect(screen.getAllByRole("status").filter(node => node.getAttribute("aria-busy") === "true")).toHaveLength(7);
    expect(screen.queryByText("기록을 불러오는 중이에요.")).toBeNull();
  });
  it("does not reposition the first day after the user starts scrolling during a read", async () => {
    const previous = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
    const scroll = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scroll });
    try {
    renderMealLogShell();
    fireEvent.wheel(window, { deltaY: 200 });
    await screen.findByText("달걀");
    await act(async () => { await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
    expect(scroll).not.toHaveBeenCalled();
    } finally {
      if (previous) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", previous);
      else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
    }
  });

  it("replaces the placeholder with the selected-day intake surface", async () => {
    const { fetchMock } = renderMealLogShell();

    expect(await screen.findByRole("heading", { name: "8월 10일 월요일 식사 기록" }))
      .toBeTruthy();
    expect(screen.getByLabelText("식사 기록 날짜 선택")).toBeTruthy();
    expect(screen.queryByText("식사 기록은 준비 중이에요")).toBeNull();
    expect((await screen.findAllByText("210 kcal")).length).toBeGreaterThan(0);
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

  it("shows the empty state with the server-confirmed zero daily totals", async () => {
    renderMealLogShell({ empty: true });

    const card = within(await screen.findByRole("region", { name: "8월 10일 월요일 식사 기록" }));
    expect(await card.findByText("이날 기록한 음식이 없어요. 끼니에서 먹은 음식을 추가해 보세요.")).toBeTruthy();
    expect(card.queryByRole("region", { name: "하루 영양" })).toBeNull();
  });

  it("exposes one selected date radio with roving keyboard navigation and no edge wrapping", async () => {
    const user = userEvent.setup();
    const { historyMocks } = renderMealLogShell();

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
    const callsAtEnd = historyMocks.push.mock.calls.length;
    await user.keyboard("{ArrowRight}");
    expect(historyMocks.push).toHaveBeenCalledTimes(callsAtEnd);
    expect(document.activeElement).toBe(end);

    await user.keyboard("{Home}");
    const start = screen.getByRole("radio", { name: /8\/10 월요일 선택/u });
    await waitFor(() => expect(start.getAttribute("aria-checked")).toBe("true"));
    expect(document.activeElement).toBe(start);
    const callsAtStart = historyMocks.push.mock.calls.length;
    await user.keyboard("{ArrowLeft}");
    expect(historyMocks.push).toHaveBeenCalledTimes(callsAtStart);
    expect(document.activeElement).toBe(start);

    next.focus();
    await user.keyboard(" ");
    await waitFor(() => expect(next.getAttribute("aria-checked")).toBe("true"));
    start.focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(start.getAttribute("aria-checked")).toBe("true"));
  });

  it("updates rapid date choices without queueing server navigations or refetching the week", async () => {
    const user = userEvent.setup();
    const { historyMocks, navigationMocks, fetchMock } = renderMealLogShell();
    await screen.findByText("달걀");
    const radios = screen.getAllByRole("radio");
    radios[0].focus();
    await user.keyboard("{End}{Home}{ArrowRight}");
    expect(radios[1].getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(radios[1]);
    expect(historyMocks.push).toHaveBeenLastCalledWith(null, "", "/planner?segment=log&date=2026-08-11");
    expect(navigationMocks.push).not.toHaveBeenCalled();
    expect(navigationMocks.replace).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/meal-log?"))).toHaveLength(7);
  });
});
