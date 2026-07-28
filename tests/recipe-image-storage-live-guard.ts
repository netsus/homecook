import { spawnSync } from "node:child_process";

const LOCAL_HOSTS = new Set([
  "127.0.0.1",
  "::1",
  "[::1]",
  "localhost",
]);
const LOCAL_WRITE_OPT_IN = "HOMECOOK_STORAGE_LIVE_LOCAL_ONLY";

function parseUrl(value: string, label: string) {
  try {
    return new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }
}

function assertLocalHost(value: string, label: string) {
  const url = parseUrl(value, label);
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(`${label} must point to local Supabase`);
  }
  return url;
}

function parseSupabaseStatusEnv(output: string) {
  return Object.fromEntries(
    output
      .split("\n")
      .map((line) => line.match(/^([A-Z0-9_]+)="(.*)"$/u))
      .filter((match): match is RegExpMatchArray => Boolean(match))
      .map((match) => [match[1], match[2]]),
  );
}

function readSupabaseStatusEnv({
  cwd = process.cwd(),
  exec = spawnSync,
}: {
  cwd?: string;
  exec?: typeof spawnSync;
} = {}) {
  const result = exec(
    "pnpm",
    ["dlx", "supabase", "status", "-o", "env"],
    {
      cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: process.env.PATH ?? "",
      },
    },
  );
  if (result.status !== 0) {
    throw new Error("local Supabase status is unavailable");
  }
  return parseSupabaseStatusEnv(result.stdout);
}

export function isLocalStorageLiveEnvAvailable({
  databaseUrl,
  localOnlyOptIn = process.env[LOCAL_WRITE_OPT_IN],
  serviceRoleKey,
  statusEnv,
  storageUrl,
}: {
  databaseUrl?: string;
  localOnlyOptIn?: string;
  serviceRoleKey?: string;
  statusEnv?: Record<string, string | undefined>;
  storageUrl?: string;
}) {
  if (!storageUrl || !serviceRoleKey || !databaseUrl) {
    return false;
  }

  if (localOnlyOptIn !== "1") {
    throw new Error(`${LOCAL_WRITE_OPT_IN}=1 is required for live writes`);
  }

  const storage = assertLocalHost(
    storageUrl,
    "HOMECOOK_STORAGE_LIVE_URL",
  );
  if (
    storage.protocol !== "http:"
    || storage.port !== "54321"
  ) {
    throw new Error(
      "HOMECOOK_STORAGE_LIVE_URL must be local Supabase http://*:54321",
    );
  }

  if (databaseUrl) {
    const database = assertLocalHost(
      databaseUrl,
      "HOMECOOK_STORAGE_LIVE_DB_URL",
    );
    if (
      database.protocol !== "postgresql:"
      || database.port !== "54322"
      || database.pathname !== "/postgres"
    ) {
      throw new Error(
        "HOMECOOK_STORAGE_LIVE_DB_URL must be local Supabase postgresql://*:54322/postgres",
      );
    }
  }

  const localStatusEnv = statusEnv ?? readSupabaseStatusEnv();
  if (
    localStatusEnv.API_URL !== storageUrl
    || localStatusEnv.SERVICE_ROLE_KEY !== serviceRoleKey
  ) {
    throw new Error("live Storage env must match local Supabase status");
  }
  if (databaseUrl && localStatusEnv.DB_URL !== databaseUrl) {
    throw new Error("live DB env must match local Supabase status");
  }

  return true;
}
