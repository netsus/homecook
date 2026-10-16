import { afterEach, expect, it, vi } from "vitest";
import { createManualRecipe } from "@/lib/api/manual-recipe";

afterEach(() => vi.unstubAllGlobals());

it("preserves the recoverable preparation code and the caller's stable request key", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false, data: null,
    error: { code: "RECIPE_PREPARATION_PENDING", message: "공개 준비 중", fields: [] },
  }), { status: 503 }));
  vi.stubGlobal("fetch", fetch);
  const result = await createManualRecipe({ title: "내 레시피", base_servings: 2, ingredients: [], steps: [] }, { idempotencyKey: "stable-key", expectedOwnerId: "owner" });
  expect(result.error?.code).toBe("RECIPE_PREPARATION_PENDING");
  expect(fetch.mock.calls[0]?.[1].headers["Idempotency-Key"]).toBe("stable-key");
});

it("keeps unknown server failures ambiguous instead of permitting a fresh create", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false, data: null,
    error: { code: "INTERNAL_ERROR", message: "실패", fields: [] },
  }), { status: 500 })));
  const result = await createManualRecipe({ title: "내 레시피", base_servings: 2, ingredients: [], steps: [] });
  expect(result.error?.code).toBe("NETWORK_ERROR");
});

it("negotiates capability without changing legacy body and preserves the exact raw body and stable key", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false, data: null,
    error: { code: "UNIT_POLICY_INACTIVE", message: "입력은 유지돼요.", fields: [] },
  }), { status: 409 }));
  vi.stubGlobal("fetch", fetch);
  const body = { title: "원문 분수", base_servings: 2, ingredients: [{ ingredient_id: "ingredient", row_key: "row", standard_name: "우유", amount: 1 / 3, unit: "ml", ingredient_type: "QUANT" as const, display_text: "원문", scalable: true, sort_order: 1,
    quantity_input: { schema_version: "quantity-v4" as const, raw_value: "1/3", raw_unit: "ml", expected_context_sha256: "a".repeat(64) } }], steps: [] };
  const result = await createManualRecipe(body, { idempotencyKey: "same-key", expectedOwnerId: "owner" });
  expect(result.error?.code).toBe("UNIT_POLICY_INACTIVE");
  expect(fetch.mock.calls[0][1].headers["X-Homecook-Quantity-Contract"]).toBe("quantity-v4");
  expect(fetch.mock.calls[0][1].body).toBe(JSON.stringify(body)); expect(body.ingredients[0].quantity_input.raw_value).toBe("1/3");
  await createManualRecipe({ title: "기존", base_servings: 2, ingredients: [], steps: [] });
  expect(fetch.mock.calls[1][1].headers["X-Homecook-Quantity-Contract"]).toBe("quantity-v4");
});
