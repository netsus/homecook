import { beforeEach, describe, expect, it, vi } from "vitest";

const cookingApi = vi.hoisted(() => ({
  completeCookingSession: vi.fn(),
  completeStandaloneCooking: vi.fn(),
  fetchCookMode: vi.fn(),
  fetchStandaloneCookMode: vi.fn(),
  isCookingApiError: (error: unknown) =>
    error instanceof Error && "status" in error && "code" in error,
}));

vi.mock("@/lib/api/cooking", () => cookingApi);

import {
  resetCookModeStore,
  useCookModeStore,
} from "@/stores/cook-mode-store";
import {
  resetStandaloneCookModeStore,
  useStandaloneCookModeStore,
} from "@/stores/standalone-cook-mode-store";

describe("legacy cooking completion attempt keys", () => {
  beforeEach(() => {
    cookingApi.completeCookingSession.mockReset();
    cookingApi.completeStandaloneCooking.mockReset();
    resetCookModeStore();
    resetStandaloneCookModeStore();
  });

  it("reuses the planner completion key for the same payload after a retryable failure", async () => {
    cookingApi.completeCookingSession
      .mockRejectedValueOnce(new Error("network failed"))
      .mockResolvedValueOnce({ status: "completed" });
    useCookModeStore.setState({ sessionId: "session-1", screenState: "ready" });

    await useCookModeStore.getState().complete(["ingredient-1"]);
    await useCookModeStore.getState().complete(["ingredient-1"]);

    expect(cookingApi.completeCookingSession).toHaveBeenCalledTimes(2);
    const firstKey = cookingApi.completeCookingSession.mock.calls[0]?.[2];
    const secondKey = cookingApi.completeCookingSession.mock.calls[1]?.[2];
    expect(firstKey).toMatch(/^[0-9a-f-]{36}$/i);
    expect(secondKey).toBe(firstKey);
  });

  it("reuses the standalone completion key for the same payload after a retryable failure", async () => {
    cookingApi.completeStandaloneCooking
      .mockRejectedValueOnce(new Error("network failed"))
      .mockResolvedValueOnce({ leftover_dish_id: "leftover-1" });
    useStandaloneCookModeStore.setState({
      recipeId: "recipe-1",
      servings: 2,
      screenState: "ready",
    });

    await useStandaloneCookModeStore.getState().complete(["ingredient-1"]);
    await useStandaloneCookModeStore.getState().complete(["ingredient-1"]);

    expect(cookingApi.completeStandaloneCooking).toHaveBeenCalledTimes(2);
    const firstKey = cookingApi.completeStandaloneCooking.mock.calls[0]?.[1];
    const secondKey = cookingApi.completeStandaloneCooking.mock.calls[1]?.[1];
    expect(firstKey).toMatch(/^[0-9a-f-]{36}$/i);
    expect(secondKey).toBe(firstKey);
  });

  it("rotates the planner completion key when the canonical payload changes", async () => {
    cookingApi.completeCookingSession.mockRejectedValue(new Error("network failed"));
    useCookModeStore.setState({ sessionId: "session-1", screenState: "ready" });

    await useCookModeStore.getState().complete(["ingredient-1"]);
    await useCookModeStore.getState().complete(["ingredient-2"]);

    expect(cookingApi.completeCookingSession.mock.calls[1]?.[2])
      .not.toBe(cookingApi.completeCookingSession.mock.calls[0]?.[2]);
  });

  it("rotates the standalone completion key when the canonical payload changes", async () => {
    cookingApi.completeStandaloneCooking.mockRejectedValue(new Error("network failed"));
    useStandaloneCookModeStore.setState({
      recipeId: "recipe-1",
      servings: 2,
      screenState: "ready",
    });

    await useStandaloneCookModeStore.getState().complete(["ingredient-1"]);
    await useStandaloneCookModeStore.getState().complete(["ingredient-2"]);

    expect(cookingApi.completeStandaloneCooking.mock.calls[1]?.[1])
      .not.toBe(cookingApi.completeStandaloneCooking.mock.calls[0]?.[1]);
  });
});
