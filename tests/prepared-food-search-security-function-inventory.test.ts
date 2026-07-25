import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import { parseFunctionSearchPath } from "../scripts/lib/security-function-config.mjs";

const MANIFEST_PATH =
  "docs/security/prepared-food-search-relevance-security-function-authorization-manifest.json";

describe("prepared food search security function inventory", () => {
  it("isolates search_path from trailing function-local settings", () => {
    expect(parseFunctionSearchPath(
      "{\"search_path=pg_catalog, public, pg_temp\","
        + "\"pg_trgm.word_similarity_threshold=0.3\","
        + "plan_cache_mode=force_custom_plan}",
    )).toEqual(["pg_catalog", "public", "pg_temp"]);
  });

  it("classifies the locked-down helpers and service-only ranked RPC", () => {
    expect(existsSync(MANIFEST_PATH)).toBe(true);

    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as {
      migrations: string[];
      functions: Array<Record<string, unknown>>;
    };

    expect(manifest.migrations).toEqual([
      "supabase/migrations/20260725120000_prepared_food_search_relevance_foundation.sql",
      "supabase/migrations/20260725130000_prepared_food_search_relevance_indexes.sql",
      "supabase/migrations/20260725140000_prepared_food_search_ranked_rpc.sql",
    ]);
    expect(manifest.functions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          signature: "public.normalize_food_search_text(text, boolean)",
          control_class: "application-controlled",
          effect: "read-only",
          exposure: "service-internal",
          allowed_principals: [],
          security_mode: "invoker",
          safe_search_path: ["pg_catalog", "pg_temp"],
        }),
        expect.objectContaining({
          signature: "public.food_search_short_ngrams(text)",
          control_class: "application-controlled",
          effect: "read-only",
          exposure: "service-internal",
          allowed_principals: [],
          security_mode: "invoker",
          safe_search_path: ["pg_catalog", "pg_temp"],
        }),
        expect.objectContaining({
          signature:
            "public.search_food_catalog_ranked(uuid, text, text[], text, integer, jsonb, text, integer)",
          control_class: "application-controlled",
          effect: "read-only",
          exposure: "service-internal",
          allowed_principals: ["service_role"],
          security_mode: "definer",
          safe_search_path: ["pg_catalog", "public", "pg_temp"],
        }),
      ]),
    );
    expect(manifest.functions).toHaveLength(3);
  });

  it("validates the additive manifest without a live database", () => {
    const result = spawnSync(
      "node",
      ["scripts/validate-security-function-authorization.mjs", "--contract-only"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          SECURITY_FUNCTION_DATABASE_URL:
            "postgresql://postgres:postgres@127.0.0.1:1/postgres",
        },
      },
    );
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status, output).toBe(0);
    expect(output).toContain(
      "prepared-food-search-relevance:3 post-migration additive application functions",
    );
  }, 15_000);
});
