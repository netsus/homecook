// Preparation only: no filesystem, network, issuer, SQL executor or launchd
// adapter. An intent is not an approval receipt or authority to mutate production.
import { isDeepStrictEqual } from "node:util";
import { DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_OPTIONS,
  buildYoutubeExtractionWorkerPolicySnapshotDigest } from "./youtube-extraction-worker-artifact.mjs";
import { assertV71ManagerClaims } from "./youtube-v71-controlled-cutover.mjs";

export const V74_TRANSITION = Object.freeze({
  releaseSha: "3e58467499c63ba20c3b3191d9dd7dec77a7aa44",
  artifactSha256: "89d78b374187d70099c63e6c5a1877fb2d360b149e23827cbffabc7da54af1bc",
  schemaIdentity: "youtube-extraction-worker-schema-v2",
  schemaSha256: "2ea26b772e3f69e7bbf524d6303c5c40072b6c721028204a821dba0699822e20",
  catalogSha256: "de001df9981d361130136e2dff184665ec5280e82a857aa4e0e6cd593848af05",
  pipelineIdentity: "0d81a76c8df4b3f0c8ec05f1a0ad9aeab5477b9cb7fa4b64e299ce83452b7583",
  snapshotDigest: "6ad984e1ff856c009698bb15d1c2afb72116264b29120390204cc6af32aef121",
  predecessorReleaseSha: "6b610eb012da42b5d151b058531815dc12a8ca45",
  predecessorPipelineIdentity: "85fbf4877e6f2894841bfd160f2d9a63894eb709fd63e897483efe71fd4016cd",
  predecessorSnapshotDigest: "17577b8be8be9da59d37aee80c4467e09fc27b8398a547f63497760c774dc6d7",
  generationBefore: 48, generationAfter: 49, ledgerCount: 232,
  workerLifetimeSeconds: 518400, managerLifetimeSeconds: 300,
});
const sha = (value) => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
function check(value, reason) { if (!value) throw new Error(`v74 preparation rejected: ${reason}`); }
const zero = (o) => o.queued === 0 && o.processing === 0 && o.permitHeld === false && o.activeEnqueueSessions === 0;
const credentialProof = (metadata) => ({ generation: metadata.generation, releaseSha: metadata.release_sha,
  schemaIdentity: metadata.schema_identity, snapshotDigest: metadata.allowed_snapshot_digest,
  jtiSha256: metadata.jti_sha256, expiresAt: metadata.expires_at });
function assertProtected(o) {
  check(o && o.ledgerCount === V74_TRANSITION.ledgerCount && o.catalogSha256 === V74_TRANSITION.catalogSha256
    && o.schemaSha256 === V74_TRANSITION.schemaSha256, "database/schema/catalog boundary");
  for (const key of ["targetSha256", "normalDataSha256", "authoritySha256", "credentialRowSha256", "policyRowSha256"])
    check(sha(o[key]), `missing ${key}`);
  check(zero(o), "queue/permit/enqueue not drained");
  check(isDeepStrictEqual(o.controls, { productWriter: true, weightWriter: true, quantityWriter: true,
    personalAttestationWriter: true, r2Active: false, r2Recording: false }), "writer/R2 controls changed");
  check(o.policy?.version === 3 && o.policy.extractorMode === "i031_codex_vision"
    && isDeepStrictEqual(o.policy.resultAffectingOptions, DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_OPTIONS), "policy options changed");
  check(typeof o.policy.fingerprintKeyVersion === "string" && o.policy.fingerprintKeyVersion.length > 0
    && ((o.policy.previousFingerprintKeyVersion === null && o.policy.previousFingerprintValidUntil === null)
      || typeof o.policy.previousFingerprintKeyVersion === "string" && o.policy.previousFingerprintKeyVersion.length > 0
        && Number.isFinite(Date.parse(o.policy.previousFingerprintValidUntil))), "fingerprint rotation state missing");
}

export function assertV74WorkerCredential({ claims, metadata, now = new Date() }) {
  const expected = { role: "youtube_extraction_worker", scope: "youtube-extraction-worker",
    iss: "https://worker.mumeok.kr", aud: "youtube-extraction", generation: 49,
    release_sha: V74_TRANSITION.releaseSha, schema_identity: V74_TRANSITION.schemaIdentity,
    allowed_snapshot_digest: V74_TRANSITION.snapshotDigest };
  for (const [key, value] of Object.entries(expected)) check(claims?.[key] === value, `worker claim ${key}`);
  check(sha(claims?.jti_hash) && Number.isSafeInteger(claims.iat) && Number.isSafeInteger(claims.exp)
    && claims.exp - claims.iat === V74_TRANSITION.workerLifetimeSeconds
    && claims.iat * 1000 <= now.getTime() + 30000 && claims.exp * 1000 > now.getTime(), "worker lifetime/JTI");
  check(metadata && isDeepStrictEqual(credentialProof(metadata), { generation: 49, releaseSha: expected.release_sha,
    schemaIdentity: expected.schema_identity, snapshotDigest: expected.allowed_snapshot_digest,
    jtiSha256: claims.jti_hash, expiresAt: new Date(claims.exp * 1000).toISOString() }), "worker metadata differs");
  return credentialProof(metadata);
}

export function buildV74RegistrationIntent({ before, candidate, claims, metadata, managerClaims, now = new Date() }) {
  assertProtected(before);
  check(before.policy.enabled === false && before.policy.pipelineIdentity === V74_TRANSITION.predecessorPipelineIdentity
    && before.policy.snapshotDigest === V74_TRANSITION.predecessorSnapshotDigest, "predecessor policy not quiesced");
  check(before.credential?.generation === 48 && before.credential.releaseSha === V74_TRANSITION.predecessorReleaseSha
    && before.credential.schemaIdentity === V74_TRANSITION.schemaIdentity
    && before.credential.snapshotDigest === V74_TRANSITION.predecessorSnapshotDigest
    && sha(before.credential.jtiSha256) && Date.parse(before.credential.expiresAt) > now.getTime(), "predecessor credential differs");
  check(before.service?.loaded === false && sha(before.service.plistSha256), "predecessor not stopped/identified");
  for (const key of ["releaseSha", "artifactSha256", "schemaIdentity", "schemaSha256", "pipelineIdentity", "snapshotDigest"])
    check(candidate?.[key] === V74_TRANSITION[key], `candidate ${key}`);
  check(buildYoutubeExtractionWorkerPolicySnapshotDigest({ policyVersion: 3, pipelineIdentity: candidate.pipelineIdentity })
    === candidate.snapshotDigest, "candidate policy digest");
  const worker = assertV74WorkerCredential({ claims, metadata, now });
  assertV71ManagerClaims(managerClaims, now);
  check(managerClaims.iat * 1000 <= now.getTime() + 30000, "future manager");
  // This patch intentionally does not reset fingerprint current/previous/TTL,
  // options, writers, grants or schema. A production adapter must verify the
  // before/after observations inside the same locked transaction.
  return { schema: "homecook.youtube-v74-registration-intent.preparation.v1", candidate: structuredClone(candidate),
    before: structuredClone(before), worker, policyAfter: { ...structuredClone(before.policy),
      pipelineIdentity: candidate.pipelineIdentity, snapshotDigest: candidate.snapshotDigest, enabled: false },
    cas: { expectedGeneration: 48, newGeneration: 49 }, requiresApproval: true,
    productionExecutorAvailable: false };
}

export function classifyV74RegistrationRecovery({ intent, observed, now = new Date() }) {
  const stop = (reason) => ({ state: "unknown", next: "read-only-reconcile", mayRestore48: false,
    mayIssueCredential: false, mayRotateCredential: false, reason });
  try {
    check(intent?.schema === "homecook.youtube-v74-registration-intent.preparation.v1", "intent origin");
    assertProtected(intent.before);
    for (const key of ["releaseSha", "artifactSha256", "schemaIdentity", "schemaSha256", "pipelineIdentity", "snapshotDigest"])
      check(intent.candidate?.[key] === V74_TRANSITION[key], `intent candidate ${key}`);
    check(isDeepStrictEqual(intent.cas, { expectedGeneration: 48, newGeneration: 49 }), "intent CAS");
    check(intent.before.credential?.generation === 48
      && intent.before.credential.releaseSha === V74_TRANSITION.predecessorReleaseSha
      && intent.before.credential.schemaIdentity === V74_TRANSITION.schemaIdentity
      && intent.before.credential.snapshotDigest === V74_TRANSITION.predecessorSnapshotDigest
      && intent.before.policy.enabled === false
      && intent.before.policy.pipelineIdentity === V74_TRANSITION.predecessorPipelineIdentity
      && intent.before.policy.snapshotDigest === V74_TRANSITION.predecessorSnapshotDigest, "intent predecessor");
    check(intent.worker?.generation === 49 && intent.worker.releaseSha === V74_TRANSITION.releaseSha
      && intent.worker.schemaIdentity === V74_TRANSITION.schemaIdentity
      && intent.worker.snapshotDigest === V74_TRANSITION.snapshotDigest && sha(intent.worker.jtiSha256), "intent worker");
    check(isDeepStrictEqual(intent.policyAfter, { ...intent.before.policy,
      pipelineIdentity: V74_TRANSITION.pipelineIdentity, snapshotDigest: V74_TRANSITION.snapshotDigest, enabled: false }), "intent policy patch");
    assertProtected(observed);
    for (const key of ["targetSha256", "normalDataSha256", "authoritySha256"])
      check(observed[key] === intent.before[key], `${key} drift`);
    check(isDeepStrictEqual(observed.controls, intent.before.controls), "controls drift");
    check(observed.service?.plistSha256 === intent.before.service.plistSha256
      || observed.service?.artifactSha256 === intent.candidate.artifactSha256, "foreign launcher");
    if (isDeepStrictEqual(observed.credential, intent.before.credential)
      && observed.credentialRowSha256 === intent.before.credentialRowSha256
      && observed.policyRowSha256 === intent.before.policyRowSha256
      && isDeepStrictEqual(observed.policy, intent.before.policy)) {
      check(Date.parse(observed.credential.expiresAt) > now.getTime(), "predecessor expired");
      return { state: "not-applied", next: "verify-backup-restore-original-policy-and-owned48", mayRestore48: true,
        mayIssueCredential: false, mayRotateCredential: false };
    }
    check(isDeepStrictEqual(observed.credential, intent.worker) && Date.parse(observed.credential.expiresAt) > now.getTime(), "unknown credential");
    check(isDeepStrictEqual(observed.policy, { ...intent.policyAfter, enabled: observed.policy.enabled })
      && typeof observed.policy.enabled === "boolean", "mixed policy/credential");
    // Even an exact ON readback is not proof of activation: reconcile the
    // original durable verification/activation receipt; never mint or CAS again.
    return { state: observed.policy.enabled ? "registered-on-needs-receipt" : "registered-disabled",
      next: observed.policy.enabled ? "read-only-activation-reconciliation" : "repair-same49-only",
      mayRestore48: false, mayIssueCredential: false, mayRotateCredential: false };
  } catch (error) { return stop(error.message); }
}
