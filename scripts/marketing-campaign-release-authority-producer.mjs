#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

import {
  sealCampaignAuthorityArtifact,
} from "./lib/marketing-campaign-fast-release.mjs";
import {
  createProductionSurfaceSnapshot,
  validateProductionInventory,
} from "./lib/local-mac-production-rehearsal-inventory.mjs";
import { classifyProductionInventory } from "./lib/local-mac-production-rehearsal-classifier.mjs";
import { validateRunEvidence } from "./lib/local-mac-production-rehearsal-runner.mjs";
import {
  getLocalMacProductionReleasePaths,
  normalizeRunningReleaseDescriptor,
} from "./lib/local-mac-production-release.mjs";

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--") continue;
    const value = argv[index + 1];
    if (!token.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error(`${token} requires a value.`);
    }
    options[token.slice(2).replaceAll("-", "_")] = value;
    index += 1;
  }
  return options;
}

function absolute(options, key) {
  const value = options[key];
  if (typeof value !== "string" || !isAbsolute(value)) {
    throw new Error(`--${key.replaceAll("_", "-")} must be absolute.`);
  }
  return resolve(value);
}

function json(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeAuthority(root, name, value) {
  writeFileSync(join(root, name), `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8", flag: "wx", mode: 0o600,
  });
}

export function produceCampaignReleaseAuthorities(argv) {
  const options = parseArgs(argv);
  const outputRoot = absolute(options, "output_root");
  const candidate = json(absolute(options, "candidate_result"));
  const runEvidence = validateRunEvidence(json(absolute(options, "rehearsal_result")));
  const inventory = validateProductionInventory(json(absolute(options, "production_inventory")));
  const classification = classifyProductionInventory(inventory);
  const backupResult = json(absolute(options, "backup_result"));
  const backupVerification = json(absolute(options, "backup_verification"));
  const bundleBytes = readFileSync(absolute(options, "bundle"));
  const backupBytes = readFileSync(absolute(options, "backup_archive"));
  const releaseSha = options.release_sha;
  if (!/^[0-9a-f]{40}$/u.test(releaseSha ?? "")
    || candidate?.manifest?.release_sha !== releaseSha
    || runEvidence.release_sha !== releaseSha) {
    throw new Error("Producer release SHA does not match candidate and rehearsal evidence.");
  }
  if (classification.promotion_safe !== true || backupResult.status !== "PASS"
    || backupVerification.status !== "PASS"
    || runEvidence.previous_bundle_rollback?.status !== "pass") {
    throw new Error("Producer requires promotion-safe inventory and verified backup evidence.");
  }
  const producer = {
    repository: "netsus/homecook",
    workflow_path: ".github/workflows/marketing-campaign-release-authority.yml",
    workflow_run_id: Number(options.workflow_run_id),
    workflow_run_attempt: Number(options.workflow_run_attempt),
    workflow_head_sha: releaseSha,
  };
  const releaseBundleSha256 = createHash("sha256").update(bundleBytes).digest("hex");
  const buildId = candidate.manifest.build_id;
  const components = ["app", "full-local", "youtube-worker"].map((component) => ({
    component,
    release_sha: releaseSha,
    build_id: buildId,
    release_bundle_sha256: releaseBundleSha256,
  }));
  const bundle = sealCampaignAuthorityArtifact({
    schema: "homecook.marketing-campaign-bundle-authority.v1",
    release_sha: releaseSha,
    release_tree: candidate.manifest.release_tree,
    build_id: buildId,
    release_bundle_sha256: releaseBundleSha256,
    components,
    producer,
  }, "authority_sha256");
  const rehearsal = sealCampaignAuthorityArtifact({
    schema: "homecook.marketing-campaign-rehearsal-receipt.v1",
    release_sha: releaseSha,
    build_id: buildId,
    release_bundle_sha256: releaseBundleSha256,
    run_count: 1,
    candidate_health: "pass",
    previous_bundle_rollback: "pass",
    production_guard: "unchanged",
    cleanup: "complete",
    isolation: {
      private_root: true,
      unique_docker_project: true,
      unique_volumes: true,
      fresh_database: true,
    },
    run_evidence_sha256: runEvidence.evidence_digest,
    producer,
  }, "receipt_sha256");
  const currentDescriptor = normalizeRunningReleaseDescriptor(
    json(getLocalMacProductionReleasePaths(options.home_dir).currentDescriptorPath),
  );
  const previousBundle = {
    release_sha: currentDescriptor.release_sha,
    build_id: currentDescriptor.build_id,
    release_bundle_sha256: currentDescriptor.sealed_bundle_digest,
  };
  const snapshotProjection = createProductionSurfaceSnapshot(inventory);
  const snapshot = sealCampaignAuthorityArtifact({
    schema: "homecook.marketing-campaign-production-snapshot.v1",
    captured_at: snapshotProjection.captured_at,
    complete: true,
    promotion_safe: true,
    previous_release_sha: previousBundle.release_sha,
    inventory_sha256: snapshotProjection.surface_digest,
    producer,
  }, "snapshot_sha256");
  const backupCreatedAt = backupVerification.created_at ?? backupResult.created_at;
  const backup = sealCampaignAuthorityArtifact({
    schema: "homecook.marketing-campaign-backup-receipt.v1",
    created_at: backupCreatedAt,
    source_snapshot_sha256: snapshot.snapshot_sha256,
    archive_sha256: createHash("sha256").update(backupBytes).digest("hex"),
    encrypted: true,
    verified: true,
    verification_sha256: createHash("sha256")
      .update(JSON.stringify(backupVerification)).digest("hex"),
    producer,
  }, "receipt_sha256");
  writeAuthority(outputRoot, "bundle-authority.json", bundle);
  writeAuthority(outputRoot, "rehearsal-receipt.json", rehearsal);
  writeAuthority(outputRoot, "production-snapshot.json", snapshot);
  writeAuthority(outputRoot, "backup-receipt.json", backup);
  writeAuthority(outputRoot, "previous-bundle.json", previousBundle);
  return { bundle, rehearsal, snapshot, backup, previousBundle };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    produceCampaignReleaseAuthorities(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
