#!/usr/bin/env node
import { readFileSync } from "node:fs";

import { durableJson, privatePath } from "./lib/marketing-round2-controlled-deploy.mjs";
import {
  assembleYoutubeResolutionRolloutReview,
  assembleYoutubeResolutionCredentialExecutionAuthority,
  assembleYoutubeResolutionWebActivation,
  assembleYoutubeResolutionWorkerInstallManifest,
  sha256,
} from "./lib/prelaunch-youtube-resolution-manifest-assembly.mjs";

const ROOT = "/Users/cwj/.homecook/operations/youtube-resolution-20261010";
const PATHS = Object.freeze({
  finalPlan: `${ROOT}/db-final-plan.json`,
  dbReceipt: `${ROOT}/db-apply-receipt.json`,
  rootApproval: `${ROOT}/root-approval.json`,
  credentialTransition: `${ROOT}/credential-transition.json`,
  rolloutReview: `${ROOT}/rollout-review.json`,
  workerInstallManifest: `${ROOT}/worker-install.json`,
  workerInstallResult: `${ROOT}/worker-install-result.json`,
  webActivation: `${ROOT}/web-activation.json`,
  credentialExecutionAuthority: `${ROOT}/credential-execution-authority.json`,
});
const read = async (path) => { await privatePath(path); const bytes = readFileSync(path); return { bytes, value: JSON.parse(bytes) }; };

async function rollout() {
  const [plan, receipt, approval] = await Promise.all([read(PATHS.finalPlan), read(PATHS.dbReceipt), read(PATHS.rootApproval)]);
  const review = assembleYoutubeResolutionRolloutReview({
    precutoverAuthority: plan.value.review,
    dbApplyReceiptProof: { path: PATHS.dbReceipt, sha256: sha256(receipt.bytes) },
    originalReadinessSha256: approval.value.r2.originalReadinessSha256,
    proofDigests: approval.value.r2.proofDigests,
    artifactPaths: approval.value.artifactPaths,
    databaseBefore: approval.value.databaseBefore,
    expectedFunctionEvidence: plan.value.plan.expectedAfter.functionEvidence,
  });
  await durableJson(PATHS.rolloutReview, review, true); return review;
}

async function worker() {
  const [review, approval, credential, receipt, closure] = await Promise.all([
    read(PATHS.rolloutReview), read(PATHS.rootApproval), read(PATHS.credentialTransition),
    read(PATHS.dbReceipt), read(`${ROOT}/enqueue-closure.json`),
  ]);
  const manifest = assembleYoutubeResolutionWorkerInstallManifest({
    review: review.value,
    rootApproval: approval.value,
    credentialTransition: credential.value,
    dbApplyReceiptProof: { path: PATHS.dbReceipt, sha256: sha256(receipt.bytes) },
    enqueueClosureProof: { path: `${ROOT}/enqueue-closure.json`, sha256: sha256(closure.bytes) },
  });
  await durableJson(PATHS.workerInstallManifest, manifest, true); return manifest;
}

async function credentialAuthority() {
  const [approval, closure, receipt] = await Promise.all([
    read(PATHS.rootApproval), read(`${ROOT}/enqueue-closure.json`), read(PATHS.dbReceipt),
  ]);
  if (approval.value.approved !== true) throw new Error("root approval is not active");
  const authority = assembleYoutubeResolutionCredentialExecutionAuthority({
    releaseSha: approval.value.releaseSha,
    rootApprovalProof: { path: PATHS.rootApproval, sha256: sha256(approval.bytes) },
    enqueueClosureProof: { path: `${ROOT}/enqueue-closure.json`, sha256: sha256(closure.bytes) },
    dbApplyReceiptProof: { path: PATHS.dbReceipt, sha256: sha256(receipt.bytes) },
    approvedAt: new Date().toISOString(),
  });
  await durableJson(PATHS.credentialExecutionAuthority, authority, true); return authority;
}

async function activation() {
  const [review, result] = await Promise.all([read(PATHS.rolloutReview), read(PATHS.workerInstallResult)]);
  const manifest = assembleYoutubeResolutionWebActivation({
    rolloutReviewProof: { path: PATHS.rolloutReview, sha256: sha256(review.bytes) },
    rolloutReview: review.value,
    workerInstallResultProof: { path: PATHS.workerInstallResult, sha256: sha256(result.bytes) },
    workerInstallResult: result.value,
  });
  await durableJson(PATHS.webActivation, manifest, true); return manifest;
}

const [command] = process.argv.slice(2);
const result = command === "--rollout-review" ? await rollout()
  : command === "--credential-execution-authority" ? await credentialAuthority()
    : command === "--worker-install" ? await worker()
    : command === "--activation" ? await activation()
      : (() => { throw new Error("usage: assemble-prelaunch-youtube-resolution.mjs --rollout-review|--credential-execution-authority|--worker-install|--activation"); })();
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
