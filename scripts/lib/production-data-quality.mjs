import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { isIP } from "node:net";
import { isAbsolute, join, resolve } from "node:path";
import {
  FULL_LOCAL_SECRET_NAMES,
  validateExternalSecretDirectory,
  validateFullLocalProductionConfig,
} from "./full-local-production-runtime.mjs";

const PRODUCTION_ENVS = new Set(["production", "preview-production"]);

const FORBIDDEN_ENABLED_FLAGS = [
  "HOMECOOK_ENABLE_QA_FIXTURES",
  "NEXT_PUBLIC_HOMECOOK_ENABLE_QA_FIXTURES",
  "HOMECOOK_ENABLE_LOCAL_DEV_AUTH",
  "NEXT_PUBLIC_HOMECOOK_ENABLE_LOCAL_DEV_AUTH",
  "NEXT_PUBLIC_HOMECOOK_ENABLE_LOCAL_GOOGLE_OAUTH",
];

const FORBIDDEN_TEXT_PATTERNS = [
  { id: "loro", label: "LoRo", pattern: /loro/iu },
  { id: "test-ko", label: "테스트", pattern: /테스트/u },
  { id: "local-ko", label: "로컬", pattern: /로컬/u },
  { id: "tester-ko", label: "테스터", pattern: /테스터/u },
  { id: "fixture", label: "fixture", pattern: /fixture/iu },
  { id: "mock", label: "mock", pattern: /mock/iu },
  { id: "dummy", label: "dummy", pattern: /dummy/iu },
  { id: "demo", label: "demo", pattern: /demo/iu },
  { id: "sample", label: "sample", pattern: /sample/iu },
];

const FORBIDDEN_URL_PATTERNS = [
  { id: "localhost", label: "localhost", pattern: /localhost|127\.0\.0\.1|\[::1\]/iu },
  { id: "example-domain", label: "example domain", pattern: /(^|\/\/|\.)(example\.com|example\.org|example\.net)(\/|$)/iu },
  { id: "placeholder", label: "placeholder", pattern: /placeholder|placehold\.co|picsum\.photos/iu },
];

export const PRODUCTION_DATA_SCAN_TABLES = [
  {
    table: "recipes",
    columns: "id, title, description, thumbnail_url, source_type, visibility, deleted_at",
    textFields: ["title", "description"],
    urlFields: ["thumbnail_url"],
    idField: "id",
  },
  {
    table: "users",
    columns: "id, nickname, email, social_id, profile_image_url",
    textFields: ["nickname", "email", "social_id"],
    urlFields: ["profile_image_url"],
    idField: "id",
  },
  {
    table: "recipe_books",
    columns: "id, name, book_type, user_id, cover_image_url",
    textFields: ["name"],
    urlFields: ["cover_image_url"],
    idField: "id",
  },
  {
    table: "ingredients",
    columns: "id, standard_name, category",
    textFields: ["standard_name"],
    urlFields: [],
    idField: "id",
  },
];

const LOCAL_MAC_FULL_LOCAL_CONFIG = "infra/full-local-supabase/.env.production.local";
const LOCAL_MAC_FULL_LOCAL_CONFIG_EXAMPLE = "infra/full-local-supabase/.env.production.example";
const LOCAL_MAC_FULL_LOCAL_PROJECT = "homecook-full-local-isolated";

const LOCAL_SCAN_COLUMNS = Object.freeze(Object.fromEntries(
  PRODUCTION_DATA_SCAN_TABLES.map((table) => [
    table.table,
    Object.freeze(table.columns.split(",").map((column) => column.trim())),
  ]),
));

export function loadProductionEnvFiles({
  rootDir = process.cwd(),
  loadEnvFile = (filePath) => process.loadEnvFile(filePath),
} = {}) {
  const loadedFiles = [];

  for (const fileName of [".env.production.local", ".env.local", ".env.production", ".env"]) {
    const filePath = resolve(rootDir, fileName);
    if (!existsSync(filePath)) continue;
    loadEnvFile(filePath);
    loadedFiles.push(filePath);
  }

  return loadedFiles;
}

export function parseProductionDataQualityArgs(argv) {
  const args = {
    json: false,
    limit: 500,
    requireDb: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--") {
      continue;
    }

    if (arg === "--json") {
      args.json = true;
      continue;
    }

    if (arg === "--require-db") {
      args.requireDb = true;
      continue;
    }

    if (arg === "--limit") {
      const parsed = Number(argv[index + 1]);
      if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error("--limit must be a positive integer.");
      }
      args.limit = parsed;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function isTruthyFlag(value) {
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

export function isProductionLikeEnv(env = process.env) {
  return (
    PRODUCTION_ENVS.has(env.NODE_ENV ?? "")
    || env.VERCEL_ENV === "production"
    || env.HOMECOOK_VALIDATE_PRODUCTION_DATA === "1"
  );
}

export function isLocalUrl(value) {
  if (!value) return false;

  try {
    const url = new URL(value);
    const hostname = url.hostname
      .toLowerCase()
      .replace(/^\[/u, "")
      .replace(/\]$/u, "")
      .replace(/\.+$/u, "");

    if (hostname === "localhost" || hostname === "::1") {
      return true;
    }

    if (isIP(hostname) === 4) {
      return hostname.startsWith("127.");
    }

    const mappedIpv4 = hostname.match(
      /^::ffff:([0-9a-f]{1,4}):[0-9a-f]{1,4}$/u,
    );
    if (!mappedIpv4) {
      return false;
    }

    const leadingIpv4Bits = Number.parseInt(mappedIpv4[1], 16);
    return leadingIpv4Bits >= 0x7f00 && leadingIpv4Bits <= 0x7fff;
  } catch {
    return false;
  }
}

export function validateProductionEnv(env = process.env) {
  const errors = [];
  const warnings = [];
  const productionLike = isProductionLikeEnv(env);
  const productionExposure = env.HOMECOOK_PRODUCTION_EXPOSURE;
  const localOnlyProduction = productionExposure === "local-only";
  const localOnlyOrigins =
    localOnlyProduction
    && isLocalUrl(env.NEXT_PUBLIC_APP_URL)
    && isLocalUrl(env.NEXT_PUBLIC_SITE_URL);

  if (!productionLike) {
    warnings.push("production-like env가 아니므로 운영 데이터 게이트는 env sanity만 확인합니다.");
  }

  if (productionLike) {
    if (productionExposure && !["local-only", "public"].includes(productionExposure)) {
      errors.push({
        code: "PRODUCTION_EXPOSURE_INVALID",
        message: "HOMECOOK_PRODUCTION_EXPOSURE must be local-only or public.",
      });
    }

    for (const key of FORBIDDEN_ENABLED_FLAGS) {
      if (isTruthyFlag(env[key])) {
        errors.push({
          code: "PRODUCTION_QA_FLAG_ENABLED",
          message: `${key}=1 is not allowed in production-like environments.`,
        });
      }
    }

    if (
      env.HOMECOOK_YOUTUBE_FIXTURE_PROVIDER
      && env.HOMECOOK_YOUTUBE_FIXTURE_PROVIDER !== "0"
    ) {
      errors.push({
        code: "PRODUCTION_YOUTUBE_FIXTURE_PROVIDER_ENABLED",
        message: "HOMECOOK_YOUTUBE_FIXTURE_PROVIDER must be unset or 0 in production-like environments.",
      });
    }

    if (!localOnlyOrigins && isLocalUrl(env.NEXT_PUBLIC_SUPABASE_URL)) {
      errors.push({
        code: "PRODUCTION_LOCAL_SUPABASE_URL",
        message: "NEXT_PUBLIC_SUPABASE_URL points to localhost in a production-like environment.",
      });
    }

    if (
      !localOnlyProduction
      && (isLocalUrl(env.NEXT_PUBLIC_APP_URL) || isLocalUrl(env.NEXT_PUBLIC_SITE_URL))
    ) {
      errors.push({
        code: "PRODUCTION_LOCAL_APP_URL",
        message: "NEXT_PUBLIC_APP_URL/NEXT_PUBLIC_SITE_URL must not point to localhost in production-like environments.",
      });
    }

    if (localOnlyProduction) {
      warnings.push("local-only production은 현재 Mac 밖으로 공개하지 않아야 합니다.");
    }
  }

  return { errors, productionLike, warnings };
}

export function findForbiddenValues(row, tableConfig) {
  const findings = [];

  for (const field of tableConfig.textFields) {
    const value = row[field];
    if (typeof value !== "string" || value.trim().length === 0) continue;

    for (const rule of FORBIDDEN_TEXT_PATTERNS) {
      if (rule.pattern.test(value)) {
        findings.push({ field, rule: rule.id, label: rule.label, value });
      }
    }
  }

  for (const field of tableConfig.urlFields) {
    const value = row[field];
    if (typeof value !== "string" || value.trim().length === 0) continue;

    for (const rule of FORBIDDEN_URL_PATTERNS) {
      if (rule.pattern.test(value)) {
        findings.push({ field, rule: rule.id, label: rule.label, value });
      }
    }
  }

  return findings;
}

export function buildDataQualityFindings(rowsByTable) {
  const findings = [];

  for (const tableConfig of PRODUCTION_DATA_SCAN_TABLES) {
    const rows = rowsByTable[tableConfig.table] ?? [];

    for (const row of rows) {
      for (const match of findForbiddenValues(row, tableConfig)) {
        findings.push({
          code: "FORBIDDEN_PRODUCTION_DATA_PATTERN",
          table: tableConfig.table,
          id: String(row[tableConfig.idField] ?? ""),
          field: match.field,
          rule: match.rule,
          message: `${tableConfig.table}.${match.field} contains ${match.label}.`,
        });
      }
    }
  }

  return findings;
}

function scanFailure() {
  return {
    errors: [{
      code: "PRODUCTION_LOCAL_DB_SCAN_FAILED",
      message: "Local Mac production data scan failed.",
    }],
    skipped: false,
    skipReason: null,
    findings: [],
  };
}

function parseFullLocalConfig(text) {
  const config = {};
  for (const rawLine of String(text).split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/u.exec(line);
    if (!match) throw new Error("Invalid full-local config.");
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    config[match[1]] = value;
  }
  return config;
}

function assertMode(stat, expected, kind) {
  if ((stat.mode & 0o777) !== expected) {
    throw new Error(`Invalid ${kind} mode.`);
  }
}

function isRegularFile(stat) {
  return typeof stat.isFile === "function"
    ? stat.isFile()
    : (stat.mode & 0o170000) === 0o100000;
}

function isDirectory(stat) {
  return typeof stat.isDirectory === "function"
    ? stat.isDirectory()
    : (stat.mode & 0o170000) === 0o040000;
}

function isSymbolicLink(stat) {
  return typeof stat.isSymbolicLink === "function" && stat.isSymbolicLink();
}

function assertLocalScannerPaths({
  configPath,
  configExamplePath,
  repositoryRoot,
  secretDirectory,
  statImpl,
  realpathImpl,
}) {
  if (
    typeof secretDirectory !== "string"
    || secretDirectory.trim().length === 0
    || !isAbsolute(configPath)
    || !isAbsolute(configExamplePath)
    || !isAbsolute(secretDirectory)
  ) {
    throw new Error("Full-local paths must be absolute.");
  }

  const configStat = statImpl(configPath);
  if (isSymbolicLink(configStat) || !isRegularFile(configStat)) {
    throw new Error("Full-local config must be a regular file.");
  }
  assertMode(configStat, 0o600, "config");

  const configExampleStat = statImpl(configExamplePath);
  if (isSymbolicLink(configExampleStat) || !isRegularFile(configExampleStat)) {
    throw new Error("Full-local config example must be a regular file.");
  }

  const repository = realpathImpl(repositoryRoot);
  const requestedSecretDirectory = resolve(secretDirectory);
  const validatedSecretDirectory = validateExternalSecretDirectory({
    repositoryRoot: repository,
    secretDirectory: requestedSecretDirectory,
  });
  if (realpathImpl(validatedSecretDirectory) !== requestedSecretDirectory) {
    throw new Error("Full-local secret directory alias is not allowed.");
  }

  const secretDirectoryStat = statImpl(secretDirectory);
  if (isSymbolicLink(secretDirectoryStat) || !isDirectory(secretDirectoryStat)) {
    throw new Error("Full-local secret directory must be a real directory.");
  }
  assertMode(secretDirectoryStat, 0o700, "secret directory");
}

function localScanSql(limit) {
  const queries = PRODUCTION_DATA_SCAN_TABLES.map((table) => {
    const columns = LOCAL_SCAN_COLUMNS[table.table].map((column) => `"${column}"`).join(", ");
    return `'${table.table}', COALESCE((SELECT json_agg(row_to_json(scanned) ORDER BY scanned."${table.idField}") FROM (SELECT ${columns} FROM public."${table.table}" ORDER BY "${table.idField}" LIMIT ${limit}) AS scanned), '[]'::json)`;
  });
  return [
    "BEGIN READ ONLY;",
    "SET LOCAL statement_timeout = '30s';",
    `SELECT json_build_object(${queries.join(", ")})::text;`,
    "COMMIT;",
  ].join("\n");
}

function validateRowsByTable(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid scan result.");
  }
  const expectedTables = PRODUCTION_DATA_SCAN_TABLES.map((table) => table.table).sort();
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(expectedTables)) {
    throw new Error("Invalid scan tables.");
  }
  for (const table of expectedTables) {
    if (!Array.isArray(value[table])) throw new Error("Invalid scan rows.");
    const allowedColumns = new Set(LOCAL_SCAN_COLUMNS[table]);
    for (const row of value[table]) {
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        throw new Error("Invalid scan row.");
      }
      if (Object.keys(row).some((key) => !allowedColumns.has(key))) {
        throw new Error("Unexpected scan column.");
      }
    }
  }
  return value;
}

/**
 * @param {{
 *   env?: Record<string, string | undefined>,
 * }} [options]
 */
export function shouldUseLocalMacProductionDataScan({
  env = process.env,
} = {}) {
  return env.HOMECOOK_AUTH_AUTHORITY === "local"
    && env.HOMECOOK_DATA_AUTHORITY === "local";
}

/**
 * @param {{
 *   rootDir?: string,
 *   env?: Record<string, string | undefined>,
 *   limit?: number,
 *   readFileImpl?: (path: string) => string,
 *   statImpl?: (path: string) => {
 *     mode: number,
 *     isFile?: () => boolean,
 *     isDirectory?: () => boolean,
 *     isSymbolicLink?: () => boolean,
 *   },
 *   realpathImpl?: (path: string) => string,
 *   runCommand?: (command: string, args: string[], options: Record<string, unknown>) => {
 *     status: number | null,
 *     stdout?: string | Buffer,
 *     stderr?: string | Buffer,
 *   },
 * }} [options]
 */
export async function scanLocalMacProductionData({
  rootDir = process.cwd(),
  env = process.env,
  limit = 500,
  readFileImpl = (path) => readFileSync(path, "utf8"),
  statImpl = lstatSync,
  realpathImpl = realpathSync,
  runCommand = (command, args, options) => spawnSync(command, args, options),
} = {}) {
  try {
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new Error("Invalid scan limit.");
    }
    const repositoryRoot = realpathImpl(resolve(rootDir));
    const configPath = resolve(repositoryRoot, LOCAL_MAC_FULL_LOCAL_CONFIG);
    const configExamplePath = resolve(repositoryRoot, LOCAL_MAC_FULL_LOCAL_CONFIG_EXAMPLE);
    const secretDirectory = env.HOMECOOK_FULL_LOCAL_SECRET_DIR;
    assertLocalScannerPaths({
      configPath,
      configExamplePath,
      repositoryRoot,
      secretDirectory,
      statImpl,
      realpathImpl,
    });
    const config = parseFullLocalConfig(readFileImpl(configPath));
    const configExample = parseFullLocalConfig(readFileImpl(configExamplePath));
    if (configExample.FULL_LOCAL_COMPOSE_PROJECT_NAME !== LOCAL_MAC_FULL_LOCAL_PROJECT) {
      throw new Error("Unexpected canonical compose project.");
    }
    if (
      config.FULL_LOCAL_COMPOSE_PROJECT_NAME !== LOCAL_MAC_FULL_LOCAL_PROJECT
      || config.FULL_LOCAL_SECRET_DIR !== secretDirectory
    ) {
      throw new Error("Full-local config identity mismatch.");
    }
    const secrets = Object.fromEntries(FULL_LOCAL_SECRET_NAMES.map((fileName) => {
      const secretPath = join(secretDirectory, fileName);
      const fileStat = statImpl(secretPath);
      if (isSymbolicLink(fileStat) || !isRegularFile(fileStat)) {
        throw new Error("Full-local secret must be a regular file.");
      }
      assertMode(fileStat, 0o600, "secret file");
      return [fileName, readFileImpl(secretPath)];
    }));
    validateFullLocalProductionConfig({
      config,
      configFileMode: statImpl(configPath).mode,
      secretDirectoryMode: statImpl(secretDirectory).mode,
      secrets,
    });

    const containers = runCommand("docker", [
      "ps",
      "--filter", `label=com.docker.compose.project=${LOCAL_MAC_FULL_LOCAL_PROJECT}`,
      "--filter", "label=com.docker.compose.service=postgres",
      "--filter", "status=running",
      "--filter", "health=healthy",
      "--format", "{{.ID}}",
    ], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const containerIds = String(containers.stdout ?? "")
      .split(/\r?\n/u).map((value) => value.trim()).filter(Boolean);
    if (
      containers.status !== 0
      || containerIds.length !== 1
      || !/^[a-f0-9]{12,64}$/u.test(containerIds[0])
    ) {
      throw new Error("Full-local PostgreSQL container is not uniquely healthy.");
    }

    const query = runCommand("docker", [
      "exec", "-i", containerIds[0],
      "psql", "-X", "-qAt", "-U", "supabase_admin", "-d", "postgres",
      "-v", "ON_ERROR_STOP=1",
    ], {
      encoding: "utf8",
      input: localScanSql(limit),
      maxBuffer: 16 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    });
    if (query.status !== 0) throw new Error("Full-local PostgreSQL query failed.");
    const output = String(query.stdout ?? "")
      .split(/\r?\n/u)
      .map((value) => value.trim())
      .filter(Boolean)
      .at(-1);
    const rowsByTable = validateRowsByTable(JSON.parse(output ?? ""));
    return {
      errors: [],
      skipped: false,
      skipReason: null,
      findings: buildDataQualityFindings(rowsByTable),
    };
  } catch {
    return scanFailure();
  }
}

async function scanTable(supabase, tableConfig, limit) {
  const { data, error } = await supabase
    .from(tableConfig.table)
    .select(tableConfig.columns)
    .limit(limit);

  if (error) {
    return {
      errors: [{
        code: "PRODUCTION_DATA_SCAN_FAILED",
        message: `${tableConfig.table} scan failed: ${error.message}`,
      }],
      rows: [],
    };
  }

  return { errors: [], rows: Array.isArray(data) ? data : [] };
}

async function scanRemoteProductionData({ env = process.env, limit = 500 } = {}) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return {
      errors: [],
      skipped: true,
      skipReason: "NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 없어 DB 오염 데이터 조회를 건너뜁니다.",
      findings: [],
    };
  }

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  const rowsByTable = {};
  const errors = [];

  for (const tableConfig of PRODUCTION_DATA_SCAN_TABLES) {
    const result = await scanTable(supabase, tableConfig, limit);
    rowsByTable[tableConfig.table] = result.rows;
    errors.push(...result.errors);
  }

  return {
    errors,
    skipped: false,
    skipReason: null,
    findings: buildDataQualityFindings(rowsByTable),
  };
}

/**
 * @param {{
 *   rootDir?: string,
 *   env?: Record<string, string | undefined>,
 *   limit?: number,
 *   shouldUseLocalScanner?: (options: {
 *     rootDir: string,
 *     env: Record<string, string | undefined>,
 *   }) => boolean,
 *   localScanner?: (options: {
 *     rootDir: string,
 *     env: Record<string, string | undefined>,
 *     limit: number,
 *   }) => Promise<object>,
 *   remoteScanner?: (options: {
 *     env: Record<string, string | undefined>,
 *     limit: number,
 *   }) => Promise<object>,
 * }} [options]
 */
export async function scanProductionData({
  rootDir = process.cwd(),
  env = process.env,
  limit = 500,
  shouldUseLocalScanner = shouldUseLocalMacProductionDataScan,
  localScanner = scanLocalMacProductionData,
  remoteScanner = scanRemoteProductionData,
} = {}) {
  if (shouldUseLocalScanner({ rootDir, env })) {
    return localScanner({ rootDir, env, limit });
  }
  return remoteScanner({ env, limit });
}

export async function validateProductionDataQuality({
  rootDir = process.cwd(),
  env = process.env,
  limit = 500,
  requireDb = false,
} = {}) {
  const envResult = validateProductionEnv(env);
  const dbResult = envResult.productionLike
    ? await scanProductionData({ rootDir, env, limit })
    : {
        errors: [],
        skipped: true,
        skipReason: "production-like env가 아니므로 DB 조회를 건너뜁니다.",
        findings: [],
      };

  const errors = [...envResult.errors, ...dbResult.errors, ...dbResult.findings];

  if (requireDb && dbResult.skipped) {
    errors.push({
      code: "PRODUCTION_DATA_DB_SCAN_SKIPPED",
      message: dbResult.skipReason,
    });
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings: envResult.warnings,
    db: {
      skipped: dbResult.skipped,
      skipReason: dbResult.skipReason,
      findingCount: dbResult.findings.length,
    },
  };
}
