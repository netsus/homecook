import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(path, "utf8");
}

describe("Supabase local-only operations contract", () => {
  it("publishes one canonical contract from AGENTS and the official tuple", () => {
    const agents = read("AGENTS.md");
    const sourceOfTruth = read("docs/sync/CURRENT_SOURCE_OF_TRUTH.md");
    const canonical = read("docs/engineering/supabase-local-only-operations.md");

    expect(agents).toContain("docs/engineering/supabase-local-only-operations.md");
    expect(sourceOfTruth).toContain("docs/engineering/supabase-local-only-operations.md");
    expect(sourceOfTruth).toContain("docs/요구사항기준선-v1.7.32.md");
    expect(sourceOfTruth).toContain("docs/화면정의서-v1.5.36.md");
    expect(sourceOfTruth).toContain("docs/유저flow맵-v1.3.34.md");
    expect(sourceOfTruth).toContain("docs/db설계-v1.3.34.md");
    expect(sourceOfTruth).toContain("docs/api문서-v1.2.39.md");
    expect(canonical).toContain("Remote forbidden matrix");
    expect(canonical).toContain("PR #1346 blocker disposition");
    expect(canonical).toContain("Required local gate acceptance");
  });

  it("removes remote package entrypoints and the Cloud-secret OAuth workflow", () => {
    const packageJson = JSON.parse(read("package.json")) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts["verify:security-functions:remote"]).toBeUndefined();
    expect(packageJson.scripts["closeout:security-functions:remote"]).toBeUndefined();
    expect(packageJson.scripts["hybrid-production:start"]).toBeUndefined();
    expect(packageJson.scripts["verify:account-generation:joint-preflight"]).toBeUndefined();
    expect(packageJson.scripts["verify:security-functions:release"]).toBe(
      "pnpm verify:security-functions && pnpm verify:security-functions:data-api",
    );
    expect(existsSync(".github/workflows/playwright-live-oauth.yml")).toBe(false);
    expect(read(".env.example")).toContain("HOMECOOK_AUTH_AUTHORITY=local");
    expect(read(".env.example")).toContain("HOMECOOK_DATA_AUTHORITY=local");
    expect(read(".env.example")).not.toContain(".supabase.co");
    expect(read("infra/hybrid-supabase/.env.production.example")).toContain(
      "HISTORICAL / FORBIDDEN",
    );
    expect(read("infra/hybrid-supabase/PRODUCTION_RUNBOOK.md")).toContain(
      "FORBIDDEN / N/A",
    );
    expect(read("infra/hybrid-supabase/PRODUCTION_RUNBOOK.md")).not.toContain(
      "pnpm hybrid-production:start",
    );
  });

  it("keeps required backup and Data API gates local", () => {
    const backup = read("scripts/lib/full-local-platform-backup.mjs");
    const inventory = read("scripts/full-local-platform-backup.mjs");
    const dataApi = read("scripts/run-security-function-data-api-negative-smoke.mjs");

    expect(backup).toContain('["db", "dump", "--local"');
    expect(backup).not.toContain('"--linked"');
    expect(inventory).toContain('["db", "dump", "--local"');
    expect(inventory).not.toContain('"--linked"');
    expect(dataApi).toContain('{ environment: "local", ...readLocalEnvironment() }');
    expect(dataApi).not.toContain("readRemoteEnvironment");
    expect(dataApi).not.toContain("resolveSecurityFunctionLinkedRoot");
  });
});
