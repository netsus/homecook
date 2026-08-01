import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { validateExternalSecretDirectory } from "./full-local-production-runtime.mjs";

export const FULL_LOCAL_APP_SECRET_ENV = Object.freeze({
  auth_flow_hmac_key: Object.freeze(["AUTH_FLOW_HMAC_KEY"]),
  secret_key: Object.freeze([
    "DATA_SUPABASE_SECRET_KEY",
    "LOCAL_SUPABASE_SECRET_KEY",
  ]),
  session_attestation_hmac_key_v1: Object.freeze([
    "HOMECOOK_SESSION_ATTESTATION_HMAC_KEY_V1",
  ]),
  session_generation_hmac_key_v2: Object.freeze([
    "HOMECOOK_SESSION_GENERATION_HMAC_KEY_V2",
  ]),
});

function assertMode(stat, expected, label) {
  const actual = stat.mode & 0o777;
  if (actual !== expected) {
    throw new Error(`${label} must have mode 0${expected.toString(8)}.`);
  }
}

/**
 * @returns {Readonly<Record<string, string>>}
 */
export function loadFullLocalAppSecretEnv({
  repositoryRoot,
  secretDirectory,
}) {
  if (!secretDirectory) {
    return Object.freeze({});
  }

  const requestedDirectoryStat = lstatSync(secretDirectory);
  if (
    requestedDirectoryStat.isSymbolicLink()
    || !requestedDirectoryStat.isDirectory()
  ) {
    throw new Error("Full-local app secret directory must be a real directory.");
  }

  const validatedDirectory = validateExternalSecretDirectory({
    repositoryRoot,
    secretDirectory,
  });

  const directoryStat = lstatSync(validatedDirectory);
  if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
    throw new Error("Full-local app secret directory must be a real directory.");
  }
  assertMode(directoryStat, 0o700, "Full-local app secret directory");

  const env = {};
  for (const [fileName, envNames] of Object.entries(
    FULL_LOCAL_APP_SECRET_ENV,
  )) {
    const path = join(validatedDirectory, fileName);
    const fileStat = lstatSync(path);
    if (fileStat.isSymbolicLink() || !fileStat.isFile()) {
      throw new Error(`Full-local app secret ${fileName} must be a regular file.`);
    }
    assertMode(fileStat, 0o600, `Full-local app secret ${fileName}`);
    const value = readFileSync(path, "utf8").replace(/[\r\n]+$/u, "");
    if (value.length === 0) {
      throw new Error(`Full-local app secret ${fileName} must not be empty.`);
    }
    for (const envName of envNames) {
      env[envName] = value;
    }
  }
  return Object.freeze(env);
}
