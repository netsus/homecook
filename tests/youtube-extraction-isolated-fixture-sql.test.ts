import { describe, expect, it } from "vitest";

import { buildIsolatedYoutubeWorkerSyntheticFixtureSql } from
  "../scripts/lib/youtube-extraction-isolated-fixture-sql.mjs";
import {
  buildYoutubeExtractionWorkerPolicySnapshotDigest,
  DEFAULT_YOUTUBE_EXTRACTION_WORKER_EXTRACTOR_MODE,
  DEFAULT_YOUTUBE_EXTRACTION_WORKER_FINGERPRINT_KEY_VERSION,
  DEFAULT_YOUTUBE_EXTRACTION_WORKER_PIPELINE_IDENTITY,
  DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_OPTIONS,
} from "../scripts/lib/youtube-extraction-worker-artifact.mjs";

describe("isolated worker fixture SQL", () => {
  it("uses canonical queued user, job, and policy predicate state", () => {
    const allowedSnapshotDigest = buildYoutubeExtractionWorkerPolicySnapshotDigest();
    const value = buildIsolatedYoutubeWorkerSyntheticFixtureSql({
      runIdentity: "11111111-2222-4333-8444-555555555555",
      userId: "22222222-2222-4222-8222-222222222222",
      jobId: "33333333-3333-4333-8333-333333333333",
      releaseSha: "a".repeat(40),
      schemaIdentity: "schema",
      allowedSnapshotDigest,
      jtiHash: "c".repeat(64),
      nowEpoch: 2_000_000_000,
    });

    expect(value.sql).toContain("public.users");
    expect(value.sql).toContain("public.youtube_extraction_jobs");
    expect(value.sql).toContain("'queued',0,3");
    expect(value.variables).toMatchObject({
      allowed_snapshot_digest: allowedSnapshotDigest,
      extractor_mode: DEFAULT_YOUTUBE_EXTRACTION_WORKER_EXTRACTOR_MODE,
      fingerprint_key_version: DEFAULT_YOUTUBE_EXTRACTION_WORKER_FINGERPRINT_KEY_VERSION,
      pipeline_identity: DEFAULT_YOUTUBE_EXTRACTION_WORKER_PIPELINE_IDENTITY,
      result_affecting_options: JSON.stringify(
        DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_OPTIONS,
      ),
    });
  });

  it("rejects a migration digest substituted for the policy snapshot", () => {
    expect(() => buildIsolatedYoutubeWorkerSyntheticFixtureSql({
      runIdentity: "11111111-2222-4333-8444-555555555555",
      userId: "22222222-2222-4222-8222-222222222222",
      jobId: "33333333-3333-4333-8333-333333333333",
      releaseSha: "a".repeat(40),
      schemaIdentity: "schema",
      allowedSnapshotDigest: "b".repeat(64),
      jtiHash: "c".repeat(64),
      nowEpoch: 2_000_000_000,
    })).toThrow(/policy authority/iu);
  });
});
