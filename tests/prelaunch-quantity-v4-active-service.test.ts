import { createHash } from "node:crypto";
import { chmodSync, closeSync, constants, existsSync, fstatSync, linkSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readSync, realpathSync, renameSync, rmSync, statfsSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { describe, expect, it, vi } from "vitest";

function installedPlistFixture() {
  const home = mkdtempSync(join(realpathSync("/tmp"), "c04-installed-plist-")); chmodSync(home, 0o700);
  const parent = join(home, "Library/LaunchAgents"), path = join(parent, "com.homecook.youtube-extraction-worker.plist");
  mkdirSync(parent, { recursive: true, mode: 0o755 }); chmodSync(parent, 0o755);
  writeFileSync(path, "owned plist bytes\n", { mode: 0o600 });
  const source = readFileSync("scripts/deploy-prelaunch-web.mjs", "utf8"), start = source.indexOf("function readQuantityV4InstalledWorkerPlist(");
  const bindings = { homedir: () => home, join, dirname, realpathSync, lstatSync, fstatSync, constants, openSync, closeSync, readSync, readFileSync, DeploymentError: Error };
  let read: () => Buffer;
  if (start >= 0) {
    const end = source.indexOf("async function verifyQuantityV4ActiveWorkerService(", start);
    if (end <= start) throw new Error("Exact installed plist reader boundary missing");
    read = new Function(...Object.keys(bindings), source.slice(start, end) + ";return readQuantityV4InstalledWorkerPlist;")(...Object.values(bindings));
  } else {
    // V2 RED uses precisely the current private reader; no bound authority module is imported.
    const web = readFileSync("scripts/lib/prelaunch-web-deploy.mjs", "utf8"), privateStart = web.indexOf("function closedR2PrivateDirectory("), privateEnd = web.indexOf("export function loadClosedR2Review(", privateStart);
    if (privateStart < 0 || privateEnd <= privateStart) throw new Error("Exact private reader source missing");
    const privateBindings = { ...bindings, isAbsolute, resolve, relative, sep, existsSync, statfsSync, readSync,
      closedR2Require: (condition: boolean, message: string) => { if (!condition) throw new Error(message); } };
    const privateRead = new Function(...Object.keys(privateBindings), web.slice(privateStart, privateEnd).replaceAll("export function", "function") + ";return readClosedR2PrivateBytes;")(...Object.values(privateBindings));
    read = () => privateRead(path, process.cwd());
  }
  return { read, home, parent, path, cleanup: () => rmSync(home, { recursive: true, force: true }) };
}

describe("fixed macOS worker plist file boundary", () => {
  it("reads owner/canonical parent0755 and file0600 without changing either permission", () => {
    const f = installedPlistFixture();
    try {
      expect(f.read().toString()).toBe("owned plist bytes\n");
      expect(lstatSync(f.parent).mode & 0o777).toBe(0o755); expect(lstatSync(f.path).mode & 0o777).toBe(0o600);
    } finally { f.cleanup(); }
  });
  it.each(["parent-group-write", "parent-world-write", "parent-symlink", "file-symlink", "file-permissions", "hardlink"])("denies %s in the owned filesystem fixture", kind => {
    const f = installedPlistFixture();
    try {
      if (kind === "parent-group-write") chmodSync(f.parent, 0o775);
      if (kind === "parent-world-write") chmodSync(f.parent, 0o757);
      if (kind === "parent-symlink") { renameSync(f.parent, `${f.parent}-real`); symlinkSync(`${f.parent}-real`, f.parent); }
      if (kind === "file-symlink") { renameSync(f.path, `${f.path}-real`); symlinkSync(`${f.path}-real`, f.path); }
      if (kind === "file-permissions") chmodSync(f.path, 0o644);
      if (kind === "hardlink") linkSync(f.path, `${f.path}-link`);
      expect(() => f.read()).toThrow();
    } finally { f.cleanup(); }
  });
});

// Execute only the extracted service verifier with all OS/file/network boundaries mocked.
// Neither the bound deploy CLI nor a worker profile/credential issuer is imported or spawned.
function serviceFixture({ tmpdir = true, logicalArtifact = true } = {}) {
  const source = readFileSync("scripts/deploy-prelaunch-web.mjs", "utf8");
  const start = source.indexOf("async function verifyQuantityV4ActiveWorkerService("), end = source.indexOf("function verifyProtectedBoundary(", start);
  if (start < 0 || end <= start) throw new Error("Exact active continuation service boundary missing");
  const launcherSource = readFileSync("scripts/lib/prelaunch-youtube-resolution-worker-install.mjs", "utf8");
  const launcherStart = launcherSource.indexOf("export function assertYoutubeResolutionLauncherPreserved("), launcherEnd = launcherSource.indexOf("export function preserveYoutubeResolutionLauncherEnvironment(", launcherStart);
  if (launcherStart < 0 || launcherEnd <= launcherStart) throw new Error("Exact canonical launcher guard missing");
  const assertLauncher = new Function("check", "isDeepStrictEqual", launcherSource.slice(launcherStart, launcherEnd).replace("export function", "function") + ";return assertYoutubeResolutionLauncherPreserved;")(
    (condition: boolean, message: string) => { if (!condition) throw new Error(message); }, isDeepStrictEqual);
  const opsSource = readFileSync("scripts/lib/youtube-extraction-worker-ops.mjs", "utf8"), parserStart = opsSource.indexOf("export function parseLaunchctlPrintStatus("), parserEnd = opsSource.indexOf("function ensureDryRun(", parserStart);
  if (parserStart < 0 || parserEnd <= parserStart) throw new Error("Exact legacy status parser missing");
  const parseStatus = new Function("YOUTUBE_EXTRACTION_WORKER_LABEL", opsSource.slice(parserStart, parserEnd).replace("export function", "function") + ";return parseLaunchctlPrintStatus;")("com.homecook.youtube-extraction-worker");
  const home = "/owned-fixture/home", ref = "b".repeat(40), operationId = "12345678-1234-4123-8123-123456789abc";
  const root = join(home, `.homecook/youtube-extraction-releases/${ref.slice(0, 12)}-c04-quantity-v4`);
  const secret = join(home, ".homecook/youtube-extraction"), suffix = `${ref.slice(0, 12)}-${operationId.slice(0, 8)}`;
  const manifest = join(root, "artifact.json"), credential = join(secret, `worker-credential-v48-${suffix}-c04.json`);
  const descriptor = join(secret, `app-descriptor-${suffix}-c04.json`), config = join(secret, `worker-v48-${suffix}-c04.env`);
  const schema = join(root, "scripts/manifests/youtube-extraction-expected-schema.json"), policy = join(secret, `current-policy-${suffix}-c04.json`);
  const runner = join(root, "scripts/youtube-extraction-worker-runner.mjs"), node = join(home, ".nvm/versions/node/v22.19.0/bin/node");
  const plistPath = join(home, "Library/LaunchAgents/com.homecook.youtube-extraction-worker.plist");
  const flags = ["--config", config, "--manifest", manifest, "--credential", credential, "--secret-root", secret,
    "--app-descriptor", descriptor, "--policy", policy, "--expected-schema", schema];
  const launcherEnv = [`HOME=${home}`, "PATH=/usr/bin:/bin:/opt/homebrew/bin", ...(tmpdir ? ["TMPDIR=/private/tmp/owned-worker"] : [])];
  const plist = { Label: "com.homecook.youtube-extraction-worker", WorkingDirectory: root,
    ProgramArguments: ["/usr/bin/env", "-i", ...launcherEnv, node, runner, "run", ...flags] };
  const previousPlist = { ...plist, WorkingDirectory: "/owned-fixture/old47", ProgramArguments: ["/usr/bin/env", "-i", ...launcherEnv, node, "/owned-fixture/old47/runner.mjs", "run"] };
  const operationDirectory = `/owned-fixture/worker-control/${operationId}`, backupPath = join(operationDirectory, "generation-47.plist");
  const bytes = new Map([[manifest, Buffer.from("sealed artifact")], [credential, Buffer.from("original credential")],
    [descriptor, Buffer.from("sealed descriptor")], [plistPath, Buffer.from(JSON.stringify(plist))], [backupPath, Buffer.from(JSON.stringify(previousPlist))], [join(secret, "worker.jwt"), Buffer.from("synthetic-token")]]);
  const hash = (value: Buffer) => createHash("sha256").update(value).digest("hex");
  const logicalSha = logicalArtifact ? hash(Buffer.from("logical canonical artifact identity")) : hash(bytes.get(manifest)!);
  const predecessorSha = hash(bytes.get(backupPath)!);
  const checkpoint = { pid: 12345, plistSha256: hash(bytes.get(plistPath)!), artifactSha256: logicalSha,
    descriptorSha256: hash(bytes.get(descriptor)!), credentialMetadataSha256: hash(bytes.get(credential)!), schemaIdentity: "schema-v2", snapshotDigest: "a".repeat(64) };
  const metadata = { generation: 48, release_sha: ref, schema_identity: checkpoint.schemaIdentity,
    allowed_snapshot_digest: checkpoint.snapshotDigest, expires_at: new Date(Date.now() + 3600000).toISOString(), token_file: join(secret, "worker.jwt") };
  const pids = [69608, 69608, 69608];
  // Tab/block structure matches root's sanitized native sample:
  // /tmp/mumeok-c04-active-service-print-structure.txt (no actual private output read).
  const loaded = { program: "/usr/bin/env", args: [...plist.ProgramArguments], cwd: root, path: plistPath,
    duplicate: false, truncated: false, changeDuringHealth: false, nested: false, rawTransform: (value: string) => value };
  const artifactInfo = { isFile: () => true, isSymbolicLink: () => false, nlink: 1, uid: process.getuid!(), mode: 0o644 };
  const health = { ok: true, ready: true };
  const caller = vi.fn(async () => ({ authenticatedStatus: 200, emptyClaimDenied: true }));
  const spawn = vi.fn((bin: string, args: string[]) => {
    if (bin === "/bin/launchctl") {
      const nested = loaded.nested ? ["inherited environment", "default environment", "environment", "resource coalition", "jetsam coalition", "semaphores"].map(key => `\t${key} = {\n\t\tstate = active\n\t\tinner = {\n\t\t\tstate = active\n\t\t}\n\t}\n`).join("") : "";
      const raw = loaded.rawTransform(`gui/fixture/com.homecook.youtube-extraction-worker = {\n\tpath = ${loaded.path}\n\ttype = LaunchAgent\n${nested}\tstate = running\n\tprogram = ${loaded.program}\n${loaded.duplicate ? `\tprogram = ${loaded.program}\n` : ""}\targuments = {\n${loaded.args.map(x => `\t\t${x}\n`).join("")}\t}\n\tworking directory = ${loaded.cwd}\n\tpid = ${pids.shift()}\n}\n`);
      return { status: 0, stdout: loaded.truncated ? raw.slice(0, -3) : raw };
    }
    if (bin !== node || args[0] !== runner || args[1] !== "health" || !isDeepStrictEqual(args.slice(2), flags)) throw new Error("Only fixed local health allowed");
    if (loaded.changeDuringHealth) loaded.program = "/usr/bin/false";
    return { status: 0, stdout: JSON.stringify(health) };
  });
  const read = (path: string) => { const value = bytes.get(path); if (!value) throw new Error("Foreign fixture read"); return value; };
  const readInstalled = vi.fn(() => read(plistPath)), readPrivate = vi.fn(read);
  const verifyArtifact = vi.fn(() => ({ artifact_sha256: logicalSha })), environment = vi.fn(async () => ({ synthetic: true }));
  const bindings = { homedir: () => home, join, dirname, readClosedR2PrivateBytes: readPrivate, repository: "/owned-fixture/repo",
    readQuantityV4InstalledWorkerPlist: readInstalled,
    parsePlist: (value: Buffer) => JSON.parse(value.toString()), hash, lstatSync: () => artifactInfo, readFileSync: read,
    verifyYoutubeExtractionWorkerArtifact: verifyArtifact, readYoutubeExtractionWorkerCredential: () => metadata, spawnSync: spawn,
    parseLaunchctlPrintStatus: parseStatus,
    domain: "gui/fixture", delay: vi.fn(async () => {}), readWorkerEnvironment: environment, verifyYoutubeResolutionWorkerCaller: caller, DeploymentError: Error, isDeepStrictEqual,
    assertYoutubeResolutionLauncherPreserved: assertLauncher };
  const verify = new Function(...Object.keys(bindings), source.slice(start, end) + ";return verifyQuantityV4ActiveWorkerService;")(...Object.values(bindings));
  return { verify: () => verify({ to: ref, workerAuthority: { operationId } }, {
    post: { record: checkpoint, origin: { record: { operationDirectory } } }, pre: { record: { plistSha256: predecessorSha } } }), checkpoint,
    metadata, bytes, plist, plistPath, hash, pids, artifactInfo, health, caller, spawn, verifyArtifact, environment, manifest, backupPath, loaded, readInstalled, readPrivate };
}

describe("ordinary UI continuation current worker health", () => {
  it("uses only root identity/state/PID while preserving normal nested active states", async () => {
    const f = serviceFixture(); f.loaded.nested = true;
    expect(await f.verify()).toEqual({ pid: 69608, stableObservations: 2 });
  });
  it("accepts the actual preserved TMPDIR launcher contract", async () => {
    const f = serviceFixture({ tmpdir: true, logicalArtifact: false });
    expect(await f.verify()).toEqual({ pid: 69608, stableObservations: 2 });
  });
  it("compares verified logical artifact identity rather than the distinct raw manifest hash", async () => {
    const f = serviceFixture({ tmpdir: true, logicalArtifact: true });
    expect(f.hash(f.bytes.get(f.manifest)!)).not.toBe(f.checkpoint.artifactSha256);
    expect(await f.verify()).toEqual({ pid: 69608, stableObservations: 2 });
  });
  it.each(["TMPDIR", "PATH", "predecessor"])("rejects a forged %s even when a claimed post hash was changed", async kind => {
    const f = serviceFixture();
    if (kind === "TMPDIR") f.plist.ProgramArguments = f.plist.ProgramArguments.map(x => x.startsWith("TMPDIR=") ? "TMPDIR=/private/foreign" : x);
    if (kind === "PATH") f.plist.ProgramArguments = f.plist.ProgramArguments.map(x => x.startsWith("PATH=") ? "PATH=/opt/homebrew/bin:/usr/bin:/bin" : x);
    if (kind === "predecessor") f.bytes.set(f.backupPath, Buffer.from(JSON.stringify({ ...f.plist, foreign: true })));
    f.bytes.set(f.plistPath, Buffer.from(JSON.stringify(f.plist))); f.checkpoint.plistSha256 = f.hash(f.bytes.get(f.plistPath)!);
    await expect(f.verify()).rejects.toThrow();
  });
  it.each(["program", "arguments", "TMPDIR", "cwd", "path", "duplicate", "truncated", "during-health", "missing-program", "missing-workdir", "duplicate-arguments", "ambiguous-indent"])("rejects a foreign loaded %s despite the unchanged disk plist and healthy separate runner", async kind => {
    const f = serviceFixture();
    if (kind === "program") f.loaded.program = "/usr/bin/false";
    if (kind === "arguments") f.loaded.args[f.loaded.args.length - 1] = "/foreign/schema.json";
    if (kind === "TMPDIR") f.loaded.args = f.loaded.args.map(x => x.startsWith("TMPDIR=") ? "TMPDIR=/private/foreign/" : x);
    if (kind === "cwd") f.loaded.cwd = "/foreign/cwd";
    if (kind === "path") f.loaded.path = "/foreign/service.plist";
    if (kind === "duplicate") f.loaded.duplicate = true;
    if (kind === "truncated") f.loaded.truncated = true;
    if (kind === "during-health") f.loaded.changeDuringHealth = true;
    if (kind === "missing-program") f.loaded.rawTransform = raw => raw.replace(/^\tprogram = [^\n]*\n/mu, "");
    if (kind === "missing-workdir") f.loaded.rawTransform = raw => raw.replace(/^\tworking directory = [^\n]*\n/mu, "");
    if (kind === "duplicate-arguments") f.loaded.rawTransform = raw => raw.replace("\targuments = {", "\targuments = {\n\t}\n\targuments = {");
    if (kind === "ambiguous-indent") f.loaded.rawTransform = raw => raw.replace("\t\t/usr/bin/env", "\t\t\t/usr/bin/env");
    await expect(f.verify()).rejects.toThrow();
  });
  it("accepts a natural restart only with two stable current PIDs, exact files, health and auth; preserves the old receipt PID", async () => {
    const f = serviceFixture();
    expect(await f.verify()).toEqual({ pid: 69608, stableObservations: 2 });
    expect(f.checkpoint.pid).toBe(12345);
    expect(f.verifyArtifact).toHaveBeenCalledOnce(); expect(f.caller).toHaveBeenCalledOnce();
    expect(f.spawn.mock.calls.filter(([bin]) => bin !== "/bin/launchctl")).toHaveLength(1);
    expect(f.readInstalled).toHaveBeenCalledTimes(2);
    expect(f.readPrivate.mock.calls.some(([path]) => path === f.plistPath)).toBe(false);
  });
  it("rechecks the canonical installed file after health while retaining private proof/secret reads", async () => {
    const f = serviceFixture();
    f.readInstalled.mockImplementationOnce(() => f.bytes.get(f.plistPath)!).mockImplementation(() => { throw new Error("Installed file permissions changed"); });
    await expect(f.verify()).rejects.toThrow("Installed file permissions changed");
    expect(f.readPrivate.mock.calls.some(([path]) => path === f.plistPath)).toBe(false);
  });
  it.each(["unstable", "changed-during-health", "expired", "health", "auth", "generation", "foreign-plist", "owner", "artifact"])("denies %s without any install/write/claim call", async kind => {
    const f = serviceFixture();
    if (kind === "unstable") f.pids[1]++;
    if (kind === "changed-during-health") f.pids[2]++;
    if (kind === "expired") f.metadata.expires_at = new Date(Date.now() + 1000).toISOString();
    if (kind === "health") f.health.ready = false;
    if (kind === "auth") f.caller.mockResolvedValue({ authenticatedStatus: 200, emptyClaimDenied: false });
    if (kind === "generation") f.metadata.generation = 49;
    if (kind === "foreign-plist") f.bytes.set(f.plistPath, Buffer.from("foreign plist"));
    if (kind === "owner") f.artifactInfo.uid++;
    if (kind === "artifact") f.checkpoint.artifactSha256 = "f".repeat(64);
    await expect(f.verify()).rejects.toThrow();
  });
});
