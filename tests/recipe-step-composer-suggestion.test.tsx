// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecipeEditorStepComposer } from "@/components/recipe/personal-recipe-editor-shell";

afterEach(cleanup);
const methods = [
  { id: "stir", code: "stir_fry", label: "볶기", color_key: "orange", is_system: true },
  { id: "boil", code: "boil", label: "끓이기", color_key: "red", is_system: true },
];

describe("step composer automatic method selection", () => {
  it("suggests from text but keeps a manual selection until the step is added", async () => {
    const user = userEvent.setup(); const onAdd = vi.fn();
    render(<RecipeEditorStepComposer cookingMethods={methods} nextStepNumber={1} onAdd={onAdd} />);
    const input = screen.getByLabelText("만들기 1 설명");
    await user.type(input, "양파를 볶아요");
    expect(screen.getByRole("button", { name: "볶기" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("볶기 자동 선택")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "끓이기" }));
    await user.type(input, " 노릇하게 볶아요");
    expect(screen.getByRole("button", { name: "끓이기" }).getAttribute("aria-pressed")).toBe("true");
    await user.click(screen.getByRole("button", { name: "+ 만들기 추가" }));
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ cooking_method: methods[1] }));
    await user.type(input, "다시 볶아요");
    expect(screen.getByRole("button", { name: "볶기" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("clears an automatic suggestion when the edited sentence becomes negative", async () => {
    const user = userEvent.setup(); const onAdd = vi.fn();
    render(<RecipeEditorStepComposer cookingMethods={methods} nextStepNumber={1} onAdd={onAdd} />);
    const input = screen.getByLabelText("만들기 1 설명");
    await user.type(input, "볶아요");
    await user.clear(input); await user.type(input, "볶지 마세요");
    expect(screen.getByRole("button", { name: "볶기" }).getAttribute("aria-pressed")).toBe("false");
    await user.click(screen.getByRole("button", { name: "+ 만들기 추가" }));
    expect(screen.getByText("조리법을 선택해 주세요.")).toBeTruthy();
    expect(onAdd).not.toHaveBeenCalled();
  });
});
