import { describe, expect, it } from "vitest";

import { YOUTUBE_ASYNC_POLICY } from "@/lib/server/youtube-async-extraction";
import { I031_EXACT_IDENTITY, I031_CODEX_CLI_VERSION } from "@/lib/server/youtube-i031-runtime";
import { createHash } from "node:crypto";
import { canonicalJson } from "@/lib/server/youtube-async-extraction";
import {
  buildYoutubeExtractionWorkerPolicySnapshotDigest,
  DEFAULT_YOUTUBE_EXTRACTION_WORKER_EXTRACTOR_MODE,
  DEFAULT_YOUTUBE_EXTRACTION_WORKER_PIPELINE_IDENTITY,
  DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_OPTIONS,
  DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_VERSION,
} from "../scripts/lib/youtube-extraction-worker-artifact.mjs";

describe("worker policy snapshot authority", () => {
  it("matches the canonical application and PostgreSQL policy preimage", () => {
    expect(DEFAULT_YOUTUBE_EXTRACTION_WORKER_EXTRACTOR_MODE)
      .toBe(YOUTUBE_ASYNC_POLICY.extractorMode);
    expect(DEFAULT_YOUTUBE_EXTRACTION_WORKER_PIPELINE_IDENTITY)
      .not.toBe(YOUTUBE_ASYNC_POLICY.pipelineIdentity);
    expect(DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_VERSION).toBe(1);
    expect(YOUTUBE_ASYNC_POLICY.policyVersion).toBe(2);
    expect(DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_OPTIONS)
      .toEqual(YOUTUBE_ASYNC_POLICY.resultAffectingOptions);
    expect(buildYoutubeExtractionWorkerPolicySnapshotDigest({
      pipelineIdentity: YOUTUBE_ASYNC_POLICY.pipelineIdentity,
      policyVersion: YOUTUBE_ASYNC_POLICY.policyVersion,
    }))
      .toBe(YOUTUBE_ASYNC_POLICY.snapshotDigest);
  });

  it("binds the upgraded policy to the exact models, prompts, options and CLI", () => {
    const identity = { ...I031_EXACT_IDENTITY, codexCliVersion: I031_CODEX_CLI_VERSION };
    expect(createHash("sha256").update(canonicalJson(identity)).digest("hex"))
      .toBe(YOUTUBE_ASYNC_POLICY.pipelineIdentity);
    expect(YOUTUBE_ASYNC_POLICY.snapshotDigest)
      .not.toBe(buildYoutubeExtractionWorkerPolicySnapshotDigest());
  });
});
