import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  classifyPrelaunchScope,
  parsePrelaunchOptions,
} from "../scripts/lib/prelaunch-web-deploy.mjs";
import {
  assertYoutubeResolutionWorkerInstallResult,
  assertYoutubeResolutionReviewPin,
  YOUTUBE_RESOLUTION_REVIEW_PIN,
} from "../scripts/lib/prelaunch-youtube-resolution-readiness.mjs";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");

const manifest = {
  scripts: { build: "next build", start: "node scripts/start-production.mjs" },
  dependencies: {}, devDependencies: {}, optionalDependencies: {}, peerDependencies: {},
  pnpm: {}, overrides: {}, resolutions: {}, packageManager: "pnpm@11.25.0",
};

describe("reviewed YouTube resolution deploy option", () => {
  it("requires exact reviewed ref and already-applied DB mode", () => {
    const args = [
      "--reviewed-youtube-resolution-readiness",
      "--already-applied-db",
      "--db-config", "/private/db.env",
      "--reviewed-ref", "a".repeat(40),
    ];
    expect(parsePrelaunchOptions(args)).toMatchObject({
      reviewedYoutubeResolutionReadiness: true,
      alreadyAppliedDb: true,
      ref: "a".repeat(40),
    });
    expect(() => parsePrelaunchOptions(["--reviewed-youtube-resolution-readiness"]))
      .toThrow("already-applied-db");
    expect(() => parsePrelaunchOptions(args.slice(0, -2))).toThrow("reviewed-ref");
    expect(() => parsePrelaunchOptions([...args, "--reviewed-piece-unit-readiness"]))
      .toThrow("함께");
  });

  it("allows only the three exact catalog support files for this lane", () => {
    const files = [
      "lib/ingredient-search.ts",
      "scripts/analyze-youtube-ingredient-resolution-regression.mjs",
      "scripts/manifests/youtube-extraction-expected-schema.json",
      "scripts/verify-youtube-extraction-current-catalog.mjs",
      "supabase/migrations/20261009200000_youtube_ingredient_resolution.sql",
    ];
    expect(() => classifyPrelaunchScope(files, manifest, manifest)).toThrow("허용하지 않는");
    expect(classifyPrelaunchScope(files, manifest, manifest, {
      reviewedYoutubeResolutionSupport: true,
    })).toMatchObject({
      web: ["lib/ingredient-search.ts"],
      database: ["supabase/migrations/20261009200000_youtube_ingredient_resolution.sql"],
      support: [
        "scripts/analyze-youtube-ingredient-resolution-regression.mjs",
        "scripts/manifests/youtube-extraction-expected-schema.json",
        "scripts/verify-youtube-extraction-current-catalog.mjs",
      ],
    });
    expect(() => classifyPrelaunchScope([...files, "scripts/arbitrary-worker-change.mjs"], manifest, manifest, {
      reviewedYoutubeResolutionSupport: true,
    })).toThrow("arbitrary-worker-change");
  });

  it("is fail-closed until the independently reviewed manifest is pinned", () => {
    expect(() => assertYoutubeResolutionReviewPin({ path: null, sha256: null }))
      .toThrow("not configured");
    expect(() => assertYoutubeResolutionReviewPin(YOUTUBE_RESOLUTION_REVIEW_PIN)).not.toThrow();
  });

  it("accepts only an exact post-install health receipt before web activation", () => {
    const review = {
      contract: {
        to: "a".repeat(40),
        artifact: {
          identitySha256: sha("identity"), fileSha256: sha("artifact"),
          descriptorFileSha256: sha("descriptor"), expectedSchemaSha256: sha("schema"),
        },
        credential: { afterGeneration: 46 },
        policy: { version: 3, pipelineIdentity: sha("pipeline"), snapshotDigest: sha("snapshot") },
      },
    };
    const result = {
      schema: "homecook.prelaunch-youtube-resolution-worker-install-result.v1",
      status: "installed-verified",
      releaseSha: review.contract.to,
      artifactIdentitySha256: review.contract.artifact.identitySha256,
      artifactFileSha256: review.contract.artifact.fileSha256,
      descriptorFileSha256: review.contract.artifact.descriptorFileSha256,
      expectedSchemaSha256: review.contract.artifact.expectedSchemaSha256,
      credentialGeneration: 46,
      policyVersion: 3,
      pipelineIdentity: review.contract.policy.pipelineIdentity,
      snapshotDigest: review.contract.policy.snapshotDigest,
      plistSha256: sha("plist"),
      runningObservations: [
        { loaded: true, state: "running", pid: 42 },
        { loaded: true, state: "running", pid: 42 },
      ],
      authenticatedPreRequest: true,
      emptyClaimSucceeded: true,
      queue: { queued: 0, processing: 0 },
      permitFree: true,
      installedAt: "2026-10-10T00:00:00.000Z",
      changed: true,
    };
    expect(assertYoutubeResolutionWorkerInstallResult(result, review)).toBe(true);
    expect(() => assertYoutubeResolutionWorkerInstallResult({ ...result, authenticatedPreRequest: false }, review))
      .toThrow("health");
    expect(() => assertYoutubeResolutionWorkerInstallResult({ ...result, runningObservations: [result.runningObservations[0]] }, review))
      .toThrow("running observations");
  });
});
