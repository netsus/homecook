import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  assertV71CutoverPoststate,
  assertV71CutoverPrestate,
  assertV71ManagerClaims,
  assertV71WorkerCredential,
  buildV71DatabaseTransitionSql,
} from "../scripts/lib/youtube-v71-controlled-cutover.mjs";
import {
  DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_OPTIONS,
} from "../scripts/lib/youtube-extraction-worker-artifact.mjs";

const policyDigest = "17577b8be8be9da59d37aee80c4467e09fc27b8398a547f63497760c774dc6d7";
const releaseSha = "8e515a6482a1dfaa292d6f67ae6aa8a06f84d2d4";
const pipeline = "85fbf4877e6f2894841bfd160f2d9a63894eb709fd63e897483efe71fd4016cd";
const now = new Date("2026-10-13T12:00:00.000Z");
const managerClaims = {
  role: "youtube_extraction_credential_manager",
  scope: "youtube-extraction-credential-manager",
  iss: "https://worker.mumeok.kr",
  aud: "youtube-extraction",
  jti_hash: "a".repeat(64),
  iat: 1791892800,
  exp: 1791893100,
};
const workerClaims = {
  role: "youtube_extraction_worker",
  scope: "youtube-extraction-worker",
  iss: "https://worker.mumeok.kr",
  aud: "youtube-extraction",
  generation: 47,
  jti_hash: "b".repeat(64),
  release_sha: releaseSha,
  schema_identity: "youtube-extraction-worker-schema-v2",
  allowed_snapshot_digest: policyDigest,
  iat: 1791892800,
  exp: 1792411200,
};
const credentialMetadata = {
  generation: 47,
  jti_sha256: "b".repeat(64),
  expires_at: "2026-10-19T12:00:00.000Z",
  release_sha: releaseSha,
  schema_identity: "youtube-extraction-worker-schema-v2",
  allowed_snapshot_digest: policyDigest,
};

describe("YouTube v71 controlled cutover", () => {
  it("loads with the pinned Node ESM runtime before command validation", () => {
    const script = fileURLToPath(new URL(
      "../scripts/youtube-v71-controlled-cutover.mjs",
      import.meta.url,
    ));
    const result = spawnSync(process.execPath, [script, "--invalid"], {
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("usage: youtube-v71-controlled-cutover.mjs");
    expect(result.stderr).not.toContain("SyntaxError");
  });

  it("serializes invocations and durably records zero-budget verification before activation", () => {
    const source = readFileSync(new URL(
      "../scripts/youtube-v71-controlled-cutover.mjs",
      import.meta.url,
    ), "utf8");
    expect(source).toContain("writePrivateCreateOnly(INVOCATION_LOCK");
    expect(source).toContain("another controlled cutover invocation is active");
    expect(source).toContain("SELECT pg_advisory_lock(86120317)");
    expect(source).toContain("fsyncPath(path)");
    expect(source).toContain("linkSync(staging, path)");
    expect(source).toContain("buildYoutubeExtractionWorkerPolicySnapshotDigest({");
    expect(source).not.toContain("private.youtube_extraction_policy_snapshot_digest(");
    expect(source).toContain("durablePrivateJson(VERIFICATION_RECEIPT_PATH, receipt)");
    expect(source).toContain("durablePrivateJson(RECEIPT_PATH, receipt)");
    expect(source).toContain("reconcileActivationReceipt(verificationReceipt)");
    const verificationIndex = source.indexOf(
      "const verificationReceipt = await createVerificationReceipt(before)",
    );
    expect(verificationIndex).toBeGreaterThan(0);
    expect(verificationIndex).toBeLessThan(
      source.indexOf("SET enabled=true", verificationIndex),
    );
    const receiptResetIndex = source.indexOf(
      "async function resetDisabledCutoverReceipts(target)",
    );
    expect(receiptResetIndex).toBeGreaterThan(0);
    expect(source.indexOf(
      "assertV71CutoverPoststate(database, { enabled: false })",
      receiptResetIndex,
    )).toBeLessThan(source.indexOf(
      "for (const path of [RECEIPT_PATH, VERIFICATION_RECEIPT_PATH])",
      receiptResetIndex,
    ));
    const resumeIndex = source.indexOf("async function resume(confirmation)");
    const activeVerifyIndex = source.indexOf(
      "active = await verifyActiveWorker",
      resumeIndex,
    );
    const repairDisableIndex = source.indexOf(
      "database = await disablePolicyForRepair",
      activeVerifyIndex,
    );
    const repairBootoutIndex = source.indexOf(
      "if (status.loaded) runLaunchctl([\"bootout\", SERVICE])",
      repairDisableIndex,
    );
    expect(activeVerifyIndex).toBeGreaterThan(resumeIndex);
    expect(repairDisableIndex).toBeGreaterThan(activeVerifyIndex);
    expect(repairBootoutIndex).toBeGreaterThan(repairDisableIndex);
  });

  it("accepts only the exact manager scope and a maximum five-minute lifetime", () => {
    expect(assertV71ManagerClaims(managerClaims, now)).toBe(true);
    expect(() => assertV71ManagerClaims({
      ...managerClaims,
      scope: "youtube-extraction-worker",
    }, now)).toThrow(/manager scope/iu);
    expect(() => assertV71ManagerClaims({
      ...managerClaims,
      exp: managerClaims.iat + 301,
    }, now)).toThrow(/five minutes/iu);
  });

  it("accepts only the exact six-day generation-47 worker binding", () => {
    expect(assertV71WorkerCredential({
      claims: workerClaims,
      metadata: credentialMetadata,
    }, now)).toBe(true);
    expect(() => assertV71WorkerCredential({
      claims: { ...workerClaims, generation: 48 },
      metadata: { ...credentialMetadata, generation: 48 },
    }, now)).toThrow(/worker claim generation/iu);
    expect(() => assertV71WorkerCredential({
      claims: { ...workerClaims, exp: workerClaims.exp - 1 },
      metadata: credentialMetadata,
    }, now)).toThrow(/exactly six days/iu);
  });

  it("builds one fail-closed policy plus generation 46-to-47 transaction fragment", () => {
    const sql = buildV71DatabaseTransitionSql({
      managerClaims,
      credentialMetadata,
    });
    expect(sql).toContain("enabled = false");
    expect(sql).toContain("SET LOCAL ROLE youtube_extraction_credential_manager");
    expect(sql).toContain("rotate_youtube_extraction_worker_credential(\n  46,\n  47,");
    expect(sql).toContain(releaseSha);
    expect(sql).toContain(policyDigest);
    expect(sql).not.toContain("generation 48");
  });

  it("requires drained predecessor state and exact v71 poststate", () => {
    expect(assertV71CutoverPrestate({
      ledgerCount: 219,
      queued: 0,
      processing: 0,
      permitHeld: false,
      activeEnqueueSessions: 0,
      credential: {
        generation: 46,
        releaseSha: "c51d53871f31c7840fe24792b46b191ca963b11b",
        snapshotDigest: "e40c9f4ef0d8a9241e49635f0fc906fe92a20f57a46e005fa4dd308805a191c0",
      },
      policy: {
        pipelineIdentity: "1c9c47074da3bf1c55ed83f1ba5131d9d48ad486503919c554a5530d7972d935",
        snapshotDigest: "e40c9f4ef0d8a9241e49635f0fc906fe92a20f57a46e005fa4dd308805a191c0",
        enabled: true,
      },
    })).toBe(true);
    const poststate = {
      ledgerCount: 219,
      queued: 0,
      processing: 0,
      permitHeld: false,
      activeEnqueueSessions: 0,
      credential: {
        generation: 47,
        releaseSha,
        schemaIdentity: "youtube-extraction-worker-schema-v2",
        snapshotDigest: policyDigest,
      },
      policy: {
        version: 3,
        extractorMode: "i031_codex_vision",
        pipelineIdentity: pipeline,
        snapshotDigest: policyDigest,
        enabled: false,
        resultAffectingOptions: DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_OPTIONS,
      },
    };
    expect(assertV71CutoverPoststate(poststate, { enabled: false })).toBe(true);
    expect(assertV71CutoverPoststate({
      ...poststate,
      policy: { ...poststate.policy, enabled: true },
    }, { enabled: true })).toBe(true);
    expect(() => assertV71CutoverPoststate({ ...poststate, queued: 1 }, {
      enabled: false,
    })).toThrow(/zero-budget/iu);
  });
});
