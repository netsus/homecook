import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("prepared food search remote verifier", () => {
  it("defines a merged-exact-SHA read-only verification plan", async () => {
    const verifier = await import(
      "../scripts/lib/prepared-food-search-remote-verifier.mjs"
    );

    const plan = verifier.buildPreparedFoodSearchRemoteVerificationPlan({
      mode: "post-merge-read-only",
    });

    expect(plan).toMatchObject({
      mode: "post-merge-read-only",
      readOnly: true,
      requiresMergedOriginMaster: true,
      requiresCleanTrackedTree: true,
      expectedIndexCount: 9,
    });
    expect(plan.sql).toContain("search_food_catalog_ranked");
    expect(plan.sql).toContain("has_function_privilege");
    expect(plan.sql).toContain("pg_catalog.pg_index");
    expect(plan.sql).toContain("rpc_hosted_threshold_compatible");
    expect(plan.sql).toContain("v_query_bigrams");
    expect(plan.sql).toMatch(
      /pagination_page as \([\s\S]*?array\['ingredient'\]::text\[\][\s\S]*?pagination_next_page as \(/u,
    );
    expect(plan.sql).toMatch(
      /jsonb_typeof\(\s*pagination_page\.payload -> 'next_cursor_tuple'\s*\)\s*=\s*'object'/u,
    );
    expect(plan.sql).not.toMatch(
      /community_page\.payload -> 'next_cursor_tuple' is not null/u,
    );
    expect(plan.sql).not.toMatch(
      /\b(?:insert|update|delete|truncate|alter|create|drop|grant|revoke)\b/iu,
    );
  });

  it("rejects unknown modes and non-merged or dirty source trees", async () => {
    const verifier = await import(
      "../scripts/lib/prepared-food-search-remote-verifier.mjs"
    );

    expect(() =>
      verifier.buildPreparedFoodSearchRemoteVerificationPlan({
        mode: "unknown",
      }),
    ).toThrow(/unsupported prepared food search remote verification mode/i);
    expect(() =>
      verifier.assertPreparedFoodSearchMergedExactSource({
        head: "a".repeat(40),
        originMaster: "b".repeat(40),
        trackedStatus: "",
      }),
    ).toThrow(/HEAD to equal origin\/master/i);
    expect(() =>
      verifier.assertPreparedFoodSearchMergedExactSource({
        head: "a".repeat(40),
        originMaster: "a".repeat(40),
        trackedStatus: " M migration.sql",
      }),
    ).toThrow(/clean tracked tree/i);
  });

  it("accepts only the exact index, ACL, semantic, and write-zero result", async () => {
    const verifier = await import(
      "../scripts/lib/prepared-food-search-remote-verifier.mjs"
    );
    const validResult = {
      fixture_ready: true,
      index_count: 9,
      invalid_index_count: 0,
      rpc_exists: true,
      rpc_security_definer: true,
      rpc_search_path_safe: true,
      rpc_hosted_threshold_compatible: true,
      public_execute: false,
      anon_execute: false,
      authenticated_execute: false,
      service_role_execute: true,
      public_scope_ok: true,
      private_scope_ok: true,
      moderation_scope_ok: true,
      current_nutrition_ok: true,
      cursor_v2_ok: true,
      legacy_compatibility_ok: true,
      runtime_provider_requests: 0,
      remote_writes: 0,
    };

    expect(() =>
      verifier.assertPreparedFoodSearchRemoteVerificationResult(validResult),
    ).not.toThrow();

    for (const invalidResult of [
      { ...validResult, index_count: 8 },
      { ...validResult, public_execute: true },
      { ...validResult, rpc_hosted_threshold_compatible: false },
      { ...validResult, private_scope_ok: false },
      { ...validResult, current_nutrition_ok: false },
      { ...validResult, remote_writes: 1 },
    ]) {
      expect(() =>
        verifier.assertPreparedFoodSearchRemoteVerificationResult(invalidResult),
      ).toThrow(/remote prepared food search verification failed/i);
    }

    expect(() =>
      verifier.assertPreparedFoodSearchRemoteVerificationResult({
        ...validResult,
        fixture_ready: false,
      }),
    ).toThrow(/smoke fixture is missing/i);
  });

  it("keeps the CLI secret-safe, TLS-only, and transaction read-only", () => {
    const cli = readFileSync(
      "scripts/verify-prepared-food-search-remote.mjs",
      "utf8",
    );

    expect(cli).toContain("PREPARED_FOOD_SEARCH_DATABASE_URL");
    expect(cli).toContain("PREPARED_FOOD_SEARCH_ACTOR_ID");
    expect(cli).toContain("buildPreparedFoodSearchPsqlRequest");
    expect(cli).not.toContain("PGOPTIONS");
    expect(cli).toContain("--untracked-files=no");
    expect(cli).not.toMatch(/process\.stdout\.write\([^\n]*databaseUrl/);
  });

  it("builds a pooler-safe request without inherited PGOPTIONS", async () => {
    const verifier = await import(
      "../scripts/lib/prepared-food-search-remote-verifier.mjs"
    );
    const request = verifier.buildPreparedFoodSearchPsqlRequest({
      actorId: "31000000-0000-4000-8000-000000000001",
      databaseUrl: "postgresql://example.invalid/postgres?sslmode=require",
      environment: {
        PATH: "/usr/bin",
        PGOPTIONS: "-c default_transaction_read_only=off",
      },
      planSql: "select '{}'::jsonb;",
    });

    expect(request.environment).toMatchObject({
      PATH: "/usr/bin",
      PGDATABASE: "postgresql://example.invalid/postgres?sslmode=require",
      PGSSLMODE: "require",
    });
    expect(request.environment).not.toHaveProperty("PGOPTIONS");
    expect(request.input).toContain("begin transaction read only");
    expect(request.input).toContain("set local role service_role");
    expect(request.args).toContain("actor_id=31000000-0000-4000-8000-000000000001");
  });
});
