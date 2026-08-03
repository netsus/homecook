import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

const verifierPath =
  "scripts/lib/recipe-content-snapshot-future-propagation-local-rehearsal-verifier.mjs";
const SAMPLE_CURRENT_SHA = "a".repeat(40);
const SAMPLE_PREVIOUS_SHA = "b".repeat(40);

type LocalRehearsalVerifierModule = {
  assertRecipeContentSnapshotFuturePropagationTwoOwnerResult:
    (input: Record<string, unknown>) => unknown;
  assertRecipeContentSnapshotFuturePropagationReleaseMatrix:
    (input: Record<string, unknown>) => unknown;
};

async function loadRequiredVerifier(): Promise<LocalRehearsalVerifierModule> {
  expect(
    existsSync(verifierPath),
    `${verifierPath} must exist before the release-fixture contract can pass`,
  ).toBe(true);
  const moduleUrl = pathToFileURL(resolve(verifierPath)).href;
  const loaded = await import(/* @vite-ignore */ moduleUrl);
  return loaded as LocalRehearsalVerifierModule;
}

const validTwoOwnerResult = {
  owner_a_user_id: "00000000-0000-4000-8000-00000000000a",
  owner_b_user_id: "00000000-0000-4000-8000-00000000000b",
  authenticated_owner_caller_present: true,
  preview_missing_recipe: { status: 404, error_code: "RESOURCE_NOT_FOUND" },
  preview_other_owner_recipe: { status: 404, error_code: "RESOURCE_NOT_FOUND" },
  patch_missing_recipe: { status: 404, error_code: "RESOURCE_NOT_FOUND" },
  patch_other_owner_recipe: { status: 404, error_code: "RESOURCE_NOT_FOUND" },
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

const validReleaseMatrix = {
  current_head_sha: SAMPLE_CURRENT_SHA,
  immediate_previous_sha: SAMPLE_PREVIOUS_SHA,
  current_release: {
    release_sha: SAMPLE_CURRENT_SHA,
    personal_recipe_v2_enabled: false,
    snapshot_v2_creation_enabled: false,
    personal_entry_count: 0,
    personal_caller_count: 0,
    recipe_change_previews_delta: 0,
    session_delta: 0,
    claim_delta: 0,
    personal_v2_idempotency_delta: 0,
    legacy_v1_shape_preserved: true,
  },
  immediate_previous_release: {
    release_sha: SAMPLE_PREVIOUS_SHA,
    personal_recipe_v2_enabled: false,
    snapshot_v2_creation_enabled: false,
    personal_entry_count: 0,
    personal_caller_count: 0,
    recipe_change_previews_delta: 0,
    session_delta: 0,
    claim_delta: 0,
    personal_v2_idempotency_delta: 0,
    legacy_v1_shape_preserved: true,
  },
  external_writes: 0,
  local_fixture_mutation: "isolated-and-cleaned",
};

describe("recipe content snapshot future propagation release fixture contract", () => {
  it("validates the exact two-owner denial matrix and unchanged digest result shape", async () => {
    const verifier = await loadRequiredVerifier();

    expect(() =>
      verifier.assertRecipeContentSnapshotFuturePropagationTwoOwnerResult(
        structuredClone(validTwoOwnerResult),
      ),
    ).not.toThrow();

    for (const drift of [
      { ...validTwoOwnerResult, owner_b_user_id: validTwoOwnerResult.owner_a_user_id },
      {
        ...validTwoOwnerResult,
        preview_missing_recipe: { status: 403, error_code: "RESOURCE_NOT_FOUND" },
      },
      {
        ...validTwoOwnerResult,
        patch_other_owner_recipe: { status: 404, error_code: "FORBIDDEN" },
      },
      {
        ...validTwoOwnerResult,
        authenticated_owner_caller_present: false,
      },
      {
        ...validTwoOwnerResult,
        service_role_operations: ["seed", "preview", "cleanup"],
      },
      {
        ...validTwoOwnerResult,
        unchanged_digest_scope_count: 5,
      },
      {
        ...validTwoOwnerResult,
        unchanged_digest_scopes: ["recipe", "content"],
      },
      { ...validTwoOwnerResult, production_writes: 1 },
      { ...validTwoOwnerResult, staging_writes: 1 },
      { ...validTwoOwnerResult, remote_writes: 1 },
    ]) {
      expect(() =>
        verifier.assertRecipeContentSnapshotFuturePropagationTwoOwnerResult(
          drift,
        ),
      ).toThrow();
    }
  });

  it("validates the exact current/immediate-previous flag-off release matrix", async () => {
    const verifier = await loadRequiredVerifier();

    expect(() =>
      verifier.assertRecipeContentSnapshotFuturePropagationReleaseMatrix(
        structuredClone(validReleaseMatrix),
      ),
    ).not.toThrow();

    for (const drift of [
      {
        ...validReleaseMatrix,
        current_release: {
          ...validReleaseMatrix.current_release,
          personal_recipe_v2_enabled: true,
        },
      },
      {
        ...validReleaseMatrix,
        immediate_previous_release: {
          ...validReleaseMatrix.immediate_previous_release,
          snapshot_v2_creation_enabled: true,
        },
      },
      {
        ...validReleaseMatrix,
        current_release: {
          ...validReleaseMatrix.current_release,
          recipe_change_previews_delta: 1,
        },
      },
      {
        ...validReleaseMatrix,
        current_release: {
          ...validReleaseMatrix.current_release,
          session_delta: 1,
        },
      },
      {
        ...validReleaseMatrix,
        immediate_previous_release: {
          ...validReleaseMatrix.immediate_previous_release,
          claim_delta: 1,
        },
      },
      {
        ...validReleaseMatrix,
        immediate_previous_release: {
          ...validReleaseMatrix.immediate_previous_release,
          personal_v2_idempotency_delta: 1,
        },
      },
      {
        ...validReleaseMatrix,
        current_release: {
          ...validReleaseMatrix.current_release,
          legacy_v1_shape_preserved: false,
        },
      },
      {
        ...validReleaseMatrix,
        immediate_previous_release: {
          ...validReleaseMatrix.immediate_previous_release,
          release_sha: SAMPLE_CURRENT_SHA,
        },
      },
      { ...validReleaseMatrix, external_writes: 1 },
      { ...validReleaseMatrix, local_fixture_mutation: "dirty" },
    ]) {
      expect(() =>
        verifier.assertRecipeContentSnapshotFuturePropagationReleaseMatrix(
          drift,
        ),
      ).toThrow();
    }
  });
});
