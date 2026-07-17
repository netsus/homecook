// @vitest-environment jsdom

import React from "react";
import { cleanup, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MealNutritionSummary,
  PlannerWeekNutritionSummary,
} from "@/components/planner/planner-nutrition-summary";
import { usePlannerNutritionSummary } from "@/components/planner/use-planner-nutrition-summary";
import {
  formatPlannerNutritionEnergy,
  formatPlannerNutritionValue,
} from "@/lib/planner/planner-nutrition-presentation";
import type {
  PlannerNutritionAggregate,
  PlannerNutritionData,
  PlannerNutritionValue,
} from "@/types/planner-nutrition";

const fetchPlannerNutrition = vi.fn();

vi.mock("@/lib/api/planner-nutrition", () => ({
  fetchPlannerNutrition: (...args: unknown[]) => fetchPlannerNutrition(...args),
  isPlannerNutritionApiError: (error: unknown) =>
    Boolean(error) && typeof error === "object" && "status" in (error as object),
}));

function value(
  amount: number | null,
  status: PlannerNutritionValue["status"] = "complete",
  knownAmount: number | null = null,
): PlannerNutritionValue {
  return {
    amount,
    known_amount: knownAmount,
    status,
    display_mode:
      status === "complete" ? "total" : status === "partial" ? "minimum" : null,
  };
}

function aggregate(
  overrides: Partial<PlannerNutritionAggregate> = {},
): PlannerNutritionAggregate {
  return {
    basis: { amount: 1, unit: "range" },
    values: {
      energy_kcal: value(640),
      carbohydrate_g: value(72),
      protein_g: value(31),
      fat_g: value(18),
      sodium_mg: value(890),
    },
    calculation_status: "complete",
    calculation_quality: "direct",
    incomplete_entry_count: 0,
    warnings: [],
    sources: [],
    ...overrides,
  };
}

function dataForRange(
  startDate: string,
  nutrition = aggregate(),
): PlannerNutritionData {
  return {
    range: { start_date: startDate, end_date: startDate },
    summary: {
      nutrition,
      recipe_entry_count: 1,
      product_entry_count: 0,
    },
    days: [
      {
        plan_date: startDate,
        nutrition,
        columns: [{ column_id: "column-breakfast", nutrition }],
      },
    ],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}

describe("planner nutrition presentation", () => {
  afterEach(() => cleanup());

  it.each([
    [value(0), "0 kcal"],
    [value(null, "partial", 832), "최소 832 kcal"],
    [value(null, "unavailable"), "정보 준비 중"],
  ] as const)("keeps observed zero, minimum, and missing energy distinct", (input, expected) => {
    expect(formatPlannerNutritionEnergy(input)).toBe(expected);
  });

  it.each([
    ["carbohydrate_g", value(0), "0 g"],
    ["protein_g", value(null, "partial", 23.4), "최소 23.4 g"],
    ["sodium_mg", value(null, "unavailable"), "정보 준비 중"],
  ] as const)("formats core nutrients without turning missing into zero", (code, input, expected) => {
    expect(formatPlannerNutritionValue(code, input)).toBe(expected);
  });

  it("shows only compact energy and incomplete guidance in the week summary", () => {
    const partial = aggregate({
      calculation_status: "partial",
      calculation_quality: "mixed",
      incomplete_entry_count: 2,
      values: {
        ...aggregate().values,
        energy_kcal: value(null, "partial", 832),
      },
    });

    render(
      <PlannerWeekNutritionSummary
        days={[{ plan_date: "2026-07-13", nutrition: partial, columns: [] }]}
        error={null}
        isRefreshing={false}
        nutrition={partial}
        onRetry={vi.fn()}
        status="ready"
      />,
    );

    expect(screen.getByText("계획 영양")).toBeTruthy();
    expect(screen.getAllByText("최소 832 kcal").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2개 확인 필요").length).toBeGreaterThan(0);
    expect(screen.queryByText("탄수화물")).toBeNull();
    expect(screen.queryByText("나트륨")).toBeNull();
  });

  it("renders the meal core five, quality, safe warning guidance, and restores focus after ESC", async () => {
    const user = userEvent.setup();
    const partial = aggregate({
      calculation_status: "partial",
      calculation_quality: "mixed",
      incomplete_entry_count: 2,
      warnings: ["UNIT_CONVERSION_MISSING", "INTERNAL_RAW_CODE"],
      values: {
        ...aggregate().values,
        energy_kcal: value(null, "partial", 510),
        sodium_mg: value(null, "unavailable"),
      },
    });

    render(
      <MealNutritionSummary
        error={null}
        isRefreshing={false}
        nutrition={partial}
        onRetry={vi.fn()}
        status="ready"
      />,
    );

    const summary = screen.getByTestId("meal-nutrition-summary");
    expect(within(summary).getByText("열량")).toBeTruthy();
    expect(within(summary).getByText("탄수화물")).toBeTruthy();
    expect(within(summary).getByText("단백질")).toBeTruthy();
    expect(within(summary).getByText("지방")).toBeTruthy();
    expect(within(summary).getByText("나트륨")).toBeTruthy();
    expect(within(summary).getByText("최소 510 kcal")).toBeTruthy();
    expect(within(summary).getByText("정보 준비 중")).toBeTruthy();
    expect(within(summary).getByText("직접값과 환산값 혼합 · 예상치")).toBeTruthy();

    const warningButton = within(summary).getByRole("button", { name: "확인 필요 안내 2개 보기" });
    await user.click(warningButton);
    const dialog = screen.getByRole("dialog", { name: "계획 영양 확인 안내" });
    expect(within(dialog).getByText("일부 재료나 단위의 영양값을 계산하지 못했어요.")).toBeTruthy();
    expect(within(dialog).getByText("일부 계획 영양을 확인해 주세요.")).toBeTruthy();
    expect(within(dialog).queryByText("INTERNAL_RAW_CODE")).toBeNull();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "계획 영양 확인 안내" })).toBeNull();
    expect(document.activeElement).toBe(warningButton);
  });

  it("keeps the empty scope unavailable instead of showing false zero", () => {
    render(
      <MealNutritionSummary
        error={null}
        isRefreshing={false}
        nutrition={aggregate({
          calculation_status: "unavailable",
          calculation_quality: null,
          values: {
            energy_kcal: value(null, "unavailable"),
            carbohydrate_g: value(null, "unavailable"),
            protein_g: value(null, "unavailable"),
            fat_g: value(null, "unavailable"),
            sodium_mg: value(null, "unavailable"),
          },
        })}
        onRetry={vi.fn()}
        status="empty"
      />,
    );

    expect(screen.getByText("계획 영양 정보 없음")).toBeTruthy();
    expect(screen.queryByText("0 kcal")).toBeNull();
    expect(screen.queryByRole("button", { name: /수정|삭제|다시 계산|고정/ })).toBeNull();
  });
});

describe("usePlannerNutritionSummary", () => {
  beforeEach(() => {
    fetchPlannerNutrition.mockReset();
  });

  afterEach(() => cleanup());

  it("lets the latest range win even when an older response arrives last", async () => {
    const first = deferred<PlannerNutritionData>();
    const second = deferred<PlannerNutritionData>();
    fetchPlannerNutrition
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const { result, rerender } = renderHook(
      ({ startDate, endDate }) =>
        usePlannerNutritionSummary({ enabled: true, startDate, endDate }),
      {
        initialProps: { startDate: "2026-07-13", endDate: "2026-07-19" },
      },
    );

    rerender({ startDate: "2026-07-20", endDate: "2026-07-26" });
    second.resolve(dataForRange("2026-07-20"));
    await waitFor(() => expect(result.current.data?.range.start_date).toBe("2026-07-20"));

    first.resolve(dataForRange("2026-07-13"));
    await waitFor(() => expect(result.current.data?.range.start_date).toBe("2026-07-20"));
    expect(fetchPlannerNutrition.mock.calls[0]?.[2]).toBeInstanceOf(AbortSignal);
  });

  it("preserves visible data during a soft refresh error and retries the same range", async () => {
    fetchPlannerNutrition
      .mockResolvedValueOnce(dataForRange("2026-07-13"))
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce(dataForRange("2026-07-13", aggregate({ calculation_quality: "mixed" })));

    const { result } = renderHook(() =>
      usePlannerNutritionSummary({
        enabled: true,
        startDate: "2026-07-13",
        endDate: "2026-07-13",
      }),
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    await result.current.retry();
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.data?.range.start_date).toBe("2026-07-13");

    await result.current.retry();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.data?.summary.nutrition.calculation_quality).toBe("mixed");
  });
});
