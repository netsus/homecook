#!/usr/bin/env node

import { isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  accessSync,
  constants,
  lstatSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  statSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const AUTHORITATIVE_EXECUTE_COMMAND =
  'C2_NODE="/absolute/verified/node"; C2_HEAD="$(/usr/bin/git rev-parse HEAD)"; /usr/bin/git show "$C2_HEAD":scripts/bootstrap-production-release-rulesets.mjs | /usr/bin/env -u NODE_OPTIONS "$C2_NODE" --input-type=module - --source-repo "$(/usr/bin/git rev-parse --show-toplevel)" --expected-head "$C2_HEAD" apply --execute --confirm APPLY_PRODUCTION_RELEASE_GITHUB_CONTROLS --repo netsus/homecook --snapshot-dir <absolute-create-only-path> --app-id 4724458 --app-private-key-file <absolute-path> --json';
const IMMUTABLE_EXECUTION_PATHS = [
  "scripts/bootstrap-production-release-rulesets.mjs",
  "scripts/manage-production-release-rulesets.mjs",
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

function printHelp() {
  process.stdout.write(`Usage:
  node scripts/manage-production-release-rulesets.mjs plan [--root-dir <path>] [--json]
  node scripts/manage-production-release-rulesets.mjs verify [--root-dir <path>] [--actual-dir <path>] [--json]
  node scripts/manage-production-release-rulesets.mjs apply [--root-dir <path>] [--json]
  ${AUTHORITATIVE_EXECUTE_COMMAND}

Safety contract:
- plan / verify are read-only local desired-state validation
- apply defaults to dry-run
- direct worktree apply --execute is refused before any local implementation import
- authoritative apply --execute runs only from the immutable HEAD bootstrap
`);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {
    actualDir: null,
    appId: null,
    appPrivateKeyFile: null,
    command,
    confirm: null,
    execute: false,
    json: false,
    repo: null,
    rootDir: process.cwd(),
    snapshotDir: null,
  };

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === "--") {
      continue;
    }
    if (token === "--json") {
      options.json = true;
      continue;
    }
    if (token === "--execute") {
      options.execute = true;
      continue;
    }

    const value = rest[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${token} requires a value.`);
    }

    if (token === "--root-dir") {
      options.rootDir = value;
    } else if (token === "--actual-dir") {
      options.actualDir = value;
    } else if (token === "--app-id") {
      options.appId = value;
    } else if (token === "--app-private-key-file") {
      options.appPrivateKeyFile = value;
    } else if (token === "--confirm") {
      options.confirm = value;
    } else if (token === "--repo") {
      options.repo = value;
    } else if (token === "--snapshot-dir") {
      options.snapshotDir = value;
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
    index += 1;
  }

  return options;
}

function verifyEntryTrustedExecutable(candidate, allowedRealpaths, label) {
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

function getImmutableExecutionContext(gitPath) {
  const codeRoot = process.env.HOMECOOK_C2_IMMUTABLE_CODE_ROOT;
  const sourceRepoRoot = process.env.HOMECOOK_C2_SOURCE_REPO_ROOT;
  const expectedHead = process.env.HOMECOOK_C2_IMMUTABLE_HEAD;
  if (!codeRoot || !sourceRepoRoot || !expectedHead) return null;
  const resolvedCodeRoot = realpathSync(resolve(codeRoot));
  const resolvedSourceRepoRoot = realpathSync(resolve(sourceRepoRoot));
  if (
    resolvedCodeRoot === resolvedSourceRepoRoot
    || realpathSync(fileURLToPath(import.meta.url))
      !== resolve(resolvedCodeRoot, "scripts/manage-production-release-rulesets.mjs")
    || !/^[0-9a-f]{40,64}$/u.test(expectedHead)
  ) {
    return null;
  }
  const context = {
    codeRoot: resolvedCodeRoot,
    expectedHead,
    sourceRepoRoot: resolvedSourceRepoRoot,
  };
  const rootStat = lstatSync(resolvedCodeRoot);
  if (
    !rootStat.isDirectory()
    || (rootStat.mode & 0o077) !== 0
    || (typeof process.getuid === "function" && rootStat.uid !== process.getuid())
  ) {
    return null;
  }
  const expressions = [
    "HEAD",
    ...IMMUTABLE_EXECUTION_PATHS.map((path) => `${expectedHead}:${path}`),
  ];
  const gitResult = spawnSync(
    gitPath,
    ["-C", resolvedSourceRepoRoot, "rev-parse", ...expressions],
    { encoding: "utf8" },
  );
  const objectIds = gitResult.stdout?.trim().split("\n") ?? [];
  const formatResult = spawnSync(
    gitPath,
    ["-C", resolvedSourceRepoRoot, "rev-parse", "--show-object-format"],
    { encoding: "utf8" },
  );
  const objectFormat = formatResult.stdout?.trim();
  const listingResult = spawnSync(
    gitPath,
    [
      "-C",
      resolvedSourceRepoRoot,
      "ls-tree",
      "-rz",
      "--full-tree",
      expectedHead,
      "--",
      ...IMMUTABLE_EXECUTION_PATHS,
    ],
  );
  const entries = new Map();
  for (const record of listingResult.stdout?.toString("utf8").split("\0").filter(Boolean) ?? []) {
    const match = record.match(/^([0-9]{6}) blob ([0-9a-f]+)\t([\s\S]+)$/u);
    if (!match) return null;
    entries.set(match[3], { mode: match[1], objectId: match[2] });
  }
  if (
    gitResult.status !== 0
    || formatResult.status !== 0
    || listingResult.status !== 0
    || objectIds.length !== expressions.length
    || objectIds[0] !== expectedHead
    || entries.size !== IMMUTABLE_EXECUTION_PATHS.length
    || !["sha1", "sha256"].includes(objectFormat)
  ) {
    return null;
  }
  for (const [index, path] of IMMUTABLE_EXECUTION_PATHS.entries()) {
    const absolutePath = resolve(resolvedCodeRoot, path);
    if (!absolutePath.startsWith(`${resolvedCodeRoot}${sep}`)) return null;
    const stat = lstatSync(absolutePath);
    let bytes;
    let mode;
    if (stat.isSymbolicLink()) {
      bytes = Buffer.from(readlinkSync(absolutePath));
      mode = "120000";
    } else if (stat.isFile()) {
      bytes = readFileSync(absolutePath);
      mode = (stat.mode & 0o111) === 0 ? "100644" : "100755";
    } else {
      return null;
    }
    const expectedEntry = entries.get(path);
    if (
      expectedEntry?.mode !== mode
      || expectedEntry?.objectId !== objectIds[index + 1]
    ) {
      return null;
    }
    const actualObjectId = createHash(objectFormat)
      .update(`blob ${bytes.length}\0`)
      .update(bytes)
      .digest("hex");
    if (actualObjectId !== objectIds[index + 1]) return null;
  }
  return context;
}

function printResult(result, json) {
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  process.stdout.write(`mode: ${result.mode}\n`);
  process.stdout.write(`dry_run: ${result.dry_run ? "true" : "false"}\n`);
  process.stdout.write(`activation_blocked: ${result.activation_blocked ? "true" : "false"}\n`);
  process.stdout.write(`actual_state: ${result.actual_state}\n`);
  for (const ruleset of result.rulesets) {
    process.stdout.write(`- ${ruleset.name}: ${ruleset.pattern}\n`);
  }
}

let ProductionReleaseApplyError = null;
try {
  const options = parseArgs(process.argv.slice(2));
  if (!options.command || options.command === "help" || options.command === "--help") {
    printHelp();
    process.exit(0);
  }

  if (!["plan", "verify", "apply"].includes(options.command)) {
    throw new Error(`Unknown command: ${options.command}`);
  }

  let immutableContext = null;
  if (options.command === "apply" && options.execute) {
    try {
      const gitPath = verifyEntryTrustedExecutable(
        "/usr/bin/git",
        ["/usr/bin/git"],
        "Git",
      );
      const nodeRealpath = realpathSync(process.execPath);
      verifyEntryTrustedExecutable(process.execPath, [nodeRealpath], "Node.js");
      immutableContext = getImmutableExecutionContext(gitPath);
    } catch {
      immutableContext = null;
    }
  }
  if (options.command === "apply" && options.execute && !immutableContext) {
    throw new Error(
      `Authoritative immutable C2 execution is required. Run:\n${AUTHORITATIVE_EXECUTE_COMMAND}`,
    );
  }

  const rulesetModule = await import("./lib/production-release-rulesets.mjs");
  const applyModule = await import("./lib/production-release-rulesets-apply.mjs");
  const trustedToolsModule = await import("./lib/trusted-production-release-tools.mjs");
  ProductionReleaseApplyError = applyModule.ProductionReleaseApplyError;

  if (options.command === "apply" && options.execute) {
    const toolPaths = trustedToolsModule.resolveTrustedProductionReleaseToolPaths();
    const result = await applyModule.executeProductionReleaseControls({
      appId: options.appId,
      confirmation: options.confirm,
      expectedSourceHead: immutableContext.expectedHead,
      gitRootDir: immutableContext.sourceRepoRoot,
      privateKeyFile: options.appPrivateKeyFile,
      repository: options.repo,
      rootDir: immutableContext.codeRoot,
      snapshotDir: options.snapshotDir,
      toolPaths,
    });
    printResult(result, options.json);
    process.exit(0);
  }

  const plan = rulesetModule.getProductionReleaseRulesetPlan({
    actualDir: options.actualDir,
    rootDir: options.rootDir,
  });
  printResult({
    dry_run: options.command === "apply",
    mode: options.command,
    ...plan,
  }, options.json);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (
    ProductionReleaseApplyError
    && error instanceof ProductionReleaseApplyError
    && process.argv.includes("--json")
  ) {
    process.stderr.write(`${JSON.stringify({
      error: message,
      manual_action_required: error.manualActionRequired,
      partial_state: error.partialState,
      private_key: { supplied: process.argv.includes("--app-private-key-file") },
    }, null, 2)}\n`);
  } else {
    process.stderr.write(`${message}\n`);
  }
  process.exit(1);
}
