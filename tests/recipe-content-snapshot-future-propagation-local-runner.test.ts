import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

const runnerPath =
  "scripts/run-recipe-content-snapshot-future-propagation-local-rehearsal.mjs";
const helperPath =
  "scripts/lib/recipe-content-snapshot-future-propagation-local-runner.mjs";
const CURRENT_SHA = "a".repeat(40);
const PREVIOUS_SHA = "b".repeat(40);

type RunnerModule = {
  assertLocalRehearsalRunnerInput(input: Record<string, unknown>): unknown;
  buildLocalRehearsalCollectorContract(): Record<string, unknown>;
  buildLocalRehearsalResourcePlan(input: Record<string, unknown>): Record<string, unknown>;
  buildSanitizedRunnerSummary(plan: Record<string, unknown>): Record<string, unknown>;
};

function readRequiredFile(path: string, label: string) {
  expect(
    existsSync(path),
    `${path} must exist before the ${label} contract can pass`,
  ).toBe(true);
  return readFileSync(path, "utf8");
}

async function loadHelper(): Promise<RunnerModule> {
  readRequiredFile(helperPath, "local rehearsal helper");
  return import(
    /* @vite-ignore */ pathToFileURL(resolve(helperPath)).href
  ) as Promise<RunnerModule>;
}

describe("recipe content snapshot future propagation local rehearsal runner contract", () => {
  it("uses repo-owned files without invoking the default Supabase lifecycle", () => {
    const runner = readRequiredFile(runnerPath, "local rehearsal runner");
    const helper = readRequiredFile(helperPath, "local rehearsal helper");

    expect(runner).toContain("recipe-content-snapshot-future-propagation-local-runner");
    expect(helper).toContain("recipe-content-snapshot-future-propagation-local-runner");
    expect(runner).not.toMatch(/\bsupabase\s+(?:stop|db\s+reset|start)\b/iu);
    expect(helper).not.toMatch(/\bsupabase\s+(?:stop|db\s+reset|start)\b/iu);
  });

  it("fails closed on missing opt-in, ambiguous SHAs, relative reports, or unsafe input", async () => {
    const helper = await loadHelper();
    const valid = {
      local_rehearsal_opt_in: true,
      current_head_sha: CURRENT_SHA,
      immediate_previous_sha: PREVIOUS_SHA,
      report_path: "/tmp/homecook-rehearsal-report.json",
    };

    expect(() => helper.assertLocalRehearsalRunnerInput(valid)).not.toThrow();
    for (const drift of [
      { ...valid, local_rehearsal_opt_in: false },
      { ...valid, immediate_previous_sha: CURRENT_SHA },
      { ...valid, current_head_sha: "short" },
      { ...valid, report_path: "relative/report.json" },
    ]) {
      expect(() => helper.assertLocalRehearsalRunnerInput(drift)).toThrow();
    }
  });

  it("builds unique full-local loopback resources and bounded finally cleanup", async () => {
    const helper = await loadHelper();
    const plan = helper.buildLocalRehearsalResourcePlan({
      current_head_sha: CURRENT_SHA,
      immediate_previous_sha: PREVIOUS_SHA,
      run_id: "abc123",
      temp_root: "/tmp/homecook-rehearsal-abc123",
      ports: {
        gateway: 41001,
        auth_proxy: 41002,
        https: 41003,
        postgres: 41004,
        app: 41005,
      },
    });

    expect(plan).toMatchObject({
      compose_file: "infra/full-local-supabase/docker-compose.production.yml",
      runtime_helper: "scripts/lib/full-local-production-runtime.mjs",
      compose_project: "homecook-rehearsal-abc123",
      secret_directory_mode: "0700",
      secret_file_mode: "0600",
      external_writes: 0,
      cleanup: {
        strategy: "finally",
        remove_temporary_worktrees: true,
        remove_temporary_root: true,
      },
      loopback: {
        issuer: "https://127.0.0.1:41003/auth/v1",
      },
    });
    expect(JSON.stringify(plan)).not.toContain("127.0.0.1:54321");
    expect(() => helper.buildLocalRehearsalResourcePlan({
      current_head_sha: CURRENT_SHA,
      immediate_previous_sha: PREVIOUS_SHA,
      run_id: "abc123",
      temp_root: "/tmp/homecook-rehearsal-abc123",
      ports: {
        gateway: 41001,
        auth_proxy: 41001,
        https: 41003,
        postgres: 41004,
        app: 41005,
      },
    })).toThrow(/distinct/iu);
  });

  it("keeps stdout summaries free of paths, credentials, tokens, rows, and digests", async () => {
    const helper = await loadHelper();
    const plan = helper.buildLocalRehearsalResourcePlan({
      current_head_sha: CURRENT_SHA,
      immediate_previous_sha: PREVIOUS_SHA,
      run_id: "summary1",
      temp_root: "/tmp/homecook-rehearsal-summary1",
      ports: {
        gateway: 42001,
        auth_proxy: 42002,
        https: 42003,
        postgres: 42004,
        app: 42005,
      },
    });
    const summary = helper.buildSanitizedRunnerSummary(plan);

    expect(summary).not.toHaveProperty("temp_root");
    expect(JSON.stringify(summary)).not.toMatch(
      /secret|token|digest|password|postgresql:|\/tmp\//iu,
    );
  });

  it("locks the implemented live collector contract", async () => {
    const helper = await loadHelper();
    const contract = helper.buildLocalRehearsalCollectorContract();

    expect(contract).toMatchObject({
      collector_status: "implemented",
      authenticated_callers: ["owner_a", "owner_b"],
      expected_denial: { status: 404, error_code: "RESOURCE_NOT_FOUND" },
      digest_invariance: ["recipe", "content", "meal", "shopping", "claim", "session"],
      release_matrix: ["current", "immediate_previous"],
      production_writes: 0,
      staging_writes: 0,
      remote_writes: 0,
    });
    expect(contract).toHaveProperty("route_requests", [
      { method: "POST", path: "/api/v1/recipes/:id/future-plan-impact" },
      { method: "PATCH", path: "/api/v1/recipes/:id" },
    ]);
  });
});
