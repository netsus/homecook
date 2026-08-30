import { createHash } from "node:crypto";
import { isAbsolute, join, resolve } from "node:path";

import { classifyProductionInventory } from "./local-mac-production-rehearsal-classifier.mjs";
import { readCompletedCandidateRoot } from "./local-mac-production-rehearsal-candidate.mjs";
import { readCanonicalInventoryFile } from "./local-mac-production-rehearsal-inventory.mjs";
import {
  readCanonicalReceiptFile,
  readPrivateCanonicalJsonFile,
  validateRepeatabilityReceipt,
} from "./local-mac-production-rehearsal-receipts.mjs";
import {
  digestLocalMacProductionExecutionTree,
  readLocalMacProductionGitReleaseEvidence,
  validateLocalMacProductionReleaseManifest,
} from "./local-mac-production-release.mjs";
import { sha256Jcs } from "./rfc8785-jcs.mjs";

const DIGEST_PATTERN = /^[0-9a-f]{64}$/u;

function requireExactUtcTimestamp(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a nonempty timestamp.`);
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    throw new Error(`${label} must be an exact UTC millisecond RFC3339 instant.`);
  }
  return value;
}

/** @param {any} options */
export function validateProductionPromotionPreMutationGate({
  manifest,
  repeatabilityReceipt,
  memberReceipts,
  candidateManifest,
  candidateRoot,
  candidateComponentDigests,
  inventoryCapturedAt,
  classification,
  now = new Date(),
} = {}) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new Error("Production promotion authority requires a valid current instant.");
  }
  if (!repeatabilityReceipt) throw new Error("Production promotion repeatability receipt is missing.");
  const repeatability = validateRepeatabilityReceipt(repeatabilityReceipt, { memberReceipts, now });
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("Production promotion manifest authority is missing.");
  }
  if (!candidateManifest || typeof candidateManifest !== "object" || Array.isArray(candidateManifest)) {
    throw new Error("Production promotion sealed candidate authority is missing.");
  }
  if (!isAbsolute(candidateRoot ?? "") || resolve(candidateRoot) !== candidateRoot) {
    throw new Error("Sealed candidate root authority must be an absolute canonical path.");
  }
  if (!candidateComponentDigests || ["app", "full_local", "worker"].some(
    (field) => !DIGEST_PATTERN.test(candidateComponentDigests[field] ?? ""),
  )) throw new Error("Sealed candidate component execution digests are invalid.");
  for (const field of ["candidate_identity_digest", "bundle_manifest_digest"]) {
    if (!DIGEST_PATTERN.test(candidateManifest[field] ?? "")) {
      throw new Error(`Sealed candidate ${field} is invalid.`);
    }
  }
  const bindings = [
    ["release_sha", repeatability.release_sha],
    ["release_tree", repeatability.release_tree],
    ["build_id", repeatability.build_id],
    ["sealed_bundle_digest", repeatability.sealed_bundle_digest],
  ];
  for (const [field, expected] of bindings) {
    if (manifest[field] !== expected) throw new Error(`Production manifest ${field} differs from repeatability authority.`);
    if (candidateManifest[field] !== expected) throw new Error(`Sealed candidate ${field} differs from repeatability authority.`);
  }
  if (
    manifest.rehearsal_receipt_schema !== repeatability.schema
    || manifest.repeatability_receipt_digest !== repeatability.repeatability_receipt_digest
    || manifest.rehearsal_receipt_valid_until !== repeatability.valid_until
  ) throw new Error("Production manifest receipt authority differs from the validated repeatability receipt.");

  const capturedAt = requireExactUtcTimestamp(inventoryCapturedAt, "inventoryCapturedAt");
  const capturedMilliseconds = Date.parse(capturedAt);
  if (capturedMilliseconds > now.getTime()) throw new Error("Production inventory contains a future time claim.");
  if (now.getTime() - capturedMilliseconds > 5 * 60 * 1000) {
    throw new Error("Production inventory is stale; a new R0 inventory is required.");
  }
  if (!classification || typeof classification !== "object" || Array.isArray(classification)) {
    throw new Error("Production mixed-state classification authority is missing.");
  }
  const classificationKeys = [
    "schema", "inventory_digest", "classified_at", "states", "promotion_safe",
    "mutation_attempt_count", "findings", "recovery_plan", "classification_digest",
  ];
  if (JSON.stringify(Object.keys(classification).sort()) !== JSON.stringify(classificationKeys.sort())) {
    throw new Error("Production mixed-state classification has an open or incomplete schema.");
  }
  if (classification.schema !== "homecook.local-mac-production-rehearsal-classification.v1") {
    throw new Error("Production mixed-state classification schema is invalid.");
  }
  const classifiedAt = requireExactUtcTimestamp(classification.classified_at, "classification.classified_at");
  if (Date.parse(classifiedAt) < capturedMilliseconds || Date.parse(classifiedAt) > now.getTime()) {
    throw new Error("Production mixed-state classification contains a future or pre-inventory time claim.");
  }
  const { classification_digest: classificationDigest, ...classificationUnsigned } = classification;
  if (!DIGEST_PATTERN.test(classification.inventory_digest ?? "")
    || !DIGEST_PATTERN.test(classificationDigest ?? "")
    || sha256Jcs(classificationUnsigned) !== classificationDigest) {
    throw new Error("Production mixed-state classification digest authority is invalid.");
  }
  if (
    classification.promotion_safe !== true
    || classification.mutation_attempt_count !== 0
    || !Array.isArray(classification.findings)
    || classification.findings.length !== 0
    || !Array.isArray(classification.recovery_plan)
    || classification.recovery_plan.length !== 0
    || !Array.isArray(classification.states)
    || classification.states.length < 1
    || classification.states.some((state) => !["coherent_running", "coherent_prepared"].includes(state))
    || !classification.states.includes("coherent_running")
  ) throw new Error("Production mixed-state classification is not promotion_safe or has unresolved findings.");
  const authority = {
    release_sha: repeatability.release_sha,
    release_tree: repeatability.release_tree,
    build_id: repeatability.build_id,
    sealed_bundle_digest: repeatability.sealed_bundle_digest,
    repeatability_receipt_digest: repeatability.repeatability_receipt_digest,
    rehearsal_receipt_valid_until: repeatability.valid_until,
    candidate_identity_digest: candidateManifest.candidate_identity_digest,
    bundle_manifest_digest: candidateManifest.bundle_manifest_digest,
    inventory_digest: classification.inventory_digest,
    candidate_root_digest: sha256Jcs(candidateRoot),
    candidate_component_digest: sha256Jcs(candidateComponentDigests),
  };
  return Object.freeze({
    verified: true,
    authority_digest: sha256Jcs(authority),
    classification_digest: classificationDigest,
    ...authority,
  });
}

export function createProductionPromotionAuthorityVerifier({
  candidatePath,
  inventoryPath,
  manifestPath,
  memberReceiptPaths,
  repeatabilityReceiptPath,
  repoRoot,
  verifyAttestation,
  readCandidate = readCompletedCandidateRoot,
  readInventory = readCanonicalInventoryFile,
  readReceipt = readCanonicalReceiptFile,
  readManifestSource = readPrivateCanonicalJsonFile,
  readGitEvidence = readLocalMacProductionGitReleaseEvidence,
} = {}) {
  if (!Array.isArray(memberReceiptPaths) || memberReceiptPaths.length !== 2) {
    throw new Error("Production promotion authority requires exactly two member receipt paths.");
  }
  return ({ frozenCandidateAuthority = null, manifest = null, now = new Date() } = {}) => {
    const manifestSource = readManifestSource(manifestPath, { repoRoot });
    let manifestInput;
    try {
      manifestInput = JSON.parse(manifestSource);
    } catch {
      throw new Error("Production release manifest is not valid JSON.");
    }
    const validatedManifest = validateLocalMacProductionReleaseManifest({
      manifest: manifestInput,
      manifestDigest: createHash("sha256").update(manifestSource, "utf8").digest("hex"),
      manifestPath,
      readGitEvidence,
      requireAttestation: true,
      rootDir: repoRoot,
      verifyAttestation,
    });
    if (manifest && [
      "release_sha", "release_tree", "build_id", "sealed_bundle_digest",
      "repeatability_receipt_digest", "rehearsal_receipt_valid_until",
    ].some((field) => manifest[field] !== validatedManifest[field])) {
      throw new Error("Production manifest authority changed between pre-mutation reads.");
    }
    const memberReceipts = memberReceiptPaths.map((path) => readReceipt(path, {
      repoRoot,
      now,
    }));
    const repeatabilityReceipt = readReceipt(repeatabilityReceiptPath, {
      repoRoot,
      memberReceipts,
      now,
    });
    const candidateRoot = frozenCandidateAuthority ? resolve(frozenCandidateAuthority.root) : resolve(candidatePath);
    const candidate = frozenCandidateAuthority ? {
      manifest: {
        release_sha: validatedManifest.release_sha,
        release_tree: validatedManifest.release_tree,
        build_id: validatedManifest.build_id,
        sealed_bundle_digest: validatedManifest.sealed_bundle_digest,
        candidate_identity_digest: frozenCandidateAuthority.candidateIdentityDigest,
        bundle_manifest_digest: frozenCandidateAuthority.bundleManifestDigest,
      },
    } : readCandidate(candidateRoot);
    const inventory = readInventory(inventoryPath, { repoRoot });
    const classification = classifyProductionInventory(inventory, {
      classifiedAt: now.toISOString(),
    });
    const bundleRoot = join(candidateRoot, "bundles", "bundle");
    const componentRoots = frozenCandidateAuthority ? {
      app: frozenCandidateAuthority.appRoot,
      full_local: frozenCandidateAuthority.fullLocalRoot,
      worker: frozenCandidateAuthority.workerRoot,
    } : {
      app: join(bundleRoot, "app"),
      full_local: join(bundleRoot, "full_local"),
      worker: join(bundleRoot, "worker"),
    };
    const candidateComponentDigests = frozenCandidateAuthority ? {
      app: frozenCandidateAuthority.appSourceDigest,
      full_local: frozenCandidateAuthority.fullLocalSourceDigest,
      worker: frozenCandidateAuthority.workerSourceDigest,
    } : Object.fromEntries(Object.entries(componentRoots).map(
      ([component, root]) => [component, digestLocalMacProductionExecutionTree(root)],
    ));
    const authority = validateProductionPromotionPreMutationGate({
      manifest: validatedManifest,
      repeatabilityReceipt,
      memberReceipts,
      candidateManifest: candidate.manifest,
      candidateRoot,
      candidateComponentDigests,
      inventoryCapturedAt: inventory.captured_at,
      classification,
      now,
    });
    return Object.freeze({
      ...authority,
      sealed_candidate: Object.freeze(frozenCandidateAuthority ? { ...frozenCandidateAuthority } : {
        root: candidateRoot,
        appRoot: componentRoots.app,
        fullLocalRoot: componentRoots.full_local,
        workerRoot: componentRoots.worker,
        workerManifestPath: join(bundleRoot, "worker", "artifact.json"),
        candidateIdentityDigest: candidate.manifest.candidate_identity_digest,
        bundleManifestDigest: candidate.manifest.bundle_manifest_digest,
        sealedBundleDigest: candidate.manifest.sealed_bundle_digest,
        repeatabilityReceiptDigest: repeatabilityReceipt.repeatability_receipt_digest,
        appSourceDigest: candidateComponentDigests.app,
        fullLocalSourceDigest: candidateComponentDigests.full_local,
        workerSourceDigest: candidateComponentDigests.worker,
      }),
    });
  };
}
