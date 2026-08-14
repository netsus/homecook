import React from "react";
import { render } from "@testing-library/react";
import { vi } from "vitest";

import { PlannerWeekScreen } from "@/components/planner/planner-week-screen";

const ENTRY_ID = "10000000-0000-4000-8000-000000000001";
const DELETED_ENTRY_ID = "10000000-0000-4000-8000-000000000002";
const BREAKFAST_ID = "20000000-0000-4000-8000-000000000001";
const LUNCH_ID = "20000000-0000-4000-8000-000000000002";
const SOURCE_ID = "30000000-0000-4000-8000-000000000001";

const nutrition = {
  calculation_status: "complete",
  calories_kcal: 210,
  carbohydrate_g: 18,
  protein_g: 14,
  fat_g: 9,
  sodium_mg: 330,
};

const entry = {
  id: ENTRY_ID,
  revision: 1,
  consumed_at: null,
  consumed_local_date: "2026-08-10",
  timezone_name_snapshot: "Asia/Seoul",
  meal_plan_column_id: BREAKFAST_ID,
  slot_name_snapshot: "아침",
  source: { type: "ingredient", id: SOURCE_ID },
  quantity: { amount: 2, unit: "개" },
  display_name: "달걀",
  display_brand: null,
  nutrition,
  created_at: "2026-08-10T00:00:00.000Z",
  updated_at: "2026-08-10T00:00:00.000Z",
};

const deletedEntry = {
  ...entry,
  id: DELETED_ENTRY_ID,
  meal_plan_column_id: null,
  slot_name_snapshot: "간식",
  display_name: "플레인 요거트",
};

const day = {
  date: "2026-08-10",
  active_columns: [
    { id: BREAKFAST_ID, name: "아침", sort_order: 0 },
    { id: LUNCH_ID, name: "점심", sort_order: 1 },
  ],
  active_sections: [
    {
      meal_plan_column_id: BREAKFAST_ID,
      slot_name_snapshot: "아침",
      sort_order: 0,
      entries: [entry],
      subtotal: nutrition,
      incomplete_count: 0,
    },
    {
      meal_plan_column_id: LUNCH_ID,
      slot_name_snapshot: "점심",
      sort_order: 1,
      entries: [],
      subtotal: { ...nutrition, calories_kcal: 0, carbohydrate_g: 0, protein_g: 0, fat_g: 0, sodium_mg: 0 },
      incomplete_count: 0,
    },
  ],
  deleted_column_sections: [
    {
      slot_name_snapshot: "간식",
      entries: [deletedEntry],
      subtotal: nutrition,
      incomplete_count: 0,
    },
  ],
  entries: [entry, deletedEntry],
  day_total: { ...nutrition, incomplete_count: 0 },
};

const navigationMocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  searchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: navigationMocks.push,
    replace: navigationMocks.replace,
  }),
  useSearchParams: () => navigationMocks.searchParams(),
}));

vi.mock("@/lib/auth/e2e-auth-override", () => ({
  readE2EAuthOverride: () => true,
  withE2EAuthOverrideHeaders: (init?: RequestInit) => init ?? {},
}));

vi.mock("@/lib/supabase/env", () => ({ hasSupabasePublicEnv: () => false }));
vi.mock("@/components/shared/profile-summary-button", () => ({
  ProfileSummaryButton: () => <button type="button">프로필</button>,
}));

export function renderMealLogShell({
  failDate,
  includeCookedBatch = false,
  recentCookedWithoutProjection = false,
  batchWeightStatus = "known",
  paginatedSources = false,
}: {
  failDate?: string;
  includeCookedBatch?: boolean;
  recentCookedWithoutProjection?: boolean;
  batchWeightStatus?: "known" | "missing" | "unrecoverable";
  paginatedSources?: boolean;
} = {}) {
  navigationMocks.push.mockReset();
  navigationMocks.replace.mockReset();
  navigationMocks.searchParams.mockReturnValue(
    new URLSearchParams("segment=log&date=2026-08-10"),
  );
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input);
    const url = new URL(path, "http://localhost");
    if (failDate && path.includes(`/meal-log?date=${failDate}`)) {
      return new Response(JSON.stringify({
        success: false,
        data: null,
        error: { code: "READ_FAILED", message: "날짜 표시를 확인하지 못했어요.", fields: [] },
      }), {
        headers: { "content-type": "application/json" },
        status: 503,
      });
    }
    const data = path.includes("/meal-log/recent")
      ? url.searchParams.has("cursor") && paginatedSources
        ? {
            items: [{
              source: { type: "ingredient", id: "30000000-0000-4000-8000-000000000002" },
              display_name: "바나나",
              display_brand: null,
              last_quantity: { amount: 1, unit: "개" },
              frequency: 2,
            }],
            next_cursor: null,
            has_next: false,
          }
        : {
          items: [{
            source: recentCookedWithoutProjection
              ? { type: "cooked_batch", id: "40000000-0000-4000-8000-000000000009" }
              : { type: "ingredient", id: SOURCE_ID },
            display_name: recentCookedWithoutProjection ? "예전 카레" : "달걀",
            display_brand: null,
            last_quantity: { amount: 2, unit: "개" },
            frequency: 3,
          }],
          next_cursor: paginatedSources ? "recent-cursor" : null,
          has_next: paginatedSources,
        }
      : path.includes("/meal-log/entries")
        ? { entry }
        : path.includes("/meal-log?")
          ? day
          : path.includes("/cooked-batches")
            ? {
                items: includeCookedBatch || paginatedSources ? [{
                  id: url.searchParams.has("cursor")
                    ? "40000000-0000-4000-8000-000000000002"
                    : "40000000-0000-4000-8000-000000000001",
                  recipe_id: SOURCE_ID,
                  recipe_title: url.searchParams.has("cursor") ? "카레" : "된장찌개",
                  recipe_thumbnail_url: null,
                  status: "leftover",
                  cooked_at: "2026-08-09T09:00:00.000Z",
                  cooking_servings: 2,
                  finished_weight_g: batchWeightStatus === "known" ? 500 : null,
                  remaining_weight_g: batchWeightStatus === "known" ? 80 : null,
                  weight_status: batchWeightStatus,
                  batch_status: "available",
                  depleted_reason: null,
                  revision: 1,
                  nutrition_calculation_status: batchWeightStatus === "known" ? "complete" : "unavailable",
                  current_unweighed_closure_event_id: null,
                }] : [],
                next_cursor: paginatedSources && !url.searchParams.has("cursor") ? "batch-cursor" : null,
                has_next: paginatedSources && !url.searchParams.has("cursor"),
              }
            : path.includes("/food-catalog/search") && paginatedSources
              ? {
                  items: [{
                    type: "ingredient",
                    id: url.searchParams.has("cursor")
                      ? "30000000-0000-4000-8000-000000000004"
                      : "30000000-0000-4000-8000-000000000003",
                    standard_name: url.searchParams.has("cursor") ? "우유" : "시금치",
                    category: "테스트",
                    default_unit: "g",
                  }],
                  next_cursor: url.searchParams.has("cursor") ? null : "catalog-cursor",
                  has_next: !url.searchParams.has("cursor"),
                }
              : { items: [], next_cursor: null, has_next: false };
    return new Response(JSON.stringify({ success: true, data, error: null }), {
      headers: { "content-type": "application/json" },
      status: 200,
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return {
    ...render(<PlannerWeekScreen initialAuthenticated />),
    fetchMock,
    navigationMocks,
  };
}
