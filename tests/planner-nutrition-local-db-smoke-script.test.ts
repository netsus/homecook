import { describe, expect, it, vi } from "vitest";

import {
  isPlannerNutritionSummarySettled,
  waitForPlannerNutritionSummarySettled,
} from "../scripts/verify-planner-nutrition-local-db.mjs";

describe("planner nutrition local DB smoke script", () => {
  it("distinguishes the transient loading copy from settled unavailable content", () => {
    expect(isPlannerNutritionSummarySettled("계획 영양 불러오는 중")).toBe(false);
    expect(isPlannerNutritionSummarySettled("계획 영양 정보 준비 중")).toBe(true);
  });

  it("waits for the visible summary to leave loading state before returning its text", async () => {
    const waitFor = vi.fn().mockResolvedValue(undefined);
    const textContent = vi
      .fn()
      .mockResolvedValueOnce("계획 영양 불러오는 중")
      .mockResolvedValueOnce("계획 영양 불러오는 중")
      .mockResolvedValueOnce("계획 영양 정보 준비 중");

    const settledText = await waitForPlannerNutritionSummarySettled(
      { textContent, waitFor },
      { pollIntervalMs: 0, timeoutMs: 100 },
    );

    expect(waitFor).toHaveBeenCalledWith({ state: "visible" });
    expect(textContent).toHaveBeenCalledTimes(3);
    expect(settledText).toBe("계획 영양 정보 준비 중");
  });
});
