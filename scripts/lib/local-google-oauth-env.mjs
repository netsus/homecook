import fs from "node:fs";
import path from "node:path";

const CLIENT_ID_KEYS = [
  "SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID",
  "SUPABASE_AUTH_GOOGLE_CLIENT_ID",
];

const SECRET_KEYS = [
  "SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET",
  "SUPABASE_AUTH_GOOGLE_SECRET",
];

function stripWrappingQuotes(value) {
  if (value.length >= 2 && value.startsWith("\"") && value.endsWith("\"")) {
    return value.slice(1, -1);
  }

  return value;
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const content = fs.readFileSync(filePath, "utf8");
  const entries = {};

  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = stripWrappingQuotes(line.slice(separatorIndex + 1).trim());
    entries[key] = value;
  }

  return entries;
}

function readFallbackEnvFiles(rootDir) {
  return {
    ...parseEnvFile(path.join(rootDir, ".env")),
    ...parseEnvFile(path.join(rootDir, ".env.local")),
  };
}

function pickFirstDefined(keys, primaryEnv, fallbackEnv) {
  for (const key of keys) {
    const value = primaryEnv[key] ?? fallbackEnv[key];

    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

export function readLocalGoogleOAuthEnv(baseEnv = process.env, rootDir = process.cwd()) {
  const fallbackEnv = readFallbackEnvFiles(rootDir);
  const clientId = pickFirstDefined(CLIENT_ID_KEYS, baseEnv, fallbackEnv);
  const secret = pickFirstDefined(SECRET_KEYS, baseEnv, fallbackEnv);

  return {
    clientId,
    secret,
    enabled: Boolean(clientId && secret),
  };
}

export function withLocalGoogleOAuthEnv(baseEnv = process.env, rootDir = process.cwd()) {
  const googleOAuthEnv = readLocalGoogleOAuthEnv(baseEnv, rootDir);
  const nextEnv = {
    ...baseEnv,
    NEXT_PUBLIC_HOMECOOK_ENABLE_LOCAL_GOOGLE_OAUTH: googleOAuthEnv.enabled ? "1" : "0",
  };

  if (!googleOAuthEnv.enabled) {
    return nextEnv;
  }

  return {
    ...nextEnv,
    SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID: googleOAuthEnv.clientId,
    SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET: googleOAuthEnv.secret,
  };
}
