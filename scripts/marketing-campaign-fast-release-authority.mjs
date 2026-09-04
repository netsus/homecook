#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { isAbsolute } from "node:path";

import {
  buildCampaignManifestFromAuthorities,
  sealCampaignAuthorityArtifact,
  validateCampaignManifest,
  verifyCampaignPromotionAuthority,
} from "./lib/marketing-campaign-fast-release.mjs";
import { verifyCampaignGitHubAttestation } from "./lib/marketing-campaign-github-attestation.mjs";
import { validateProductionInventory } from "./lib/local-mac-production-rehearsal-inventory.mjs";

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = { command, json: false };
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === "--") continue;
    if (token === "--json") { options.json = true; continue; }
    const value = rest[index + 1];
    if (!token.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error(`${token} requires a value.`);
    }
    options[token.slice(2).replaceAll("-", "_")] = value;
    index += 1;
  }
  return options;
}

function pathOption(options, key) {
  const value = options[key];
  if (typeof value !== "string" || !isAbsolute(value)) {
    throw new Error(`--${key.replaceAll("_", "-")} must be an absolute path.`);
  }
  return value;
}

function jsonFile(options, key) {
  return JSON.parse(readFileSync(pathOption(options, key), "utf8"));
}

function bytesFile(options, key) {
  return readFileSync(pathOption(options, key));
}

function writeCreateOnly(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8", flag: "wx", mode: 0o600,
  });
}

export function runCampaignAuthorityCli(argv, { now = () => new Date(), output = process.stdout } = {}) {
  const options = parseArgs(argv);
  let result;
  if (options.command === "seal-approval") {
    result = sealCampaignAuthorityArtifact({
      schema: "homecook.marketing-campaign-approval-authority.v1",
      environment: "production-release-approval",
      approved_at: options.approved_at,
      reviewer_id: Number(options.reviewer_id),
      prevent_self_review: true,
      workflow_run_id: Number(options.workflow_run_id),
      workflow_run_attempt: Number(options.workflow_run_attempt),
      workflow_head_sha: options.workflow_head_sha,
    }, "authority_sha256");
    writeCreateOnly(pathOption(options, "output"), result);
  } else if (options.command === "build-manifest") {
    result = buildCampaignManifestFromAuthorities({
      releaseTag: options.release_tag,
      ciCheckRuns: jsonFile(options, "check_runs"),
      bundleBytes: bytesFile(options, "bundle"),
      backupArchiveBytes: bytesFile(options, "backup_archive"),
      bundle: jsonFile(options, "bundle_authority"),
      rehearsal: jsonFile(options, "rehearsal_receipt"),
      snapshot: jsonFile(options, "production_snapshot"),
      backup: jsonFile(options, "backup_receipt"),
      approval: jsonFile(options, "approval_authority"),
      previousBundle: jsonFile(options, "previous_bundle"),
    });
    writeCreateOnly(pathOption(options, "output"), result);
  } else if (options.command === "seal-attestation") {
    const manifest = validateCampaignManifest(jsonFile(options, "manifest"));
    const predicateBytes = bytesFile(options, "predicate");
    const attestationBytes = bytesFile(options, "attestation_bundle");
    const cryptographic = verifyCampaignGitHubAttestation({
      manifestPath: pathOption(options, "manifest"),
      attestationBundlePath: pathOption(options, "attestation_bundle"),
      predicatePath: pathOption(options, "predicate"),
      releaseSha: manifest.release_sha,
    });
    result = sealCampaignAuthorityArtifact({
      schema: "homecook.marketing-campaign-attestation-authority.v1",
      repository: "netsus/homecook",
      release_sha: manifest.release_sha,
      release_tag: manifest.release_tag,
      manifest_sha256: manifest.manifest_sha256,
      subject_sha256: cryptographic.subject_sha256,
      predicate_sha256: createHash("sha256").update(predicateBytes).digest("hex"),
      release_bundle_sha256: manifest.release_bundle_sha256,
      github_attestation_bundle_sha256: createHash("sha256").update(attestationBytes).digest("hex"),
      verified: true,
    }, "attestation_sha256");
    writeCreateOnly(pathOption(options, "output"), result);
  } else if (options.command === "verify") {
    const boundSnapshot = jsonFile(options, "production_snapshot");
    if (options.live_inventory) {
      const liveInventory = validateProductionInventory(jsonFile(options, "live_inventory"));
      if (liveInventory.surface_digest !== boundSnapshot.inventory_sha256) {
        throw new Error("Live production snapshot drifted from approved authority.");
      }
    }
    result = verifyCampaignPromotionAuthority({
      manifest: jsonFile(options, "manifest"),
      attestation: jsonFile(options, "attestation_authority"),
      attestationBundleBytes: bytesFile(options, "attestation_bundle"),
      ciCheckRuns: jsonFile(options, "check_runs"),
      bundleBytes: bytesFile(options, "bundle"),
      backupArchiveBytes: bytesFile(options, "backup_archive"),
      bundle: jsonFile(options, "bundle_authority"),
      rehearsal: jsonFile(options, "rehearsal_receipt"),
      snapshot: boundSnapshot,
      backup: jsonFile(options, "backup_receipt"),
      approval: jsonFile(options, "approval_authority"),
      now: now(),
      attestationVerifier: () => verifyCampaignGitHubAttestation({
        manifestPath: pathOption(options, "manifest"),
        attestationBundlePath: pathOption(options, "attestation_bundle"),
        predicatePath: pathOption(options, "predicate"),
        releaseSha: jsonFile(options, "manifest").release_sha,
      }),
    });
  } else {
    throw new Error("Campaign authority command must be seal-approval, build-manifest, seal-attestation, or verify.");
  }
  output.write(`${JSON.stringify(result, null, options.json ? 2 : 0)}\n`);
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    runCampaignAuthorityCli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
