import { describe, expect, it, vi } from "vitest";
import { ensureIssuedWorkerCredential } from "../scripts/lib/local-mac-production-rehearsal-runner-adapters.mjs";
import { buildYoutubeExtractionWorkerPolicySnapshotDigest } from "../scripts/lib/youtube-extraction-worker-artifact.mjs";

const manifest = { release_sha: "a".repeat(40), migration: { ordered_migration_files_digest: "b".repeat(64) } };
const artifact = {
  allowed_snapshot_digest: buildYoutubeExtractionWorkerPolicySnapshotDigest(),
  schema_identity: "isolated-schema",
};
function state(issue = vi.fn(() => ({ token: "private", jtiHash: "c".repeat(64), metadata: { issued_at: "2026-08-30T00:00:00.000Z" } }))) { return { runId: "11111111-2222-4333-8444-555555555555", secrets: { jwt_keys: "[]" }, credentialIssuer: issue }; }
describe("isolated worker credential issuance", () => {
  it("issues once and reuses exact metadata", () => { const issue = vi.fn(() => ({ token: "private", jtiHash: "c".repeat(64), metadata: { issued_at: "2026-08-30T00:00:00.000Z" } })); const value = state(issue); expect(ensureIssuedWorkerCredential(value, manifest, artifact)).toBe(ensureIssuedWorkerCredential(value, manifest, artifact)); expect(issue).toHaveBeenCalledTimes(1); });
  it("rejects conflicting authority", () => { const value = state(); ensureIssuedWorkerCredential(value, manifest, artifact); expect(() => ensureIssuedWorkerCredential(value, { ...manifest, release_sha: "d".repeat(40) }, artifact)).toThrow(/conflict/iu); });
});
