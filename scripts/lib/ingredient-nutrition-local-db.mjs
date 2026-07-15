import { IngredientNutritionImportError } from "./ingredient-nutrition-import.mjs";

const OVERRIDE_KEYS = [
  "HOMECOOK_LOCAL_PGHOST",
  "HOMECOOK_LOCAL_PGPORT",
  "HOMECOOK_LOCAL_PGDATABASE",
  "HOMECOOK_LOCAL_PGUSER",
];
const LOCAL_SECRET_KEYS = ["PGPASSWORD", "PGPASSFILE"];

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
        "-U", "postgres", "-d", "postgres", "-At",
        "-v", "ON_ERROR_STOP=1",
      ],
    };
  }
  if (LOCAL_SECRET_KEYS.some((key) => Object.hasOwn(env, key))) invalid();
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
    !/^[A-Za-z_][A-Za-z0-9_]*$/.test(database) ||
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
      "-At",
      "-v", "ON_ERROR_STOP=1",
    ],
  };
}
