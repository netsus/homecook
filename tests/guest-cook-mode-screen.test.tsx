// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GuestCookModeScreen } from "@/components/cooking/guest-cook-mode-screen";
import type { CookingStandaloneCookModeData } from "@/types/cooking";

const mocks = vi.hoisted(() => ({ read: vi.fn(), back: vi.fn() }));
// Browser checks cover responsive CSS; these tests exercise view behavior.
vi.mock("@/components/cooking/cook-mode-layout.module.css", () => ({ default: {} }));
vi.mock("@/lib/api/cooking", () => ({ fetchStandaloneCookMode: mocks.read }));
vi.mock("@/components/shared/use-app-return", () => ({ useAppReturn: () => ({ goBack: mocks.back, href: "/recipe/public-recipe" }) }));
const source: CookingStandaloneCookModeData = { recipe: {
  id: "public-recipe", title: "공개 요리", cooking_servings: 2,
  ingredients: [
    { ingredient_id: "rice", standard_name: "쌀", amount: 100, unit: "g", display_text: "쌀 100g", ingredient_type: "QUANT", scalable: true },
    { ingredient_id: "salt", standard_name: "소금", amount: null, unit: null, display_text: "소금 적당량", ingredient_type: "TO_TASTE", scalable: false },
  ], steps: [],
} };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.read.mockReset().mockResolvedValue(structuredClone(source));
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected guest request"); }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("edits fractions and compatible units inline in memory, then completes without account writes", async () => {
  render(<GuestCookModeScreen recipeId="public-recipe" servings={2} />);
  await userEvent.click(await screen.findByRole("button", { name: "쌀 수량 수정" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  await userEvent.clear(screen.getByRole("textbox", { name: "쌀 양" }));
  await userEvent.type(screen.getByRole("textbox", { name: "쌀 양" }), "1/3");
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "쌀 단위" }), "kg");
  expect(Number((screen.getByRole("textbox", { name: "쌀 양" }) as HTMLInputElement).value)).toBeCloseTo(1 / 3000, 10);
  await userEvent.click(screen.getByRole("button", { name: "저장" }));
  await userEvent.click(await screen.findByRole("button", { name: "쌀 수량 수정" }));
  await userEvent.clear(screen.getByRole("textbox", { name: "쌀 양" }));
  await userEvent.type(screen.getByRole("textbox", { name: "쌀 양" }), "1/2");
  await userEvent.click(screen.getByRole("button", { name: "저장" }));
  expect((await screen.findByRole("button", { name: "쌀 수량 수정" })).textContent).toBe("1/2kg");
  expect(screen.getByRole("button", { name: "소금 수량 수정" }).textContent).toBe("적당량");
  await userEvent.click(screen.getByRole("button", { name: "요리 완료" }));
  expect(screen.getByRole("status").textContent).toContain("계정에 저장되지 않았어요");
  expect(screen.getByRole("link", { name: "로그인하고 기록 시작하기" }).getAttribute("href")).toBe("/login?next=%2Frecipe%2Fpublic-recipe");
  expect(screen.getByRole("link", { name: "돌아가기" }).getAttribute("href")).toBe("/recipe/public-recipe");
  expect(screen.queryByRole("link", { name: "식사 기록하기" })).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
  expect(source.recipe.ingredients[0].amount).toBe(100);
  expect(source.recipe.ingredients[0].display_text).toBe("쌀 100g");
});

it("resets local edits on remount and cancels through the return context without a write", async () => {
  const view = render(<GuestCookModeScreen recipeId="public-recipe" servings={2} />);
  await userEvent.click(await screen.findByRole("button", { name: "쌀 수량 수정" }));
  await userEvent.clear(screen.getByRole("textbox", { name: "쌀 양" }));
  await userEvent.type(screen.getByRole("textbox", { name: "쌀 양" }), "200");
  await userEvent.click(screen.getByRole("button", { name: "저장" }));
  expect((await screen.findByRole("button", { name: "쌀 수량 수정" })).textContent).toBe("200g");
  view.unmount();
  render(<GuestCookModeScreen recipeId="public-recipe" servings={2} />);
  expect((await screen.findByRole("button", { name: "쌀 수량 수정" })).textContent).toBe("100g");
  await userEvent.click(screen.getByRole("button", { name: "취소" }));
  expect(mocks.back).toHaveBeenCalledTimes(1);
  expect(fetch).not.toHaveBeenCalled();
});

it("keeps an inaccessible public read as an error and retries only that read", async () => {
  mocks.read.mockRejectedValueOnce(new Error("레시피를 찾을 수 없어요."));
  render(<GuestCookModeScreen recipeId="public-recipe" servings={2} />);
  expect((await screen.findByRole("alert")).textContent).toBe("레시피를 찾을 수 없어요.");
  expect(screen.queryByRole("button", { name: "요리 완료" })).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  expect(await screen.findByRole("heading", { name: "공개 요리" })).toBeTruthy();
  await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(2));
  expect(fetch).not.toHaveBeenCalled();
});
