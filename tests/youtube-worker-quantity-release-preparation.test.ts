import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import workerPostimages from "../docs/security/youtube-worker-quantity-function-postimages.json";
import expectedSchema from "../scripts/manifests/youtube-extraction-expected-schema.json";
import {
  buildYoutubeExtractionAppDescriptor,
  buildYoutubeExtractionWorkerPolicySnapshotDigest,
  materializeYoutubeExtractionWorkerArtifact,
  readYoutubeExtractionExpectedSchema,
  sha256File,
  stableStringify,
  verifyYoutubeExtractionWorkerArtifact,
} from "../scripts/lib/youtube-extraction-worker-artifact.mjs";
import {
  YOUTUBE_V71_PIPELINE_IDENTITY,
  YOUTUBE_V71_POLICY_SNAPSHOT_DIGEST,
  YOUTUBE_V71_POLICY_VERSION,
} from "../scripts/lib/youtube-v71-worker-preparation.mjs";

const priorCatalog = "81362d758b5138a95b6cbe1d8d7c1f064653b467907a42a7335c00d97dc59ba9";
const nextCatalog = "de001df9981d361130136e2dff184665ec5280e82a857aa4e0e6cd593848af05";
const schemaPath = "scripts/manifests/youtube-extraction-expected-schema.json";
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

function makeRemovable(directory: string) {
  chmodSync(directory, 0o700);
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) makeRemovable(join(directory, entry.name));
  }
}

describe("C04 worker source release preparation", () => {
  it("uses the reviewed worker postimage catalog while preserving every other schema field", () => {
    expect(workerPostimages.catalog_before).toBe(priorCatalog);
    expect(workerPostimages.catalog_after).toBe(nextCatalog);
    expect(expectedSchema.catalog_fingerprint).toBe(workerPostimages.catalog_after);
    expect(workerPostimages.functions).toHaveLength(13);
    expect(sha256(readFileSync(workerPostimages.migration))).toBe(workerPostimages.migration_sha256);
    expect(workerPostimages.migration_sha256).toBe("f586b27f2f5da5063a7eaa70278c7f00edab762aa27248b91a224411f436c750");
    const sql = readFileSync(workerPostimages.migration, "utf8");
    expect(sql).toContain(`v_before constant text:='${priorCatalog}'`);
    expect(sql).toContain(`v_after constant text:='${nextCatalog}'`);
    expect(readYoutubeExtractionExpectedSchema(join(process.cwd(), schemaPath))).toEqual(expectedSchema);
    // The predecessor canonical bytes protect all non-catalog schema/model/RPC fields.
    expect(sha256(stableStringify({ ...expectedSchema, catalog_fingerprint: priorCatalog })))
      .toBe("0b791ca528514744b71c96efc681ecbe5fb54a6b277c54e4ee86035b6451c98d");
  });

  it("binds the six reviewed migrations after the latest C01 compatibility source", () => {
    for (const [filename, digest] of [
      ["20261013233000_cooked_batch_weight_evidence.sql", "60b9f4008768fc0846eb0b3a104fac3ef0650975535371adf876b95dcb711aa0"],
      ["20261014010000_ingredient_quantity_policy_v4.sql", "c66ee907de4130b2fe3b86bcdbe48b15021f228485e52fbe1aca5acfee5e7bfd"],
      ["20261014200000_quantity_input_v4_consumers.sql", "9ec96a2a7bbf7192801b1f6dd43304ed8ba78ab73f934eac4c2c300e3ca85573"],
      ["20261014210000_product_quantity_input_v4.sql", "e33a2110afd4a71a6042ce6d4d416f2bf189e107f4528e5b5ae2e440e180ad88"],
      ["20261014213000_product_quantity_edit_capability.sql", "acb0ec83aeabc91320a61b406c2a23dda258033592defbb09bd7f1bb8667399b"],
      ["20261014220000_recipe_quantity_input_v4.sql", "9b15696aa8f33cb6a9c707d1355a90efb07bd929df3943519e58b1d6d6cc2367"],
      ["20261014223000_youtube_quantity_input_bridge.sql", "f586b27f2f5da5063a7eaa70278c7f00edab762aa27248b91a224411f436c750"],
    ]) expect(sha256(readFileSync(join("supabase/migrations", filename)))).toBe(digest);
  });

  it("seals the current source closure locally without issuing credentials or running the worker", () => {
    const directory = realpathSync(mkdtempSync(join(tmpdir(), "mumeok-c04-worker-artifact-fixture-")));
    const fixtureRelease = "a".repeat(40);
    try {
      const digest = buildYoutubeExtractionWorkerPolicySnapshotDigest({
        policyVersion: YOUTUBE_V71_POLICY_VERSION,
        pipelineIdentity: YOUTUBE_V71_PIPELINE_IDENTITY,
      });
      expect(digest).toBe(YOUTUBE_V71_POLICY_SNAPSHOT_DIGEST);
      const artifact = materializeYoutubeExtractionWorkerArtifact({
        rootDir: process.cwd(), outputDir: join(directory, "artifact"), releaseSha: fixtureRelease,
        releaseTree: "b".repeat(40), buildId: "c04-local-fixture", promotionId: "c04-local-fixture",
        allowedSnapshotDigest: digest, policyVersion: YOUTUBE_V71_POLICY_VERSION,
        pipelineIdentity: YOUTUBE_V71_PIPELINE_IDENTITY,
      });
      const verified = verifyYoutubeExtractionWorkerArtifact(artifact.manifest_path);
      expect(verified).toEqual(artifact.manifest);
      expect(verified.files).toContainEqual(expect.objectContaining({ path: "scripts/lib/youtube-extraction-worker-runtime.mjs",
        sha256: sha256File(join(process.cwd(), "scripts/lib/youtube-extraction-worker-runtime.mjs")) }));
      expect(verified.expected_schema_sha256).toBe(sha256File(join(process.cwd(), schemaPath)));
      expect(readYoutubeExtractionExpectedSchema(join(artifact.root_dir, schemaPath)).catalog_fingerprint).toBe(nextCatalog);
      const descriptor = buildYoutubeExtractionAppDescriptor({ releaseSha: fixtureRelease,
        schemaIdentity: verified.schema_identity, expectedPolicyVersion: verified.policy_version,
        expectedPolicySnapshotDigest: verified.allowed_snapshot_digest, artifactSha256: verified.artifact_sha256,
        expectedSchemaSha256: verified.expected_schema_sha256 });
      expect(descriptor.expected_schema_sha256).toBe(verified.expected_schema_sha256);
      expect(descriptor.artifact_sha256).toBe(verified.artifact_sha256);
      expect(descriptor.release_sha).toBe(fixtureRelease);
    } finally {
      makeRemovable(directory);
      rmSync(directory, { recursive: true });
    }
  });
});
