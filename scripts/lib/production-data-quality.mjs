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

const DATA_SCAN_TABLES = [
  {
    table: "recipes",
    columns: "id, title, description, thumbnail_url, source_type",
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
    return ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

export function validateProductionEnv(env = process.env) {
  const errors = [];
  const warnings = [];
  const productionLike = isProductionLikeEnv(env);

  if (!productionLike) {
    warnings.push("production-like env가 아니므로 운영 데이터 게이트는 env sanity만 확인합니다.");
  }

  if (productionLike) {
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

    if (isLocalUrl(env.NEXT_PUBLIC_SUPABASE_URL)) {
      errors.push({
        code: "PRODUCTION_LOCAL_SUPABASE_URL",
        message: "NEXT_PUBLIC_SUPABASE_URL points to localhost in a production-like environment.",
      });
    }

    if (isLocalUrl(env.NEXT_PUBLIC_APP_URL) || isLocalUrl(env.NEXT_PUBLIC_SITE_URL)) {
      errors.push({
        code: "PRODUCTION_LOCAL_APP_URL",
        message: "NEXT_PUBLIC_APP_URL/NEXT_PUBLIC_SITE_URL must not point to localhost in production-like environments.",
      });
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

  for (const tableConfig of DATA_SCAN_TABLES) {
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
          value: match.value,
        });
      }
    }
  }

  return findings;
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

export async function scanProductionData({ env = process.env, limit = 500 } = {}) {
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

  for (const tableConfig of DATA_SCAN_TABLES) {
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

export async function validateProductionDataQuality({
  env = process.env,
  limit = 500,
  requireDb = false,
} = {}) {
  const envResult = validateProductionEnv(env);
  const dbResult = envResult.productionLike
    ? await scanProductionData({ env, limit })
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

