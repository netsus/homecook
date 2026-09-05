import { existsSync, lstatSync, readFileSync, realpathSync, writeFileSync, chmodSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseEnv } from "node:util";
import { DeploymentError } from "./prelaunch-web-deploy.mjs";

const externalSecrets = new Set(["HOMECOOK_FULL_LOCAL_SECRET_DIR", "AUTH_FLOW_HMAC_KEY", "DATA_SUPABASE_SECRET_KEY", "LOCAL_SUPABASE_SECRET_KEY", "HOMECOOK_SESSION_ATTESTATION_HMAC_KEY_V1", "HOMECOOK_SESSION_GENERATION_HMAC_KEY_V2"]);

export function validateEnvironmentPatch(patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (!/^[A-Z][A-Z0-9_]*$/u.test(key)
      || /^(?:HOME|PATH|TMPDIR|LANG|LC_ALL|USER|LOGNAME|SHELL|ENV|BASH_ENV|GIT_.+|COREPACK_.+|NODE_.+|LD_.+|DYLD_.+|NPM_.+|PNPM_.+|HOMECOOK_RELEASE_.+|HOMECOOK_DEPLOY_.+)$/u.test(key)
      || /(?:QA|FIXTURE|MOCK|BYPASS)/u.test(key)
      || /^NEXT_PUBLIC_.*(?:SECRET|PASSWORD|PRIVATE|SERVICE_ROLE|HMAC)/u.test(key)
      || externalSecrets.has(key)) throw new DeploymentError(`웹 환경 파일에서 변경할 수 없는 키: ${key}`);
    if (["HOMECOOK_AUTH_AUTHORITY", "HOMECOOK_DATA_AUTHORITY"].includes(key) && value !== "local") throw new DeploymentError(`${key}는 local을 유지해야 합니다.`);
    if (["DATA_SUPABASE_URL", "LOCAL_SUPABASE_INTERNAL_URL"].includes(key)) {
      let parsed;
      try { parsed = new URL(value); } catch { throw new DeploymentError(`로컬 URL 형식이 잘못되었습니다: ${key}`); }
      if (!["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname) || !["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) throw new DeploymentError(`${key}는 로컬 데이터 서버를 유지해야 합니다.`);
    }
    if (value.includes("\0")) throw new DeploymentError(`환경 값 형식이 잘못되었습니다: ${key}`);
  }
  return patch;
}

export function readEnvironmentPatch(path, repositoryRoot) {
  if (!path) return {};
  const requested = resolve(path);
  const stat = lstatSync(requested);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid()) throw new DeploymentError("환경 파일은 현재 사용자가 소유한 실제 일반 파일이어야 합니다.");
  if ((stat.mode & 0o777) !== 0o600) throw new DeploymentError("환경 파일 권한은 0600이어야 합니다.");
  const real = realpathSync(requested);
  const repository = realpathSync(repositoryRoot);
  for (const candidate of [real, requested]) for (let directory = dirname(candidate); ; directory = dirname(directory)) {
    if (directory === repository || existsSync(join(directory, ".git"))) throw new DeploymentError("환경 파일을 Git 저장소 밖의 비공개 폴더에 두세요.");
    if (directory === dirname(directory)) break;
  }
  return validateEnvironmentPatch(parseEnv(readFileSync(real, "utf8")));
}

function dotenvValue(value) {
  // Node's dotenv reader supports literal multiline values and three quote forms.
  for (const quote of ["'", "`", '"']) {
    const serialized = `${quote}${value}${quote}`;
    if (!value.includes(quote) && parseEnv(`VALUE=${serialized}`).VALUE === value) return serialized;
  }
  throw new DeploymentError("환경 값을 dotenv 파일에 손실 없이 저장할 수 없습니다. 따옴표·역슬래시 조합을 확인하세요.");
}

export function applyEnvironmentPatch(checkout, plist, patch) {
  if (Object.keys(patch).length === 0) return plist;
  validateEnvironmentPatch(patch);
  const path = join(checkout, ".env.production.local");
  const existing = existsSync(path) ? parseEnv(readFileSync(path, "utf8")) : {};
  const bytes = Object.entries({ ...existing, ...patch }).map(([key, value]) => `${key}=${dotenvValue(value)}`).join("\n");
  writeFileSync(path, `${bytes}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
  return { ...plist, EnvironmentVariables: { ...plist.EnvironmentVariables, ...patch } };
}
