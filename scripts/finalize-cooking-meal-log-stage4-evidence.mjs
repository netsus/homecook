#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  cp,
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import {
  canPromoteStage4Evidence,
  finalizeStage4Proof,
} from "./lib/cooking-meal-log-stage4-isolated.mjs";

const SLICE = "cooking-meal-log-cross-slice-release-qa";
const EXPECTED_OUTPUT = `ui/designs/evidence/${SLICE}`;

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!["--capture-dir", "--output-dir", "--proof-ledger"].includes(token)) {
      throw new Error(`unknown Stage 4 finalizer argument: ${token}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${token} requires a value`);
    }
    values[token.slice(2)] = value;
    index += 1;
  }
  for (const key of ["capture-dir", "output-dir", "proof-ledger"]) {
    if (!values[key]) throw new Error(`--${key} is required`);
  }
  return values;
}

function assertRepositoryRelative(value, label) {
  if (
    typeof value !== "string"
    || value.length === 0
    || path.isAbsolute(value)
    || value.split(/[\\/]/u).includes("..")
  ) {
    throw new Error(`${label} must be a safe repository-relative path`);
  }
  return path.normalize(value);
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

async function sha256(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

async function assertRegularFile(filePath, label) {
  const metadata = await lstat(filePath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`${label} must be a regular non-symlink file`);
  }
}

function evidenceEntries(ledger) {
  const entries = [...(ledger.private_nondisclosure?.evidence ?? [])];
  for (const screen of Object.values(ledger.screens ?? {})) {
    for (const stateEntries of Object.values(screen.states ?? {})) {
      entries.push(...stateEntries);
    }
  }
  return entries;
}

function localizeEvidencePaths(ledger, localizedPaths) {
  return JSON.parse(JSON.stringify(ledger), (key, value) =>
    key === "path" && localizedPaths.has(value)
      ? localizedPaths.get(value)
      : value
  );
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repositoryRoot = git("rev-parse", "--show-toplevel");
  if (path.resolve(repositoryRoot) !== path.resolve(process.cwd())) {
    throw new Error("Stage 4 finalizer must run from the repository root");
  }
  if (git("status", "--porcelain", "--untracked-files=all") !== "") {
    throw new Error("Stage 4 finalizer requires a clean worktree");
  }

  const captureDir = assertRepositoryRelative(args["capture-dir"], "capture dir");
  const proofLedgerPath = assertRepositoryRelative(
    args["proof-ledger"],
    "proof ledger",
  );
  const outputDir = assertRepositoryRelative(args["output-dir"], "output dir");
  if (!captureDir.startsWith(`.artifacts/${SLICE}/stage4-captures/`)) {
    throw new Error("capture dir must be an isolated Stage 4 capture artifact");
  }
  if (outputDir !== EXPECTED_OUTPUT) {
    throw new Error(`output dir must be exactly ${EXPECTED_OUTPUT}`);
  }

  const captureManifestPath = path.join(captureDir, "manifest.json");
  await assertRegularFile(captureManifestPath, "capture manifest");
  await assertRegularFile(proofLedgerPath, "proof ledger");
  const captureManifest = JSON.parse(await readFile(captureManifestPath, "utf8"));
  const proofLedger = JSON.parse(await readFile(proofLedgerPath, "utf8"));
  const sourceHeadSha = git("rev-parse", "HEAD");
  if (
    captureManifest.source_head_sha !== sourceHeadSha
    || proofLedger.source_head_sha !== sourceHeadSha
  ) {
    throw new Error("Stage 4 finalizer source head is stale");
  }

  const tempOutput = `${outputDir}.tmp-${process.pid}`;
  try {
    await stat(outputDir);
    throw new Error(`create-only evidence directory already exists: ${outputDir}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await rm(tempOutput, { force: true, recursive: true });
  await mkdir(path.dirname(tempOutput), { recursive: true });
  await cp(captureDir, tempOutput, {
    errorOnExist: true,
    force: false,
    recursive: true,
    verbatimSymlinks: true,
  });

  try {
    const localizedPaths = new Map();
    const proofDir = path.join(tempOutput, "proof");
    await mkdir(proofDir, { mode: 0o700 });
    for (const entry of evidenceEntries(proofLedger)) {
      const sourcePath = assertRepositoryRelative(entry.path, "evidence path");
      await assertRegularFile(sourcePath, `evidence ${sourcePath}`);
      const actualSha256 = await sha256(sourcePath);
      if (actualSha256 !== entry.sha256) {
        throw new Error(`Stage 4 evidence hash mismatch: ${sourcePath}`);
      }
      if (!localizedPaths.has(sourcePath)) {
        const fileName = `${actualSha256}-${path.basename(sourcePath)}`;
        await cp(sourcePath, path.join(proofDir, fileName), {
          errorOnExist: true,
          force: false,
        });
        localizedPaths.set(sourcePath, `${EXPECTED_OUTPUT}/proof/${fileName}`);
      }
    }

    const localizedLedger = localizeEvidencePaths(proofLedger, localizedPaths);
    const stateMatrices = [];
    for (const artifact of captureManifest.artifacts ?? []) {
      if (!artifact.file.endsWith("-state-matrix.json")) continue;
      const matrixPath = path.join(captureDir, artifact.file);
      await assertRegularFile(matrixPath, `state matrix ${artifact.file}`);
      stateMatrices.push(JSON.parse(await readFile(matrixPath, "utf8")));
    }
    const finalized = finalizeStage4Proof({
      captureManifest,
      proofLedger: localizedLedger,
      stateMatrices,
    });
    for (const matrix of finalized.state_matrices) {
      await writeJson(
        path.join(tempOutput, `${matrix.screen}-state-matrix.json`),
        matrix,
      );
    }

    const proofFile = path.join(tempOutput, "proof-ledger.json");
    await writeJson(proofFile, localizedLedger);
    const artifacts = [];
    for (const artifact of captureManifest.artifacts ?? []) {
      const artifactPath = path.join(tempOutput, artifact.file);
      await assertRegularFile(artifactPath, `final artifact ${artifact.file}`);
      const metadata = await stat(artifactPath);
      artifacts.push({
        bytes: metadata.size,
        file: artifact.file,
        sha256: await sha256(artifactPath),
      });
    }
    const canonicalPromotion = canPromoteStage4Evidence({
      qualityStatus: captureManifest.quality?.quality_status,
      stage4Complete: finalized.stage4_complete,
    });
    if (!canonicalPromotion) {
      throw new Error("Stage 4 finalized evidence cannot be promoted");
    }
    await writeJson(path.join(tempOutput, "manifest.json"), {
      ...captureManifest,
      artifacts,
      canonical_promotion: true,
      finalized_at: new Date().toISOString(),
      owner_boundary: finalized.owner_boundary,
      proof_ledger: {
        file: "proof-ledger.json",
        sha256: await sha256(proofFile),
      },
      stage4_complete: true,
    });
    await rename(tempOutput, outputDir);
  } catch (error) {
    await rm(tempOutput, { force: true, recursive: true });
    throw error;
  }

  process.stdout.write(`${JSON.stringify({
    canonical_promotion: true,
    evidence_dir: outputDir,
    source_head_sha: sourceHeadSha,
    stage4_complete: true,
  })}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
