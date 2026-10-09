import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import { assertResolutionReview } from "./prelaunch-youtube-resolution-contract.mjs";
import {
  assertYoutubeResolutionRolloutReview,
  assertYoutubeResolutionWorkerInstallResult,
} from "./prelaunch-youtube-resolution-readiness.mjs";
import { assertYoutubeResolutionWorkerInstallManifest } from "./prelaunch-youtube-resolution-worker-install.mjs";

const SHA = /^[a-f0-9]{64}$/u;
const requireValue = (value, message) => { if (!value) throw new Error(`YouTube resolution manifest assembly: ${message}`); };
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function assembleYoutubeResolutionCredentialExecutionAuthority({
  releaseSha,
  rootApprovalProof,
  enqueueClosureProof,
  dbApplyReceiptProof,
  approvedAt,
}) {
  for (const [label, proof] of Object.entries({ rootApprovalProof, enqueueClosureProof, dbApplyReceiptProof })) {
    requireValue(proof?.path?.startsWith("/") && SHA.test(proof.sha256 ?? ""), `${label} missing`);
  }
  requireValue(/^[a-f0-9]{40}$/u.test(releaseSha ?? "") && Number.isFinite(Date.parse(approvedAt)),
    "credential execution identity/time invalid");
  return {
    schema: "homecook.youtube-resolution-credential-execution-authority.v1",
    approved: true,
    releaseSha,
    rootApproval: rootApprovalProof,
    enqueueClosure: enqueueClosureProof,
    dbApplyReceipt: dbApplyReceiptProof,
    approvedAt,
  };
}

export function assembleYoutubeResolutionRolloutReview({
  precutoverAuthority,
  dbApplyReceiptProof,
  originalReadinessSha256,
  proofDigests,
  artifactPaths,
  databaseBefore,
  expectedFunctionEvidence,
}) {
  requireValue(precutoverAuthority?.schema === "homecook.prelaunch-youtube-resolution-precutover-authority.v1",
    "precutover authority schema mismatch");
  requireValue(dbApplyReceiptProof?.path?.startsWith("/") && SHA.test(dbApplyReceiptProof.sha256 ?? ""),
    "DB receipt proof missing");
  const contract = {
    ...precutoverAuthority,
    schema: "homecook.prelaunch-youtube-resolution-review.v1",
    proofs: { ...precutoverAuthority.proofs, dbApplyReceipt: dbApplyReceiptProof },
  };
  assertResolutionReview(contract);
  const review = {
    schema: "homecook.prelaunch-youtube-resolution-rollout-review.v1",
    contract,
    originalReadinessSha256,
    proofDigests,
    artifactPaths,
    databaseBefore,
    expectedFunctionEvidence,
  };
  return assertYoutubeResolutionRolloutReview(review);
}
export function assembleYoutubeResolutionWorkerInstallManifest({
  review,
  rootApproval,
  credentialTransition,
  dbApplyReceiptProof,
  enqueueClosureProof,
}) {
  assertYoutubeResolutionRolloutReview(review);
  requireValue(rootApproval?.approved === true && rootApproval.releaseSha === review.contract.to,
    "root approval mismatch");
  requireValue(credentialTransition?.schema === "homecook.youtube-resolution-credential-transition.v1"
    && credentialTransition.dbRegistered === true
    && credentialTransition.before?.generation === 45 && credentialTransition.after?.generation === 46,
  "credential transition evidence mismatch");
  requireValue(dbApplyReceiptProof.sha256 === review.contract.proofs.dbApplyReceipt.sha256
    && enqueueClosureProof.sha256 === review.contract.proofs.enqueueClosure.sha256,
  "DB/closure proof differs from rollout review");
  const previous = {
    path: review.contract.previousWorker.plistPath,
    sha256: review.contract.previousWorker.plistSha256,
    loaded: review.contract.previousWorker.atInstallLoaded,
    state: review.contract.previousWorker.atInstallState,
  };
  const authority = {
    releaseSha: review.contract.to,
    runtimeFiles: review.contract.runtimeFiles,
    catalogFingerprint: review.contract.catalog.after,
    policyVersion: review.contract.policy.version,
    pipelineIdentity: review.contract.policy.pipelineIdentity,
    snapshotDigest: review.contract.policy.snapshotDigest,
    credentialGeneration: review.contract.credential.afterGeneration,
    queue: { queued: 0, processing: 0 },
    permitHeld: false,
    dbReceiptSha256: dbApplyReceiptProof.sha256,
    artifactIdentitySha256: review.contract.artifact.identitySha256,
    artifactFileSha256: review.contract.artifact.fileSha256,
    descriptorFileSha256: review.contract.artifact.descriptorFileSha256,
    expectedSchemaSha256: review.contract.artifact.expectedSchemaSha256,
    previousPlistPath: previous.path,
    previousPlistSha256: previous.sha256,
    previousLoaded: previous.loaded,
    previousState: previous.state,
    enqueueClosureSha256: enqueueClosureProof.sha256,
    workerStopped: true,
  };
  const paths = {
    ...rootApproval.workerPaths,
    artifact: review.artifactPaths.manifest,
    descriptor: review.artifactPaths.descriptor,
    expectedSchema: review.artifactPaths.expectedSchema,
  };
  const manifest = {
    schema: "homecook.prelaunch-youtube-resolution-worker-install.v1",
    reviewedAt: credentialTransition.registeredAt,
    review,
    authority,
    previous,
    credentialBefore: credentialTransition.before,
    credentialAfter: credentialTransition.after,
    paths,
    i031Preflight: rootApproval.i031Preflight,
  };
  return assertYoutubeResolutionWorkerInstallManifest(manifest);
}

export function assembleYoutubeResolutionWebActivation({
  rolloutReviewProof,
  rolloutReview,
  workerInstallResultProof,
  workerInstallResult,
}) {
  assertYoutubeResolutionRolloutReview(rolloutReview);
  assertYoutubeResolutionWorkerInstallResult(workerInstallResult, rolloutReview);
  requireValue(rolloutReviewProof?.path?.startsWith("/") && SHA.test(rolloutReviewProof.sha256 ?? "")
    && workerInstallResultProof?.path?.startsWith("/") && SHA.test(workerInstallResultProof.sha256 ?? ""),
  "activation proof path/hash missing");
  requireValue(!isDeepStrictEqual(rolloutReviewProof, workerInstallResultProof), "activation proofs must be separate files");
  return {
    schema: "homecook.prelaunch-youtube-resolution-web-activation.v1",
    rolloutReview: rolloutReviewProof,
    workerInstallResult: workerInstallResultProof,
  };
}
