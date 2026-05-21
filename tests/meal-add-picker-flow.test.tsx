// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MealAddPickerFlow } from "@/components/planner/meal-add-picker-flow";
import { LeftoverPicker } from "@/components/planner/leftover-picker";
import * as leftoversApi from "@/lib/api/leftovers";

vi.mock("@/lib/api/leftovers", () => ({
  fetchLeftovers: vi.fn(),
}));

vi.mock("@/lib/api/meal", () => ({
  createMealSafe: vi.fn(),
}));

describe("MealAddPickerFlow leftover picker presentation", () => {
  beforeEach(() => {
    vi.mocked(leftoversApi.fetchLeftovers).mockReset();
    vi.mocked(leftoversApi.fetchLeftovers).mockResolvedValue({ items: [] });
  });

  afterEach(() => {
    cleanup();
  });

  it("keeps the inline meal-add flow leftover picker as a bottom sheet", async () => {
    render(
      <MealAddPickerFlow
        columnId="550e8400-e29b-41d4-a716-446655440050"
        entryMode="leftover"
        onClose={vi.fn()}
        onComplete={vi.fn()}
        planDate="2026-04-18"
        slotName="아침"
      />,
    );

    const dialog = await screen.findByRole("dialog", { name: "남은 요리에서 추가" });

    expect(dialog.getAttribute("data-app-overlay-shell")).toBe("bottom-sheet");
    expect(screen.queryByTestId("leftover-picker-screen")).toBeNull();
    expect(screen.queryByTestId("leftover-picker-web")).toBeNull();
  });

  it("renders the web leftover picker inline without creating an overlay", async () => {
    render(
      <LeftoverPicker
        isCreating={false}
        onClose={vi.fn()}
        onLeftoverSelect={vi.fn()}
        onServingsCancel={vi.fn()}
        onServingsConfirm={vi.fn()}
        presentation="web"
        selectedLeftover={null}
        slotLabel="4/18 아침"
      />,
    );

    expect(await screen.findByTestId("leftover-picker-web")).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "남은 요리에서 추가" })).toBeNull();
  });
});
