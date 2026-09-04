import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

import {
  assertTrustedExecutableSnapshotStable,
  resolveTrustedGhExecutable,
  snapshotTrustedExecutables,
} from "./trusted-production-release-tools.mjs";

const REPOSITORY = "netsus/homecook";
const SOURCE_REF = "refs/heads/master";
const SIGNER_WORKFLOW =
  "netsus/homecook/.github/workflows/marketing-campaign-fast-release.yml";
const PREDICATE_TYPE =
  "https://github.com/netsus/homecook/attestations/marketing-campaign-release/v1";

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

/** @param {Record<string, any>} options */
export function verifyCampaignGitHubAttestation({
  manifestPath,
  attestationBundlePath,
  predicatePath,
  releaseSha,
  runCommand = spawnSync,
  ghPath = resolveTrustedGhExecutable(),
}) {
  if (!/^[0-9a-f]{40}$/u.test(releaseSha ?? "")) {
    throw new Error("Campaign attestation release SHA is invalid.");
  }
  const manifestBytes = readFileSync(manifestPath);
  const expectedSubjectSha256 = createHash("sha256").update(manifestBytes).digest("hex");
  const expectedPredicate = JSON.parse(readFileSync(predicatePath, "utf8"));
  const tools = { ghPath };
  const before = snapshotTrustedExecutables(tools);
  const result = runCommand(ghPath, [
    "attestation", "verify", manifestPath,
    "--repo", REPOSITORY,
    "--bundle", attestationBundlePath,
    "--predicate-type", PREDICATE_TYPE,
    "--signer-workflow", SIGNER_WORKFLOW,
    "--signer-digest", releaseSha,
    "--source-ref", SOURCE_REF,
    "--source-digest", releaseSha,
    "--deny-self-hosted-runners",
    "--format", "json",
  ], {
    encoding: "utf8",
    env: { HOME: process.env.HOME, PATH: "/usr/bin:/bin" },
    maxBuffer: 16 * 1024 * 1024,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 60_000,
  });
  assertTrustedExecutableSnapshotStable(before, tools);
  if (result.error || result.signal || result.status !== 0) {
    throw new Error("GitHub campaign attestation cryptographic verification failed.");
  }
  let records;
  try {
    records = JSON.parse(result.stdout);
  } catch {
    throw new Error("GitHub campaign attestation verifier returned invalid JSON.");
  }
  if (!Array.isArray(records) || records.length !== 1) {
    throw new Error("GitHub campaign attestation verifier must return exactly one result.");
  }
  const statement = records[0]?.verificationResult?.statement;
  const subjectMatches = Array.isArray(statement?.subject)
    && statement.subject.length === 1
    && statement.subject[0]?.digest?.sha256 === expectedSubjectSha256;
  if (!subjectMatches || statement?.predicateType !== PREDICATE_TYPE
    || JSON.stringify(canonical(statement?.predicate)) !== JSON.stringify(canonical(expectedPredicate))) {
    throw new Error("GitHub campaign attestation subject or predicate does not match exact bytes.");
  }
  return Object.freeze({
    verified: true,
    repository: REPOSITORY,
    signer_workflow: SIGNER_WORKFLOW,
    source_ref: SOURCE_REF,
    source_digest: releaseSha,
    subject_sha256: expectedSubjectSha256,
    predicate: expectedPredicate,
  });
}
