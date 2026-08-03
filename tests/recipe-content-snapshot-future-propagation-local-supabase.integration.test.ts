import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const adapterPath =
  "scripts/lib/recipe-content-snapshot-future-propagation-full-local-adapter.mjs";
const enabled =
  process.env.HOMECOOK_RECIPE_FUTURE_LOCAL_COLLECTOR_TEST === "1";
const run = enabled ? describe : describe.skip;

type AdapterModule = {
  createRecipeContentSnapshotFuturePropagationFullLocalAdapter(input: {
    plan: Record<string, unknown>;
    reportPath: string;
  }): {
    collectTwoOwner(input: Record<string, unknown>): Promise<Record<string, unknown>>;
    cleanup(input: Record<string, unknown>): Promise<void>;
    prepare(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  };
};

run("recipe content snapshot future propagation isolated full-local adapter", () => {
  it("boots only unique loopback resources and removes them in finally", async () => {
    expect(
      existsSync(adapterPath),
      `${adapterPath} must exist before the isolated full-local smoke can pass`,
    ).toBe(true);
    const adapterModule = await import(
      /* @vite-ignore */ pathToFileURL(resolve(adapterPath)).href
    ) as AdapterModule;
    const temporaryRoot = join(tmpdir(), `homecook-rehearsal-test-${process.pid}`);
    const currentHeadSha = execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
    const immediatePreviousSha = execFileSync(
      "git",
      ["merge-base", "HEAD", "origin/master"],
      { encoding: "utf8" },
    ).trim();
    const plan = {
      mode: "isolated-full-local-rehearsal-plan",
      current_head_sha: currentHeadSha,
      immediate_previous_sha: immediatePreviousSha,
      compose_file: "infra/full-local-supabase/docker-compose.production.yml",
      runtime_helper: "scripts/lib/full-local-production-runtime.mjs",
      compose_project: `homecook-rehearsal-test-${process.pid}`,
      postgres_volume: `homecook-rehearsal-test-${process.pid}-postgres`,
      storage_volume: `homecook-rehearsal-test-${process.pid}-storage`,
      temp_root: temporaryRoot,
      secret_directory_mode: "0700",
      secret_file_mode: "0600",
      loopback: {
        gateway_url: "http://127.0.0.1:43101",
        auth_proxy_url: "http://127.0.0.1:43102",
        public_auth_url: "https://127.0.0.1:43103",
        issuer: "https://127.0.0.1:43103/auth/v1",
        postgres_port: 43104,
        app_url: "http://127.0.0.1:43105",
      },
      full_local_env: {
        FULL_LOCAL_API_EXTERNAL_URL:
          "https://127.0.0.1:43103/auth/v1",
        FULL_LOCAL_COMPOSE_PROJECT_NAME:
          `homecook-rehearsal-test-${process.pid}`,
        FULL_LOCAL_POSTGRES_VOLUME_NAME:
          `homecook-rehearsal-test-${process.pid}-postgres`,
        FULL_LOCAL_STORAGE_VOLUME_NAME:
          `homecook-rehearsal-test-${process.pid}-storage`,
      },
      cleanup: {
        strategy: "finally",
        compose_project: `homecook-rehearsal-test-${process.pid}`,
        remove_only_named_volumes: [
          `homecook-rehearsal-test-${process.pid}-postgres`,
          `homecook-rehearsal-test-${process.pid}-storage`,
        ],
        remove_temporary_worktrees: true,
        remove_temporary_root: true,
      },
      external_writes: 0,
    };
    const adapter =
      adapterModule.createRecipeContentSnapshotFuturePropagationFullLocalAdapter({
        plan,
        reportPath: `/tmp/homecook-rehearsal-test-${process.pid}.json`,
      });

    let runtime: Record<string, unknown> | null = null;
    try {
      runtime = await adapter.prepare({ plan });
      expect(runtime).toMatchObject({
        auth_jwt_algorithm: "ES256",
        compose_project: plan.compose_project,
        external_writes: 0,
        issuer: plan.loopback.issuer,
        migrations_applied: true,
      });
      await expect(adapter.collectTwoOwner({
        plan,
        releaseSha: plan.current_head_sha,
        runtime,
      })).resolves.toMatchObject({
        authenticated_owner_caller_present: true,
        patch_missing_recipe: {
          error_code: "RESOURCE_NOT_FOUND",
          status: 404,
        },
        patch_other_owner_recipe: {
          error_code: "RESOURCE_NOT_FOUND",
          status: 404,
        },
        preview_missing_recipe: {
          error_code: "RESOURCE_NOT_FOUND",
          status: 404,
        },
        preview_other_owner_recipe: {
          error_code: "RESOURCE_NOT_FOUND",
          status: 404,
        },
        production_writes: 0,
        remote_writes: 0,
        staging_writes: 0,
        unchanged_digest_scope_count: 6,
      });
    } finally {
      await adapter.cleanup({ plan, runtime });
    }
  }, 240_000);
});
