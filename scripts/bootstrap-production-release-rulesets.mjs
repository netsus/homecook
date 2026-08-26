#!/usr/bin/env node

import {
  accessSync,
  chmodSync,
  constants,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { isAbsolute, join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

let GIT = null;
let NODE = null;
let TAR = null;
const ENTRY_PATH = "scripts/manage-production-release-rulesets.mjs";
const ARCHIVE_PATHS = [
  ENTRY_PATH,
  "scripts/bootstrap-production-release-rulesets.mjs",
  "scripts/lib/exact-git-worktree.mjs",
  "scripts/lib/github-app-identity.mjs",
  "scripts/lib/production-release-approval-policy.mjs",
  "scripts/lib/production-release-ruleset-patterns.mjs",
  "scripts/lib/production-release-rulesets-apply.mjs",
  "scripts/lib/production-release-rulesets.mjs",
  "scripts/lib/trusted-production-release-tools.mjs",
  ".github/rulesets/production-release-master.json",
  ".github/rulesets/production-release-tag-creation.json",
  ".github/rulesets/production-release-tag-immutability.json",
  ".github/rulesets/production-release-approval-environment.json",
  ".github/workflows/production-release-attestation.yml",
];

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

function verifyTrustedExecutable(candidate, allowedRealpaths, label) {
  if (!isAbsolute(candidate)) throw new Error(`${label} path must be absolute.`);
  const realpath = realpathSync(candidate);
  const stat = statSync(realpath);
  accessSync(realpath, constants.X_OK);
  if (
    !stat.isFile()
    || (stat.mode & 0o111) === 0
    || (stat.mode & 0o022) !== 0
    || !allowedRealpaths.includes(realpath)
  ) {
    throw new Error(`${label} executable failed trusted realpath or safe mode verification.`);
  }
  return realpath;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error("Immutable C2 bootstrap plumbing failed closed.");
  }
  return result.stdout?.trim() ?? "";
}

function parseBootstrapArgs(argv) {
  let expectedHead = null;
  const forwarded = [];
  let sourceRepo = null;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--") continue;
    if (token === "--source-repo") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--source-repo requires an absolute path.");
      }
      sourceRepo = value;
      index += 1;
      continue;
    }
    if (token === "--expected-head") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--expected-head requires an exact Git object ID.");
      }
      expectedHead = value;
      index += 1;
      continue;
    }
    if (token === "--root-dir") {
      throw new Error("--root-dir is internal to immutable C2 execution.");
    }
    forwarded.push(token);
  }
  if (!sourceRepo || !isAbsolute(sourceRepo)) {
    throw new Error("--source-repo must be the absolute canonical Git checkout root.");
  }
  if (!/^[0-9a-f]{40,64}$/u.test(expectedHead ?? "")) {
    throw new Error("--expected-head must be an exact Git object ID.");
  }
  if (forwarded[0] !== "apply" || !forwarded.includes("--execute")) {
    throw new Error("The immutable bootstrap accepts only apply --execute.");
  }
  return {
    expectedHead,
    forwarded,
    sourceRepo: realpathSync(resolve(sourceRepo)),
  };
}

function verifyExtractedArchive(sourceRepo, codeRoot, head) {
  const objectFormat = run(GIT, ["-C", sourceRepo, "rev-parse", "--show-object-format"]);
  if (!["sha1", "sha256"].includes(objectFormat)) {
    throw new Error("Unsupported Git object format.");
  }
  const listing = spawnSync(
    GIT,
    ["-C", sourceRepo, "ls-tree", "-rz", "--full-tree", head, "--", ...ARCHIVE_PATHS],
  );
  if (listing.status !== 0) throw new Error("Unable to enumerate immutable C2 inputs.");
  const seen = [];
  for (const record of listing.stdout.toString("utf8").split("\0").filter(Boolean)) {
    const match = record.match(/^([0-9]{6}) blob ([0-9a-f]+)\t([\s\S]+)$/u);
    if (!match) throw new Error("Immutable C2 archive contains an unsupported tree entry.");
    const [, mode, objectId, path] = match;
    if (!ARCHIVE_PATHS.includes(path)) throw new Error("Immutable C2 archive path mismatch.");
    const absolutePath = resolve(codeRoot, path);
    if (!absolutePath.startsWith(`${resolve(codeRoot)}${sep}`)) {
      throw new Error("Immutable C2 archive path escaped its private root.");
    }
    const stat = lstatSync(absolutePath);
    let bytes;
    let actualMode;
    if (mode === "120000") {
      if (!stat.isSymbolicLink()) throw new Error("Immutable C2 symlink mode mismatch.");
      bytes = Buffer.from(readlinkSync(absolutePath));
      actualMode = "120000";
    } else {
      if (!stat.isFile()) throw new Error("Immutable C2 file mode mismatch.");
      bytes = readFileSync(absolutePath);
      actualMode = (stat.mode & 0o111) === 0 ? "100644" : "100755";
    }
    const actualObjectId = createHash(objectFormat)
      .update(`blob ${bytes.length}\0`)
      .update(bytes)
      .digest("hex");
    if (actualMode !== mode || actualObjectId !== objectId) {
      throw new Error("Immutable C2 archive bytes differ from HEAD.");
    }
    seen.push(path);
  }
  if (
    seen.length !== ARCHIVE_PATHS.length
    || ARCHIVE_PATHS.some((path) => !seen.includes(path))
  ) {
    throw new Error("Immutable C2 archive is incomplete.");
  }
}

let codeRoot = null;
try {
  GIT = verifyTrustedExecutable("/usr/bin/git", ["/usr/bin/git"], "Git");
  TAR = verifyTrustedExecutable(
    "/usr/bin/tar",
    ["/usr/bin/tar", "/usr/bin/bsdtar"],
    "tar",
  );
  const nodeRealpath = realpathSync(process.execPath);
  NODE = verifyTrustedExecutable(process.execPath, [nodeRealpath], "Node.js");
  const { expectedHead, forwarded, sourceRepo } = parseBootstrapArgs(process.argv.slice(2));
  const topLevel = realpathSync(
    resolve(run(GIT, ["-C", sourceRepo, "rev-parse", "--show-toplevel"])),
  );
  if (topLevel !== sourceRepo) {
    throw new Error("--source-repo must be the exact Git checkout root.");
  }
  const head = run(GIT, ["-C", sourceRepo, "rev-parse", "HEAD"]);
  if (!/^[0-9a-f]{40,64}$/u.test(head)) throw new Error("HEAD object ID is invalid.");
  if (head !== expectedHead) {
    throw new Error("Source repository HEAD changed before immutable materialization.");
  }

  codeRoot = mkdtempSync(join(tmpdir(), "homecook-c2-immutable-"));
  chmodSync(codeRoot, 0o700);
  const archivePath = join(codeRoot, "source.tar");
  run(GIT, [
    "-C",
    sourceRepo,
    "archive",
    "--format=tar",
    `--output=${archivePath}`,
    head,
    "--",
    ...ARCHIVE_PATHS,
  ]);
  run(TAR, ["-xf", archivePath, "-C", codeRoot]);
  unlinkSync(archivePath);
  verifyExtractedArchive(sourceRepo, codeRoot, head);

  const child = spawnSync(
    NODE,
    [resolve(codeRoot, ENTRY_PATH), ...forwarded],
    {
      env: {
        ...process.env,
        HOMECOOK_C2_IMMUTABLE_CODE_ROOT: codeRoot,
        HOMECOOK_C2_IMMUTABLE_HEAD: head,
        HOMECOOK_C2_SOURCE_REPO_ROOT: sourceRepo,
      },
      stdio: "inherit",
    },
  );
  process.exitCode = child.status ?? 1;
} catch (error) {
  fail(error instanceof Error ? error.message : "Immutable C2 bootstrap failed closed.");
} finally {
  if (codeRoot) rmSync(codeRoot, { force: true, recursive: true });
}
