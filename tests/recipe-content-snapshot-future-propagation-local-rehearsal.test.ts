import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

const cliPath =
  "scripts/verify-recipe-content-snapshot-future-propagation-local-rehearsal.mjs";
const verifierPath =
  "scripts/lib/recipe-content-snapshot-future-propagation-local-rehearsal-verifier.mjs";
const SAMPLE_CURRENT_SHA = "a".repeat(40);
const SAMPLE_PREVIOUS_SHA = "b".repeat(40);

type LocalRehearsalVerifierModule = {
  assertRecipeContentSnapshotFuturePropagationLocalRehearsalEnvironment:
    (input: Record<string, unknown>) => unknown;
  buildRecipeContentSnapshotFuturePropagationLocalRehearsalPlan:
    (input: Record<string, unknown>) => Record<string, unknown>;
};

function readRequiredCli() {
  expect(
    existsSync(cliPath),
    `${cliPath} must exist before the local rehearsal CLI contract can pass`,
  ).toBe(true);
  return readFileSync(cliPath, "utf8");
}

async function loadRequiredVerifier(): Promise<LocalRehearsalVerifierModule> {
  expect(
    existsSync(verifierPath),
    `${verifierPath} must exist before the local rehearsal verifier contract can pass`,
  ).toBe(true);
  const moduleUrl = pathToFileURL(resolve(verifierPath)).href;
  const loaded = await import(/* @vite-ignore */ moduleUrl);
  return loaded as LocalRehearsalVerifierModule;
}

describe("recipe content snapshot future propagation local rehearsal verifier contract", () => {
  it("keeps workflow commands and PR bookkeeping on the exact slice", () => {
    const workItem = JSON.parse(readFileSync(
      ".workflow-v2/work-items/recipe-content-snapshot-future-propagation.json",
      "utf8",
    ));
    const status = JSON.parse(readFileSync(".workflow-v2/status.json", "utf8"));
    const statusItem = status.items.find((item: { id: string }) =>
      item.id === "recipe-content-snapshot-future-propagation"
    );
    const unrelatedItem = status.items.find((item: { id: string }) =>
      item.id === "baemin-prototype-planner-week-parity"
    );
    const requiredChecks = [
      ...workItem.verification.required_checks,
      ...statusItem.required_checks,
    ].join("\n");

    expect(requiredChecks).toContain(
      "scripts/verify-recipe-content-snapshot-future-propagation-local-rehearsal.mjs",
    );
    expect(requiredChecks).not.toContain(
      "scripts/verify-recipe-content-snapshot-future-propagation-local-first.mjs",
    );
    expect(statusItem.pr_path).toBe("https://github.com/netsus/homecook/pull/1281");
    expect(unrelatedItem.pr_path).toBe("pending");
  });

  it("defines a pre-merge exact-current-head CLI contract instead of the historical post-merge full-local lane", () => {
    const cli = readRequiredCli();

    expect(cli).not.toContain("post-merge-full-local-read-only");
    expect(cli).not.toContain("full-local-verification-cli-runner.mjs");
    expect(cli).toMatch(/current[-_ ]head|exact[-_ ]current[-_ ]head/i);
    expect(cli).toMatch(/immediate[-_ ]previous/i);
  });

  it("fails closed unless loopback-only opt-in and exact current or immediate-previous SHAs are explicit", async () => {
    const verifier = await loadRequiredVerifier();

    const validEnvironment = {
      local_rehearsal_opt_in: true,
      local_supabase_api_url: "http://127.0.0.1:54321",
      local_database_url: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      current_head_sha: SAMPLE_CURRENT_SHA,
      immediate_previous_sha: SAMPLE_PREVIOUS_SHA,
      resolved_current_head_sha: SAMPLE_CURRENT_SHA,
      resolved_immediate_previous_sha: SAMPLE_PREVIOUS_SHA,
    };

    expect(() =>
      verifier.assertRecipeContentSnapshotFuturePropagationLocalRehearsalEnvironment({
        ...validEnvironment,
      }),
    ).not.toThrow();
    expect(() =>
      verifier.assertRecipeContentSnapshotFuturePropagationLocalRehearsalEnvironment({
        ...validEnvironment,
        local_supabase_api_url: "http://localhost:54321",
      }),
    ).not.toThrow();
    expect(() =>
      verifier.assertRecipeContentSnapshotFuturePropagationLocalRehearsalEnvironment({
        ...validEnvironment,
        local_database_url: "postgresql://postgres:postgres@[::1]:54322/postgres",
      }),
    ).not.toThrow();

    for (const drift of [
      { ...validEnvironment, local_rehearsal_opt_in: false },
      { ...validEnvironment, local_supabase_api_url: "https://supabase.example.com" },
      { ...validEnvironment, local_database_url: "postgresql://postgres:postgres@db.example.com/postgres" },
      { ...validEnvironment, current_head_sha: "short" },
      { ...validEnvironment, immediate_previous_sha: SAMPLE_CURRENT_SHA },
      { ...validEnvironment, resolved_current_head_sha: SAMPLE_PREVIOUS_SHA },
      { ...validEnvironment, resolved_immediate_previous_sha: SAMPLE_CURRENT_SHA },
      { ...validEnvironment, resolved_immediate_previous_sha: null },
    ]) {
      expect(() =>
        verifier.assertRecipeContentSnapshotFuturePropagationLocalRehearsalEnvironment(
          drift,
        ),
      ).toThrow();
    }
  });

  it("builds a structured pre-merge plan with exact collection steps and result schemas", async () => {
    const verifier = await loadRequiredVerifier();

    const plan =
      verifier.buildRecipeContentSnapshotFuturePropagationLocalRehearsalPlan({
        current_head_sha: SAMPLE_CURRENT_SHA,
        immediate_previous_sha: SAMPLE_PREVIOUS_SHA,
      });

    expect(plan).toMatchObject({
      mode: "exact-current-head-local-rehearsal",
      current_head_sha: SAMPLE_CURRENT_SHA,
      immediate_previous_sha: SAMPLE_PREVIOUS_SHA,
      external_writes: 0,
      local_fixture_mutation: "isolated-and-cleaned",
    });
    expect(plan).toHaveProperty("collection_steps");
    expect(plan).toHaveProperty("result_schema");
    expect(JSON.stringify(plan)).not.toContain("post-merge");
    expect(JSON.stringify(plan)).not.toContain("read_only");
  });
});
