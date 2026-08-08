import { loadFullLocalAppSecretEnv } from "./full-local-app-runtime-env.mjs";
import { loadProductionEnvFiles } from "./production-data-quality.mjs";

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
  return Object.freeze({ ...processEnv, ...secretEnv });
}
