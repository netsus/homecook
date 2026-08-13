import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(path, "utf8");
}

function filesUnder(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
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
    expect(packageJson.scripts["test:hybrid-supabase:runtime"]).toBeUndefined();
    expect(packageJson.scripts["test:hybrid-supabase:postgres"]).toBeUndefined();
    expect(packageJson.scripts["test:hybrid-supabase:storage"]).toBeUndefined();
    expect(packageJson.scripts["test:hybrid-production:runtime"]).toBeUndefined();
    expect(packageJson.scripts["verify:account-generation:joint-preflight"]).toBeUndefined();
    expect(packageJson.scripts["full-local-production:storage-copy:plan"]).toBeUndefined();
    expect(packageJson.scripts["full-local-production:storage-copy"]).toBeUndefined();
    expect(packageJson.scripts["full-local-production:storage-copy:verify"]).toBeUndefined();
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

  it("relocks the active full-local workpack to the current tuple and quarantines migration history", () => {
    const readme = read("docs/workpacks/full-local-supabase-production/README.md");
    const acceptance = read("docs/workpacks/full-local-supabase-production/acceptance.md");
    const activeReadme = readme.split("## Historical appendix / FORBIDDEN N/A")[0];

    for (const expected of [
      "v1.7.32",
      "v1.5.36",
      "v1.3.34",
      "DB v1.3.34",
      "API v1.2.39",
    ]) {
      expect(readme).toContain(expected);
    }
    expect(acceptance).toContain("v1.7.32/v1.5.36/v1.3.34/DB v1.3.34/API v1.2.39");
    expect(readme).toContain("## Historical appendix / FORBIDDEN N/A");
    expect(activeReadme).not.toMatch(/remote-default|hosted S3|migration source-of-record/iu);
  });

  it("keeps active package, CI, runbook, and workpack surfaces free of remote execution", () => {
    const packageScripts = JSON.stringify(
      (JSON.parse(read("package.json")) as { scripts: Record<string, string> }).scripts,
    );
    const workflowText = filesUnder(".github/workflows")
      .map((path) => read(path))
      .join("\n");
    const ciWorkflow = read(".github/workflows/ci.yml");
    const activeDocs = [
      "docs/engineering/current-mac-production-plan.md",
      "docs/engineering/full-local-session-lifecycle-runbook.md",
      "docs/workpacks/youtube-async-extraction-notification/README.md",
      "docs/workpacks/youtube-async-extraction-notification/acceptance.md",
      "docs/workpacks/full-local-supabase-production/README.md",
      "docs/workpacks/full-local-supabase-production/acceptance.md",
    ].map((path) => {
      const text = read(path);
      return text.split("## Historical appendix / FORBIDDEN N/A")[0];
    }).join("\n");
    const forbiddenExecution = /(?:supabase\s+link|db\s+push|--linked|HOMECOOK_HOSTED_SUPABASE|SUPABASE_ACCESS_TOKEN|SUPABASE_DB_PASSWORD)/iu;

    expect(packageScripts).not.toMatch(forbiddenExecution);
    expect(workflowText).not.toMatch(forbiddenExecution);
    expect(packageScripts).not.toContain("tests/hybrid-isolated-runtime.test.ts");
    expect(ciWorkflow).not.toContain("hybrid-authority-runtime");
    expect(ciWorkflow).not.toContain("test:hybrid-supabase:runtime");
    expect(ciWorkflow).toMatch(/supabase\/setup-cli@\S+[\s\S]*?version:\s*2\.110\.0/iu);
    expect(activeDocs).not.toMatch(forbiddenExecution);
  });

  it("allows remote command and credential literals only in the explicit historical inventory", () => {
    const forbiddenExecution = /(?:supabase\s+link|db\s+push|--linked|HOMECOOK_HOSTED_SUPABASE|SUPABASE_ACCESS_TOKEN|SUPABASE_DB_PASSWORD)/iu;
    const allowedScriptHistory = new Set([
      "scripts/lib/account-generation-auth-hook-config-verifier.mjs",
      "scripts/local-supabase-storage-copy.mjs",
      "scripts/run-security-function-authorization-postgres-integration.mjs",
      "scripts/security-function-linked-root.mjs",
      "scripts/validate-security-function-authorization.mjs",
      "scripts/verify-account-generation-auth-hook-config.mjs",
      "scripts/verify-account-session-generation-remote.mjs",
      "scripts/verify-recipe-snapshot-authority-remote.mjs",
      "scripts/verify-recipe-visibility-read-hardening-remote.mjs",
    ]);
    const allowedDocHistory = new Set([
      "docs/engineering/supabase-local-only-operations.md",
      "docs/engineering/supabase-migrations.md",
      "docs/workpacks/28-external-ingredient-data-ingest-gate/db-quality-report-2026-06-25.md",
      "docs/workpacks/28-external-ingredient-data-ingest-gate/launch-ingredient-db-load-plan-2026-06-24.md",
      "docs/workpacks/28-external-ingredient-data-ingest-gate/launch-recipe-db-load-plan-2026-06-25.md",
      "docs/workpacks/28-external-ingredient-data-ingest-gate/live-fetch-balanced-sample-2026-05-29.md",
      "docs/workpacks/full-local-supabase-production/acceptance.md",
    ]);
    const scriptMatches = filesUnder("scripts")
      .filter((path) => forbiddenExecution.test(read(path)));
    const docMatches = [
      ...filesUnder("docs/engineering"),
      ...filesUnder("docs/workpacks"),
    ].filter((path) => forbiddenExecution.test(read(path)));
    const packageScripts = Object.values(
      (JSON.parse(read("package.json")) as { scripts: Record<string, string> }).scripts,
    ).join("\n");

    expect(new Set(scriptMatches)).toEqual(allowedScriptHistory);
    expect(new Set(docMatches)).toEqual(allowedDocHistory);
    for (const historicalPath of [...allowedScriptHistory].filter((path) => ![
      "scripts/run-security-function-authorization-postgres-integration.mjs",
      "scripts/validate-security-function-authorization.mjs",
    ].includes(path))) {
      expect(packageScripts).not.toContain(historicalPath);
    }
    expect(read("scripts/run-security-function-authorization-postgres-integration.mjs"))
      .toContain("Remote/linked Supabase verification is forbidden");
    expect(read("scripts/validate-security-function-authorization.mjs"))
      .toContain("Remote/linked Supabase verification is forbidden");
    expect(read("scripts/local-supabase-storage-copy.mjs")).toContain(
      "FORBIDDEN: hosted-to-local Storage copy",
    );
    const hybridVerifier = spawnSync(
      process.execPath,
      ["scripts/verify-hybrid-supabase.mjs", "--mode", "production-runtime-docker"],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    expect(hybridVerifier.status).not.toBe(0);
    expect(hybridVerifier.stderr).toContain(
      "FORBIDDEN: hybrid remote/local verification is historical",
    );
    const remoteMirror = spawnSync(
      process.execPath,
      ["scripts/hybrid-remote-auth-mirror.mjs", "apply", "--remote-env", "/tmp/forbidden"],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    expect(remoteMirror.status).not.toBe(0);
    expect(remoteMirror.stderr).toContain(
      "FORBIDDEN: remote Auth mirror is historical",
    );
    for (const [path, message] of [
      ["scripts/verify-account-generation-auth-hook-config.mjs", "remote Supabase auth-hook"],
      ["scripts/verify-account-session-generation-remote.mjs", "remote account-session"],
      ["scripts/verify-recipe-snapshot-authority-remote.mjs", "remote recipe-snapshot"],
      ["scripts/verify-recipe-visibility-read-hardening-remote.mjs", "remote recipe-visibility"],
    ]) {
      const historicalCli = spawnSync(
        process.execPath,
        [path, "--remote-env", "/tmp/forbidden", "--linked-root", "/tmp/forbidden"],
        { cwd: process.cwd(), encoding: "utf8" },
      );
      expect(historicalCli.status, path).not.toBe(0);
      expect(historicalCli.stderr, path).toContain(`FORBIDDEN: ${message}`);
    }

    for (const path of [
      "scripts/youtube-real-app-route-smoke.mjs",
      "scripts/qa-seed-slices-01-05.mjs",
    ]) {
      const hostedOperator = spawnSync(process.execPath, [path], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          HOMECOOK_AUTH_AUTHORITY: "local",
          HOMECOOK_DATA_AUTHORITY: "local",
          HOMECOOK_YOUTUBE_FIXTURE_PROVIDER: "0",
          NEXT_PUBLIC_SUPABASE_URL: "https://forbidden-project.supabase.co",
          NODE_ENV: "development",
          SUPABASE_SERVICE_ROLE_KEY: "forbidden-service-role-key",
        },
      });
      expect(hostedOperator.status, path).not.toBe(0);
      expect(hostedOperator.stderr, path).toMatch(/local-only|loopback/iu);
    }
  });

  it("tombstones every directly executable remote Auth legacy command before credentials or network", () => {
    const legacyCommands = [
      {
        path: "scripts/run-hybrid-revoked-session-canary.mjs",
        args: [
          "--allow-hosted-session-revocation",
          "--expected-project-ref",
          "forbidden-project",
        ],
        message: "FORBIDDEN: hosted revoked-session canary is historical",
      },
      {
        path: "scripts/sync-remote-auth-jwks.mjs",
        args: [
          "--endpoint",
          "https://forbidden-project.supabase.co/auth/v1/.well-known/jwks.json",
          "--issuer",
          "https://forbidden-project.supabase.co/auth/v1",
          "--local-jwks",
          "/tmp/forbidden-local-jwks.json",
          "--output",
          "/tmp/forbidden-combined-jwks.json",
        ],
        message: "FORBIDDEN: remote Auth JWKS sync is historical",
      },
    ];

    for (const legacyCommand of legacyCommands) {
      const result = spawnSync(process.execPath, [
        legacyCommand.path,
        ...legacyCommand.args,
      ], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          AUTH_SUPABASE_EXPECTED_ISSUER:
            "https://forbidden-project.supabase.co/auth/v1",
          AUTH_SUPABASE_JWKS_URL:
            "https://forbidden-project.supabase.co/auth/v1/.well-known/jwks.json",
          HYBRID_CANARY_ACCESS_TOKEN: "forbidden-access-token",
          HYBRID_CANARY_DISPOSABLE: "YES-REVOKE-THIS-SESSION",
          HYBRID_CANARY_REFRESH_TOKEN: "forbidden-refresh-token",
          NEXT_PUBLIC_AUTH_SUPABASE_PUBLISHABLE_KEY: "forbidden-publishable-key",
          NEXT_PUBLIC_AUTH_SUPABASE_URL:
            "https://forbidden-project.supabase.co",
        },
      });

      expect(result.status, legacyCommand.path).not.toBe(0);
      expect(result.stderr, legacyCommand.path).toContain(legacyCommand.message);
      const source = read(legacyCommand.path);
      expect(source, legacyCommand.path).not.toMatch(
        /@supabase\/supabase-js|\bfetch\s*\(|process\.env|readFileSync|writeFileSync|renameSync/,
      );
    }
  });

  it("keeps remote Auth legacy commands out of active imports, package scripts, and CI", () => {
    const legacyCommands = [
      "run-hybrid-revoked-session-canary.mjs",
      "sync-remote-auth-jwks.mjs",
    ];
    const packageScripts = Object.values(
      (JSON.parse(read("package.json")) as { scripts: Record<string, string> }).scripts,
    ).join("\n");
    const workflows = filesUnder(".github/workflows")
      .map((path) => read(path))
      .join("\n");
    const activeScriptImports = filesUnder("scripts")
      .filter((path) => !legacyCommands.some((name) => path.endsWith(name)))
      .map((path) => read(path))
      .join("\n");

    for (const legacyCommand of legacyCommands) {
      expect(packageScripts).not.toContain(legacyCommand);
      expect(workflows).not.toContain(legacyCommand);
      expect(activeScriptImports).not.toContain(legacyCommand);
    }
  });

  it("keeps required backup and Data API gates local", () => {
    const backup = read("scripts/lib/full-local-platform-backup.mjs");
    const inventory = read("scripts/full-local-platform-backup.mjs");
    const dataApi = read("scripts/run-security-function-data-api-negative-smoke.mjs");
    const productionRuntime = read("scripts/full-local-production-runtime.mjs");

    expect(backup).toContain('["db", "dump", "--local"');
    expect(backup).not.toContain('"--linked"');
    expect(inventory).not.toContain('["db", "dump", "--local"');
    expect(inventory).toContain("dumpFullLocalProductionDatabase");
    expect(inventory).toContain("selectFullLocalProductionResources");
    expect(inventory).toContain("buildPinnedSupabaseCliInvocation");
    expect(inventory).toContain("PINNED_SUPABASE_CLI_VERSION");
    expect(inventory).toContain("beginConsistentCut");
    expect(inventory).toContain("captureSource");
    expect(inventory).toContain("sourceIdentity");
    expect(inventory).not.toContain('run("supabase"');
    expect(inventory).not.toContain('"--linked"');
    expect(dataApi).toContain('{ environment: "local", ...readLocalEnvironment() }');
    expect(dataApi).not.toContain("readRemoteEnvironment");
    expect(dataApi).not.toContain("resolveSecurityFunctionLinkedRoot");
    expect(productionRuntime).toContain("storagePayloadPath");
    expect(productionRuntime).toContain("buildDockerStorageVolumeRestoreInvocation");
    expect(productionRuntime).toContain("verifyStoragePayloadManifest");
    expect(productionRuntime).toContain("mapStorageRowsToPayloadReferences");
  });
});
