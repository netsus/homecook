import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer as createNetServer } from "node:net";

import { describe, expect, it } from "vitest";

import {
  assertFullLocalComposeModel,
  assertNoSecretLeakage,
  fullLocalImageRefsForPlatform,
  generateFullLocalSecretBundle,
  materializeFullLocalSecrets,
} from "../scripts/lib/full-local-production-runtime.mjs";

const run = process.env.FULL_LOCAL_PRODUCTION_DOCKER_SMOKE === "1"
  ? describe
  : describe.skip;
const composeFile = "infra/full-local-supabase/docker-compose.production.yml";

function command(executable: string, args: string[], env: NodeJS.ProcessEnv) {
  return execFileSync(executable, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env,
    maxBuffer: 32 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function compose(project: string, env: NodeJS.ProcessEnv, args: string[]) {
  return command(
    "docker",
    ["compose", "--project-name", project, "-f", composeFile, ...args],
    env,
  );
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("No loopback port was allocated."));
        return;
      }
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

async function waitForHealthy(project: string, env: NodeJS.ProcessEnv) {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const containers = compose(project, env, ["ps", "-q"])
      .trim().split("\n").filter(Boolean);
    if (containers.length === 7) {
      const states = containers.map((container) => JSON.parse(command(
        "docker",
        ["inspect", "--format", "{{json .State}}", container],
        env,
      )) as { Health?: { Status?: string }; Status?: string });
      if (states.every((state) =>
        state.Status === "running"
        && (!state.Health || state.Health.Status === "healthy"))) {
        return containers;
      }
      if (states.some((state) => state.Status === "exited")) {
        throw new Error(`A full-local container exited: ${JSON.stringify(states)}`);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error("Full-local runtime did not become healthy within 180 seconds.");
}

run("full-local production Docker runtime", () => {
  it("boots healthy with file-mounted secrets and an Auth-only public edge", async () => {
    const root = mkdtempSync(join(tmpdir(), "homecook-full-local-docker-"));
    const project = `homecook-full-local-test-${Date.now()}`;
    const secretDirectory = join(root, "secrets");
    const secrets = generateFullLocalSecretBundle();
    materializeFullLocalSecrets({
      readSecret: (name: string) => secrets[name as keyof typeof secrets],
      targetDirectory: secretDirectory,
    });
    const [internalPort, authPort] = await Promise.all([freePort(), freePort()]);
    const images = fullLocalImageRefsForPlatform("linux/arm64");
    const env = {
      ...process.env,
      FULL_LOCAL_ADDITIONAL_REDIRECT_URLS:
        "https://app.mumeok.com/auth/callback,https://app.mumeok.com/auth/link/callback",
      FULL_LOCAL_API_EXTERNAL_URL: "https://auth.mumeok.com/auth/v1",
      FULL_LOCAL_AUTH_IMAGE: images.auth,
      FULL_LOCAL_AUTH_PROXY_PORT: String(authPort),
      FULL_LOCAL_COMPOSE_PROJECT_NAME: project,
      FULL_LOCAL_DOCKER_PLATFORM: "linux/arm64",
      FULL_LOCAL_ENABLE_ANONYMOUS_USERS: "false",
      FULL_LOCAL_ENABLE_EMAIL_AUTOCONFIRM: "false",
      FULL_LOCAL_ENABLE_EMAIL_SIGNUP: "false",
      FULL_LOCAL_ENABLE_PHONE_SIGNUP: "false",
      FULL_LOCAL_INTERNAL_GATEWAY_PORT: String(internalPort),
      FULL_LOCAL_INTERNAL_GATEWAY_URL: `http://127.0.0.1:${internalPort}`,
      FULL_LOCAL_INTERNAL_S3_URL:
        `http://127.0.0.1:${internalPort}/storage/v1/s3`,
      FULL_LOCAL_KONG_IMAGE: images.kong,
      FULL_LOCAL_NODE_IMAGE: images.node,
      FULL_LOCAL_POSTGRES_IMAGE: images.postgres,
      FULL_LOCAL_POSTGRES_VOLUME_NAME: `${project}-postgres`,
      FULL_LOCAL_POSTGREST_IMAGE: images.postgrest,
      FULL_LOCAL_PUBLIC_AUTH_URL: "https://auth.mumeok.com",
      FULL_LOCAL_SECRET_DIR: secretDirectory,
      FULL_LOCAL_SITE_URL: "https://app.mumeok.com",
      FULL_LOCAL_STORAGE_FILE_SIZE_LIMIT: "52428800",
      FULL_LOCAL_STORAGE_GLOBAL_BUCKET: "homecook-test",
      FULL_LOCAL_STORAGE_IMAGE: images.storage,
      FULL_LOCAL_STORAGE_REGION: "homecook-local-1",
      FULL_LOCAL_STORAGE_TENANT_ID: "homecook-test",
      FULL_LOCAL_STORAGE_VOLUME_NAME: `${project}-storage`,
    };

    let failure: unknown;
    try {
      const model = JSON.parse(compose(project, env, ["config", "--format", "json"]));
      expect(assertFullLocalComposeModel(model)).toBe(true);

      command("docker", ["volume", "create", env.FULL_LOCAL_POSTGRES_VOLUME_NAME], env);
      const rotationConfig = join(root, "rotation.env");
      writeFileSync(
        rotationConfig,
        `${Object.entries(env)
          .filter(([name, value]) => name.startsWith("FULL_LOCAL_") && value)
          .map(([name, value]) => `${name}=${value}`)
          .join("\n")}\nFULL_LOCAL_KEYCHAIN_SERVICE=${project}-keychain\n`,
        { encoding: "utf8", mode: 0o600 },
      );
      const rotationAttempt = spawnSync(
        process.execPath,
        [
          "scripts/full-local-production-runtime.mjs",
          "bootstrap-secrets",
          "--config",
          rotationConfig,
          "--replace",
        ],
        { cwd: process.cwd(), encoding: "utf8", env },
      );
      expect(rotationAttempt.status).toBe(1);
      expect(rotationAttempt.stderr).toMatch(
        /persistent PostgreSQL volume exists/iu,
      );

      compose(project, env, ["up", "-d"]);
      const containers = await waitForHealthy(project, env);
      const headers = { apikey: secrets.publishable_key };
      const internalAuth = await fetch(
        `http://127.0.0.1:${internalPort}/auth/v1/health`,
        { headers },
      );
      const publicAuth = await fetch(
        `http://127.0.0.1:${authPort}/auth/v1/health`,
        { headers },
      );
      const blockedRest = await fetch(`http://127.0.0.1:${authPort}/rest/v1/`);
      const blockedStorage = await fetch(
        `http://127.0.0.1:${authPort}/storage/v1/`,
      );
      const blockedHealth = await fetch(
        `http://127.0.0.1:${authPort}/healthz`,
      );
      const oauthLogMarker = "oauth-code-must-not-reach-logs-0001";
      await fetch(
        `http://127.0.0.1:${authPort}/auth/v1/callback?code=${oauthLogMarker}&state=fixture`,
        { redirect: "manual" },
      );

      expect(internalAuth.status).toBe(200);
      expect(publicAuth.status).toBe(200);
      expect(blockedRest.status).toBe(404);
      expect(blockedStorage.status).toBe(404);
      expect(blockedHealth.status).toBe(404);

      const artifacts = containers.flatMap((container) => [
        {
          label: `${container}:Config.Env`,
          text: command(
            "docker",
            ["inspect", "--format", "{{json .Config.Env}}", container],
            env,
          ),
        },
        {
          label: `${container}:logs`,
          text: command("docker", ["logs", container], env),
        },
      ]);
      for (const [name, secret] of Object.entries(secrets)) {
        for (const artifact of artifacts) {
          try {
            assertNoSecretLeakage({ artifacts: [artifact.text], secrets: [secret] });
          } catch {
            throw new Error(
              `Secret leakage detected for ${name} in ${artifact.label}.`,
            );
          }
        }
      }
      expect(assertNoSecretLeakage({
        artifacts: artifacts.map((artifact) => artifact.text),
        secrets: [oauthLogMarker],
      })).toBe(true);
    } catch (error) {
      failure = error;
      const diagnostics = compose(project, env, ["ps", "-a"])
        + compose(project, env, ["logs", "--no-color", "--tail", "120"]);
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}\n${diagnostics}`,
      );
    } finally {
      try {
        compose(project, env, ["down", "--volumes", "--remove-orphans"]);
      } finally {
        rmSync(root, { force: true, recursive: true });
      }
    }
    expect(failure).toBeUndefined();
  }, 240_000);
});
