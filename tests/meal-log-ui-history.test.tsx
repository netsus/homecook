// @vitest-environment jsdom

import { cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { renderMealLogShell } from "@/tests/fixtures/meal-log-ui-harness";

describe("MEAL_LOG deleted-column history", () => {
  afterEach(cleanup);

  it("keeps history visible but never exposes a deleted column as a new target", async () => {
    renderMealLogShell();

    expect(await screen.findByRole("heading", { name: /삭제된 끼니의 기록 · 간식/u }))
      .toBeTruthy();
    expect(screen.queryByRole("button", { name: "삭제된 끼니에 음식 추가" }))
      .toBeNull();
  });

  it("moves by exactly seven days through the existing Planner history helper", async () => {
    const user = userEvent.setup();
    const { navigationMocks } = renderMealLogShell();
    const rail = screen.getByTestId("meal-log-week-date-rail");
    rail.focus();
    await user.keyboard("{PageDown}");
    expect(navigationMocks.push).toHaveBeenCalledWith(
      "/planner?segment=log&date=2026-08-17",
      { scroll: false },
    );
  });
  it("swipes a week once without making adjacent duplicate dates keyboard targets", async () => {
    const { navigationMocks } = renderMealLogShell();
    const rail=screen.getByTestId("meal-log-week-date-rail");
    Object.defineProperty(rail,"clientWidth",{configurable:true,value:320});
    expect(screen.getAllByRole("radio")).toHaveLength(7);
    rail.scrollLeft=640;
    fireEvent.scroll(rail);
    await waitFor(()=>expect(navigationMocks.push).toHaveBeenCalledWith("/planner?segment=log&date=2026-08-17",{scroll:false}));
    expect(rail.scrollLeft).toBe(320);
  });
  it("jumps directly to last month using the calendar control", async () => {
    const { navigationMocks } = renderMealLogShell();
    fireEvent.click(screen.getByRole("button",{name:"달력에서 날짜 선택"}));
    fireEvent.click(screen.getByRole("button",{name:"이전 달"}));
    fireEvent.click(screen.getByRole("button",{name:"2026년 7월 10일"}));
    await waitFor(()=>expect(navigationMocks.push).toHaveBeenCalledWith("/planner?segment=log&date=2026-07-10",{scroll:false}));
  });
  it("preserves focus for repeated keyboard week movement from a selected date", async () => {
    renderMealLogShell();
    const selected=await screen.findByRole("radio",{name:/8\/10 월요일 선택/});
    selected.focus();
    fireEvent.keyDown(selected,{key:"PageDown"});
    await waitFor(()=>expect(document.activeElement).toBe(screen.getByTestId("meal-log-week-date-rail")));
  });

});
