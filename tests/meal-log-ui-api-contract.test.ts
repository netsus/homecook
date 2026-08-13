import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createMealLogEntry,
  deleteMealLogEntry,
  fetchMealLogDay,
  fetchMealLogRecent,
  isMealLogApiError,
  updateMealLogEntry,
} from "@/lib/api/meal-log";

const ENTRY_ID = "11111111-1111-4111-8111-111111111111";
const COLUMN_ID = "22222222-2222-4222-8222-222222222222";
const SOURCE_ID = "33333333-3333-4333-8333-333333333333";
const IDEMPOTENCY_KEY = "44444444-4444-4444-8444-444444444444";

const nutrition = {
  calculation_status: "partial",
  calories_kcal: 320,
  carbohydrate_g: null,
  protein_g: 18,
  fat_g: 12,
  sodium_mg: 410,
};

const entry = {
  id: ENTRY_ID,
  revision: 3,
  consumed_at: null,
  consumed_local_date: "2026-08-10",
  timezone_name_snapshot: "Asia/Seoul",
  meal_plan_column_id: null,
  slot_name_snapshot: "삭제된 야식",
  source: { type: "ingredient", id: SOURCE_ID },
  quantity: { amount: 120, unit: "g" },
  display_name: "두부",
  display_brand: null,
  nutrition,
  created_at: "2026-08-10T01:00:00.000Z",
  updated_at: "2026-08-10T02:00:00.000Z",
};

function success(data: unknown, status = 200) {
  return new Response(JSON.stringify({ success: true, data, error: null }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("meal-log UI API contract", () => {
  it("preserves the stored-date history and server-authored day total", async () => {
    const day = {
      date: "2026-08-10",
      active_columns: [],
      active_sections: [],
      deleted_column_sections: [{
        slot_name_snapshot: "삭제된 야식",
        entries: [entry],
        subtotal: nutrition,
        incomplete_count: 1,
      }],
      entries: [entry],
      day_total: { ...nutrition, calories_kcal: 999, incomplete_count: 1 },
    };
    const fetchMock = vi.fn<typeof fetch>(async () => success(day));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchMealLogDay("2026-08-10");

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/v1/meal-log?date=2026-08-10");
    expect(result).toEqual(day);
    expect(result.entries[0].consumed_at).toBeNull();
    expect(result.day_total.calories_kcal).toBe(999);
  });

  it("keeps the recent projection in one server order and one opaque cursor", async () => {
    const page = {
      items: [
        {
          source: { type: "ingredient", id: SOURCE_ID },
          display_name: "두부",
          display_brand: null,
          last_quantity: { amount: 120, unit: "g" },
          frequency: 3,
        },
      ],
      next_cursor: "opaque-cursor",
      has_next: true,
    };
    const fetchMock = vi.fn<typeof fetch>(async () => success(page));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchMealLogRecent({ cursor: "opaque-cursor", limit: 20 });

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "/api/v1/meal-log/recent?limit=20&cursor=opaque-cursor",
    );
    expect(result).toEqual(page);
  });

  it("creates with the supplied operation key and no revision field", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => success({ entry }, 201));
    vi.stubGlobal("fetch", fetchMock);

    await createMealLogEntry({
      consumedLocalDate: "2026-08-10",
      timezoneNameSnapshot: "Asia/Seoul",
      consumedAt: null,
      mealPlanColumnId: COLUMN_ID,
      source: { type: "ingredient", id: SOURCE_ID },
      quantity: { amount: 120, unit: "g" },
    }, IDEMPOTENCY_KEY);

    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/api/v1/meal-log/entries");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(IDEMPOTENCY_KEY);
    expect(JSON.parse(String(init?.body))).toEqual({
      consumed_local_date: "2026-08-10",
      timezone_name_snapshot: "Asia/Seoul",
      consumed_at: null,
      meal_plan_column_id: COLUMN_ID,
      source: { type: "ingredient", id: SOURCE_ID },
      quantity: { amount: 120, unit: "g" },
    });
  });

  it("creates a fresh UUID for each deliberate mutation when no retry key is supplied", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => success({ entry }, 201));
    vi.stubGlobal("fetch", fetchMock);
    const input = {
      consumedLocalDate: "2026-08-10",
      timezoneNameSnapshot: "Asia/Seoul",
      consumedAt: null,
      mealPlanColumnId: COLUMN_ID,
      source: { type: "ingredient" as const, id: SOURCE_ID },
      quantity: { amount: 120, unit: "g" },
    };

    await createMealLogEntry(input);
    await createMealLogEntry(input);

    const keys = fetchMock.mock.calls.map(([, init]) =>
      new Headers(init?.headers).get("Idempotency-Key"));
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(keys[1]).toMatch(/^[0-9a-f-]{36}$/);
    expect(keys[1]).not.toBe(keys[0]);
  });

  it("updates with the explicit active column, expected revision, and retry key", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => success({ entry: {
      ...entry,
      revision: 4,
      meal_plan_column_id: COLUMN_ID,
      slot_name_snapshot: "점심",
    } }));
    vi.stubGlobal("fetch", fetchMock);

    await updateMealLogEntry(ENTRY_ID, {
      consumedLocalDate: "2026-08-10",
      timezoneNameSnapshot: "Asia/Seoul",
      consumedAt: null,
      mealPlanColumnId: COLUMN_ID,
      source: { type: "ingredient", id: SOURCE_ID },
      quantity: { amount: 130, unit: "g" },
      expectedRevision: 3,
    }, IDEMPOTENCY_KEY);

    const [path, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(init?.body));
    expect(path).toBe(`/api/v1/meal-log/entries/${ENTRY_ID}`);
    expect(init?.method).toBe("PATCH");
    expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(IDEMPOTENCY_KEY);
    expect(body).toEqual({
      consumed_local_date: "2026-08-10",
      timezone_name_snapshot: "Asia/Seoul",
      consumed_at: null,
      meal_plan_column_id: COLUMN_ID,
      source: { type: "ingredient", id: SOURCE_ID },
      quantity: { amount: 130, unit: "g" },
      expected_revision: 3,
    });
    expect(body).not.toHaveProperty("active_consumption_event_id");
    expect(body).not.toHaveProperty("reverses_event_id");
  });

  it("deletes by revision without accepting a client-authored event target", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => success({ entry }));
    vi.stubGlobal("fetch", fetchMock);

    await deleteMealLogEntry(ENTRY_ID, 3, IDEMPOTENCY_KEY);

    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe(`/api/v1/meal-log/entries/${ENTRY_ID}`);
    expect(init?.method).toBe("DELETE");
    expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(IDEMPOTENCY_KEY);
    expect(JSON.parse(String(init?.body))).toEqual({ expected_revision: 3 });
  });

  it("preserves the official error code, message, status, and fields", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      success: false,
      data: null,
      error: {
        code: "CONFLICT",
        message: "다른 변경이 먼저 반영됐어요.",
        fields: [{ field: "expected_revision", reason: "stale" }],
      },
    }), { status: 409 })));

    const error = await deleteMealLogEntry(ENTRY_ID, 2, IDEMPOTENCY_KEY)
      .catch((caught) => caught);

    expect(isMealLogApiError(error)).toBe(true);
    expect(error).toMatchObject({
      status: 409,
      code: "CONFLICT",
      message: "다른 변경이 먼저 반영됐어요.",
      fields: [{ field: "expected_revision", reason: "stale" }],
    });
  });
});
