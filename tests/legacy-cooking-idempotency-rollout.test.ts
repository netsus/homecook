import { describe, expect, it, vi } from "vitest";

import {
  executeLegacyCookingMutation,
  getLegacyCookingIdempotencyPhase,
} from "@/lib/server/legacy-product-compat";
import { MemoryLegacyCompatibilityReceiptStore } from "./fixtures/legacy-product-compat-harness";

const KEY = "550e8400-e29b-41d4-a716-446655440501";

describe.each(["planner_complete", "standalone_complete"] as const)(
  "legacy cooking idempotency rollout: %s",
  (scope) => {
    it("keeps pre-gate no-key v1 behavior and generic consumed ingredient semantics", async () => {
      const mutate = vi.fn(async () => ({ pantry_removed: 2 }));
      const result = await executeLegacyCookingMutation({
        phase: "optional",
        scope,
        key: null,
        canonicalPayload: {
          consumed_ingredient_ids: ["550e8400-e29b-41d4-a716-446655440601"],
        },
        store: new MemoryLegacyCompatibilityReceiptStore(),
        mutate,
      });

      expect(result).toEqual({ ok: true, replayed: false, data: { pantry_removed: 2 } });
      expect(mutate).toHaveBeenCalledTimes(1);
    });

    it("rejects malformed keys with 400 and mutation zero", async () => {
      const mutate = vi.fn(async () => ({ pantry_removed: 2 }));
      const result = await executeLegacyCookingMutation({
        phase: "optional",
        scope,
        key: "not-a-uuid",
        canonicalPayload: { consumed_ingredient_ids: [] },
        store: new MemoryLegacyCompatibilityReceiptStore(),
        mutate,
      });

      expect(result).toEqual({ ok: false, status: 400, code: "INVALID_IDEMPOTENCY_KEY" });
      expect(mutate).not.toHaveBeenCalled();
    });

    it("durably replays the same canonical payload and rejects mismatch without mutation", async () => {
      const store = new MemoryLegacyCompatibilityReceiptStore<{ pantry_removed: number }>();
      const mutate = vi.fn(async () => ({ pantry_removed: 2 }));
      const base = {
        phase: "optional" as const,
        scope,
        key: KEY,
        store,
        mutate,
      };

      const first = await executeLegacyCookingMutation({
        ...base,
        canonicalPayload: { consumed_ingredient_ids: ["550e8400-e29b-41d4-a716-446655440601"] },
      });
      const replay = await executeLegacyCookingMutation({
        ...base,
        canonicalPayload: { consumed_ingredient_ids: ["550e8400-e29b-41d4-a716-446655440601"] },
      });
      const mismatch = await executeLegacyCookingMutation({
        ...base,
        canonicalPayload: { consumed_ingredient_ids: [] },
      });

      expect(first).toEqual({ ok: true, replayed: false, data: { pantry_removed: 2 } });
      expect(replay).toEqual({ ok: true, replayed: true, data: { pantry_removed: 2 } });
      expect(mismatch).toEqual({ ok: false, status: 409, code: "IDEMPOTENCY_KEY_REUSED" });
      expect(mutate).toHaveBeenCalledTimes(1);
    });

    it("requires the key only after the full-release no-key-zero gate", async () => {
      const mutate = vi.fn(async () => ({ pantry_removed: 2 }));
      const result = await executeLegacyCookingMutation({
        phase: "required",
        scope,
        key: null,
        canonicalPayload: { consumed_ingredient_ids: [] },
        store: new MemoryLegacyCompatibilityReceiptStore(),
        mutate,
      });

      expect(result).toEqual({ ok: false, status: 428, code: "IDEMPOTENCY_KEY_REQUIRED" });
      expect(mutate).not.toHaveBeenCalled();
    });
  },
);

describe("legacy cooking required-key activation guard", () => {
  it("stays optional even when an unapproved runtime flag is present", () => {
    expect(getLegacyCookingIdempotencyPhase({
      HOMECOOK_LEGACY_COOKING_IDEMPOTENCY_REQUIRED: "true",
    })).toBe("optional");
  });
});
