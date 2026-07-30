import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("hybrid Storage internal boundary contract", () => {
  it("pins JWKS Storage behind the only loopback gateway entrypoint", () => {
    const compose = readFileSync(
      "infra/hybrid-supabase/docker-compose.integration.yml",
      "utf8",
    );
    const gateway = readFileSync(
      "infra/hybrid-supabase/loopback-gateway.mjs",
      "utf8",
    );

    expect(compose).not.toMatch(/\bports\s*:/);
    expect(compose).toMatch(/supabase\/storage-api:v1\.60\.4/);
    expect(compose).toMatch(/JWT_JWKS:.*COMBINED_JWKS/);
    expect(compose).toMatch(/STORAGE_UPSTREAM_URL:\s*http:\/\/storage:5000/);
    expect(gateway).toMatch(/claims\.role !== "authenticated"/);
    expect(gateway).toMatch(/readRemoteUser/);
    expect(gateway).toMatch(/assertAuthority/);
    expect(gateway).not.toMatch(/async function persistAuthority/);
    expect(gateway).toMatch(/ACCOUNT_SESSION_STALE/);
  });

  it("removes anon/authenticated mutation policies from final recipe image buckets", () => {
    const migration = readFileSync(
      "supabase/migrations/20260730223000_hybrid_storage_browser_mutation_deny.sql",
      "utf8",
    );

    expect(migration).toMatch(
      /drop policy if exists recipe_images_insert_own/i,
    );
    expect(migration).toMatch(
      /drop policy if exists recipe_images_update_own/i,
    );
    expect(migration).toMatch(
      /drop policy if exists recipe_images_delete_own/i,
    );
    expect(migration).toMatch(
      /cmd in \('INSERT', 'UPDATE', 'DELETE', 'ALL'\)/i,
    );
    expect(migration).toMatch(
      /recipe-images-private/i,
    );
    expect(migration).not.toMatch(/create policy[\s\S]*for (insert|update|delete)/i);
  });
});
