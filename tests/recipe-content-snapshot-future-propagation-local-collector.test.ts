import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it, vi } from "vitest";

const collectorPath =
  "scripts/lib/recipe-content-snapshot-future-propagation-local-collector.mjs";
const CURRENT_SHA = "a".repeat(40);
const PREVIOUS_SHA = "b".repeat(40);

type CollectorModule = {
  runRecipeContentSnapshotFuturePropagationLocalCollector(input: {
    adapter: Record<string, unknown>;
    plan: Record<string, unknown>;
    reportPath: string;
  }): Promise<Record<string, unknown>>;
};

async function loadCollector(): Promise<CollectorModule> {
  expect(
    existsSync(collectorPath),
    `${collectorPath} must exist before the live collector contract can pass`,
  ).toBe(true);
  return import(
    /* @vite-ignore */ pathToFileURL(resolve(collectorPath)).href
  ) as Promise<CollectorModule>;
}

function releaseEntry(releaseSha: string) {
  return {
    release_sha: releaseSha,
    personal_recipe_v2_enabled: false,
    snapshot_v2_creation_enabled: false,
    personal_entry_count: 0,
    personal_caller_count: 0,
    recipe_change_previews_delta: 0,
    session_delta: 0,
    claim_delta: 0,
    personal_v2_idempotency_delta: 0,
    legacy_v1_shape_preserved: true,
  };
}

function twoOwnerResult() {
  const missing = { status: 404, error_code: "RESOURCE_NOT_FOUND" };
  return {
    owner_a_user_id: "00000000-0000-4000-8000-00000000000a",
    owner_b_user_id: "00000000-0000-4000-8000-00000000000b",
    authenticated_owner_caller_present: true,
    preview_missing_recipe: missing,
    preview_other_owner_recipe: missing,
    patch_missing_recipe: missing,
    patch_other_owner_recipe: missing,
    service_role_operations: ["seed", "digest", "cleanup"],
    unchanged_digest_scope_count: 6,
    unchanged_digest_scopes: [
      "recipe",
      "content",
      "meal",
      "shopping",
      "claim",
      "session",
    ],
    production_writes: 0,
    staging_writes: 0,
    remote_writes: 0,
  };
}

function plan() {
  return {
    current_head_sha: CURRENT_SHA,
    immediate_previous_sha: PREVIOUS_SHA,
    external_writes: 0,
  };
}

describe("recipe content snapshot future propagation local collector", () => {
  it("collects previous, current, and two-owner evidence in order and always cleans up", async () => {
    const collector = await loadCollector();
    const calls: string[] = [];
    const adapter = {
      prepare: vi.fn(async () => {
        calls.push("prepare");
        return { runtimeId: "isolated" };
      }),
      collectRelease: vi.fn(async ({ releaseSha }: { releaseSha: string }) => {
        calls.push(`release:${releaseSha}`);
        return releaseEntry(releaseSha);
      }),
      collectTwoOwner: vi.fn(async () => {
        calls.push("two-owner");
        return twoOwnerResult();
      }),
      writeReport: vi.fn(async () => calls.push("write-report")),
      cleanup: vi.fn(async () => calls.push("cleanup")),
    };

    const result =
      await collector.runRecipeContentSnapshotFuturePropagationLocalCollector({
        adapter,
        plan: plan(),
        reportPath: "/tmp/rehearsal-report.json",
      });

    expect(calls).toEqual([
      "prepare",
      `release:${PREVIOUS_SHA}`,
      `release:${CURRENT_SHA}`,
      "two-owner",
      "cleanup",
      "write-report",
    ]);
    expect(result).toMatchObject({
      two_owner_result: { authenticated_owner_caller_present: true },
      release_matrix: {
        current_head_sha: CURRENT_SHA,
        immediate_previous_sha: PREVIOUS_SHA,
        external_writes: 0,
        local_fixture_mutation: "isolated-and-cleaned",
      },
    });
  });

  it("cleans up and refuses to write a report when collection fails", async () => {
    const collector = await loadCollector();
    const cleanup = vi.fn(async () => undefined);
    const writeReport = vi.fn(async () => undefined);
    const adapter = {
      prepare: vi.fn(async () => ({ runtimeId: "isolated" })),
      collectRelease: vi.fn(async () => {
        throw new Error("fixture failed");
      }),
      collectTwoOwner: vi.fn(),
      writeReport,
      cleanup,
    };

    await expect(
      collector.runRecipeContentSnapshotFuturePropagationLocalCollector({
        adapter,
        plan: plan(),
        reportPath: "/tmp/rehearsal-report.json",
      }),
    ).rejects.toThrow(/fixture failed/iu);
    expect(writeReport).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("rejects forged PASS data before report persistence", async () => {
    const collector = await loadCollector();
    const writeReport = vi.fn(async () => undefined);
    const cleanup = vi.fn(async () => undefined);
    const adapter = {
      prepare: vi.fn(async () => ({ runtimeId: "isolated" })),
      collectRelease: vi.fn(async ({ releaseSha }: { releaseSha: string }) =>
        releaseEntry(releaseSha)),
      collectTwoOwner: vi.fn(async () => ({
        ...twoOwnerResult(),
        remote_writes: 1,
      })),
      writeReport,
      cleanup,
    };

    await expect(
      collector.runRecipeContentSnapshotFuturePropagationLocalCollector({
        adapter,
        plan: plan(),
        reportPath: "/tmp/rehearsal-report.json",
      }),
    ).rejects.toThrow(/writes|remote/iu);
    expect(writeReport).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
