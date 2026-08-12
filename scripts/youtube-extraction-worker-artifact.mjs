#!/usr/bin/env node

import {
  buildYoutubeExtractionWorkerArtifactManifest,
  buildYoutubeExtractionAppDescriptor,
  ensureAbsolutePath,
  ensureNonEmptyString,
  ensureReleaseSha,
  ensureSnapshotDigest,
  writeJsonFile,
} from "./lib/youtube-extraction-worker-artifact.mjs";

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {
    command,
    rootDir: process.cwd(),
    json: false,
  };

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === "--") continue;
    if (token === "--json") {
      options.json = true;
      continue;
    }

    const value = rest[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${token} requires a value.`);
    }

    switch (token) {
      case "--root-dir":
        options.rootDir = ensureAbsolutePath(value, "rootDir");
        break;
      case "--release-sha":
        options.releaseSha = ensureReleaseSha(value);
        break;
      case "--schema-identity":
        options.schemaIdentity = ensureNonEmptyString(value, "schemaIdentity");
        break;
      case "--allowed-snapshot-digest":
        options.allowedSnapshotDigest = ensureSnapshotDigest(value);
        break;
      case "--policy-version":
        options.policyVersion = Number(value);
        break;
      case "--output":
        options.output = ensureAbsolutePath(value, "output");
        break;
      case "--app-descriptor-output":
        options.appDescriptorOutput = ensureAbsolutePath(value, "appDescriptorOutput");
        break;
      default:
        throw new Error(`Unknown option: ${token}`);
    }
    index += 1;
  }

  return options;
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.command !== "build") {
    throw new Error(
      "Usage: node scripts/youtube-extraction-worker-artifact.mjs build --release-sha <40-hex> --allowed-snapshot-digest <64-hex> [--schema-identity <id>] [--output <absolute .json path>] [--app-descriptor-output <absolute .json path>] [--json]",
    );
  }

  const manifest = buildYoutubeExtractionWorkerArtifactManifest({
    rootDir: options.rootDir,
    releaseSha: options.releaseSha,
    schemaIdentity: options.schemaIdentity,
    allowedSnapshotDigest: options.allowedSnapshotDigest,
    policyVersion: options.policyVersion,
  });
  const appDescriptor = buildYoutubeExtractionAppDescriptor({
    releaseSha: manifest.release_sha,
    schemaIdentity: manifest.schema_identity,
    expectedPolicyVersion: manifest.policy_version,
    expectedPolicySnapshotDigest: manifest.allowed_snapshot_digest,
  });

  if (options.output) {
    writeJsonFile(options.output, manifest, { mode: 0o600 });
  }
  if (options.appDescriptorOutput) {
    writeJsonFile(options.appDescriptorOutput, appDescriptor, { mode: 0o600 });
  }

  printJson({
    ok: true,
    manifest,
    app_descriptor: appDescriptor,
    manifest_output: options.output ?? null,
    app_descriptor_output: options.appDescriptorOutput ?? null,
  });
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
