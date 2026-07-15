import { spawnSync } from "node:child_process";

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

function execute(invocation, sql, spawn) {
  const result = spawn(invocation.command, invocation.args, {
    input: sql,
    encoding: "utf8",
    timeout: 30_000,
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

export function runLocalPsqlJson(sql, env = process.env, spawn = spawnSync) {
  const invocation = buildLocalPsqlInvocation(env);
  const guardedSql = invocation.sentinel === undefined
    ? sql
    : guardOverrideSql(sql, invocation.sentinel);
  return parseJson(
    execute(invocation, guardedSql, spawn),
    "LOCAL_DATABASE_RESPONSE_INVALID",
  );
}
