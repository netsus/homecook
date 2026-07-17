import { spawn as spawnChild, spawnSync } from "node:child_process";
import { once } from "node:events";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";

import { IngredientNutritionImportError } from "./ingredient-nutrition-import.mjs";

const OVERRIDE_KEYS = [
  "HOMECOOK_LOCAL_PGHOST",
  "HOMECOOK_LOCAL_PGPORT",
  "HOMECOOK_LOCAL_PGDATABASE",
  "HOMECOOK_LOCAL_PGUSER",
];
const LOCAL_UNSAFE_KEYS = [
  "PGPASSWORD",
  "PGPASSFILE",
  "PGSERVICE",
  "PGSERVICEFILE",
  "PGOPTIONS",
];
export const LOCAL_DATABASE_SENTINEL = "homecook-isolated-local-v1";
const LOCAL_DATABASE_SENTINEL_ERROR_MARKER =
  "HOMECOOK_LOCAL_DATABASE_SENTINEL_INVALID";
const LOCAL_JSON_FILE_FUNCTIONS = new Set([
  "apply_public_prepared_food_catalog_import",
]);

function invalid() {
  throw new IngredientNutritionImportError("LOCAL_DATABASE_CONFIGURATION_INVALID");
}

export function buildLocalPsqlInvocation(env) {
  if (Object.keys(env).some((key) =>
    key.startsWith("HOMECOOK_LOCAL_PG") && !OVERRIDE_KEYS.includes(key),
  )) {
    invalid();
  }
  const values = Object.fromEntries(OVERRIDE_KEYS.map((key) => [key, env[key]]));
  const configuredCount = Object.values(values).filter((value) => value !== undefined).length;
  if (configuredCount === 0) {
    return {
      command: "docker",
      args: [
        "exec", "-i", "supabase_db_homecook", "psql",
        "-U", "postgres", "-d", "postgres", "-X", "-At",
        "-v", "ON_ERROR_STOP=1",
      ],
    };
  }
  if (LOCAL_UNSAFE_KEYS.some((key) => Object.hasOwn(env, key))) invalid();
  if (configuredCount !== OVERRIDE_KEYS.length) invalid();
  const host = values.HOMECOOK_LOCAL_PGHOST;
  const port = Number(values.HOMECOOK_LOCAL_PGPORT);
  const database = values.HOMECOOK_LOCAL_PGDATABASE;
  const user = values.HOMECOOK_LOCAL_PGUSER;
  if (
    !["127.0.0.1", "localhost", "::1"].includes(host) ||
    !Number.isInteger(port) ||
    port < 1024 ||
    port > 65535 ||
    port === 5432 ||
    !/^homecook_[a-z0-9_]+$/.test(database) ||
    !/^[A-Za-z_][A-Za-z0-9_]*$/.test(user)
  ) {
    invalid();
  }
  return {
    command: "psql",
    args: [
      "-h", host,
      "-p", String(port),
      "-U", user,
      "-d", database,
      "-X",
      "-At",
      "-v", "ON_ERROR_STOP=1",
    ],
    env: {
      PATH: typeof env.PATH === "string" ? env.PATH : "",
      PGPASSFILE: "/dev/null",
    },
    sentinel: {
      database,
      value: LOCAL_DATABASE_SENTINEL,
    },
  };
}

function execute(invocation, sql, spawn, timeoutMs) {
  const result = spawn(invocation.command, invocation.args, {
    input: sql,
    encoding: "utf8",
    timeout: timeoutMs,
    ...(invocation.env === undefined ? {} : { env: invocation.env }),
  });
  if (result.status !== 0 || result.error) {
    const errorOutput = `${result.stderr ?? ""}\n${result.stdout ?? ""}`;
    if (errorOutput.includes(LOCAL_DATABASE_SENTINEL_ERROR_MARKER)) {
      throw new IngredientNutritionImportError("LOCAL_DATABASE_SENTINEL_INVALID");
    }
    throw new IngredientNutritionImportError("LOCAL_DATABASE_UNAVAILABLE");
  }
  return result.stdout.trim().split("\n").filter(Boolean).at(-1) ?? "";
}

function sqlLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function guardOverrideSql(sql, sentinel) {
  if (typeof sql !== "string" || sql.trim() === "" || sql.includes("\\")) {
    invalid();
  }
  const database = sqlLiteral(sentinel.database);
  const sentinelValue = sqlLiteral(sentinel.value);
  return `
do $homecook_local_database_guard$
declare
  observed_sentinel text;
begin
  select shobj_description(oid, 'pg_database')
  into observed_sentinel
  from pg_database
  where datname = current_database();

  if current_database() <> ${database}
    or observed_sentinel is distinct from ${sentinelValue}
  then
    raise exception using
      errcode = 'P0001',
      message = '${LOCAL_DATABASE_SENTINEL_ERROR_MARKER}';
  end if;
end
$homecook_local_database_guard$;
${sql}`;
}

function parseJson(output, code) {
  try {
    return JSON.parse(output);
  } catch {
    throw new IngredientNutritionImportError(code);
  }
}

function validTimeout(timeoutMs) {
  return Number.isInteger(timeoutMs) && timeoutMs >= 1_000 && timeoutMs <= 60 * 60_000;
}

export function runLocalPsqlJson(
  sql,
  env = process.env,
  spawn = spawnSync,
  { timeoutMs = 30_000 } = {},
) {
  if (!validTimeout(timeoutMs)) {
    invalid();
  }
  const invocation = buildLocalPsqlInvocation(env);
  const guardedSql = invocation.sentinel === undefined
    ? sql
    : guardOverrideSql(sql, invocation.sentinel);
  return parseJson(
    execute(invocation, guardedSql, spawn, timeoutMs),
    "LOCAL_DATABASE_RESPONSE_INVALID",
  );
}

async function pipeFileToStdin(filePath, stdin) {
  for await (const chunk of createReadStream(filePath)) {
    if (!stdin.write(chunk)) await once(stdin, "drain");
  }
}

function executeJsonFileFunction(
  invocation,
  functionName,
  payloadPath,
  rowsFilePath,
  spawn,
  timeoutMs,
) {
  return new Promise((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args, {
      stdio: ["pipe", "pipe", "pipe"],
      ...(invocation.env === undefined ? {} : { env: invocation.env }),
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      if (!settled) {
        settled = true;
        reject(new IngredientNutritionImportError("LOCAL_DATABASE_UNAVAILABLE"));
      }
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", () => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(new IngredientNutritionImportError("LOCAL_DATABASE_UNAVAILABLE"));
      }
    });
    child.on("close", (status) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (status !== 0) {
        if (`${stderr}\n${stdout}`.includes(LOCAL_DATABASE_SENTINEL_ERROR_MARKER)) {
          reject(new IngredientNutritionImportError("LOCAL_DATABASE_SENTINEL_INVALID"));
          return;
        }
        reject(new IngredientNutritionImportError("LOCAL_DATABASE_UNAVAILABLE"));
        return;
      }
      try {
        resolve(parseJson(
          stdout.trim().split("\n").filter(Boolean).at(-1) ?? "",
          "LOCAL_DATABASE_RESPONSE_INVALID",
        ));
      } catch (error) {
        reject(error);
      }
    });

    const guard = invocation.sentinel === undefined
      ? ""
      : guardOverrideSql("select 1;", invocation.sentinel);
    const prefix = `${guard}
begin;
create temp table homecook_local_json_payload (payload jsonb);
create temp table homecook_local_json_result (payload jsonb);
\\copy pg_temp.homecook_local_json_payload(payload) from stdin with (format csv, delimiter E'\\x02', quote E'\\x01', escape E'\\x01')
`;
    const rowsCopy = rowsFilePath === undefined
      ? ""
      : `\\.
create temp table homecook_prepared_food_import_items (item jsonb);
\\copy pg_temp.homecook_prepared_food_import_items(item) from stdin with (format csv, delimiter E'\\x02', quote E'\\x01', escape E'\\x01')
`;
    const suffix = `\\.
insert into pg_temp.homecook_local_json_result(payload)
select public.${functionName}((select payload from pg_temp.homecook_local_json_payload));
commit;
select payload::text from pg_temp.homecook_local_json_result;
`;
    let streamStage = "payload";
    (async () => {
      child.stdin.write(prefix);
      await pipeFileToStdin(payloadPath, child.stdin);
      if (rowsFilePath !== undefined) {
        streamStage = "rows";
        child.stdin.write(rowsCopy);
        await pipeFileToStdin(rowsFilePath, child.stdin);
      }
      streamStage = "suffix";
      child.stdin.end(suffix);
    })().catch((error) => {
      child.stdin.destroy();
      child.kill("SIGTERM");
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        const causeCode = typeof error?.code === "string" && /^[A-Z0-9_]+$/.test(error.code)
          ? error.code
          : "STREAM_FAILED";
        reject(new IngredientNutritionImportError(
          "LOCAL_DATABASE_CONFIGURATION_INVALID",
          { stage: streamStage, cause_code: causeCode },
        ));
      }
    });
  });
}

export async function runLocalPsqlJsonFileFunction(
  functionName,
  payloadPath,
  env = process.env,
  spawn = spawnChild,
  { timeoutMs = 30_000, rowsFilePath } = {},
) {
  if (
    !LOCAL_JSON_FILE_FUNCTIONS.has(functionName)
    || typeof payloadPath !== "string"
    || !path.isAbsolute(payloadPath)
    || !validTimeout(timeoutMs)
    || (rowsFilePath !== undefined && (
      typeof rowsFilePath !== "string" || !path.isAbsolute(rowsFilePath)
    ))
  ) {
    invalid();
  }
  const payloadStat = await stat(payloadPath).catch(() => null);
  if (
    payloadStat === null
    || !payloadStat.isFile()
    || payloadStat.size <= 0
    || payloadStat.size >= 1024 * 1024 * 1024
  ) {
    invalid();
  }
  if (rowsFilePath !== undefined) {
    const rowsStat = await stat(rowsFilePath).catch(() => null);
    if (
      rowsStat === null
      || !rowsStat.isFile()
      || rowsStat.size <= 0
      || rowsStat.size >= 1024 * 1024 * 1024
    ) {
      invalid();
    }
  }
  return executeJsonFileFunction(
    buildLocalPsqlInvocation(env),
    functionName,
    payloadPath,
    rowsFilePath,
    spawn,
    timeoutMs,
  );
}
