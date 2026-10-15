import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, lstatSync, rmSync, realpathSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { afterEach, expect, it } from "vitest";
import { DEV_DEPLOY_SNAPSHOT_PATHS, installDevDeployLauncher, verifyDevDeployToolLoad } from "../scripts/lib/dev-deploy-launcher.mjs";
import { prelaunchVerificationEnvironment } from "../scripts/lib/prelaunch-web-deploy.mjs";

const requiredRegistryFiles = [
  "docs/security/full-local-auth-db-security-function-authorization-manifest.json",
  "docs/security/recipe-snapshot-authority-security-function-authorization-manifest.json",
  "docs/security/personal-recipe-customization-write-core-security-function-authorization-manifest.json",
  "docs/security/recipe-content-snapshot-future-propagation-security-function-authorization-manifest.json",
  "docs/security/recipe-product-source-function-postimages.json",
  "docs/security/cooked-weight-evidence-source-function-postimages.json",
  "docs/security/quantity-input-v4-source-function-postimages.json",
  "docs/security/youtube-worker-quantity-function-postimages.json",
  "docs/security/cooked-weight-user-attestation-source-function-postimages.json",
  "docs/security/recipe-save-recovery-source-function-postimages.json",
  "docs/security/recipe-future-request-role-source-function-postimage.json",
];
const hash = (value: Buffer) => createHash("sha256").update(value).digest("hex");

const snapshotRoots: string[] = [];
afterEach(() => { for (const root of snapshotRoots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function snapshotRoot() {
  const root = mkdtempSync(join(realpathSync(tmpdir()), "hc-snapshot-"));
  snapshotRoots.push(root);
  return root;
}

function ownedInstallerRepository(root: string) {
  const repository = join(root, "repo"), taskHome = join(root, "fixture-home"), current = process.cwd();
  mkdirSync(repository);
  const archive = execFileSync("git", ["archive", "--format=tar", "HEAD", ...new Set([...DEV_DEPLOY_SNAPSHOT_PATHS, "supabase/migrations", ...requiredRegistryFiles].filter(path=>spawnSync("git",["cat-file","-e",`HEAD:${path}`],{cwd:current,stdio:"ignore"}).status===0))],
    { cwd: current, maxBuffer: 128 * 1024 * 1024 });
  execFileSync("/usr/bin/tar", ["-xf", "-", "-C", repository], { input: archive });
  for (const path of ["scripts/deploy-prelaunch-web.mjs", "scripts/lib/prelaunch-web-deploy.mjs", "scripts/lib/prelaunch-database.mjs",
    "scripts/lib/full-local-restore-cutover.mjs", "scripts/lib/full-local-security-inventory.mjs", "scripts/lib/dev-deploy-launcher.mjs", ...requiredRegistryFiles]) {
    let bytes = readFileSync(join(current, path));
    if (path === "scripts/lib/prelaunch-web-deploy.mjs") bytes = Buffer.from(bytes.toString().replace(/^export const ([A-Z0-9_]+_PIN) = [\s\S]*?;(?=\r?\n)/gmu,
      (_text, name: string) => `export const ${name} = Object.freeze({ path: null, sha256: null });`));
    writeFileSync(join(repository, path), bytes);
  }
  // Only the owned installer's homedir import is injected. Its installer body and the parent/user HOME remain untouched.
  const install = readFileSync(join(current, "scripts/install-dev-deploy.mjs"), "utf8"), originalImport = 'import { homedir } from "node:os";';
  expect(install.split(originalImport)).toHaveLength(2);
  const injectedImport = 'import { homedir } from "./fixture-home.mjs";', injectedInstaller = install.replace(originalImport, injectedImport);
  expect(injectedInstaller.replace(injectedImport, originalImport)).toBe(install);
  writeFileSync(join(repository, "scripts/install-dev-deploy.mjs"), injectedInstaller);
  writeFileSync(join(repository, "scripts/fixture-home.mjs"), `export const homedir = () => ${JSON.stringify(taskHome)};\n`);
  writeFileSync(join(repository, "supabase/not-runtime.env"), "owned fixture: must not be archived\n");
  writeFileSync(join(repository, "docs/not-runtime.md"), "owned fixture: must not be archived\n");
  const git = (args: string[]) => execFileSync("git", ["-C", repository, ...args], { stdio: "ignore" });
  git(["init"]); git(["config", "user.name", "Snapshot Fixture"]); git(["config", "user.email", "snapshot-fixture@example.invalid"]);
  git(["remote", "add", "origin", "https://github.com/netsus/homecook.git"]); git(["add", "."]); git(["commit", "-m", "Verify deployment data closure in an owned install archive"]);
  return { repository, taskHome, env: prelaunchVerificationEnvironment("test", process.env) };
}

it("loads the committed deployment import graph from its exact git archive", () => {
  const root = snapshotRoot(), repository = process.cwd();
  const archive = execFileSync("git", ["archive", "--format=tar", "HEAD", ...DEV_DEPLOY_SNAPSHOT_PATHS.filter(path=>spawnSync("git",["cat-file","-e",`HEAD:${path}`],{cwd:repository,stdio:"ignore"}).status===0)], { cwd: repository, maxBuffer: 128 * 1024 * 1024 });
  execFileSync("/usr/bin/tar", ["-xf", "-", "-C", root], { input: archive });
  expect(() => verifyDevDeployToolLoad({ entryPoint: join(root, "scripts/deploy-prelaunch-web.mjs"), repository, nodePath: process.execPath })).not.toThrow();
});

it("installs the working tool and generates exact227/228/personal inventories from committed static data", () => {
  const { repository, taskHome, env } = ownedInstallerRepository(snapshotRoot());
  const installed = spawnSync(process.execPath, ["--", join(repository, "scripts/install-dev-deploy.mjs"), "--ref", "HEAD"], { env, encoding: "utf8" });
  expect(installed.status, installed.stderr).toBe(0);
  const tools = join(taskHome, ".homecook/prelaunch-web/tools"), snapshot = join(tools, readdirSync(tools)[0]);
  const paths = [...requiredRegistryFiles, ...readdirSync(join(repository, "supabase/migrations")).map(name => `supabase/migrations/${name}`)];
  for (const path of paths) expect(hash(readFileSync(join(snapshot, path)))).toBe(hash(readFileSync(join(repository, path))));
  expect(readdirSync(join(snapshot, "docs"))).toEqual(["security"]);
  expect(readdirSync(join(snapshot, "docs/security")).sort()).toEqual(requiredRegistryFiles.map(path => path.split("/").at(-1)).sort());
  expect(existsSync(join(snapshot, "supabase/not-runtime.env"))).toBe(false);
  expect(existsSync(join(snapshot, "docs/not-runtime.md"))).toBe(false);
  const probe = String.raw`import assert from 'node:assert/strict';
    const web=await import(${JSON.stringify(join(snapshot, "scripts/lib/prelaunch-web-deploy.mjs"))});
    const db=await import(${JSON.stringify(join(snapshot, "scripts/lib/prelaunch-database.mjs"))});
    for(const [name,value] of Object.entries(web)) if(name.endsWith('_PIN')) assert.deepEqual(value,{path:null,sha256:null});
    assert.deepEqual(web.COOKED_WEIGHT_ROLLOUT_REVIEW_PIN,{path:null,sha256:null});
    assert.deepEqual(web.COOKED_WEIGHT_WRITER_REVIEW_PIN,{path:null,sha256:null});
    assert.throws(()=>web.loadProtectedRolloutReview(${JSON.stringify(repository)},{feature:'unreviewed-feature'}));
    assert.ok(db.COOKED_WEIGHT_SCOPE_SQL.includes('verify_scope_pre_cooked_weight_evidence_20261013'));
    assert.ok(db.COOKED_WEIGHT_STABLE_IMMUTABLE_SQL.includes("p.pronargs=0"));
    assert.ok(web.protectedReaderFenceSql({feature:'cooked-weight-evidence'}).check.includes('cooked_batch_weight_evidence_control'));
    const inventory=await import(${JSON.stringify(join(snapshot, "scripts/lib/full-local-security-inventory.mjs"))});
    const base={includeCookedWeightEvidenceFunctions:true,includeQuantityInputV4Functions:true};
    const count=sql=>sql.split('values ')[1].split('), actual as (')[0].match(/\('(public|private)\./g).length;
    const before=inventory.buildRecipeProductSourceFunctionInventorySql(base);
    const after=inventory.buildRecipeProductSourceFunctionInventorySql({...base,includeCookedWeightAttestationFunctions:true});
    const personal=inventory.buildCookedWeightAttestationSourceFunctionInventorySql();
    const latest=inventory.buildRecipeProductSourceFunctionInventorySql({...base,includeCookedWeightAttestationFunctions:true,includeRecipeSaveRecoveryFunctions:true});
    const exact=inventory.buildRecipeSaveRecoverySourceFunctionInventorySql();
    const role=inventory.buildRecipeProductSourceFunctionInventorySql({...base,includeCookedWeightAttestationFunctions:true,includeRecipeSaveRecoveryFunctions:true,includeRecipeRequestRoleFunctions:true});
    const roleExact=inventory.buildRecipeSaveRecoverySourceFunctionInventorySql({includeRecipeRequestRoleFunctions:true});
    assert.ok(role.includes('e6eb35af2e77538b72d655b16f408967'));
    const generated={before227:count(before),after228:count(after),personal:count(personal),after231:count(latest),recipeSave:count(exact),after232:count(role),requestRole:count(roleExact)};
    assert.deepEqual(generated,{before227:94,after228:103,personal:10,after231:109,recipeSave:11,after232:109,requestRole:11});
    assert.ok(personal.includes('verify_scope_pre_weight_attestation_20261014'));
    console.log(JSON.stringify(generated));
  `;
  const loaded = spawnSync(process.execPath, ["--input-type=module", "-e", probe], { env, encoding: "utf8" });
  expect(loaded.status, loaded.stderr).toBe(0);
  expect(JSON.parse(loaded.stdout)).toEqual({ before227: 94, after228: 103, personal: 10, after231:109, recipeSave:11, after232:109, requestRole:11 });
});

it("rejects the former snapshot paths at the real registry import instead of silently dropping the guard", () => {
  const root = snapshotRoot(), oldPaths = ["scripts", "infra", ".env.example", "package.json", "supabase/config.toml", "lib/server/youtube-extraction-worker-timing.json"];
  const archive = execFileSync("git", ["archive", "--format=tar", "HEAD", ...oldPaths], { cwd: process.cwd(), maxBuffer: 128 * 1024 * 1024 });
  execFileSync("/usr/bin/tar", ["-xf", "-", "-C", root], { input: archive });
  const loaded = spawnSync(process.execPath, ["--input-type=module", "-e", `await import(${JSON.stringify(join(root, "scripts/lib/full-local-security-inventory.mjs"))});`],
    { env: prelaunchVerificationEnvironment("test", process.env), encoding: "utf8" });
  expect(loaded.status).not.toBe(0); expect(loaded.stderr).toContain("ENOENT");
  expect(loaded.stderr).toContain("full-local-auth-db-security-function-authorization-manifest.json");
});

it("rejects the old archive that omits the required static JSON", () => {
  const root = snapshotRoot(), repository = process.cwd();
  const oldPaths = DEV_DEPLOY_SNAPSHOT_PATHS.filter(path => path !== "lib/server/youtube-extraction-worker-timing.json" && spawnSync("git",["cat-file","-e",`HEAD:${path}`],{cwd:repository,stdio:"ignore"}).status===0);
  const archive = execFileSync("git", ["archive", "--format=tar", "HEAD", ...oldPaths], { cwd: repository, maxBuffer: 128 * 1024 * 1024 });
  execFileSync("/usr/bin/tar", ["-xf", "-", "-C", root], { input: archive });
  expect(() => verifyDevDeployToolLoad({ entryPoint: join(root, "scripts/deploy-prelaunch-web.mjs"), repository, nodePath: process.execPath })).toThrow("load");
});

it("publishes a loadable archived tool through the real installer in an isolated home", () => {
  const { taskHome, repository, env } = ownedInstallerRepository(snapshotRoot());
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
    "scripts/install-dev-deploy.mjs": readFileSync(join(process.cwd(), "scripts/install-dev-deploy.mjs"), "utf8")
      .replace('import { homedir } from "node:os";', 'import { homedir } from "./fixture-home.mjs";'),
    "scripts/fixture-home.mjs": `export const homedir = () => ${JSON.stringify(taskHome)};\n`,
    "scripts/lib/dev-deploy-launcher.mjs": readFileSync(join(process.cwd(), "scripts/lib/dev-deploy-launcher.mjs"), "utf8"),
    "scripts/deploy-prelaunch-web.mjs": 'import "./missing-module.mjs";\n',
    "infra/fixture.txt": "fixture", ".env.example": "", "package.json": '{"type":"module"}', "supabase/config.toml": "",
    "lib/server/youtube-extraction-worker-timing.json": "{}",
    "supabase/migrations/fixture.sql": "SELECT 1;\n",
  };
  for (const path of requiredRegistryFiles) files[path] = "{}";
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
    env: prelaunchVerificationEnvironment("test", process.env), encoding: "utf8",
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
