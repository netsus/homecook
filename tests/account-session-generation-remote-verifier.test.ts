import { describe, expect, it } from "vitest";

describe("account session generation remote verifier", () => {
  it("defines read-only inventory and protected post-merge dark-ship plans", async () => {
    const verifier = await import(
      "../scripts/lib/account-session-generation-remote-verifier.mjs"
    );

    const inventory = verifier.buildAccountGenerationRemoteVerificationPlan({
      mode: "inventory",
    });
    const postMerge = verifier.buildAccountGenerationRemoteVerificationPlan({
      mode: "post-merge-dark-ship",
    });

    expect(inventory.readOnly).toBe(true);
    expect(inventory.requiresMergedOriginMaster).toBe(false);
    expect(postMerge.readOnly).toBe(true);
    expect(postMerge.requiresMergedOriginMaster).toBe(true);

    expect(inventory.sql.toLowerCase()).toContain(
      "to_regclass('public.account_generation_capability_state')",
    );
    expect(postMerge.sql.toLowerCase()).toContain(
      "from public.account_generation_capability_state",
    );
    expect(postMerge.sql.toLowerCase()).toContain(
      "from public.user_account_generation_watermarks",
    );
    expect(postMerge.sql.toLowerCase()).toContain(
      "from public.user_account_lifecycles",
    );

    for (const plan of [inventory, postMerge]) {
      expect(plan.sql.toLowerCase()).toContain("from pg_catalog.pg_constraint");
      expect(plan.sql).not.toMatch(
        /\b(?:insert|update|delete|truncate|alter|create|drop|grant|revoke)\b/iu,
      );
    }
  });

  it("fails closed on unknown verification modes", async () => {
    const verifier = await import(
      "../scripts/lib/account-session-generation-remote-verifier.mjs"
    );

    expect(() =>
      verifier.buildAccountGenerationRemoteVerificationPlan({
        mode: "unknown",
      }),
    ).toThrow("unsupported account generation remote verification mode");
  });

  it("accepts only a legacy singleton with canonical authority at zero after merge", async () => {
    const verifier = await import(
      "../scripts/lib/account-session-generation-remote-verifier.mjs"
    );
    const validResult = {
      capability: {
        state: "legacy",
        revision: 1,
        current_cutover_attempt_id: null,
      },
      capability_count: 1,
      watermark_count: 0,
      lifecycle_count: 0,
      auth_inbound_fks: [],
    };

    expect(() =>
      verifier.assertAccountGenerationRemoteVerificationResult({
        mode: "post-merge-dark-ship",
        result: validResult,
      }),
    ).not.toThrow();

    for (const invalidResult of [
      { ...validResult, capability_count: 0 },
      {
        ...validResult,
        capability: { ...validResult.capability, state: "generation_active" },
      },
      { ...validResult, watermark_count: 1 },
      { ...validResult, lifecycle_count: 1 },
    ]) {
      expect(() =>
        verifier.assertAccountGenerationRemoteVerificationResult({
          mode: "post-merge-dark-ship",
          result: invalidResult,
        }),
      ).toThrow(
        "remote F0 is not a legacy dark ship with canonical authority at zero",
      );
    }
  });
});
