import { isDeepStrictEqual } from "node:util";
import { dirname, join } from "node:path";

export class DeploymentError extends Error {}

export function fetchPrelaunchLanding(origin) {
  return fetch(`${origin}/beta?ad_variant=a`, { redirect: "error", signal: AbortSignal.timeout(2500) });
}

export function prelaunchChangedFiles(git, from, to) {
  return git(["diff", "--name-only", "--no-renames", "-z", from, to]).split("\0").filter(Boolean);
}

export function classifyPrelaunchScope(files, before, after) {
  const scope = { web: [], database: [], support: [], api: [] };
  const support = /^(?:docs\/|tests\/|ui\/|marketing\/|\.github\/|\.agents\/|\.claude\/|\.codex\/|\.opencode\/|\.workflow-v2\/)|^(?:AGENTS|CLAUDE|README)\.md$|^opencode\.json$|^scripts\/(?:(?:lib\/)?marketing-validation-[a-z-]+|ci-path-filter|deploy-prelaunch-web|install-prelaunch-deploy|install-dev-deploy|lib\/dev-deploy-launcher|lib\/prelaunch-[a-z-]+)\.mjs$/u;
  const exactSupport = new Set([
    "design-qa.md",
    "scripts/generate-mumeok-icon-edges.mjs",
    "scripts/lib/validate-workflow-v2.mjs",
    "scripts/lib/ingredient-conversion-domain.mjs",
    "scripts/reconcile-recipe-nutrition-v2-data.mjs",
    "scripts/run-recipe-nutrition-postgres-integration.mjs",
    "scripts/sql/reconcile-recipe-nutrition-v2-data-20260915.sql",
    "scripts/validate-account-session-generation-inventory.mjs",
    "scripts/youtube-real-app-route-smoke.mjs",
  ]);
  const web = /^(?:app|components|lib|stores|types|hooks|public)\/|^scripts\/lib\/recipe-nutrition-predecessor\.mjs$|^(?:middleware\.[cm]?[jt]s|next\.config\.[cm]?[jt]s|tsconfig\.json|postcss\.config\.[cm]?js|package\.json|pnpm-lock\.yaml|\.env\.example)$/u;
  const denied = [];
  for (const file of files) {
    if (/^supabase\/migrations\/\d+_[^/]+\.sql$/u.test(file)) scope.database.push(file);
    else if (support.test(file) || exactSupport.has(file)) scope.support.push(file);
    else if (web.test(file)) scope.web.push(file);
    else denied.push(file);
  }
  if (denied.length) throw new DeploymentError(`빠른 웹/DB 배포에서 허용하지 않는 서버 구성 변경: ${denied.join(", ")}`);
  const dependencyKeys = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies", "pnpm", "overrides", "resolutions", "packageManager"];
  if ((dependencyKeys.some((key) => !isDeepStrictEqual(before[key], after[key])) || files.includes("pnpm-lock.yaml"))
    && (!files.includes("package.json") || !files.includes("pnpm-lock.yaml"))) {
    throw new DeploymentError("의존성 변경은 package.json과 pnpm-lock.yaml을 함께 변경해야 합니다.");
  }
  if (after.scripts?.build !== "next build" || (after.scripts?.start !== undefined && after.scripts.start !== "node scripts/start-production.mjs")) {
    throw new DeploymentError("빠른 배포는 기본 Next.js build/start 실행 계약을 유지해야 합니다.");
  }
  scope.api = scope.web.filter((file) => /^app\/api\/|^lib\/(?:server|api|auth|supabase)(?:\/|[.-])|^scripts\/lib\/recipe-nutrition-predecessor\.mjs$|^middleware\.|\/route\.[cm]?[jt]sx?$/u.test(file));
  return scope;
}

// Kept for callers of the original landing deployment helper.
export function assertFrontendScope(files, before, after) {
  return classifyPrelaunchScope(files, before, after);
}

export function parsePrelaunchOptions(args) {
  /** @type {{ref: string, refOption: string, envFile?: string, dbConfig?: string, dbBaseline?: string, dbCompatible?: boolean, verifyScript?: string, testScript?: string, alreadyAppliedDb?: boolean, skipAutomatedTests?: boolean, reviewedRepairReadiness?: boolean, reviewedBetaReadiness?: boolean}} */
  const options = { ref: "origin/master", refOption: "--ref" };
  const names = { "--env-file": "envFile", "--db-config": "dbConfig", "--db-baseline": "dbBaseline", "--verify-script": "verifyScript", "--test-script": "testScript" };
  const seen = new Set();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const flag = { "--db-compatible": "dbCompatible", "--already-applied-db": "alreadyAppliedDb", "--skip-automated-tests": "skipAutomatedTests", "--reviewed-repair-readiness": "reviewedRepairReadiness", "--reviewed-beta-readiness": "reviewedBetaReadiness" }[key];
    if (flag) {
      if (options[flag]) throw new DeploymentError("중복된 배포 옵션입니다.");
      options[flag] = true;
      index -= 1;
      continue;
    }
    const isRef = ["--ref", "--reviewed-ref"].includes(key);
    const identity = isRef ? "ref" : names[key];
    const value = args[index + 1];
    if (!identity || seen.has(identity) || !value || value.startsWith("--")) throw new DeploymentError("잘못되거나 중복된 배포 옵션입니다. --help를 확인하세요.");
    seen.add(identity);
    options[identity] = value;
    if (isRef) options.refOption = key;
  }
  if (options.alreadyAppliedDb && options.dbBaseline) throw new DeploymentError("이미 적용된 DB 확인에는 baseline을 새로 만들 수 없습니다.");
  if (options.reviewedRepairReadiness && !options.alreadyAppliedDb) throw new DeploymentError("검토한 복구 배포에는 --already-applied-db가 필요합니다.");
  if (options.reviewedBetaReadiness && !options.alreadyAppliedDb) throw new DeploymentError("검토한 베타 배포에는 --already-applied-db가 필요합니다.");
  if (options.reviewedBetaReadiness && options.reviewedRepairReadiness) throw new DeploymentError("서로 다른 한정 배포 검증을 함께 지정할 수 없습니다.");
  if (options.skipAutomatedTests && (options.testScript || options.verifyScript)) throw new DeploymentError("테스트 생략과 검증 스크립트는 함께 지정할 수 없습니다.");
  if (options.testScript && !/^test(?::[a-z0-9:_-]+)?$/u.test(options.testScript)) throw new DeploymentError("--test-script에는 package.json의 test 명령 이름이 필요합니다.");
  if ((options.dbBaseline || options.dbCompatible || options.alreadyAppliedDb) && !options.dbConfig) throw new DeploymentError("DB 추가 옵션에는 --db-config가 함께 필요합니다.");
  return options;
}

export function prelaunchVerificationScripts(scope, manifest, verifyScript, skipAutomatedTests = false, testScript) {
  if (skipAutomatedTests && (verifyScript || testScript)) throw new DeploymentError("테스트 생략과 검증 스크립트는 함께 지정할 수 없습니다.");
  if (testScript && !/^test(?::[a-z0-9:_-]+)?$/u.test(testScript)) throw new DeploymentError("기본 검증에는 test 명령 이름이 필요합니다.");
  const primary = testScript ?? (scope.api.length && !skipAutomatedTests ? "test:product" : undefined);
  const scripts = [...new Set([...(primary ? [primary] : []), ...(verifyScript ? [verifyScript] : [])])];
  for (const script of scripts) {
    if (!/^(?:test(?::[a-z0-9:_-]+)?|verify:[a-z0-9:_-]+|marketing:(?:preview|production):[a-z0-9:_-]+)$/u.test(script)
      || typeof manifest.scripts?.[script] !== "string" || !manifest.scripts[script].trim()) throw new DeploymentError(`대상 package.json에 유효한 검증 명령이 필요합니다: ${script}`);
  }
  return scripts;
}

export function prelaunchVerificationEnvironment(script, environment) {
  if (script !== "test" && !script.startsWith("test:")) return { ...environment };
  const execution = Object.fromEntries(["HOME", "PATH", "TMPDIR", "LANG", "LC_ALL", "USER", "LOGNAME", "SHELL", "CI"]
    .filter((key) => environment[key] !== undefined).map((key) => [key, environment[key]]));
  return { ...execution, NODE_ENV: "test" };
}

/** @param {{scripts: string[], run: (script: string) => Promise<void>}} options */
export async function runPrelaunchVerification({ scripts, run }) {
  for (const script of scripts) await run(script);
}

export function shouldRequireDatabaseRecovery(record) {
  return !(record.changed === false && record.outcome === "rolled_back");
}

/** @param {{required: boolean, open: () => unknown, gate?: () => Promise<void>, compatibilityConfirmed?: boolean, onApplied?: (record: Record<string, unknown>) => Promise<void>}} options */
export async function prepareDatabaseDeployment({ required, open, gate, compatibilityConfirmed, onApplied = async () => {} }) {
  if (!required) return null;
  if (compatibilityConfirmed !== true) throw new DeploymentError("DB 변경은 --db-compatible 호환성 확인이 필요합니다.");
  if (typeof gate !== "function") throw new DeploymentError("DB 배포에는 격리 검증 단계가 필요합니다.");
  const database = await open();
  try {
    const plan = await database.plan();
    if (plan.baselineRequired) throw new DeploymentError("최초 DB 배포에는 실제 반영 이력을 확인한 --db-baseline <비공개 JSON>이 필요합니다.");
    if (plan.migrationMode !== "additive") throw new DeploymentError("이전 웹과 호환되지 않는 DB 변경은 별도 배포 절차가 필요합니다.");
    await gate();
    let applied;
    try { applied = await database.apply(); } catch (error) {
      if (error.databaseState) await onApplied({ ...error.databaseState, backwardCompatible: ["committed", "rolled_back"].includes(error.databaseState.outcome) });
      throw error;
    }
    const record = { ...applied, backwardCompatible: true };
    await onApplied(record);
    await database.verify();
    return record;
  } finally { await database.close(); }
}

export function retargetPlist(plist, checkout) {
  const args = plist.ProgramArguments;
  if (plist.Label !== "com.homecook.production" || !Array.isArray(args)
    || args.length !== 6 || args[1] !== join(plist.WorkingDirectory, "scripts/start-production.mjs")
    || !["-H", "--hostname"].includes(args[2]) || args[3] !== "127.0.0.1"
    || !["-p", "--port"].includes(args[4]) || args[5] !== "3100") {
    throw new DeploymentError("기존 웹 설정은 com.homecook.production / 127.0.0.1:3100이어야 합니다.");
  }
  return {
    ...plist,
    WorkingDirectory: checkout,
    ProgramArguments: [args[0], join(checkout, "scripts/start-production.mjs"), ...args.slice(2)],
  };
}

export function retargetRound2Release(plist, readinessPath, releaseSha) {
  const environment = plist.EnvironmentVariables;
  const hasRound2Release = Boolean(environment?.MUMEOK_ROUND2_RELEASE_SHA || environment?.MUMEOK_ROUND2_READINESS_PATH);
  if (!hasRound2Release) return plist;
  if (!environment?.MUMEOK_ROUND2_RELEASE_SHA || !environment?.MUMEOK_ROUND2_READINESS_PATH || !environment?.MUMEOK_ROUND2_REPOSITORY_ROOT) {
    throw new DeploymentError("R2 운영 repository/release/readiness 환경값은 함께 있어야 합니다.");
  }
  if (!/^[a-f0-9]{40}$/u.test(releaseSha) || typeof readinessPath !== "string" || !readinessPath.startsWith("/") || typeof plist.WorkingDirectory !== "string" || !plist.WorkingDirectory.startsWith("/")) {
    throw new DeploymentError("R2 운영 repository/release/readiness 대상이 올바르지 않습니다.");
  }
  return {
    ...plist,
    EnvironmentVariables: {
      ...environment,
      MUMEOK_ROUND2_REPOSITORY_ROOT: plist.WorkingDirectory,
      MUMEOK_ROUND2_RELEASE_SHA: releaseSha,
      MUMEOK_ROUND2_READINESS_PATH: readinessPath,
    },
  };
}

export function inheritRound2Readiness({ readiness, previous, next, liveSha, releaseSha, files, databaseDeployment = false }) {
  const before = previous.EnvironmentVariables ?? {};
  const after = next.EnvironmentVariables ?? {};
  if (!readiness || typeof readiness !== "object" || Array.isArray(readiness) || readiness.version !== 1
    || readiness.profile !== "production" || readiness.origin !== "https://app.mumeok.kr" || readiness.hostname !== "app.mumeok.kr"
    || typeof readiness.verified_at !== "string" || !Number.isFinite(Date.parse(readiness.verified_at))
    || !/^[a-f0-9]{40}$/u.test(liveSha) || !/^[a-f0-9]{40}$/u.test(releaseSha)
    || readiness.release_sha !== liveSha || before.MUMEOK_ROUND2_RELEASE_SHA !== liveSha
    || before.MUMEOK_ROUND2_REPOSITORY_ROOT !== previous.WorkingDirectory
    || !before.MUMEOK_ROUND2_READINESS_PATH?.startsWith("/")) {
    throw new DeploymentError("R2 readiness가 현재 실행 중인 checkout과 release SHA에 연결되어 있지 않습니다.");
  }
  // Proofs cover these code, SQL, consent and ingress boundaries. Changed boundaries need fresh evidence.
  const protectedSources = [
    /^(?:app\/(?:beta|privacy|api\/v1\/marketing|%5F_ops\/r2-preflight)\/|app\/(?:layout\.|globals\.css$)|components\/marketing\/|lib\/(?:marketing[./-]|supabase\/|server\/(?:marketing-|recording-page\.|homeflow-page\.|full-local-auth\/|hybrid-auth\/))|types\/marketing-)/u,
    /^(?:supabase\/|infra\/|scripts\/sql\/|scripts\/(?:start-production\.mjs|lib\/(?:start-production-runtime|production-data-quality|full-local-|marketing-round2)))/u,
    /^(?:middleware\.|proxy\.|next\.config\.|tsconfig\.json$|package\.json$|pnpm-lock\.yaml$|\.env(?:\.|$))/u,
  ];
  if (databaseDeployment || !Array.isArray(files) || files.some(file => protectedSources.some(pattern => pattern.test(file)))) {
    throw new DeploymentError("R2 보호 코드·SQL·동의·라우팅 변경은 기존 readiness를 승계할 수 없습니다.");
  }
  const protectedEnvironment = /^(?:(?:NEXT_PUBLIC_)?(?:MUMEOK_|MARKETING_|SUPABASE_|TURNSTILE_)|(?:DATA|LOCAL)_SUPABASE_|HOMECOOK_(?:AUTH|DATA|FULL_LOCAL|SESSION)|NEXT_PUBLIC_SITE_URL$|NODE_ENV$)/u;
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  if ([...keys].some(key => protectedEnvironment.test(key) && before[key] !== after[key])
    || !isDeepStrictEqual({ ...retargetPlist(previous, next.WorkingDirectory), EnvironmentVariables: undefined }, { ...next, EnvironmentVariables: undefined })) {
    throw new DeploymentError("R2 키·대상·실행 설정 변경은 기존 readiness를 승계할 수 없습니다.");
  }
  // Only the new checkout binding changes; original proof files, hashes and verification times survive unchanged.
  return { ...readiness, release_sha: releaseSha };
}

// Preparation includes build + isolated GET checks. No service mutation may happen there.
export async function deployTransaction({ prepare, activate, verify, restore, verifyRestored }) {
  try { await prepare(); } catch (error) {
    const detail = error instanceof DeploymentError ? ` ${error.message}` : " 비공개 배포 로그를 확인하세요.";
    throw new DeploymentError(`준비 실패: 실행 중인 웹은 변경하지 않았습니다.${detail}`);
  }
  try {
    await activate();
    await verify();
  } catch {
    try {
      await restore();
      await verifyRestored();
    } catch {
      throw new DeploymentError("웹 교체 실패, 자동 복구도 실패했습니다. 저장된 이전 plist로 rollback을 실행하세요.");
    }
    throw new DeploymentError("웹 교체 실패, 이전 웹 복구 완료. 비공개 배포 로그를 확인하세요.");
  }
}

export function productionEnvironment(plist, source = process.env) {
  const operatingSystem = Object.fromEntries(["HOME", "PATH", "TMPDIR", "LANG", "LC_ALL", "USER", "LOGNAME", "SHELL"]
    .filter((key) => source[key] !== undefined).map((key) => [key, source[key]]));
  const env = { ...operatingSystem, ...plist.EnvironmentVariables };
  return { ...env, PATH: `${dirname(plist.ProgramArguments[0])}:${env.PATH ?? "/usr/bin:/bin"}` };
}

export function assertRollbackTarget(live, state, recovering) {
  const matchesTarget = live.cwd === state.checkout && live.buildId === state.buildId && live.plistHash === state.targetPlistHash;
  const matchesPrevious = recovering && live.cwd === state.previousCwd && live.buildId === state.previousBuildId && live.plistHash === state.previousPlistHash;
  if (!matchesTarget && !matchesPrevious) throw new DeploymentError("기록 이후 다른 웹 배포가 감지되어 rollback을 중단합니다.");
}

export function createCancellation() {
  let cancelled = false;
  let draining;
  const stops = new Set();
  return {
    check() { if (cancelled) throw new DeploymentError("배포 취소 요청을 처리했습니다."); },
    track(stop) { stops.add(stop); return () => stops.delete(stop); },
    request() {
      cancelled = true;
      draining ??= Promise.allSettled([...stops].map((stop) => stop()));
      return draining;
    },
    drain: () => draining ?? Promise.resolve(),
  };
}
export function prelaunchBuildEnvironment(plist, releaseName) {
  return { ...productionEnvironment(plist), CI: "true", HOMECOOK_RELEASE_BUILD_ID: `prelaunch-${releaseName}` };
}

export function parsePrelaunchArgs(argv) {
  const [action = "help", ...args] = argv;
  return { action, args: args[0] === "--" ? args.slice(1) : args };
}

export async function restartLaunchAgent({ isLoaded, bootout, writePlist, bootstrap, wait }) {
  if (await isLoaded()) await bootout();
  for (let attempt = 0; await isLoaded(); attempt += 1) {
    if (attempt === 20) throw new DeploymentError("이전 웹 등록의 종료를 기다리다 시간이 초과했습니다.");
    await wait(500);
  }
  await writePlist();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = await bootstrap();
    if (code === 0) return;
    if (code !== 5) throw new DeploymentError("웹 등록에 실패했습니다. 비공개 배포 로그를 확인하세요.");
    if (attempt < 19) await wait(500);
  }
  throw new DeploymentError("웹 등록 재시도 시간이 초과했습니다. 비공개 배포 로그를 확인하세요.");
}

export function prelaunchSourceAncestry(option, ref, liveRef, target) {
  if (option === "--ref") return [target, "origin/master"];
  if (option !== "--reviewed-ref" || !/^[a-f0-9]{40}$/u.test(ref) || ref !== target) {
    throw new DeploymentError("검토한 출시 전 수정은 --reviewed-ref에 정확한 40자리 커밋 SHA를 지정해야 합니다.");
  }
  return [liveRef, target];
}
