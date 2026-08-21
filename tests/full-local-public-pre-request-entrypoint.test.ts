import { existsSync, readFileSync, readdirSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migrationName =
  "20260821170000_full_local_public_pre_request_entrypoint.sql";
const migrationPath = `supabase/migrations/${migrationName}`;
const migration = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8")
  : "";
const hardeningMigrationName =
  "20260821180000_full_local_missing_scope_fail_closed.sql";
const hardeningMigrationPath = `supabase/migrations/${hardeningMigrationName}`;
const hardeningMigration = existsSync(hardeningMigrationPath)
  ? readFileSync(hardeningMigrationPath, "utf8")
  : "";
const wrapper = "public.verify_hybrid_request_authority_pre_request";
const compose = readFileSync(
  "infra/hybrid-supabase/docker-compose.integration.yml",
  "utf8",
);
const productionCompose = readFileSync(
  "infra/hybrid-supabase/docker-compose.production.yml",
  "utf8",
);
const postgresRunner = readFileSync(
  "scripts/run-account-session-generation-postgres-integration.mjs",
  "utf8",
);
const hybridRuntimeTest = readFileSync(
  "tests/hybrid-isolated-runtime.test.ts",
  "utf8",
);
const manifest = JSON.parse(readFileSync(
  "docs/security/account-session-generation-security-function-authorization-manifest.json",
  "utf8",
)) as {
  migrations: string[];
  functions: Array<{
    allowed_principals: string[];
    control_class: string;
    effect: string;
    exposure: string;
    safe_search_path: string[];
    security_mode: string;
    signature: string;
  }>;
};

describe("full-local public PostgREST pre-request entrypoint", () => {
  it("adds one migration that delegates only to the private authority verifier", () => {
    expect(existsSync(migrationPath)).toBe(true);
    expect(migration).toContain(
      `create or replace function ${wrapper}()`,
    );
    expect(migration).toMatch(/returns void\s+language plpgsql/iu);
    expect(migration).toMatch(/security definer/iu);
    expect(migration).toMatch(
      /set search_path = pg_catalog, public, private, pg_temp/iu,
    );
    expect(migration).toMatch(
      /begin\s+perform private\.verify_hybrid_request_authority\(\);\s+end;/iu,
    );
    const body = migration.match(/as \$function\$([\s\S]*?)\$function\$/iu)?.[1] ?? "";
    expect(body.match(/\bperform\b/giu)).toHaveLength(1);
    expect(body).not.toMatch(/\b(insert|update|delete|select|execute)\b/iu);
  });

  it("locks owner, ACL, PostgREST role config, and reload notification", () => {
    expect(migration).toMatch(
      new RegExp(`alter function ${wrapper.replaceAll(".", "\\.")}\\(\\)\\s+owner to postgres`, "iu"),
    );
    expect(migration).toMatch(
      new RegExp(`revoke all on function ${wrapper.replaceAll(".", "\\.")}\\(\\)\\s+from public, anon, authenticated, service_role`, "iu"),
    );
    expect(migration).toMatch(
      new RegExp(`grant execute on function ${wrapper.replaceAll(".", "\\.")}\\(\\)\\s+to anon, authenticated, service_role`, "iu"),
    );
    expect(migration).toMatch(
      new RegExp(`alter role authenticator set pgrst\\.db_pre_request\\s*=\\s*'${wrapper.replaceAll(".", "\\.")}'`, "iu"),
    );
    expect(migration).toMatch(/notify pgrst,\s*'reload config'/iu);
    expect(migration).not.toMatch(
      /grant\s+(?:usage|execute)[\s\S]*private\.verify_hybrid_request_authority/iu,
    );
  });

  it("fails closed on missing scopes before delegating exactly once", () => {
    expect(existsSync(hardeningMigrationPath)).toBe(true);
    expect(hardeningMigration).toContain(
      `create or replace function ${wrapper}()`,
    );
    expect(hardeningMigration).toMatch(/returns void\s+language plpgsql/iu);
    expect(hardeningMigration).toMatch(/security definer/iu);
    expect(hardeningMigration).toMatch(
      /set search_path = pg_catalog, public, private, pg_temp/iu,
    );
    expect(hardeningMigration).toMatch(
      new RegExp(`alter function ${wrapper.replaceAll(".", "\\.")}\\(\\)\\s+owner to postgres`, "iu"),
    );
    expect(hardeningMigration).toMatch(
      new RegExp(`revoke all on function ${wrapper.replaceAll(".", "\\.")}\\(\\)\\s+from public, anon, authenticated, service_role`, "iu"),
    );
    expect(hardeningMigration).toMatch(
      new RegExp(`grant execute on function ${wrapper.replaceAll(".", "\\.")}\\(\\)\\s+to anon, authenticated, service_role`, "iu"),
    );
    expect(hardeningMigration).toMatch(
      new RegExp(`alter role authenticator set pgrst\\.db_pre_request\\s*=\\s*'${wrapper.replaceAll(".", "\\.")}'`, "iu"),
    );
    expect(hardeningMigration).toMatch(/notify pgrst,\s*'reload config'/iu);
    expect(hardeningMigration).toMatch(
      /current_setting\('request\.jwt\.claims',\s*true\)/iu,
    );
    expect(hardeningMigration).toMatch(
      /current_setting\('request\.headers',\s*true\)/iu,
    );
    expect(hardeningMigration).toMatch(
      /v_role\s*=\s*'service_role'[\s\S]*btrim\(coalesce\(v_headers\s*->>\s*'x-homecook-internal-scope',\s*''\)\)\s*=\s*''/iu,
    );
    expect(hardeningMigration).toMatch(
      /v_role\s*=\s*'anon'[\s\S]*btrim\(coalesce\(v_headers\s*->>\s*'x-homecook-public-read-scope',\s*''\)\)\s*=\s*''/iu,
    );
    expect(hardeningMigration.match(/raise exception 'ACCOUNT_SESSION_STALE'/giu))
      .toHaveLength(2);
    expect(hardeningMigration.match(/using errcode = '55000'/giu))
      .toHaveLength(2);
    expect(
      hardeningMigration.match(
        /perform private\.verify_hybrid_request_authority\(\)/giu,
      ),
    ).toHaveLength(1);
    expect(hardeningMigration).not.toMatch(
      /admin-data|auth-flow|request-authority|recipe-detail|recipe-cook-mode/iu,
    );
    expect(hardeningMigration).not.toMatch(
      /grant\s+(?:usage|execute)[\s\S]*private\.verify_hybrid_request_authority/iu,
    );
  });

  it("keeps the wrapper RPC path outside every authority allowlist", () => {
    const allMigrations = readdirSync("supabase/migrations")
      .filter((file) => file.endsWith(".sql"))
      .map((file) => readFileSync(`supabase/migrations/${file}`, "utf8"))
      .join("\n");

    expect(allMigrations).not.toContain(
      "/rpc/verify_hybrid_request_authority_pre_request",
    );
    expect(migration).toContain(
      "Direct RPC requests are rejected by the delegated authority verifier",
    );
  });

  it("uses the public entrypoint in the isolated PostgREST runtime", () => {
    for (const runtime of [compose, productionCompose]) {
      expect(runtime).toMatch(
        /PGRST_DB_PRE_REQUEST:\s*public\.verify_hybrid_request_authority_pre_request/iu,
      );
      expect(runtime).not.toMatch(
        /PGRST_DB_PRE_REQUEST:\s*private\.verify_hybrid_request_authority/iu,
      );
    }
  });

  it("applies the canonical migration after every runtime bootstrap path", () => {
    const boundedMigration =
      "supabase/migrations/20260820120000_full_local_session_bounded_token_overlap.sql";
    expect(postgresRunner).toContain(boundedMigration);
    expect(postgresRunner).toContain(migrationPath);
    expect(postgresRunner.indexOf(boundedMigration))
      .toBeLessThan(postgresRunner.indexOf(migrationPath));
    expect(postgresRunner.split(migrationPath)).toHaveLength(3);

    const runtimeMount =
      "./runtime-bootstrap.sql:/docker-entrypoint-initdb.d/zy-homecook-runtime-bootstrap.sql:ro";
    const migrationMount =
      `../../${migrationPath}:/docker-entrypoint-initdb.d/zzz-homecook-public-pre-request.sql:ro`;
    expect(compose).toContain(runtimeMount);
    expect(compose).toContain(migrationMount);
    expect(compose.indexOf(runtimeMount)).toBeLessThan(compose.indexOf(migrationMount));
    expect(compose).toContain(
      "to_regprocedure('public.verify_hybrid_request_authority_pre_request()') is not null",
    );
    expect(compose.indexOf(migrationMount))
      .toBeLessThan(compose.indexOf("\n  postgrest:\n"));
    expect(hybridRuntimeTest).toContain(
      "const publicPreRequestMigration = readFileSync(",
    );
    expect(hybridRuntimeTest).not.toMatch(
      /input:\s*readFileSync\(\s*["']infra\/hybrid-supabase\/runtime-bootstrap\.sql["']/gu,
    );
    expect(hybridRuntimeTest.split("input: publicPreRequestMigration"))
      .toHaveLength(3);

    expect(postgresRunner.indexOf(migrationPath))
      .toBeLessThan(postgresRunner.indexOf(hardeningMigrationPath));
    expect(postgresRunner.split(hardeningMigrationPath)).toHaveLength(3);
    const hardeningMount =
      `../../${hardeningMigrationPath}:/docker-entrypoint-initdb.d/zzzz-homecook-missing-scope-fail-closed.sql:ro`;
    expect(compose).toContain(hardeningMount);
    expect(compose.indexOf(migrationMount)).toBeLessThan(
      compose.indexOf(hardeningMount),
    );
    expect(hybridRuntimeTest).toContain(
      "const missingScopeHardeningMigration = readFileSync(",
    );
    expect(hybridRuntimeTest.split("input: missingScopeHardeningMigration"))
      .toHaveLength(3);
  });

  it("classifies the self-blocking wrapper as service-internal", () => {
    expect(manifest.migrations).toContain(migrationPath);
    expect(manifest.migrations).toContain(hardeningMigrationPath);
    expect(manifest.functions).toContainEqual({
      signature: `${wrapper}()`,
      control_class: "application-controlled",
      effect: "read-only",
      exposure: "service-internal",
      allowed_principals: ["anon", "authenticated", "service_role"],
      owner: "postgres",
      security_mode: "definer",
      safe_search_path: ["pg_catalog", "public", "private", "pg_temp"],
    });
  });
});
