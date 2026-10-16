import { loadFullLocalAppSecretEnv } from "./full-local-app-runtime-env.mjs";
import { loadProductionEnvFiles } from "./production-data-quality.mjs";
import { loadFingerprintV2SecretEnv } from "./youtube-fingerprint-secret-env.mjs";

/**
 * @param {{
 *   repositoryRoot: string,
 *   processEnv?: Record<string, string | undefined>,
 *   loadEnvFiles?: (options: { rootDir: string }) => unknown,
 *   loadSecretEnv?: (options: {
 *     repositoryRoot: string,
 *     secretDirectory: string | undefined,
 *   }) => Readonly<Record<string, string>>,
 * }} options
 */
export function prepareStartProductionRuntimeEnv({
  repositoryRoot,
  processEnv = process.env,
  loadEnvFiles = loadProductionEnvFiles,
  loadSecretEnv = loadFullLocalAppSecretEnv,
} = {}) {
  loadEnvFiles({ rootDir: repositoryRoot });
  const secretEnv = loadSecretEnv({
    repositoryRoot,
    secretDirectory: processEnv.HOMECOOK_FULL_LOCAL_SECRET_DIR,
  });
  const merged = { ...processEnv, ...secretEnv };
  const fingerprintEnv = loadFingerprintV2SecretEnv({ repositoryRoot, env: merged });
  return Object.freeze({ ...merged, ...fingerprintEnv });
}
