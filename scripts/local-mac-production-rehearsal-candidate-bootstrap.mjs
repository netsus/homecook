#!/usr/bin/env node

import { createHash } from "node:crypto";
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
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
    const cli = await import(pathToFileURL(join(sourceRoot, "scripts", "local-mac-production-rehearsal.mjs")).href);
    await cli.runLocalMacProductionRehearsalCli(["candidate", ...argv], {
      immutableBootstrapVerified: true,
      repositoryRootResolver: () => repositoryRoot,
    });
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
