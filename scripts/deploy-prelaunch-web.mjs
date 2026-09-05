#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { classifyPrelaunchScope, assertRollbackTarget, parsePrelaunchArgs, parsePrelaunchOptions, prelaunchVerificationScripts, prelaunchVerificationEnvironment, runPrelaunchVerification, prepareDatabaseDeployment, prelaunchSourceAncestry, restartLaunchAgent, createCancellation, prelaunchBuildEnvironment, DeploymentError, deployTransaction, productionEnvironment, retargetPlist } from "./lib/prelaunch-web-deploy.mjs";

import { applyEnvironmentPatch, readEnvironmentPatch } from "./lib/prelaunch-environment.mjs";
import { createPrelaunchDatabase } from "./lib/prelaunch-database.mjs";

const repository = realpathSync(resolve(process.env.HOMECOOK_DEPLOY_REPOSITORY || resolve(dirname(fileURLToPath(import.meta.url)), "..")));
const root = join(homedir(), ".homecook/prelaunch-web");
const plistPath = join(homedir(), "Library/LaunchAgents/com.homecook.production.plist");
const statePath = join(root, "state.json");
const recoveryPath = join(root, "recovery.json");
const databaseStatePath = join(root, "database-state.json");
const domain = `gui/${process.getuid()}`;
const service = `${domain}/com.homecook.production`;
let logFd;
const cancellation = createCancellation();
const say = (message) => process.stdout.write(`${message}\n`);

function command(bin, args, options = {}) {
  const result = spawnSync(bin, args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, ...options });
  if (result.status !== 0) throw new DeploymentError(`명령 실패: ${bin === "git" ? "git" : "로컬 배포 도구"}. 비공개 로그를 확인하세요.`);
  return result.stdout?.trim() ?? "";
}
const git = (args, cwd = repository) => command("git", ["-C", cwd, ...args]);
const parsePlist = (bytes) => JSON.parse(command("/usr/bin/plutil", ["-convert", "json", "-o", "-", "--", "-"], { input: bytes }));
const plistBytes = (value) => command("/usr/bin/plutil", ["-convert", "xml1", "-o", "-", "--", "-"], { input: JSON.stringify(value) });
function atomicWrite(path, bytes) {
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, bytes, { mode: 0o600 });
  chmodSync(temp, 0o600);
  renameSync(temp, path);
}
function current() {
  const bytes = readFileSync(plistPath);
  const plist = parsePlist(bytes);
  retargetPlist(plist, plist.WorkingDirectory);
  const cwd = plist.WorkingDirectory;
  return { bytes, plist, cwd, ref: git(["rev-parse", "HEAD"], cwd), buildId: readFileSync(join(cwd, ".next/BUILD_ID"), "utf8").trim() };
}
function assertClean(cwd) {
  if (git(["status", "--porcelain", "--untracked-files=no"], cwd)) {
    throw new DeploymentError("현재 웹 checkout에 수정한 추적 파일이 있어 배포를 중단합니다.");
  }
}
function plan(ref, live, option = "--ref", verifyScript) {
  assertClean(live.cwd);
  const target = git(["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`]);
  git(["merge-base", "--is-ancestor", ...prelaunchSourceAncestry(option, ref, live.ref, target)]);
  const files = git(["diff", "--name-only", "--no-renames", live.ref, target]).split("\n").filter(Boolean);
  const manifest = (sha) => JSON.parse(git(["show", `${sha}:package.json`]));
  const scope = classifyPrelaunchScope(files, manifest(live.ref), manifest(target));
  const verificationScripts = prelaunchVerificationScripts(scope, manifest(target), verifyScript);
  return { from: live.ref, target, files, scope, verificationScripts };
}
function ownChild(child) {
  const stopped = new Promise((resolvePromise) => {
    child.once("error", () => resolvePromise(null));
    child.once("exit", resolvePromise);
  });
  let stopping;
  const stop = () => stopping ??= (async () => {
    if (child.pid) {
      try { process.kill(-child.pid, "SIGTERM"); } catch { /* Already exited. */ }
      await Promise.race([stopped, delay(5000)]);
      try { process.kill(-child.pid, "SIGKILL"); } catch { /* All owned processes exited. */ }
    }
    await stopped;
  })();
  return { stopped, stop, forget: cancellation.track(stop) };
}
async function logged(bin, args, options) {
  cancellation.check();
  const owned = ownChild(spawn(bin, args, { ...options, detached: true, stdio: ["ignore", logFd, logFd] }));
  try {
    const code = await owned.stopped;
    cancellation.check();
    if (code !== 0) throw new DeploymentError("배포 하위 명령 실패");
  } finally { await owned.stop(); owned.forget(); }
}
function copyEnvironment(source, checkout) {
  for (const relative of [".env.production.local", ".env.local", ".env.production", ".env", "infra/full-local-supabase/.env.production.local"]) {
    const from = join(source, relative);
    if (!existsSync(from)) continue;
    const to = join(checkout, relative);
    mkdirSync(dirname(to), { recursive: true, mode: 0o700 });
    writeFileSync(to, readFileSync(from), { mode: 0o600 });
    chmodSync(to, 0o600);
  }
}
async function freePort() {
  const server = createServer();
  await new Promise((resolvePromise, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolvePromise); });
  const port = server.address().port;
  await new Promise((resolvePromise) => server.close(resolvePromise));
  return port;
}
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function smoke(port, cwd, buildId, recovering = false) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u.test(buildId)) throw new DeploymentError("잘못된 Next.js 빌드 ID");
  const manifestPath = `/_next/static/${buildId}/_buildManifest.js`;
  const expected = hash(readFileSync(join(cwd, ".next/static", buildId, "_buildManifest.js")));
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (!recovering) cancellation.check();
    try {
      const origin = `http://127.0.0.1:${port}`;
      const get = (path) => fetch(`${origin}${path}`, { redirect: "error", signal: AbortSignal.timeout(2500) });
      const page = await get("/beta");
      if (!page.ok) throw new Error();
      const html = await page.text();
      const manifest = await get(manifestPath);
      if (!manifest.ok || hash(Buffer.from(await manifest.arrayBuffer())) !== expected) throw new Error();
      const asset = html.match(/(?:src|href)="(\/_next\/static\/[^"?]+\.(?:js|css))(?:\?[^" ]*)?"/u)?.[1];
      if (!asset || !(await get(asset)).ok) throw new Error();
      if (!recovering) cancellation.check();
      return;
    } catch { await delay(500); }
  }
  throw new DeploymentError("웹 GET 확인 실패 (/beta·빌드 ID·정적 파일)");
}
async function preview(plist, checkout, buildId) {
  const port = await freePort();
  cancellation.check();
  const child = spawn(plist.ProgramArguments[0], [join(checkout, "scripts/start-production.mjs"), "-H", "127.0.0.1", "-p", String(port)], {
    cwd: checkout, env: productionEnvironment(plist), detached: true, stdio: ["ignore", logFd, logFd],
  });
  const owned = ownChild(child);
  try { await smoke(port, checkout, buildId); } finally { await owned.stop(); owned.forget(); }

}
async function switchWeb(bytes) {
  await restartLaunchAgent({
    isLoaded: async () => spawnSync("/bin/launchctl", ["print", service], { stdio: "ignore" }).status === 0,
    bootout: async () => { command("/bin/launchctl", ["bootout", service], { stdio: ["ignore", logFd, logFd] }); },
    writePlist: async () => { atomicWrite(plistPath, bytes); },
    bootstrap: async () => spawnSync("/bin/launchctl", ["bootstrap", domain, plistPath], { stdio: ["ignore", logFd, logFd] }).status,
    wait: delay,
  });
}
async function deploy(options) {
  if (existsSync(recoveryPath)) throw new DeploymentError("이전 배포 복구가 남아 있습니다. status와 rollback을 먼저 실행하세요.");
  const live = current();
  const selection = plan(options.ref, live, options.refOption, options.verifyScript);
  const patch = readEnvironmentPatch(options.envFile, repository);
  const needsDatabase = selection.scope.database.length > 0 || Boolean(options.dbConfig);
  if (needsDatabase && !options.dbConfig) throw new DeploymentError("DB 변경이 포함되어 있습니다. --db-config <비공개 full-local 설정 파일>을 지정하세요. 웹은 변경하지 않았습니다.");
  if (needsDatabase && !options.dbCompatible) throw new DeploymentError("DB 변경은 이전 웹과의 호환성 확인 후 --db-compatible을 지정해야 합니다. 호환되지 않는 변경은 별도 배포 절차를 사용하세요.");
  const release = mkdtempSync(join(root, "releases/", `${selection.target.slice(0, 12)}-`));
  const checkout = join(release, "checkout");
  const backup = join(release, "previous.plist");
  let buildId;
  let state;
  let nextPlist;
  let nextBytes;
  say(`웹 준비: ${selection.from.slice(0, 12)} → ${selection.target.slice(0, 12)}`);
  await deployTransaction({
    prepare: async () => {
      await logged("git", ["-C", repository, "worktree", "add", "--detach", checkout, selection.target], {});
      copyEnvironment(live.cwd, checkout);
      nextPlist = retargetPlist(applyEnvironmentPatch(checkout, live.plist, patch), checkout);
      nextBytes = plistBytes(nextPlist);
      const buildOptions = { cwd: checkout, env: prelaunchBuildEnvironment(nextPlist, basename(release)) };
      say("의존성 설치 및 웹 빌드 중 (비공개 로그에 기록)");
      await logged("pnpm", ["install", "--frozen-lockfile", "--prod=false", "--ignore-scripts"], buildOptions);
      await runPrelaunchVerification({ scripts: selection.verificationScripts, run: async (script) => {
        say(`웹 교체 전 검증: ${script}`);
        await logged("pnpm", ["run", script], { ...buildOptions, env: prelaunchVerificationEnvironment(script, buildOptions.env) });
      } });
      // Load the same external full-local app secrets as production before Next's build.
      // Execute Next directly: package prebuild/postbuild hooks are not deployment steps.
      const buildScript = `import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { prepareStartProductionRuntimeEnv } from './scripts/lib/start-production-runtime.mjs';
const env = prepareStartProductionRuntimeEnv({ repositoryRoot: process.cwd() });
const require = createRequire(import.meta.url);
const result = spawnSync(process.execPath, [require.resolve('next/dist/bin/next'), 'build'], { env, stdio: 'inherit' });
process.exit(result.status ?? 1);`;
      await logged(live.plist.ProgramArguments[0], ["--input-type=module", "-e", buildScript], buildOptions);
      buildId = readFileSync(join(checkout, ".next/BUILD_ID"), "utf8").trim();
      if (buildId !== buildOptions.env.HOMECOOK_RELEASE_BUILD_ID) throw new DeploymentError("새 웹의 고유 빌드 ID가 일치하지 않습니다.");
      atomicWrite(backup, live.bytes);
      state = { backup, previousCwd: live.cwd, previousBuildId: live.buildId, previousPlistHash: hash(live.bytes), checkout, ref: selection.target, buildId, targetPlistHash: hash(nextBytes), environmentKeys: Object.keys(patch).sort() };
      if (needsDatabase) {
        say("DB 변경 검사 및 격리된 데이터베이스 검증 중");
        const database = await prepareDatabaseDeployment({
          required: true, compatibilityConfirmed: options.dbCompatible,
          open: () => createPrelaunchDatabase({ repositoryRoot: checkout, configPath: options.dbConfig, baselinePath: options.dbBaseline, backupRoot: join(release, "db-backup"), logFd, checkCancelled: () => cancellation.check() }),
          gate: async () => { await logged("pnpm", ["verify:local-supabase-runtime:isolated"], buildOptions); cancellation.check(); },
          onApplied: async (database) => { state.database = database; atomicWrite(databaseStatePath, JSON.stringify(database)); atomicWrite(recoveryPath, JSON.stringify(state)); },
        });
        state.database = database;
        atomicWrite(recoveryPath, JSON.stringify(state));
      }
      say("별도 로컬 포트에서 새 웹 확인 중");
      await preview(nextPlist, checkout, buildId);
      cancellation.check();
      assertClean(live.cwd);
      if (!readFileSync(plistPath).equals(live.bytes)) throw new DeploymentError("준비 중 웹 설정이 바뀌었습니다.");
      atomicWrite(recoveryPath, JSON.stringify(state));
    },
    activate: async () => { say("웹 프로세스 교체 중"); await switchWeb(nextBytes); },
    verify: () => smoke(3100, checkout, buildId),
    restore: async () => { await switchWeb(live.bytes); },
    verifyRestored: async () => { await smoke(3100, live.cwd, live.buildId, true); unlinkSync(recoveryPath); },
  });
  atomicWrite(statePath, JSON.stringify(state));
  unlinkSync(recoveryPath);
  say(`웹 배포 완료: ${selection.target}\n빌드 ID: ${buildId}`);
  if (state.database) say("DB 변경 기록과 백업은 비공개 배포 폴더에 보관했습니다. 웹 rollback은 DB를 되돌리지 않습니다.");
}
async function rollback() {
  const recovering = existsSync(recoveryPath);
  const record = recovering ? recoveryPath : statePath;
  if (!existsSync(record)) throw new DeploymentError("저장된 이전 웹 배포가 없습니다.");
  const state = JSON.parse(readFileSync(record, "utf8"));
  if (state.database && state.database.backwardCompatible !== true) throw new DeploymentError("이 DB 변경의 이전 웹 호환성이 확인되지 않아 자동 rollback할 수 없습니다.");
  const live = current();
  assertRollbackTarget({ ...live, plistHash: hash(live.bytes) }, state, recovering);
  const previous = readFileSync(state.backup);
  const plist = parsePlist(previous);
  retargetPlist(plist, plist.WorkingDirectory);
  await deployTransaction({
    prepare: async () => {
      await preview(plist, plist.WorkingDirectory, state.previousBuildId);
      cancellation.check();
      if (!readFileSync(plistPath).equals(live.bytes)) throw new DeploymentError("확인 중 웹 설정이 바뀌었습니다.");
    },
    activate: async () => { await switchWeb(previous); },
    verify: () => smoke(3100, plist.WorkingDirectory, state.previousBuildId),
    restore: async () => { await switchWeb(live.bytes); },
    verifyRestored: () => smoke(3100, live.cwd, live.buildId, true),
  });
  unlinkSync(record);
  // A recovery may supersede an older successful record; do not offer it as current rollback.
  if (recovering && existsSync(statePath)) unlinkSync(statePath);
  say(`이전 웹 복구 완료: ${git(["rev-parse", "HEAD"], plist.WorkingDirectory)}`);
  if (state.database) say("DB 구조와 데이터는 유지했습니다. 웹만 이전 버전으로 복구했습니다.");
}
async function main() {
  const { action, args } = parsePrelaunchArgs(process.argv.slice(2));
  if (action === "help" || action === "--help") {
    say("출시 전 웹/API/환경/추가형 DB 빠른 배포\nplan | deploy [--ref <커밋, 기본 origin/master>] [--env-file <비공개 dotenv>] [--db-config <비공개 full-local 설정>] [--db-baseline <비공개 JSON>] [--db-compatible] [--verify-script <package.json 검증 명령>]\nstatus | rollback\nplan은 변경 파일과 환경 키 이름만 표시합니다. deploy는 설치·빌드·확인 후 웹을 교체합니다.\n환경 파일은 Git 저장소 밖 0600 권한이어야 합니다. 키 값은 명령 인수에 넣지 마세요.\nAPI 변경은 test:product를 자동 실행하며 --verify-script로 추가 검증을 지정할 수 있습니다.\nDB 변경은 격리 검증·백업·트랜잭션으로 반영하며, 웹 rollback으로 DB를 되돌리지 않습니다.\n검토한 긴급 수정은 --ref 대신 --reviewed-ref <현재 웹 후속 커밋 40자리 SHA>를 사용합니다.");
    return;
  }
  if (process.platform !== "darwin") throw new DeploymentError("macOS 웹 서버에서 실행해야 합니다.");
  if (!["plan", "deploy", "status", "rollback"].includes(action) || (["status", "rollback"].includes(action) && args.length)) throw new DeploymentError("잘못된 명령입니다. --help를 확인하세요.");
  const options = parsePrelaunchOptions(args);
  if (git(["rev-parse", "--show-toplevel"]) !== repository || !/^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)netsus\/homecook(?:\.git)?$/u.test(git(["remote", "get-url", "origin"]))) throw new DeploymentError("배포 저장소는 netsus/homecook Git 저장소여야 합니다.");
  if (action === "status") {
    const { cwd, ref, buildId } = current();
    const loaded = spawnSync("/bin/launchctl", ["print", service], { stdio: "ignore" }).status === 0;
    const record = existsSync(recoveryPath) ? recoveryPath : statePath;
    const database = existsSync(databaseStatePath) ? JSON.parse(readFileSync(databaseStatePath, "utf8")) : existsSync(record) ? JSON.parse(readFileSync(record, "utf8")).database ?? null : null;
    say(JSON.stringify({ cwd, ref, buildId, loaded, database, rollbackAvailable: existsSync(statePath) || existsSync(recoveryPath), recoveryPending: existsSync(recoveryPath) }, null, 2));
    return;
  }
  if (action === "plan") {
    const selection = plan(options.ref, current(), options.refOption, options.verifyScript);
    const environmentKeys = Object.keys(readEnvironmentPatch(options.envFile, repository)).sort();
    say(JSON.stringify({ ...selection, environmentKeys, database: { required: selection.scope.database.length > 0 || Boolean(options.dbConfig), configProvided: Boolean(options.dbConfig), requiresCompatibilityConfirmation: (selection.scope.database.length > 0 || Boolean(options.dbConfig)) && !options.dbCompatible, note: "DB 이력·현재 스키마·추가형 변경 여부는 배포 시 대상 커밋에서 검사합니다." } }, null, 2));
    return;
  }
  mkdirSync(join(root, "releases"), { recursive: true, mode: 0o700 });
  chmodSync(root, 0o700);
  const lock = join(root, "deploy.lock");
  try { mkdirSync(lock, { mode: 0o700 }); } catch { throw new DeploymentError("배포 잠금이 있습니다. 다른 배포 종료 여부를 확인하세요."); }
  const onSignal = () => { void cancellation.request(); };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  try {
    const logPath = join(root, `${action}-${Date.now()}.log`);
    logFd = openSync(logPath, "wx", 0o600);
    say(`비공개 로그: ${logPath}`);
    if (action === "deploy") { await logged("git", ["-C", repository, "fetch", "origin", "master"], {}); await deploy(options); }
    else await rollback();
  } finally {
    await cancellation.drain();
    if (logFd !== undefined) closeSync(logFd);
    rmdirSync(lock);
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
  }
}
main().catch((error) => {
  process.stderr.write(`${error instanceof DeploymentError ? error.message : "배포 도구 실패. 비공개 로그와 웹 상태를 확인하세요."}\n`);
  process.exitCode = 1;
});
