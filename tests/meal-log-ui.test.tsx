// @vitest-environment jsdom

import { cleanup, screen } from "@testing-library/react";
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
});
