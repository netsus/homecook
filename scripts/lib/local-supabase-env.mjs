import { spawnSync } from "node:child_process";

import { withLocalGoogleOAuthEnv } from "./local-google-oauth-env.mjs";

function stripWrappingQuotes(value) {
  if (value.length >= 2 && value.startsWith("\"") && value.endsWith("\"")) {
    return value.slice(1, -1);
  }

  return value;
}

function parseSupabaseEnvOutput(output) {
  const parsed = {};

  output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const separatorIndex = line.indexOf("=");

      if (separatorIndex <= 0) {
        return;
      }

      const key = line.slice(0, separatorIndex);
      const value = stripWrappingQuotes(line.slice(separatorIndex + 1));
      parsed[key] = value;
    });

  return parsed;
}

export function readLocalSupabaseEnv() {
  const result = spawnSync("pnpm", ["dlx", "supabase", "status", "-o", "env"], {
    encoding: "utf8",
    env: process.env,
  });

  if (result.status !== 0) {
    throw new Error(
      result.stderr.trim()
        || "local Supabase 상태를 읽지 못했어요. 먼저 `pnpm dlx supabase start`를 실행해주세요.",
    );
  }

  const env = parseSupabaseEnvOutput(result.stdout);

  if (!env.API_URL || !env.ANON_KEY || !env.SERVICE_ROLE_KEY) {
    throw new Error("local Supabase env를 완성하지 못했어요. `supabase status -o env` 출력을 확인해주세요.");
  }

  return env;
}

export function createLocalSupabaseNextEnv(baseEnv = process.env) {
  const localSupabaseEnv = readLocalSupabaseEnv();
  const nextEnv = withLocalGoogleOAuthEnv(baseEnv);

  return {
    ...nextEnv,
    NEXT_PUBLIC_SUPABASE_URL: localSupabaseEnv.API_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: localSupabaseEnv.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: localSupabaseEnv.SERVICE_ROLE_KEY,
    NEXT_PUBLIC_APP_URL: baseEnv.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    HOMECOOK_ENABLE_LOCAL_DEV_AUTH: "1",
    NEXT_PUBLIC_HOMECOOK_ENABLE_LOCAL_DEV_AUTH: "1",
  };
}
