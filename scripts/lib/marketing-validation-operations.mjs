import { constants } from "node:fs";
import { lstat, mkdir, open, readFile } from "node:fs/promises";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

const TABLE = "marketing_validation_sessions";
const SAFE_EXPORT_ROOT = path.join(".artifacts", "marketing-validation");
const EXPORT_PAGE_SIZE = 500;
const EXPORT_COLUMNS = [
  "email",
  "consent_version",
  "consented_at",
];

export class MarketingValidationOperationError extends Error {}

function parseArgs(argv, allowedFlags) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!allowedFlags.has(token)) {
      throw new MarketingValidationOperationError(`지원하지 않는 옵션이에요: ${token}`);
    }

    if (token === "--confirm") {
      result.confirm = true;
      continue;
    }

    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new MarketingValidationOperationError(`${token} 값을 입력해 주세요.`);
    }
    result[token.slice(2).replaceAll("-", "_")] = value;
    index += 1;
  }
  return result;
}

function parseIsoTimestamp(value, flagName) {
  const timestamp = value ? new Date(value) : new Date();
  if (!Number.isFinite(timestamp.getTime())) {
    throw new MarketingValidationOperationError(`${flagName}은 ISO-8601 시각이어야 해요.`);
  }
  return timestamp.toISOString();
}

function parseOperatorId(value) {
  if (!value || !/^[a-z][a-z0-9_-]{2,31}$/u.test(value)) {
    throw new MarketingValidationOperationError(
      "--operator-id에는 개인정보가 아닌 3~32자의 소문자 운영 별칭을 입력해 주세요.",
    );
  }
  return value;
}

async function writePrivateFile(filePath, contents) {
  await mkdir(path.dirname(filePath), { mode: 0o700, recursive: true });
  const flags = (
    constants.O_CREAT
    | constants.O_TRUNC
    | constants.O_WRONLY
    | constants.O_NOFOLLOW
  );
  let handle;
  try {
    handle = await open(filePath, flags, 0o600);
    await handle.writeFile(contents, { encoding: "utf8" });
    await handle.chmod(0o600);
  } catch (error) {
    if (error?.code === "ELOOP" || error?.code === "EMLINK") {
      throw new MarketingValidationOperationError(
        "결과 파일은 심볼릭 링크가 아닌 안전한 일반 파일이어야 해요.",
      );
    }
    throw new MarketingValidationOperationError(
      "결과 파일을 쓸 수 없어요. 경로와 권한 상태를 확인해 주세요.",
    );
  } finally {
    await handle?.close();
  }
}

async function assertRegularDirectoryChain(basePath, directoryPath, allowMissing, message) {
  const relativePath = path.relative(basePath, directoryPath);
  const segments = relativePath ? relativePath.split(path.sep) : [];
  let cursor = basePath;
  for (const segment of segments) {
    cursor = path.join(cursor, segment);
    try {
      const entry = await lstat(cursor);
      if (entry.isSymbolicLink() || !entry.isDirectory()) {
        throw new MarketingValidationOperationError(message);
      }
    } catch (error) {
      if (error instanceof MarketingValidationOperationError) throw error;
      if (allowMissing && error?.code === "ENOENT") return;
      throw new MarketingValidationOperationError(message);
    }
  }
}

async function resolveSafeArtifactPath(requestedPath, cwd, { extension, flagName }) {
  if (!requestedPath) {
    throw new MarketingValidationOperationError(`${flagName} ${extension.toUpperCase()} 경로를 입력해 주세요.`);
  }

  const safeRoot = path.resolve(cwd, SAFE_EXPORT_ROOT);
  const resolvedPath = path.resolve(cwd, requestedPath);
  const relativeOutput = path.relative(safeRoot, resolvedPath);
  const errorMessage = (
    `${flagName}은 .artifacts/marketing-validation 아래 `
    + `gitignored safe directory의 ${extension.toUpperCase()}여야 해요.`
  );
  if (
    !relativeOutput
    || relativeOutput === ".."
    || relativeOutput.startsWith(`..${path.sep}`)
    || path.isAbsolute(relativeOutput)
    || path.extname(resolvedPath).toLowerCase() !== extension
  ) {
    throw new MarketingValidationOperationError(errorMessage);
  }

  const resolvedParent = path.dirname(resolvedPath);
  await assertRegularDirectoryChain(cwd, resolvedParent, true, errorMessage);
  await mkdir(resolvedParent, { mode: 0o700, recursive: true });
  await assertRegularDirectoryChain(cwd, resolvedParent, false, errorMessage);
  return resolvedPath;
}

async function readFixtureRows(filePath) {
  if (!filePath) return null;
  let parsed;
  try {
    parsed = JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    throw new MarketingValidationOperationError("--mock-db-export fixture를 읽을 수 없어요.");
  }
  if (!Array.isArray(parsed?.rows)) {
    throw new MarketingValidationOperationError("--mock-db-export fixture의 rows가 필요해요.");
  }
  return parsed.rows;
}

function readOperatorEnv(env) {
  const url = (
    env.MARKETING_VALIDATION_SUPABASE_URL
    ?? env.NEXT_PUBLIC_SUPABASE_URL
    ?? ""
  ).trim();
  const serviceRoleKey = (
    env.MARKETING_VALIDATION_SUPABASE_SERVICE_ROLE_KEY
    ?? env.SUPABASE_SERVICE_ROLE_KEY
    ?? ""
  ).trim();
  if (!url || !serviceRoleKey) {
    throw new MarketingValidationOperationError(
      "마케팅 운영용 Supabase URL과 service role key가 필요해요.",
    );
  }
  return { serviceRoleKey, url };
}

function createOperatorClient(env, scope) {
  const { serviceRoleKey, url } = readOperatorEnv(env);
  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        "x-homecook-internal-scope": scope,
      },
    },
  });
}

function escapeCsvCell(value) {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (/^[=+\-@]/u.test(text.trimStart())) {
    text = `'${text}`;
  }
  if (/[",\r\n]/u.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function renderLeadCsv(rows) {
  const lines = [EXPORT_COLUMNS.join(",")];
  for (const row of rows) {
    lines.push([
      row.email,
      row.consent_version,
      row.consented_at,
    ].map(escapeCsvCell).join(","));
  }
  return `${lines.join("\n")}\n`;
}

async function loadAcceptedLeadRows({ client, fixtureRows }) {
  if (fixtureRows) {
    return fixtureRows.filter((row) => (
      row.campaign_key === "weekly_nutrition_2026"
      && row.creative_key === "weekly_nutrition_v2"
      && row.lead_submission_status === "accepted"
      && row.consent_version === "marketing-demand-validation-v1"
      && typeof row.consented_at === "string"
      && row.consented_at.length > 0
      && typeof row.email === "string"
      && row.email.length > 0
    ));
  }

  const rows = [];
  let expectedCount = null;
  let offset = 0;
  while (expectedCount === null || rows.length < expectedCount) {
    const { count, data, error } = await client
      .from(TABLE)
      .select("id,email,consent_version,consented_at,lead_submitted_at", {
        count: "exact",
      })
      .eq("campaign_key", "weekly_nutrition_2026")
      .eq("creative_key", "weekly_nutrition_v2")
      .eq("lead_submission_status", "accepted")
      .eq("consent_version", "marketing-demand-validation-v1")
      .not("consented_at", "is", null)
      .not("email", "is", null)
      .order("lead_submitted_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + EXPORT_PAGE_SIZE - 1);
    if (error || !Array.isArray(data) || !Number.isSafeInteger(count) || count < 0) {
      throw new MarketingValidationOperationError("accepted lead export 조회에 실패했어요.");
    }
    expectedCount ??= count;
    if (data.length === 0 && rows.length < expectedCount) {
      throw new MarketingValidationOperationError(
        "accepted lead export가 조회 중 변경되어 전체 결과를 확인할 수 없어요.",
      );
    }
    rows.push(...data);
    offset += data.length;
  }
  return rows;
}

export async function runMarketingLeadExport({
  argv = process.argv.slice(2),
  cwd = process.cwd(),
  env = process.env,
} = {}) {
  const args = parseArgs(argv, new Set(["--mock-db-export", "--output"]));
  const outputPath = await resolveSafeArtifactPath(args.output, cwd, {
    extension: ".csv",
    flagName: "--output",
  });
  const fixtureRows = await readFixtureRows(args.mock_db_export);
  const client = fixtureRows
    ? null
    : createOperatorClient(env, "marketing-validation-export");
  const rows = await loadAcceptedLeadRows({ client, fixtureRows });
  await writePrivateFile(outputPath, renderLeadCsv(rows));

  return {
    exported_count: rows.length,
    output_path: path.relative(cwd, outputPath),
  };
}

function expiredRows(rows, nowIso) {
  const nowMs = new Date(nowIso).getTime();
  return rows.filter((row) => {
    const retentionMs = new Date(row.retention_until).getTime();
    return Number.isFinite(retentionMs) && retentionMs < nowMs;
  });
}

async function countExpiredRows({ client, fixtureRows, nowIso }) {
  if (fixtureRows) return expiredRows(fixtureRows, nowIso).length;

  const { count, error } = await client
    .from(TABLE)
    .select("*", { count: "exact", head: true })
    .lt("retention_until", nowIso);
  if (error || !Number.isSafeInteger(count) || count < 0) {
    throw new MarketingValidationOperationError("retention dry-run 조회에 실패했어요.");
  }
  return count;
}

async function deleteExpiredRows({ client, fixturePath, fixtureRows, nowIso }) {
  if (fixtureRows) {
    const expiredIds = new Set(expiredRows(fixtureRows, nowIso).map((row) => row.id));
    const remainingRows = fixtureRows.filter((row) => !expiredIds.has(row.id));
    await writePrivateFile(
      fixturePath,
      `${JSON.stringify({ rows: remainingRows }, null, 2)}\n`,
    );
    return expiredIds.size;
  }

  const { count, error } = await client
    .from(TABLE)
    .delete({ count: "exact" })
    .lt("retention_until", nowIso);
  if (error || !Number.isSafeInteger(count) || count < 0) {
    throw new MarketingValidationOperationError("retention purge 실행에 실패했어요.");
  }
  return count;
}

export async function runExpiredMarketingValidationPurge({
  argv = process.argv.slice(2),
  cwd = process.cwd(),
  env = process.env,
} = {}) {
  const args = parseArgs(
    argv,
    new Set([
      "--confirm",
      "--evidence",
      "--mock-db-export",
      "--now",
      "--operator-id",
    ]),
  );
  if (!args.evidence) {
    throw new MarketingValidationOperationError("--evidence JSON 경로를 입력해 주세요.");
  }
  if (args.confirm && env.MARKETING_VALIDATION_ALLOW_PURGE !== "1") {
    throw new MarketingValidationOperationError(
      "삭제에는 --confirm과 MARKETING_VALIDATION_ALLOW_PURGE=1이 모두 필요해요.",
    );
  }
  if (args.now && !args.mock_db_export) {
    throw new MarketingValidationOperationError(
      "--now 시각 재정의는 mock fixture에서만 사용할 수 있어요.",
    );
  }

  const nowIso = parseIsoTimestamp(args.now, "--now");
  const operatorId = parseOperatorId(args.operator_id);
  const evidencePath = await resolveSafeArtifactPath(args.evidence, cwd, {
    extension: ".json",
    flagName: "--evidence",
  });
  const fixtureRows = await readFixtureRows(args.mock_db_export);
  const client = fixtureRows
    ? null
    : createOperatorClient(env, "marketing-validation-purge");
  const matchedCount = await countExpiredRows({ client, fixtureRows, nowIso });
  if (args.confirm) {
    await writePrivateFile(
      evidencePath,
      `${JSON.stringify({
        deleted_count: 0,
        generated_at: nowIso,
        matched_count: matchedCount,
        mode: "confirm-pending",
        operator_id: operatorId,
        remaining_expired_count: matchedCount,
      }, null, 2)}\n`,
    );
  }
  const deletedCount = args.confirm
    ? await deleteExpiredRows({
        client,
        fixturePath: args.mock_db_export,
        fixtureRows,
        nowIso,
      })
    : 0;
  const remainingExpiredCount = args.confirm
    ? await countExpiredRows({
        client,
        fixtureRows: fixtureRows
          ? await readFixtureRows(args.mock_db_export)
          : null,
        nowIso,
      })
    : matchedCount;
  const evidence = {
    deleted_count: deletedCount,
    generated_at: nowIso,
    matched_count: matchedCount,
    mode: args.confirm ? "confirm" : "dry-run",
    operator_id: operatorId,
    remaining_expired_count: remainingExpiredCount,
  };
  await writePrivateFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  return evidence;
}
