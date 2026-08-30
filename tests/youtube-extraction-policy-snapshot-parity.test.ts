import { describe, expect, it } from "vitest";

import { YOUTUBE_ASYNC_POLICY } from "@/lib/server/youtube-async-extraction";
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
      .toBe(YOUTUBE_ASYNC_POLICY.pipelineIdentity);
    expect(DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_VERSION)
      .toBe(YOUTUBE_ASYNC_POLICY.policyVersion);
    expect(DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_OPTIONS)
      .toEqual(YOUTUBE_ASYNC_POLICY.resultAffectingOptions);
    expect(buildYoutubeExtractionWorkerPolicySnapshotDigest())
      .toBe(YOUTUBE_ASYNC_POLICY.snapshotDigest);
  });
});
