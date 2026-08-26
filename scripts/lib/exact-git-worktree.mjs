import { lstatSync, readFileSync, readlinkSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolveTrustedGitExecutable } from "./trusted-production-release-tools.mjs";

function git(gitPath, rootDir, args, options = {}) {
  const result = spawnSync(gitPath, ["-C", rootDir, ...args], options);
  if (result.status !== 0) throw new Error("Git plumbing verification failed.");
  return result.stdout;
}

export function verifyExactTrackedWorktree(
  rootDir,
  head,
  { gitPath = resolveTrustedGitExecutable() } = {},
) {
  const tree = String(git(gitPath, rootDir, ["rev-parse", `${head}^{tree}`], { encoding: "utf8" })).trim();
  const objectFormat = String(git(gitPath, rootDir, ["rev-parse", "--show-object-format"], {
    encoding: "utf8",
  })).trim();
  if (!["sha1", "sha256"].includes(objectFormat)) {
    throw new Error("Git object format is unsupported.");
  }
  const listing = git(gitPath, rootDir, ["ls-tree", "-rz", "--full-tree", head]);
  const blobs = {};
  for (const record of listing.toString("utf8").split("\0").filter(Boolean)) {
    const match = record.match(/^([0-9]{6}) (blob|commit) ([0-9a-f]+)\t([\s\S]+)$/u);
    if (!match) throw new Error("HEAD tree entry is invalid.");
    const [, mode, type, objectId, path] = match;
    if (type === "commit") continue;
    const absolutePath = resolve(rootDir, path);
    const stat = lstatSync(absolutePath);
    let bytes;
    let actualMode;
    if (mode === "120000") {
      if (!stat.isSymbolicLink()) throw new Error("Tracked symlink type mismatch.");
      bytes = Buffer.from(readlinkSync(absolutePath));
      actualMode = "120000";
    } else {
      if (!stat.isFile()) throw new Error("Tracked file type mismatch.");
      bytes = readFileSync(absolutePath);
      actualMode = (stat.mode & 0o111) === 0 ? "100644" : "100755";
    }
    const actualObjectId = createHash(objectFormat)
      .update(`blob ${bytes.length}\0`)
      .update(bytes)
      .digest("hex");
    if (actualMode !== mode || actualObjectId !== objectId) {
      throw new Error("Tracked worktree bytes or mode differ from HEAD.");
    }
    blobs[path] = objectId;
  }
  return { blobs, tree };
}
