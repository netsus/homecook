#!/usr/bin/env node

import { createHash } from "node:crypto";
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, posix, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

function reject(message) {
  throw new Error(`Release rehearsal candidate bootstrap rejected: ${message}`);
}

function snapshotExecutable(path) {
  const realpath = realpathSync(path);
  const stat = lstatSync(realpath, { bigint: true });
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o022n) !== 0n) reject("trusted bootstrap tool is unsafe");
  return {
    realpath,
    device: String(stat.dev),
    inode: String(stat.ino),
    mode: Number(stat.mode & 0o7777n),
    ctime: String(stat.ctimeNs),
    size: String(stat.size),
    sha256: createHash("sha256").update(readFileSync(realpath)).digest("hex"),
  };
}

function runExact(command, args, { cwd, homeDir, binary = false, timeout = 120_000 } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: binary ? null : "utf8",
    env: {
      GIT_ATTR_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_OPTIONAL_LOCKS: "0",
      HOME: homeDir,
      PATH: "/usr/bin:/bin",
    },
    maxBuffer: 64 * 1024 * 1024,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    timeout,
  });
  if (result.error || result.signal || result.status !== 0) reject("trusted immutable materialization command failed");
  return result.stdout;
}

export function materializeImmutableCandidateBootstrap({
  gitPath, tarPath, repositoryRoot, releaseSha, outputRoot, homeDir,
} = {}) {
  if (!/^[0-9a-f]{40}$/u.test(releaseSha ?? "") || ![repositoryRoot, outputRoot, homeDir].every(isAbsolute)) {
    reject("immutable materialization inputs are invalid");
  }
  const realRepository = realpathSync(repositoryRoot);
  const gitPre = snapshotExecutable(gitPath);
  const tarPre = snapshotExecutable(tarPath);
  try {
    mkdirSync(outputRoot, { mode: 0o700 });
  } catch (error) {
    if (error?.code === "EEXIST") reject("immutable materialization output is create-only");
    throw error;
  }
  const archivePath = join(dirname(outputRoot), `source-${releaseSha}.tar`);
  runExact(gitPre.realpath, [
    "--no-replace-objects", "-C", realRepository, "archive", "--format=tar", `--output=${archivePath}`, releaseSha,
  ], { cwd: realRepository, homeDir });
  runExact(tarPre.realpath, ["-xpf", archivePath, "-C", outputRoot], {
    cwd: outputRoot, homeDir,
  });
  rmSync(archivePath, { force: false });
  const realOutput = realpathSync(outputRoot);
  const currentUid = process.getuid?.();
  const visit = (path) => {
    const stat = lstatSync(path);
    if (stat.uid !== currentUid) reject("immutable materialization entry owner is unsafe");
    if (stat.isSymbolicLink()) {
      const target = realpathSync(path);
      if (target !== realOutput && !target.startsWith(`${realOutput}/`)) reject("immutable materialization symlink escapes");
      return;
    }
    if (stat.isDirectory()) {
      for (const name of readdirSync(path)) visit(join(path, name));
      chmodSync(path, 0o500);
      return;
    }
    if (!stat.isFile() || stat.nlink !== 1) reject("immutable materialization entry type or hardlink is unsafe");
    chmodSync(path, (stat.mode & 0o111) === 0 ? 0o400 : 0o500);
  };
  visit(realOutput);
  const gitPost = snapshotExecutable(gitPath);
  const tarPost = snapshotExecutable(tarPath);
  if (JSON.stringify(gitPre) !== JSON.stringify(gitPost) || JSON.stringify(tarPre) !== JSON.stringify(tarPost)) {
    reject("trusted bootstrap tool identity drifted");
  }
  return Object.freeze({ release_sha: releaseSha, source_root: realOutput });
}

function stableReadMaterializedFile(sourceRoot, relativePath) {
  const absolutePath = resolve(sourceRoot, relativePath);
  if (relative(sourceRoot, absolutePath).startsWith("..") || absolutePath === sourceRoot) {
    reject("immutable module graph path escapes materialized source");
  }
  const before = lstatSync(absolutePath, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n) {
    reject("immutable module graph entry type is unsafe");
  }
  if (realpathSync(absolutePath) !== absolutePath) reject("immutable module graph path contains a symlink");
  const bytes = readFileSync(absolutePath);
  const after = lstatSync(absolutePath, { bigint: true });
  for (const field of ["dev", "ino", "size", "ctimeNs", "uid", "gid", "nlink"]) {
    if (before[field] !== after[field]) reject("immutable module graph entry drifted while reading");
  }
  return bytes;
}

function relativeModuleSpecifiers(source) {
  const specifiers = new Set();
  for (const pattern of [
    /(?:^|\n)\s*(?:import|export)\s+[\s\S]*?\sfrom\s+["']([^"']+)["']/gu,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu,
    /(?:^|\n)\s*import\s+["']([^"']+)["']/gu,
  ]) {
    for (const match of source.matchAll(pattern)) {
      if (match[1].startsWith("./") || match[1].startsWith("../")) specifiers.add(match[1]);
    }
  }
  return [...specifiers];
}

/** @param {any} options */
export function verifyImmutableCandidateModuleGraph({
  entryPaths, gitPath, homeDir, lockPaths = [], releaseSha, repositoryRoot, sourceRoot,
} = /** @type {any} */ ({})) {
  if (
    !/^[0-9a-f]{40}$/u.test(releaseSha ?? "")
    || !Array.isArray(entryPaths) || entryPaths.length === 0
    || !Array.isArray(lockPaths)
    || ![repositoryRoot, sourceRoot, homeDir].every(isAbsolute)
  ) reject("immutable module graph inputs are invalid");
  const realRepository = realpathSync(repositoryRoot);
  const realSource = realpathSync(sourceRoot);
  const pending = [...entryPaths, ...lockPaths];
  const seen = new Set();
  const entries = [];
  while (pending.length > 0) {
    const requestedPath = pending.pop();
    const normalizedPath = posix.normalize(requestedPath);
    if (
      requestedPath !== normalizedPath
      || normalizedPath.startsWith("../")
      || normalizedPath.startsWith("/")
      || normalizedPath.includes("\\")
    ) reject("immutable module graph path is invalid");
    if (seen.has(normalizedPath)) continue;
    seen.add(normalizedPath);
    const treeLine = String(runExact(gitPath, [
      "--no-replace-objects", "-C", realRepository, "ls-tree", releaseSha, "--", normalizedPath,
    ], { cwd: realRepository, homeDir })).trim();
    const match = /^(100644|100755) blob ([0-9a-f]{40})\t(.+)$/u.exec(treeLine);
    if (!match || match[3] !== normalizedPath) reject("immutable module graph Git blob authority is missing");
    const exactBytes = Buffer.from(runExact(gitPath, [
      "--no-replace-objects", "-C", realRepository, "cat-file", "blob", match[2],
    ], { cwd: realRepository, homeDir, binary: true }));
    const materializedBytes = stableReadMaterializedFile(realSource, normalizedPath);
    if (!materializedBytes.equals(exactBytes)) reject("immutable module graph bytes differ from exact Git blob authority");
    const sha256 = createHash("sha256").update(exactBytes).digest("hex");
    entries.push({ blob_oid: match[2], git_mode: match[1], path: normalizedPath, sha256 });
    if (normalizedPath.endsWith(".mjs")) {
      for (const specifier of relativeModuleSpecifiers(exactBytes.toString("utf8"))) {
        const dependencyPath = posix.normalize(posix.join(posix.dirname(normalizedPath), specifier));
        if (!/\.(?:mjs|json)$/u.test(dependencyPath)) {
          reject(`immutable module graph local import is not an approved module input path: ${specifier}`);
        }
        pending.push(dependencyPath);
      }
    }
  }
  entries.sort((left, right) => left.path.localeCompare(right.path));
  return Object.freeze({
    builder_input_digest: createHash("sha256").update(JSON.stringify(entries)).digest("hex"),
    entries: Object.freeze(entries),
  });
}

function argumentValue(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : null;
}

function makeBootstrapTreeWritable(path) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) return;
  if (stat.isDirectory()) {
    chmodSync(path, 0o700);
    for (const name of readdirSync(path)) makeBootstrapTreeWritable(join(path, name));
    return;
  }
  if (stat.isFile()) chmodSync(path, 0o600);
}

async function runBootstrap(argv) {
  const releaseSha = argumentValue(argv, "--release-sha");
  if (!/^[0-9a-f]{40}$/u.test(releaseSha ?? "")) reject("--release-sha must be exact lowercase 40-hex");
  const bootstrapPath = realpathSync(fileURLToPath(import.meta.url));
  const repositoryRoot = realpathSync(resolve(dirname(bootstrapPath), ".."));
  const homeDir = realpathSync(argumentValue(argv, "--home-dir") ?? process.env.HOME ?? "");
  const gitPath = realpathSync("/usr/bin/git");
  const tarPath = realpathSync("/usr/bin/tar");
  const bootstrapPre = snapshotExecutable(bootstrapPath);
  const nodePre = snapshotExecutable(process.execPath);
  const gitPre = snapshotExecutable(gitPath);
  runExact(gitPath, ["-C", repositoryRoot, "fetch", "--no-tags", "origin", "master"], {
    cwd: repositoryRoot, homeDir,
  });
  const remoteSha = String(runExact(gitPath, ["-C", repositoryRoot, "rev-parse", "origin/master"], {
    cwd: repositoryRoot, homeDir,
  })).trim();
  if (remoteSha !== releaseSha) reject("release SHA is not current fetched origin/master");
  const exactBootstrap = runExact(gitPath, [
    "--no-replace-objects", "-C", repositoryRoot, "show", `${releaseSha}:scripts/local-mac-production-rehearsal-candidate-bootstrap.mjs`,
  ], { cwd: repositoryRoot, homeDir, binary: true });
  if (!Buffer.from(exactBootstrap).equals(readFileSync(bootstrapPath))) reject("bootstrap bytes differ from exact Git authority");
  const privateRoot = mkdtempSync(join(tmpdir(), "homecook-candidate-bootstrap-"));
  chmodSync(privateRoot, 0o700);
  const sourceRoot = join(privateRoot, "source");
  try {
    materializeImmutableCandidateBootstrap({
      gitPath, tarPath, repositoryRoot, releaseSha, outputRoot: sourceRoot, homeDir,
    });
    const materializedBootstrap = readFileSync(join(sourceRoot, "scripts", "local-mac-production-rehearsal-candidate-bootstrap.mjs"));
    if (!materializedBootstrap.equals(readFileSync(bootstrapPath))) reject("materialized bootstrap bytes drifted");
    const builderGraph = verifyImmutableCandidateModuleGraph({
      entryPaths: [
        "scripts/local-mac-production-rehearsal-candidate-bootstrap.mjs",
        "scripts/local-mac-production-rehearsal.mjs",
      ],
      gitPath,
      homeDir,
      lockPaths: ["scripts/config/local-mac-production-rehearsal-toolchain-lock.json"],
      releaseSha,
      repositoryRoot,
      sourceRoot,
    });
    const cli = await import(pathToFileURL(join(sourceRoot, "scripts", "local-mac-production-rehearsal.mjs")).href);
    await cli.runLocalMacProductionRehearsalCli(["candidate", ...argv], {
      immutableBuilderInputDigest: builderGraph.builder_input_digest,
      immutableBuilderInputEntries: builderGraph.entries,
      immutableBootstrapVerified: true,
      repositoryRootResolver: () => repositoryRoot,
    });
    const builderGraphPost = verifyImmutableCandidateModuleGraph({
      entryPaths: [
        "scripts/local-mac-production-rehearsal-candidate-bootstrap.mjs",
        "scripts/local-mac-production-rehearsal.mjs",
      ],
      gitPath,
      homeDir,
      lockPaths: ["scripts/config/local-mac-production-rehearsal-toolchain-lock.json"],
      releaseSha,
      repositoryRoot,
      sourceRoot,
    });
    if (JSON.stringify(builderGraph) !== JSON.stringify(builderGraphPost)) {
      reject("immutable candidate module graph drifted during execution");
    }
    if (JSON.stringify(bootstrapPre) !== JSON.stringify(snapshotExecutable(bootstrapPath))) {
      reject("bootstrap identity drifted during candidate execution");
    }
    if (JSON.stringify(nodePre) !== JSON.stringify(snapshotExecutable(process.execPath))) {
      reject("bootstrap Node identity drifted during candidate execution");
    }
    if (JSON.stringify(gitPre) !== JSON.stringify(snapshotExecutable(gitPath))) {
      reject("bootstrap Git identity drifted during candidate execution");
    }
  } finally {
    makeBootstrapTreeWritable(privateRoot);
    rmSync(privateRoot, { recursive: true, force: false });
  }
}

const isMain = process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url;
if (isMain) {
  runBootstrap(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
