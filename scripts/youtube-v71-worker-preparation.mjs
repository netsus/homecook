#!/usr/bin/env node

import {
  writeYoutubeV71PreparationFiles,
} from "./lib/youtube-v71-worker-preparation.mjs";

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${token} requires a value.`);
    if (token === "--artifact-manifest") options.artifactManifestPath = value;
    else if (token === "--app-descriptor") options.appDescriptorPath = value;
    else if (token === "--candidate-policy-output") options.candidatePolicyPath = value;
    else if (token === "--preparation-manifest-output") options.preparationManifestPath = value;
    else throw new Error(`Unknown option: ${token}`);
    index += 1;
  }
  return options;
}

try {
  const manifest = writeYoutubeV71PreparationFiles(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify({
    ok: true,
    release_sha: manifest.candidate.release_sha,
    artifact_identity_sha256: manifest.candidate.artifact_identity_sha256,
    policy_snapshot_digest: manifest.candidate.candidate_policy.snapshot_digest,
    credential_generation: manifest.candidate.credential.generation,
    production_mutation_authorized: manifest.production_mutation_authorized,
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
