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

const recent = {
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

const createInput = {
  consumedLocalDate: "2026-08-10",
  timezoneNameSnapshot: "Asia/Seoul",
  consumedAt: null,
  mealPlanColumnId: COLUMN_ID,
  source: { type: "ingredient" as const, id: SOURCE_ID },
  quantity: { amount: 120, unit: "g" },
};

const updateInput = {
  ...createInput,
  expectedRevision: 3,
};

function success(data: unknown, status = 200) {
  return new Response(JSON.stringify({ success: true, data, error: null }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("meal-log UI API contract", () => {
  it("preserves the stored-date history and server-authored day total", async () => {
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
    const fetchMock = vi.fn<typeof fetch>(async () => success(recent));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchMealLogRecent({ cursor: "opaque-cursor", limit: 20 });

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "/api/v1/meal-log/recent?limit=20&cursor=opaque-cursor",
    );
    expect(result).toEqual(recent);
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

  it("reuses one caller-owned operation key and payload for a deliberate create retry", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => success({ entry }, 201));
    vi.stubGlobal("fetch", fetchMock);

    await createMealLogEntry(createInput, IDEMPOTENCY_KEY);
    await createMealLogEntry(createInput, IDEMPOTENCY_KEY);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const requests = fetchMock.mock.calls.map(([, init]) => ({
      key: new Headers(init?.headers).get("Idempotency-Key"),
      body: init?.body,
    }));
    expect(requests).toEqual([
      { key: IDEMPOTENCY_KEY, body: requests[0].body },
      { key: IDEMPOTENCY_KEY, body: requests[0].body },
    ]);
  });

  it.each([
    ["create", () => (createMealLogEntry as unknown as (
      input: typeof createInput,
      idempotencyKey?: string,
    ) => Promise<unknown>)(createInput)],
    ["update", () => (updateMealLogEntry as unknown as (
      entryId: string,
      input: typeof updateInput,
      idempotencyKey?: string,
    ) => Promise<unknown>)(ENTRY_ID, updateInput)],
    ["delete", () => (deleteMealLogEntry as unknown as (
      entryId: string,
      expectedRevision: number,
      idempotencyKey?: string,
    ) => Promise<unknown>)(ENTRY_ID, 3)],
  ])("fails closed before fetch when the %s operation key is omitted", async (_name, call) => {
    const fetchMock = vi.fn<typeof fetch>(async () => success({ entry }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(call()).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      fields: [],
    });
    expect(fetchMock).not.toHaveBeenCalled();
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

  it.each([
    ["update", "not-a-uuid", () => updateMealLogEntry("not-a-uuid", updateInput, IDEMPOTENCY_KEY)],
    ["update traversal", "../recent?limit=50#", () => updateMealLogEntry("../recent?limit=50#", updateInput, IDEMPOTENCY_KEY)],
    ["delete", "not-a-uuid", () => deleteMealLogEntry("not-a-uuid", 3, IDEMPOTENCY_KEY)],
    ["delete traversal", `${ENTRY_ID}/../recent`, () => deleteMealLogEntry(`${ENTRY_ID}/../recent`, 3, IDEMPOTENCY_KEY)],
  ])("rejects an invalid %s entry id before fetch", async (_name, _entryId, call) => {
    const fetchMock = vi.fn<typeof fetch>(async () => success({ entry }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(call()).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      fields: [],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects null, malformed, and data-missing wrappers as INVALID_RESPONSE", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    for (const payload of [
      null,
      [],
      {},
      { success: true, error: null },
      { success: true, data: null, error: null },
      { success: "true", data: day, error: null },
      { success: false, data: null, error: null },
    ]) {
      fetchMock.mockResolvedValueOnce(jsonResponse(payload));
      await expect(fetchMealLogDay("2026-08-10")).rejects.toMatchObject({
        code: "INVALID_RESPONSE",
        fields: [],
      });
    }
  });

  it.each([
    ["day missing field", () => fetchMealLogDay("2026-08-10"), { ...day, entries: undefined }],
    ["day invalid total", () => fetchMealLogDay("2026-08-10"), {
      ...day,
      day_total: { ...day.day_total, incomplete_count: "1" },
    }],
    ["recent missing cursor", () => fetchMealLogRecent(), { ...recent, next_cursor: undefined }],
    ["recent invalid item", () => fetchMealLogRecent(), {
      ...recent,
      items: [{ ...recent.items[0], frequency: 0 }],
    }],
    ["mutation missing entry", () => createMealLogEntry(createInput, IDEMPOTENCY_KEY), {}],
    ["mutation invalid entry", () => deleteMealLogEntry(ENTRY_ID, 3, IDEMPOTENCY_KEY), {
      entry: { ...entry, revision: "3" },
    }],
  ])("rejects malformed %s success data", async (_name, call, data) => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => success(data)));

    await expect(call()).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      fields: [],
    });
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
