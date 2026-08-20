// @vitest-environment jsdom

import { cleanup, screen } from "@testing-library/react";
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
    await user.click(screen.getByRole("button", { name: "다음 7일" }));
    expect(navigationMocks.push).toHaveBeenCalledWith(
      "/planner?segment=log&date=2026-08-17",
    );
  });
});
