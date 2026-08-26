#!/usr/bin/env node

import { readFileSync } from "node:fs";

import {
  validateLocalMacProductionReleaseManifest,
} from "./lib/local-mac-production-release.mjs";
import {
  verifyGitHubProductionReleaseAttestation,
} from "./lib/github-production-release-attestation.mjs";

function parseArgs(argv) {
  const options = {
    bundlePath: null,
    json: false,
    releaseManifestPath: null,
    repository: null,
    rootDir: process.cwd(),
    signerWorkflow: null,
    signerDigest: null,
    sourceRef: null,
    subjectManifestPath: null,
    trustedRootPath: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--") {
      continue;
    }
    if (token === "--json") {
      options.json = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${token} requires a value.`);
    }

    if (token === "--bundle") {
      options.bundlePath = value;
    } else if (token === "--release-manifest") {
      options.releaseManifestPath = value;
    } else if (token === "--repo") {
      options.repository = value;
    } else if (token === "--root-dir") {
      options.rootDir = value;
    } else if (token === "--signer-workflow") {
      options.signerWorkflow = value;
    } else if (token === "--signer-digest") {
      options.signerDigest = value;
    } else if (token === "--source-ref") {
      options.sourceRef = value;
    } else if (token === "--subject-manifest") {
      options.subjectManifestPath = value;
    } else if (token === "--trusted-root") {
      options.trustedRootPath = value;
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
    index += 1;
  }

  return options;
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (!options.releaseManifestPath) {
    throw new Error("--release-manifest <path> is required.");
  }

  const manifest = validateLocalMacProductionReleaseManifest({
    manifest: JSON.parse(readFileSync(options.releaseManifestPath, "utf8")),
    manifestPath: options.releaseManifestPath,
    rootDir: options.rootDir,
  });

  const result = verifyGitHubProductionReleaseAttestation({
    bundlePath: options.bundlePath,
    gitEvidence: manifest.git_evidence,
    manifest,
    manifestPath: options.releaseManifestPath,
    repository: options.repository,
    rootDir: options.rootDir,
    signerWorkflow: options.signerWorkflow,
    signerDigest: options.signerDigest,
    sourceRef: options.sourceRef,
    subjectManifestPath: options.subjectManifestPath,
    trustedRootPath: options.trustedRootPath,
  });

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(`verified: ${result.verified ? "true" : "false"}\n`);
    process.stdout.write(`source: ${result.source}\n`);
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
