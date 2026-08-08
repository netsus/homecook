import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { normalizeProductionStartArgs } from "../scripts/lib/start-production-args.mjs";
import { prepareStartProductionRuntimeEnv } from "../scripts/lib/start-production-runtime.mjs";
import {
  FULL_LOCAL_APP_SECRET_ENV,
  loadFullLocalAppSecretEnv,
} from "../scripts/lib/full-local-app-runtime-env.mjs";
const temporaryDirectories: string[] = [];

function secretDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "homecook-app-secrets-"));
  temporaryDirectories.push(directory);
  chmodSync(directory, 0o700);
  for (const name of Object.keys(FULL_LOCAL_APP_SECRET_ENV)) {
    writeFileSync(join(directory, name), `${name}-value`, { mode: 0o600 });
  }
  return directory;
}

function loadSecrets(directory: string) {
  return loadFullLocalAppSecretEnv({
    repositoryRoot: process.cwd(),
    secretDirectory: directory,
  });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("production start arguments", () => {
  it("removes the pnpm separator before forwarding Next.js options", () => {
    expect(normalizeProductionStartArgs(["--", "-H", "127.0.0.1", "-p", "3100"])).toEqual([
      "-H",
      "127.0.0.1",
      "-p",
      "3100",
    ]);
  });

  it("keeps direct Next.js options unchanged", () => {
    expect(normalizeProductionStartArgs(["-H", "127.0.0.1", "-p", "3100"])).toEqual([
      "-H",
      "127.0.0.1",
      "-p",
      "3100",
    ]);
  });

  it("loads only the required full-local app secrets into their server env names", () => {
    const directory = secretDirectory();

    expect(loadSecrets(directory)).toEqual({
      AUTH_FLOW_HMAC_KEY: "auth_flow_hmac_key-value",
      DATA_SUPABASE_SECRET_KEY: "secret_key-value",
      HOMECOOK_SESSION_ATTESTATION_HMAC_KEY_V1:
        "session_attestation_hmac_key_v1-value",
      HOMECOOK_SESSION_GENERATION_HMAC_KEY_V2:
        "session_generation_hmac_key_v2-value",
      LOCAL_SUPABASE_SECRET_KEY: "secret_key-value",
    });
  });

  it("does not load secrets when the full-local secret directory is not configured", () => {
    expect(loadFullLocalAppSecretEnv({
      repositoryRoot: process.cwd(),
      secretDirectory: undefined,
    })).toEqual({});
  });

  it("loads env files before resolving the full-local secret directory", () => {
    const processEnv: Record<string, string | undefined> = {};
    const calls: string[] = [];

    const merged = prepareStartProductionRuntimeEnv({
      repositoryRoot: "/Users/tester/homecook",
      processEnv,
      loadEnvFiles: ({ rootDir }) => {
        calls.push(`env:${rootDir}`);
        processEnv.HOMECOOK_FULL_LOCAL_SECRET_DIR = "/tmp/full-local-secrets";
        return [];
      },
      loadSecretEnv: ({ secretDirectory }) => {
        calls.push(`secret:${secretDirectory ?? "missing"}`);
        return { AUTH_FLOW_HMAC_KEY: "loaded-secret" };
      },
    });

    expect(calls).toEqual([
      "env:/Users/tester/homecook",
      "secret:/tmp/full-local-secrets",
    ]);
    expect(merged).toMatchObject({
      HOMECOOK_FULL_LOCAL_SECRET_DIR: "/tmp/full-local-secrets",
      AUTH_FLOW_HMAC_KEY: "loaded-secret",
    });
  });

  it("rejects insecure permissions and symbolic-link secret files", () => {
    const insecureDirectory = secretDirectory();
    chmodSync(insecureDirectory, 0o755);
    expect(() => loadSecrets(insecureDirectory)).toThrow(
      "must have mode 0700",
    );

    const linkedDirectory = secretDirectory();
    const source = join(linkedDirectory, "source");
    writeFileSync(source, "source-value", { mode: 0o600 });
    const target = join(linkedDirectory, "auth_flow_hmac_key");
    unlinkSync(target);
    symlinkSync(source, target);
    expect(() => loadSecrets(linkedDirectory)).toThrow(
      "must be a regular file",
    );

    const targetDirectory = secretDirectory();
    const directoryLink = `${targetDirectory}-link`;
    symlinkSync(targetDirectory, directoryLink);
    temporaryDirectories.push(directoryLink);
    expect(() => loadSecrets(directoryLink)).toThrow(
      "must be a real directory",
    );
  });

  it("rejects a repository-internal secret directory", () => {
    const directory = join(process.cwd(), ".homecook-test-secrets");
    mkdirSync(directory, { mode: 0o700 });
    temporaryDirectories.push(directory);

    expect(() => loadSecrets(directory)).toThrow(
      "outside the repository",
    );
  });

  it("normalizes trailing newlines the same way as container secret loading", () => {
    const directory = secretDirectory();
    writeFileSync(join(directory, "auth_flow_hmac_key"), "flow-secret\n", {
      mode: 0o600,
    });

    expect(loadSecrets(directory).AUTH_FLOW_HMAC_KEY).toBe("flow-secret");
  });
});
