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
