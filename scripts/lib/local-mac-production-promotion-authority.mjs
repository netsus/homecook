import { createHash } from "node:crypto";

import { classifyProductionInventory } from "./local-mac-production-rehearsal-classifier.mjs";
import { readCompletedCandidateRoot } from "./local-mac-production-rehearsal-candidate.mjs";
import { readCanonicalInventoryFile } from "./local-mac-production-rehearsal-inventory.mjs";
import {
  readCanonicalReceiptFile,
  readPrivateCanonicalJsonFile,
} from "./local-mac-production-rehearsal-receipts.mjs";
import {
  readLocalMacProductionGitReleaseEvidence,
  validateLocalMacProductionReleaseManifest,
  validateProductionPromotionPreMutationGate,
} from "./local-mac-production-release.mjs";

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
  return ({ manifest = null, now = new Date() } = {}) => {
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
    const candidate = readCandidate(candidatePath);
    const inventory = readInventory(inventoryPath, { repoRoot });
    const classification = classifyProductionInventory(inventory, {
      classifiedAt: now.toISOString(),
    });
    return validateProductionPromotionPreMutationGate({
      manifest: validatedManifest,
      repeatabilityReceipt,
      memberReceipts,
      candidateManifest: candidate.manifest,
      inventoryCapturedAt: inventory.captured_at,
      classification,
      now,
    });
  };
}
