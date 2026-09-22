// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SnapshotV2CookModeScreen } from "@/components/cooking/snapshot-v2-cook-mode-screen";
import { SnapshotV2CookModeView } from "@/components/cooking/snapshot-v2-cook-mode-view";
import { getCookingSessionCookModeHref } from "@/lib/cooking/session-version-dispatch";

const cookingApi = vi.hoisted(() => ({
  cancelSnapshotV2CookingSession: vi.fn(),
  fetchSnapshotV2CookMode: vi.fn(),
}));

const navigation = vi.hoisted(() => ({ query: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(navigation.query),
}));

vi.mock("@/lib/api/cooking", () => ({
  cancelSnapshotV2CookingSession: cookingApi.cancelSnapshotV2CookingSession,
  fetchSnapshotV2CookMode: cookingApi.fetchSnapshotV2CookMode,
  isCookingApiError: (error: unknown) => typeof error === "object" && error !== null && "status" in error,
}));

const immutableSnapshot = {
  session_id: "snapshot-retry",
  contract_version: "snapshot_v2" as const,
  mode: "standalone" as const,
  status: "in_progress" as const,
  recipe: {
    id: "recipe-retry",
    title: "고정된 된장찌개",
    cooking_servings: 2,
    ingredients: [{
      ingredient_id: "ingredient-1",
      standard_name: "된장",
      amount: 2,
      unit: "큰술",
      display_text: "된장 2큰술",
      ingredient_type: "QUANT" as const,
      scalable: true,
    }],
    steps: [{
      step_number: 1,
      instruction: "재료를 넣고 끓여요.",
      cooking_method: { code: "BOIL", label: "끓이기", color_key: "orange" },
      ingredients_used: [],
      heat_level: "medium",
      duration_seconds: 600,
      duration_text: "10분",
    }],
  },
  pantry_candidates: [],
};

describe("cooking session version dispatch", () => {
  beforeEach(() => {
    navigation.query = "";
    cookingApi.cancelSnapshotV2CookingSession.mockReset();
    cookingApi.fetchSnapshotV2CookMode.mockReset();
    cookingApi.fetchSnapshotV2CookMode.mockReturnValue(new Promise(() => undefined));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("routes only from an explicit contract version", () => {
    expect(getCookingSessionCookModeHref({ session_id: "legacy", contract_version: "legacy_v1" })).toBe("/cooking/sessions/legacy/cook-mode");
    expect(getCookingSessionCookModeHref({ session_id: "snapshot", contract_version: "snapshot_v2" })).toBe("/cooking/session-attempts/snapshot/cook-mode");
    expect(() => getCookingSessionCookModeHref({ session_id: "guess" } as never)).toThrow(/contract_version/);
  });

  it("renders terminal snapshot sessions read-only without legacy fallback actions", () => {
    render(<SnapshotV2CookModeView data={{ session_id: "s", contract_version: "snapshot_v2", mode: "planner", status: "completed", recipe: { id: "r", title: "고정된 김치찌개", cooking_servings: 2, ingredients: [{ ingredient_id: "ingredient-1", standard_name: "김치", amount: 200, unit: "g", display_text: "김치 200g", ingredient_type: "QUANT", scalable: true }], steps: [{ step_number: 1, instruction: "김치를 냄비에 넣고 끓여요.", cooking_method: { code: "BOIL", label: "끓이기", color_key: "orange" }, ingredients_used: [], heat_level: "medium", duration_seconds: 600, duration_text: "10분" }] }, pantry_candidates: [] }} onCancel={() => undefined} />);
    expect(screen.getByTestId("snapshot-v2-cook-mode").classList.contains("cook-mobile-whole-screen")).toBe(true);
    expect(screen.getByText("고정된 김치찌개")).toBeTruthy();
    expect(screen.getByText("김치")).toBeTruthy();
    expect(screen.getByText("김치를 냄비에 넣고 끓여요.")).toBeTruthy();
    expect(screen.getByText(/완료된 요리 기록/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "요리 완료" })).toBeNull();
    expect(screen.queryByRole("button", { name: "취소" })).toBeNull();
    expect(screen.getByRole("link", { name: "먹은 음식 기록하기" }).getAttribute("href")).toBe("/planner?segment=log");
    expect(screen.getByRole("link", { name: "남은요리 보기" }).getAttribute("href")).toBe("/leftovers");
    expect(screen.getByRole("link", { name: "돌아가기" }).getAttribute("href")).toBe("/planner");
  });

  it("offers the originating meal after cancellation without creating a food record", async () => {
    const returnTo = "/planner/2026-09-22/dinner?slot=저녁";
    navigation.query = new URLSearchParams({ returnTo }).toString();
    cookingApi.fetchSnapshotV2CookMode.mockResolvedValue({ ...immutableSnapshot, mode: "planner" });
    cookingApi.cancelSnapshotV2CookingSession.mockResolvedValue({ status: "cancelled" });
    render(<SnapshotV2CookModeScreen initialAuthenticated sessionId="snapshot-retry" />);

    await userEvent.click(await screen.findByRole("button", { name: "취소" }));

    const back = await screen.findByRole("link", { name: "돌아가기" });
    expect(decodeURI(back.getAttribute("href")!)).toBe(returnTo);
    expect(screen.queryByRole("link", { name: "먹은 음식 기록하기" })).toBeNull();
    expect(screen.queryByRole("button", { name: "요리 완료" })).toBeNull();
    expect(screen.queryByRole("button", { name: "취소" })).toBeNull();
    expect(cookingApi.cancelSnapshotV2CookingSession).toHaveBeenCalledTimes(1);
  });

  it("returns directly opened completed standalone sessions to their recipe and rejects external return paths", async () => {
    navigation.query = new URLSearchParams({ returnTo: "https://example.com" }).toString();
    cookingApi.fetchSnapshotV2CookMode.mockResolvedValue({ ...immutableSnapshot, status: "completed" });
    render(<SnapshotV2CookModeScreen initialAuthenticated sessionId="snapshot-retry" />);

    expect((await screen.findByRole("link", { name: "돌아가기" })).getAttribute("href")).toBe("/recipe/recipe-retry");
    expect(screen.queryByRole("button", { name: "요리 완료" })).toBeNull();
    expect(cookingApi.cancelSnapshotV2CookingSession).not.toHaveBeenCalled();
  });

  it("keeps snapshot loading inside the existing whole-board geometry", () => {
    render(<SnapshotV2CookModeScreen initialAuthenticated sessionId="snapshot-pending" />);
    expect(screen.getByTestId("snapshot-v2-cook-mode-loading")).toBeTruthy();
    expect(screen.getByTestId("snapshot-v2-cook-mode-loading").querySelector(".cook-whole-board-mobile")).toBeTruthy();
  });

  it("retries only the same immutable snapshot reader and offers a safe previous action", async () => {
    const historyBack = vi.spyOn(window.history, "back").mockImplementation(() => undefined);
    cookingApi.fetchSnapshotV2CookMode
      .mockRejectedValueOnce(Object.assign(new Error("read failed"), { status: 500 }))
      .mockResolvedValueOnce(immutableSnapshot);

    render(<SnapshotV2CookModeScreen initialAuthenticated sessionId="snapshot-retry" />);

    const errorShell = await screen.findByRole("alert");
    expect(errorShell.classList.contains("cook-mobile-whole-screen")).toBe(true);
    const retry = screen.getByRole("button", { name: "다시 시도" });
    const previous = screen.getByRole("button", { name: "이전 화면" });
    await waitFor(() => expect(document.activeElement).toBe(retry));
    expect(retry.className).toMatch(/min-h-11|min-h-12/);
    expect(previous.className).toMatch(/min-h-11|min-h-12/);

    await userEvent.click(previous);
    expect(historyBack).toHaveBeenCalledTimes(1);
    await userEvent.click(retry);

    expect(cookingApi.fetchSnapshotV2CookMode).toHaveBeenNthCalledWith(1, "snapshot-retry");
    expect(cookingApi.fetchSnapshotV2CookMode).toHaveBeenNthCalledWith(2, "snapshot-retry");
    expect(await screen.findByTestId("snapshot-v2-cook-mode")).toBeTruthy();
  });

  it("uses the existing login next-path primitive for unauthorized snapshot reads", async () => {
    cookingApi.fetchSnapshotV2CookMode.mockRejectedValueOnce(
      Object.assign(new Error("login required"), { status: 401 }),
    );

    render(<SnapshotV2CookModeScreen initialAuthenticated sessionId="snapshot-private" />);

    const unauthorizedShell = await screen.findByRole("alert");
    expect(unauthorizedShell.classList.contains("cook-mobile-whole-screen")).toBe(true);
    const login = screen.getByRole("link", { name: "로그인" });
    const previous = screen.getByRole("button", { name: "이전 화면" });
    await waitFor(() => expect(document.activeElement).toBe(login));
    expect(login.getAttribute("href")).toBe(
      "/login?next=%2Fcooking%2Fsession-attempts%2Fsnapshot-private%2Fcook-mode",
    );
    expect(login.className).toMatch(/min-h-11|min-h-12/);
    expect(previous.className).toMatch(/min-h-11|min-h-12/);
    expect(cookingApi.fetchSnapshotV2CookMode).toHaveBeenCalledTimes(1);
  });
});
