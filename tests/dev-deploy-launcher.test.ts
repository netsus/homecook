import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, lstatSync, rmSync, realpathSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { afterEach, expect, it } from "vitest";
import { DEV_DEPLOY_SNAPSHOT_PATHS, installDevDeployLauncher, verifyDevDeployToolLoad } from "../scripts/lib/dev-deploy-launcher.mjs";
import { COOKED_WEIGHT_ROLLOUT_REVIEW_PIN, COOKED_WEIGHT_WRITER_REVIEW_PIN, prelaunchVerificationEnvironment } from "../scripts/lib/prelaunch-web-deploy.mjs";

const snapshotRoots: string[] = [];
afterEach(() => { for (const root of snapshotRoots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function snapshotRoot() {
  const root = mkdtempSync(join(realpathSync(tmpdir()), "hc-snapshot-"));
  snapshotRoots.push(root);
  return root;
}

it("loads the committed deployment import graph from its exact git archive", () => {
  const root = snapshotRoot(), repository = process.cwd();
  const archive = execFileSync("git", ["archive", "--format=tar", "HEAD", ...DEV_DEPLOY_SNAPSHOT_PATHS], { cwd: repository, maxBuffer: 128 * 1024 * 1024 });
  execFileSync("/usr/bin/tar", ["-xf", "-", "-C", root], { input: archive });
  expect(() => verifyDevDeployToolLoad({ entryPoint: join(root, "scripts/deploy-prelaunch-web.mjs"), repository, nodePath: process.execPath })).not.toThrow();
});

it("installs the working C01 tool graph as an actual archive and invokes its fixed probes without security document data", () => {
  const root = snapshotRoot(), repository = join(root, "repo"), taskHome = join(root, "fixture-home"), current = process.cwd();
  mkdirSync(repository);
  const archive = execFileSync("git", ["archive", "--format=tar", "HEAD", ...DEV_DEPLOY_SNAPSHOT_PATHS], { cwd: current, maxBuffer: 128 * 1024 * 1024 });
  execFileSync("/usr/bin/tar", ["-xf", "-", "-C", repository], { input: archive });
  for (const path of ["scripts/deploy-prelaunch-web.mjs", "scripts/lib/prelaunch-web-deploy.mjs", "scripts/lib/prelaunch-database.mjs", "scripts/lib/full-local-restore-cutover.mjs"]) {
    writeFileSync(join(repository, path), readFileSync(join(current, path)));
  }
  const git = (args: string[]) => execFileSync("git", ["-C", repository, ...args], { stdio: "ignore" });
  git(["init"]); git(["config", "user.name", "Snapshot Fixture"]); git(["config", "user.email", "snapshot-fixture@example.invalid"]);
  git(["remote", "add", "origin", "https://github.com/netsus/homecook.git"]); git(["add", "."]); git(["commit", "-m", "Verify fixed C01 helpers in an isolated install archive"]);
  const env = { ...prelaunchVerificationEnvironment("test", process.env), HOME: taskHome };
  const installed = spawnSync(process.execPath, ["--", join(repository, "scripts/install-dev-deploy.mjs"), "--ref", "HEAD"], { env, encoding: "utf8" });
  expect(installed.status, installed.stderr).toBe(0);
  const tools = join(taskHome, ".homecook/prelaunch-web/tools"), snapshot = join(tools, readdirSync(tools)[0]);
  expect(() => readFileSync(join(snapshot, "docs/security/cooked-weight-evidence-source-function-postimages.json"))).toThrow();
  const probe = `import assert from 'node:assert/strict';
    const web=await import(${JSON.stringify(join(snapshot, "scripts/lib/prelaunch-web-deploy.mjs"))});
    const db=await import(${JSON.stringify(join(snapshot, "scripts/lib/prelaunch-database.mjs"))});
    assert.deepEqual(web.COOKED_WEIGHT_ROLLOUT_REVIEW_PIN,${JSON.stringify(COOKED_WEIGHT_ROLLOUT_REVIEW_PIN)});
    assert.deepEqual(web.COOKED_WEIGHT_WRITER_REVIEW_PIN,${JSON.stringify(COOKED_WEIGHT_WRITER_REVIEW_PIN)});
    assert.throws(()=>web.loadProtectedRolloutReview(${JSON.stringify(repository)},{feature:'unreviewed-feature'}));
    assert.ok(db.COOKED_WEIGHT_SCOPE_SQL.includes('verify_scope_pre_cooked_weight_evidence_20261013'));
    assert.ok(db.COOKED_WEIGHT_STABLE_IMMUTABLE_SQL.includes("p.pronargs=0"));
    assert.ok(web.protectedReaderFenceSql({feature:'cooked-weight-evidence'}).check.includes('cooked_batch_weight_evidence_control'));
  `;
  const loaded = spawnSync(process.execPath, ["--input-type=module", "-e", probe], { env, encoding: "utf8" });
  expect(loaded.status, loaded.stderr).toBe(0);
});

it("rejects the old archive that omits the required static JSON", () => {
  const root = snapshotRoot(), repository = process.cwd();
  const oldPaths = DEV_DEPLOY_SNAPSHOT_PATHS.filter(path => path !== "lib/server/youtube-extraction-worker-timing.json");
  const archive = execFileSync("git", ["archive", "--format=tar", "HEAD", ...oldPaths], { cwd: repository, maxBuffer: 128 * 1024 * 1024 });
  execFileSync("/usr/bin/tar", ["-xf", "-", "-C", root], { input: archive });
  expect(() => verifyDevDeployToolLoad({ entryPoint: join(root, "scripts/deploy-prelaunch-web.mjs"), repository, nodePath: process.execPath })).toThrow("load");
});

it("publishes a loadable archived tool through the real installer in an isolated home", () => {
  const taskHome = snapshotRoot(), repository = process.cwd();
  const env = { ...prelaunchVerificationEnvironment("test", process.env), HOME: taskHome };
  const installed = spawnSync(process.execPath, ["--", join(repository, "scripts/install-dev-deploy.mjs"), "--ref", "HEAD"], { env, encoding: "utf8" });
  expect(installed.status, installed.stderr).toBe(0);
  const launcher = join(taskHome, ".local/bin/homecook-deploy");
  const loaded = spawnSync(process.execPath, ["--", launcher, "--help"], { env, encoding: "utf8" });
  expect(loaded.status, loaded.stderr).toBe(0);
  expect(loaded.stdout).toContain("출시 전 웹/API/환경/추가형 DB 빠른 배포");
});

it("keeps an installed launcher intact when a candidate snapshot cannot load", () => {
  const root = snapshotRoot(), repository = join(root, "repo"), taskHome = join(root, "fixture-home");
  mkdirSync(repository);
  const files: Record<string, string> = {
    "scripts/install-dev-deploy.mjs": readFileSync(join(process.cwd(), "scripts/install-dev-deploy.mjs"), "utf8"),
    "scripts/lib/dev-deploy-launcher.mjs": readFileSync(join(process.cwd(), "scripts/lib/dev-deploy-launcher.mjs"), "utf8"),
    "scripts/deploy-prelaunch-web.mjs": 'import "./missing-module.mjs";\n',
    "infra/fixture.txt": "fixture", ".env.example": "", "package.json": '{"type":"module"}', "supabase/config.toml": "",
    "lib/server/youtube-extraction-worker-timing.json": "{}",
  };
  for (const [file, body] of Object.entries(files)) {
    mkdirSync(join(repository, file, ".."), { recursive: true });
    writeFileSync(join(repository, file), body);
  }
  const git = (args: string[]) => execFileSync("git", ["-C", repository, ...args], { stdio: "ignore" });
  git(["init"]); git(["config", "user.name", "Snapshot Fixture"]); git(["config", "user.email", "snapshot-fixture@example.invalid"]);
  git(["remote", "add", "origin", "https://github.com/netsus/homecook.git"]); git(["add", "."]); git(["commit", "-m", "Fixture snapshot"]);
  const oldEntry = join(root, "old-entry.mjs"); writeFileSync(oldEntry, "process.exit(0);");
  const launcher = installDevDeployLauncher({ binDirectory: join(taskHome, ".local/bin"), entryPoint: oldEntry, repository, nodePath: process.execPath });
  const previous = readFileSync(launcher);
  const result = spawnSync(process.execPath, ["--", join(repository, "scripts/install-dev-deploy.mjs")], {
    env: { ...prelaunchVerificationEnvironment("test", process.env), HOME: taskHome }, encoding: "utf8",
  });
  expect(result.status).toBe(1);
  expect(readFileSync(launcher)).toEqual(previous);
});

it("runs the installed tool from another directory without changing that checkout", () => {
  const root = mkdtempSync(join(tmpdir(), "hc-launcher-"));
  const binDirectory = join(root, "bin");
  const entryPoint = join(root, "tool.mjs");
  const repository = join(root, "repository with spaces");
  const elsewhere = join(root, "elsewhere");
  mkdirSync(repository); mkdirSync(elsewhere);
  writeFileSync(entryPoint, 'console.log(JSON.stringify({args:process.argv.slice(2),repo:process.env.HOMECOOK_DEPLOY_REPOSITORY}));');
  const path = installDevDeployLauncher({ binDirectory, entryPoint, repository, nodePath: process.execPath });
  const run = spawnSync(process.execPath, [path, "plan", "--ref", "HEAD"], { cwd: elsewhere, encoding: "utf8" });
  expect(run.status).toBe(0);
  expect(JSON.parse(run.stdout)).toEqual({ args: ["plan", "--ref", "HEAD"], repo: repository });
  expect(lstatSync(path).mode & 0o777).toBe(0o700);
});

it("refuses to replace an unrelated existing command", () => {
  const root = mkdtempSync(join(tmpdir(), "hc-launcher-"));
  const path = join(root, "homecook-deploy");
  writeFileSync(path, "user owned command");
  expect(() => installDevDeployLauncher({ binDirectory: root, entryPoint: "/tool", repository: "/repo", nodePath: process.execPath })).toThrow();
  expect(readFileSync(path, "utf8")).toBe("user owned command");
});
