#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  YOUTUBE_INTEGRATED_CLIENT_VERSION,
  YOUTUBE_INTEGRATED_LIVE_RELEASE,
  YOUTUBE_INTEGRATED_MIGRATION,
  YOUTUBE_INTEGRATED_PIPELINE_IDENTITY,
  YOUTUBE_INTEGRATED_RELEASE_DESCRIPTOR,
  YOUTUBE_INTEGRATED_SOURCE_COMMITS,
  YOUTUBE_INTEGRATED_VERIFIER_VERSION,
} from "./lib/prelaunch-integrated-master-readiness.mjs";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = process.argv[2] ?? "HEAD";
const git = (args, options = {}) => execFileSync("git", ["-C", repository, ...args], {
  encoding: options.binary ? undefined : "utf8",
  maxBuffer: 64 * 1024 * 1024,
});
const existsAt = (ref, path) => spawnSync("git", ["-C", repository, "cat-file", "-e", `${ref}:${path}`]).status === 0;
const bytesAt = (ref, path) => existsAt(ref, path) ? git(["show", `${ref}:${path}`], { binary: true }) : null;
const sha256 = (bytes) => bytes === null ? null : createHash("sha256").update(bytes).digest("hex");

const targetSha = git(["rev-parse", "--verify", `${target}^{commit}`]).trim();
const changed = git(["diff", "--name-only", "--no-renames", YOUTUBE_INTEGRATED_LIVE_RELEASE, targetSha])
  .split("\n").filter(Boolean);
const paths = [...new Set([...changed, YOUTUBE_INTEGRATED_RELEASE_DESCRIPTOR])].sort();
const files = paths.map((path) => ({
  path,
  beforeSha256: sha256(bytesAt(YOUTUBE_INTEGRATED_LIVE_RELEASE, path)),
  afterSha256: path === YOUTUBE_INTEGRATED_RELEASE_DESCRIPTOR ? null : sha256(bytesAt(targetSha, path)),
}));
if (files.some((entry) => entry.path !== YOUTUBE_INTEGRATED_RELEASE_DESCRIPTOR && entry.afterSha256 === null)) {
  throw new Error("Integrated release descriptor does not support deleted target files.");
}
const migration = files.find((entry) => entry.path === YOUTUBE_INTEGRATED_MIGRATION);
if (!migration?.afterSha256) throw new Error("Integrated bridge migration is missing.");

const descriptor = {
  schema: "homecook.youtube-integrated-master-release.v1",
  liveReleaseSha: YOUTUBE_INTEGRATED_LIVE_RELEASE,
  sourceCommits: [...YOUTUBE_INTEGRATED_SOURCE_COMMITS],
  database: {
    beforeLedgerCount: 218,
    afterLedgerCount: 219,
    migration: { path: YOUTUBE_INTEGRATED_MIGRATION, sha256: migration.afterSha256 },
  },
  worker: {
    policyVersion: 3,
    credentialGenerationBefore: 46,
    credentialGenerationAfter: 47,
    pipelineIdentity: YOUTUBE_INTEGRATED_PIPELINE_IDENTITY,
    clientVersion: YOUTUBE_INTEGRATED_CLIENT_VERSION,
    verifierVersion: YOUTUBE_INTEGRATED_VERIFIER_VERSION,
  },
  files,
};
const output = resolve(repository, YOUTUBE_INTEGRATED_RELEASE_DESCRIPTOR);
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(descriptor, null, 2)}\n`, { mode: 0o644 });
process.stdout.write(`${JSON.stringify({ output, targetSha, fileCount: files.length }, null, 2)}\n`);

