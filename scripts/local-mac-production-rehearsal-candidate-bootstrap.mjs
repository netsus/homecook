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
  const currentUid = process.getuid?.();
  const mode = Number(before.mode & 0o7777n);
  if (before.uid !== BigInt(currentUid) || ![0o400, 0o500].includes(mode)) {
    reject("immutable module graph entry owner or private read-only mode is unsafe");
  }
  if (realpathSync(absolutePath) !== absolutePath) reject("immutable module graph path contains a symlink");
  const bytes = readFileSync(absolutePath);
  const after = lstatSync(absolutePath, { bigint: true });
  for (const field of ["dev", "ino", "size", "ctimeNs", "uid", "gid", "nlink"]) {
    if (before[field] !== after[field]) reject("immutable module graph entry drifted while reading");
  }
  return {
    bytes,
    identity: {
      ctime: String(before.ctimeNs),
      device: String(before.dev),
      gid: String(before.gid),
      inode: String(before.ino),
      mode,
      nlink: String(before.nlink),
      path: relativePath,
      size: String(before.size),
      uid: String(before.uid),
    },
  };
}

function lexModuleSource(source) {
  const tokens = [];
  let index = 0;
  let lineBreakBefore = false;
  const push = (type, value) => {
    tokens.push({ line_break_before: lineBreakBefore, type, value });
    lineBreakBefore = false;
  };
  const regexAllowed = () => {
    const previous = tokens.at(-1);
    if (!previous) return true;
    if (previous.type === "punct") return "([{:;,=!?&|+-*%^~<>".includes(previous.value);
    return previous.type === "id" && [
      "await", "case", "delete", "do", "else", "in", "instanceof", "of",
      "return", "throw", "typeof", "void", "yield",
    ].includes(previous.value);
  };
  const skipQuoted = (quote, { emit = true } = {}) => {
    const start = index;
    index += 1;
    while (index < source.length) {
      const character = source[index];
      if (character === "\\") {
        index += 2;
        continue;
      }
      if (character === quote) {
        index += 1;
        if (emit) push("string", source.slice(start, index));
        return;
      }
      if (character === "\n" || character === "\r") reject("immutable module graph contains an unterminated string literal");
      index += 1;
    }
    reject("immutable module graph contains an unterminated string literal");
  };
  const scanCode = (endAtTemplateBrace = false) => {
    let braceDepth = 0;
    while (index < source.length) {
      const character = source[index];
      if (/\s/u.test(character)) {
        if (character === "\n" || character === "\r") lineBreakBefore = true;
        index += 1;
        continue;
      }
      if (source.startsWith("//", index)) {
        index += 2;
        while (index < source.length && !["\n", "\r"].includes(source[index])) index += 1;
        lineBreakBefore = true;
        continue;
      }
      if (source.startsWith("/*", index)) {
        const end = source.indexOf("*/", index + 2);
        if (end < 0) reject("immutable module graph contains an unterminated block comment");
        if (/[\r\n]/u.test(source.slice(index, end + 2))) lineBreakBefore = true;
        index = end + 2;
        continue;
      }
      if (character === '"' || character === "'") {
        skipQuoted(character);
        continue;
      }
      if (character === "`") {
        index += 1;
        while (index < source.length) {
          if (source[index] === "\\") {
            index += 2;
            continue;
          }
          if (source[index] === "`") {
            index += 1;
            break;
          }
          if (source.startsWith("${", index)) {
            index += 2;
            scanCode(true);
            continue;
          }
          index += 1;
        }
        if (source[index - 1] !== "`") reject("immutable module graph contains an unterminated template literal");
        push("template", "template");
        continue;
      }
      if (character === "/" && regexAllowed()) {
        index += 1;
        let inClass = false;
        let closed = false;
        while (index < source.length) {
          if (source[index] === "\\") {
            index += 2;
            continue;
          }
          if (source[index] === "[") inClass = true;
          else if (source[index] === "]") inClass = false;
          else if (source[index] === "/" && !inClass) {
            index += 1;
            while (/[A-Za-z]/u.test(source[index] ?? "")) index += 1;
            closed = true;
            break;
          }
          if (["\n", "\r"].includes(source[index])) break;
          index += 1;
        }
        if (!closed) reject("immutable module graph contains an unterminated regular expression literal");
        push("regex", "regex");
        continue;
      }
      if (/[A-Za-z_$]/u.test(character)) {
        const start = index;
        index += 1;
        while (/[A-Za-z0-9_$]/u.test(source[index] ?? "")) index += 1;
        push("id", source.slice(start, index));
        continue;
      }
      if (/[0-9]/u.test(character)) {
        const start = index;
        index += 1;
        while (/[A-Za-z0-9_.]/u.test(source[index] ?? "")) index += 1;
        push("number", source.slice(start, index));
        continue;
      }
      if (endAtTemplateBrace && character === "}" && braceDepth === 0) {
        index += 1;
        return;
      }
      if (character === "{") braceDepth += 1;
      if (character === "}" && braceDepth > 0) braceDepth -= 1;
      push("punct", character);
      index += 1;
    }
    if (endAtTemplateBrace) reject("immutable module graph template expression is unterminated");
  };
  scanCode();
  return tokens;
}

function decodeModuleSpecifier(token) {
  if (token?.type !== "string" || token.value.length < 2) reject("immutable module graph import specifier must be literal");
  const quote = token.value[0];
  const value = token.value.slice(1, -1);
  if (token.value.at(-1) !== quote || value.includes("\\") || /[\u0000-\u001f\u007f]/u.test(value)) {
    reject("immutable module graph import specifier literal is not canonical");
  }
  return value;
}

function consumeJsonAttributes(tokens, start, { dynamic }) {
  const expected = dynamic
    ? [",", "{", "with", ":", "{", "type", ":", '"json"', "}", "}", ")"]
    : ["with", "{", "type", ":", '"json"', "}"];
  for (const [offset, value] of expected.entries()) {
    if (tokens[start + offset]?.value !== value) {
      reject(`immutable module graph JSON import attribute is not exact at token ${offset}`);
    }
  }
  return start + expected.length;
}

function collectModuleSpecifiers(source, modulePath) {
  const tokens = lexModuleSource(source);
  const specifiers = [];
  const record = (specifier, { jsonAttributes }) => {
    if (!specifier.startsWith("./") && !specifier.startsWith("../")) return;
    if (specifier.endsWith(".json") && !jsonAttributes) reject("immutable module graph relative JSON import lacks exact attributes");
    if (!specifier.endsWith(".json") && jsonAttributes) reject("immutable module graph attributes are allowed only for relative JSON imports");
    specifiers.push(specifier);
  };
  for (let cursor = 0; cursor < tokens.length; cursor += 1) {
    const token = tokens[cursor];
    if (token.type !== "id" || !["import", "export"].includes(token.value)) continue;
    if (token.value === "import" && tokens[cursor + 1]?.value === ".") continue;
    if (token.value === "import" && tokens[cursor + 1]?.value === "(") {
      if (tokens[cursor + 2]?.type !== "string") {
        reject(`immutable module graph dynamic import specifier is non-literal in ${modulePath}`);
      }
      const specifier = decodeModuleSpecifier(tokens[cursor + 2]);
      let next = cursor + 3;
      let jsonAttributes = false;
      if (tokens[next]?.value === ",") {
        next = consumeJsonAttributes(tokens, next, { dynamic: true });
        jsonAttributes = true;
      } else if (tokens[next]?.value === ")") next += 1;
      else reject("immutable module graph dynamic import syntax is unsupported");
      record(specifier, { jsonAttributes });
      cursor = next - 1;
      continue;
    }
    if (token.value === "import" && tokens[cursor + 1]?.type === "string") {
      const specifier = decodeModuleSpecifier(tokens[cursor + 1]);
      let next = cursor + 2;
      let jsonAttributes = false;
      if (tokens[next]?.value === "with") {
        next = consumeJsonAttributes(tokens, next, { dynamic: false });
        jsonAttributes = true;
      }
      record(specifier, { jsonAttributes });
      cursor = next - 1;
      continue;
    }
    if (token.value === "export" && ["const", "default", "function", "class", "let", "var", "async"].includes(tokens[cursor + 1]?.value)) {
      continue;
    }
    let from = cursor + 1;
    if (token.value === "export" && tokens[from]?.value === "{") {
      let depth = 0;
      let closing = from;
      for (; closing < tokens.length; closing += 1) {
        if (tokens[closing].value === "{") depth += 1;
        if (tokens[closing].value === "}") depth -= 1;
        if (depth === 0) break;
      }
      if (depth !== 0) reject(`immutable module graph export list is unterminated in ${modulePath}`);
      if (tokens[closing + 1]?.value !== "from") {
        cursor = closing;
        continue;
      }
      from = closing + 1;
    }
    while (from < tokens.length && tokens[from].value !== "from") {
      if (tokens[from].value === ";" || (tokens[from].type === "id" && ["import", "export"].includes(tokens[from].value))) {
        reject(`immutable module graph static import/export syntax is unsupported in ${modulePath}`);
      }
      from += 1;
    }
    if (from >= tokens.length) {
      if (token.value === "export") continue;
      reject(`immutable module graph static import is missing from in ${modulePath}`);
    }
    const specifier = decodeModuleSpecifier(tokens[from + 1]);
    let next = from + 2;
    let jsonAttributes = false;
    if (tokens[next]?.value === "with") {
      next = consumeJsonAttributes(tokens, next, { dynamic: false });
      jsonAttributes = true;
    }
    record(specifier, { jsonAttributes });
    cursor = next - 1;
  }
  return [...new Set(specifiers)];
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
  const leafPaths = new Set(lockPaths);
  const pending = [...entryPaths, ...lockPaths];
  const seen = new Set();
  const entries = [];
  const localIdentities = [];
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
    const materialized = stableReadMaterializedFile(realSource, normalizedPath);
    const materializedBytes = materialized.bytes;
    if (!materializedBytes.equals(exactBytes)) reject("immutable module graph bytes differ from exact Git blob authority");
    const sha256 = createHash("sha256").update(exactBytes).digest("hex");
    entries.push({ blob_oid: match[2], git_mode: match[1], path: normalizedPath, sha256 });
    localIdentities.push(materialized.identity);
    if (normalizedPath.endsWith(".mjs") && !leafPaths.has(normalizedPath)) {
      let source;
      try {
        source = new TextDecoder("utf-8", { fatal: true }).decode(exactBytes);
      } catch {
        reject("immutable module graph JavaScript is not fatal UTF-8");
      }
      for (const specifier of collectModuleSpecifiers(source, normalizedPath)) {
        const dependencyPath = posix.normalize(posix.join(posix.dirname(normalizedPath), specifier));
        if (!/\.(?:mjs|json)$/u.test(dependencyPath)) {
          reject(`immutable module graph local import is not an approved module input path: ${specifier}`);
        }
        pending.push(dependencyPath);
      }
    }
  }
  entries.sort((left, right) => left.path.localeCompare(right.path));
  localIdentities.sort((left, right) => left.path.localeCompare(right.path));
  return Object.freeze({
    builder_input_digest: createHash("sha256").update(JSON.stringify(entries)).digest("hex"),
    entries: Object.freeze(entries),
    local_identities: Object.freeze(localIdentities),
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

export async function runBootstrap(argv) {
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
        "scripts/local-mac-production-rehearsal.mjs",
      ],
      gitPath,
      homeDir,
      lockPaths: [
        "scripts/local-mac-production-rehearsal-candidate-bootstrap.mjs",
        "scripts/config/local-mac-production-rehearsal-toolchain-lock.json",
      ],
      releaseSha,
      repositoryRoot,
      sourceRoot,
    });
    const cli = await import(pathToFileURL(join(sourceRoot, "scripts", "local-mac-production-rehearsal.mjs")).href);
    let finalizationComplete = false;
    const beforeCandidateComplete = ({ builder_input_digest: candidateBuilderInputDigest } = {}) => {
      if (finalizationComplete) reject("immutable candidate finalization guard ran more than once");
      const builderGraphPost = verifyImmutableCandidateModuleGraph({
        entryPaths: [
          "scripts/local-mac-production-rehearsal.mjs",
        ],
        gitPath,
        homeDir,
        lockPaths: [
          "scripts/local-mac-production-rehearsal-candidate-bootstrap.mjs",
          "scripts/config/local-mac-production-rehearsal-toolchain-lock.json",
        ],
        releaseSha,
        repositoryRoot,
        sourceRoot,
      });
      if (
        JSON.stringify(builderGraph) !== JSON.stringify(builderGraphPost)
        || candidateBuilderInputDigest !== builderGraphPost.builder_input_digest
      ) reject("immutable candidate module graph drifted before completion");
      if (JSON.stringify(bootstrapPre) !== JSON.stringify(snapshotExecutable(bootstrapPath))) {
        reject("bootstrap identity drifted during candidate execution");
      }
      if (JSON.stringify(nodePre) !== JSON.stringify(snapshotExecutable(process.execPath))) {
        reject("bootstrap Node identity drifted during candidate execution");
      }
      if (JSON.stringify(gitPre) !== JSON.stringify(snapshotExecutable(gitPath))) {
        reject("bootstrap Git identity drifted during candidate execution");
      }
      finalizationComplete = true;
      return Object.freeze({
        builder_input_digest: builderGraphPost.builder_input_digest,
        verified: true,
      });
    };
    await cli.runLocalMacProductionRehearsalCli(["candidate", ...argv], {
      beforeCandidateComplete,
      immutableBuilderInputDigest: builderGraph.builder_input_digest,
      immutableBuilderInputEntries: builderGraph.entries,
      immutableBootstrapVerified: true,
      repositoryRootResolver: () => repositoryRoot,
    });
    if (!finalizationComplete) reject("candidate returned without immutable finalization");
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
