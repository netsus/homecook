import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

import * as mealLog from "@/lib/server/meal-log";

describe("meal-log core", () => {
  test("provides the dedicated server contract module", () => {
    expect(existsSync(resolve(process.cwd(), "lib/server/meal-log.ts"))).toBe(true);
  });

  test("exports strict create, update, delete, and read validators", () => {
    expect(typeof Reflect.get(mealLog, "parseMealLogMutationRequest")).toBe("function");
    expect(typeof Reflect.get(mealLog, "parseMealLogDateQuery")).toBe("function");
    expect(typeof Reflect.get(mealLog, "parseMealLogRecentQuery")).toBe("function");
    expect(typeof Reflect.get(mealLog, "parseIdempotencyKey")).toBe("function");
  });

  test("distinguishes missing and malformed UUID idempotency keys", () => {
    expect(mealLog.parseIdempotencyKey(null)).toEqual({
      ok: false,
      fields: [{ field: "Idempotency-Key", reason: "required" }],
    });
    expect(mealLog.parseIdempotencyKey("not-a-uuid")).toEqual({
      ok: false,
      fields: [{ field: "Idempotency-Key", reason: "invalid_uuid" }],
    });
  });

  test("preserves null consumed_at but rejects a timezone/date mismatch", () => {
    const valid = {
      consumed_local_date: "2026-08-10",
      timezone_name_snapshot: "Asia/Seoul",
      consumed_at: null,
      meal_plan_column_id: "11111111-1111-4111-8111-111111111111",
      source: { type: "cooked_batch", id: "22222222-2222-4222-8222-222222222222" },
      quantity: { amount: 120, unit: "g" },
    };
    expect(mealLog.parseMealLogMutationRequest(valid, "create")).toMatchObject({ ok: true });
    expect(mealLog.parseMealLogMutationRequest({
      ...valid,
      consumed_at: "2026-08-09T12:00:00.000Z",
    }, "create")).toEqual({
      ok: false,
      fields: [{ field: "consumed_at", reason: "consumed_date_timezone_mismatch" }],
    });
  });

  test("requires a positive expected revision for patch and delete", () => {
    const body = {
      consumed_local_date: "2026-08-10",
      timezone_name_snapshot: "Asia/Seoul",
      consumed_at: null,
      meal_plan_column_id: "11111111-1111-4111-8111-111111111111",
      source: { type: "ingredient", id: "22222222-2222-4222-8222-222222222222" },
      quantity: { amount: 1, unit: "g" },
      expected_revision: 0,
    };
    expect(mealLog.parseMealLogMutationRequest(body, "patch")).toMatchObject({ ok: false });
    expect(mealLog.parseMealLogDeleteRequest({ expected_revision: 0 })).toMatchObject({ ok: false });
  });

  test("serializes the parsed canonical value for RPC and idempotency hashing", () => {
    const canonicalize = Reflect.get(mealLog, "toMealLogRpcPayload") as
      | ((value: {
        consumedLocalDate: string;
        timezoneNameSnapshot: string;
        consumedAt: string | null;
        mealPlanColumnId: string;
        source: { type: "ingredient"; id: string };
        quantity: { amount: number; unit: string };
        expectedRevision: number | null;
      }) => unknown)
      | undefined;
    expect(typeof canonicalize).toBe("function");
    expect(canonicalize?.({
      consumedLocalDate: "2026-08-10",
      timezoneNameSnapshot: "Asia/Seoul",
      consumedAt: null,
      mealPlanColumnId: "11111111-1111-4111-8111-111111111111",
      source: { type: "ingredient", id: "22222222-2222-4222-8222-222222222222" },
      quantity: { amount: 1, unit: "g" },
      expectedRevision: 2,
    })).toEqual({
      consumed_local_date: "2026-08-10",
      timezone_name_snapshot: "Asia/Seoul",
      consumed_at: null,
      meal_plan_column_id: "11111111-1111-4111-8111-111111111111",
      source: { type: "ingredient", id: "22222222-2222-4222-8222-222222222222" },
      quantity: { amount: 1, unit: "g" },
      expected_revision: 2,
    });

    const request = {
      consumed_local_date: "2026-08-10",
      timezone_name_snapshot: "Asia/Seoul",
      consumed_at: "2026-08-09T15:30:00+00:00",
      meal_plan_column_id: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
      source: { type: "ingredient", id: "BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB" },
      quantity: { amount: 1, unit: " g " },
    };
    const first = mealLog.parseMealLogMutationRequest(request, "create");
    const retry = mealLog.parseMealLogMutationRequest({
      ...request,
      consumed_at: "2026-08-09T15:30:00.000Z",
      meal_plan_column_id: request.meal_plan_column_id.toLowerCase(),
      source: { ...request.source, id: request.source.id.toLowerCase() },
      quantity: { amount: 1, unit: "g" },
    }, "create");
    expect(first.ok).toBe(true);
    expect(retry.ok).toBe(true);
    if (first.ok && retry.ok) {
      expect(mealLog.toMealLogRpcPayload(first.value)).toEqual(
        mealLog.toMealLogRpcPayload(retry.value),
      );
    }
  });

  test("maps PostgreSQL deadlocks to the official CONFLICT response", async () => {
    const client = {
      rpc: async () => ({ data: null, error: { code: "40P01", message: "deadlock detected" } }),
    };
    const result = await mealLog.callMealLogRpc(client, "mutate_meal_log_entry", {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(409);
      expect(await result.response.json()).toMatchObject({
        success: false,
        error: { code: "CONFLICT" },
      });
    }
  });

  test("accepts only the exact compact nutrition response shape", () => {
    const compact = {
      calculation_status: "partial",
      calories_kcal: 120,
      carbohydrate_g: null,
      protein_g: 8,
      fat_g: 4,
      sodium_mg: 30,
    };
    expect(mealLog.projectMealLogData({ entry: { nutrition: compact } })).not.toBeNull();
    expect(mealLog.projectMealLogData({
      entry: { nutrition: { ...compact, values: { energy_kcal: 120 } } },
    })).toBeNull();
    expect(mealLog.projectMealLogData({
      entry: {
        nutrition: {
          calculation_status: "partial",
          values: { energy_kcal: 120 },
        },
      },
    })).toBeNull();
  });
});
