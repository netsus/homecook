import { execFileSync, spawnSync } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer as createNetServer } from "node:net";

import { describe, expect, it } from "vitest";

import { createHybridAuthorityFetch } from "@/lib/server/hybrid-auth/gateway";
import { createSessionKeyHash } from "@/lib/server/hybrid-auth/session-authority";
import {
  withReplacementRestoreAttemptCleanup,
} from "../scripts/lib/full-local-backup-key-recovery.mjs";
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
const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { scripts?: Record<string, string> };

function command(executable: string, args: string[], env: NodeJS.ProcessEnv) {
  return execFileSync(executable, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env,
    maxBuffer: 32 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function commandWithInput(
  executable: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  input: string,
) {
  return execFileSync(executable, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env,
    input,
    maxBuffer: 32 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

function compose(project: string, env: NodeJS.ProcessEnv, args: string[]) {
  return command(
    "docker",
    ["compose", "--project-name", project, "-f", composeFile, ...args],
    env,
  );
}

function composeOutput(project: string, env: NodeJS.ProcessEnv, args: string[]) {
  return command(
    "docker",
    ["compose", "--project-name", project, "-f", composeFile, ...args],
    env,
  );
}

function composeServiceContainer(project: string, env: NodeJS.ProcessEnv, service: string) {
  const container = compose(project, env, ["ps", "-q", service]).trim();
  if (!container) {
    throw new Error(`No full-local container found for service: ${service}`);
  }
  return container;
}

async function authJsonRequest({
  authPort,
  path,
  method = "GET",
  headers,
  body,
  bodyEncoding = "json",
}: {
  authPort: number;
  path: string;
  method?: string;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  bodyEncoding?: "json" | "form";
}) {
  const encodedBody = body === undefined
    ? undefined
    : bodyEncoding === "form"
      ? new URLSearchParams(
          Object.entries(body).map(([key, value]) => [key, String(value)]),
        ).toString()
      : JSON.stringify(body);
  const response = await fetch(`http://127.0.0.1:${authPort}${path}`, {
    method,
    headers: {
      "content-type": bodyEncoding === "form"
        ? "application/x-www-form-urlencoded"
        : "application/json",
      ...(headers ?? {}),
    },
    body: encodedBody,
  });
  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { json, response, text };
}

function readJwtClaims(token: string) {
  const [, payload] = token.split(".");
  return JSON.parse(
    Buffer.from(payload ?? "", "base64url").toString("utf8"),
  ) as {
    exp: number;
    iat: number;
    iss: string;
    session_id: string;
    sub: string;
  };
}

async function readNewerRefreshedSession({
  authPort,
  publishableKey,
  sessionA,
}: {
  authPort: number;
  publishableKey: string;
  sessionA: { access_token: string; refresh_token: string };
}) {
  const claimsA = readJwtClaims(sessionA.access_token);
  let refreshToken = sessionA.refresh_token;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const refreshGrant = await authJsonRequest({
      authPort,
      path: "/auth/v1/token?grant_type=refresh_token",
      method: "POST",
      headers: { apikey: publishableKey },
      body: { refresh_token: refreshToken },
    });
    expect(refreshGrant.response.status).toBe(200);
    const sessionB = refreshGrant.json as {
      access_token: string;
      refresh_token?: string;
    };
    const claimsB = readJwtClaims(sessionB.access_token);
    expect(claimsB.session_id).toBe(claimsA.session_id);
    if (claimsB.iat > claimsA.iat && claimsB.exp > claimsA.exp) {
      return { claimsA, claimsB, sessionB };
    }
    refreshToken = sessionB.refresh_token ?? refreshToken;
    await new Promise((resolve) => setTimeout(resolve, 1_100));
  }

  throw new Error("Refreshed JWT did not advance iat/exp within bounded retries.");
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

function applyDockerMigrationChain(project: string, env: NodeJS.ProcessEnv) {
  const required = new Set([
    "20260301000000_core_schema_bootstrap.sql",
    "20260425000000_08b_add_pantry_items_table.sql",
    "20260426090000_09_shopping_tables.sql",
    "20260429050000_14_cook_session_tables.sql",
    "20260429080000_15a_cook_planner_complete.sql",
    "20260521103000_20_youtube_real_import.sql",
    "20260524154000_account_delete_private_data.sql",
    "20260527030000_admin_foundation.sql",
    "20260617090000_36b_recipe_tags_model.sql",
    "20260617110000_36c_recipe_tags_search_themes.sql",
    "20260620065500_shopping_already_have_pantry_reflection.sql",
    "20260714143000_ingredient_nutrition_conversion_model.sql",
    "20260716090000_add_recipe_nutrition_snapshots.sql",
    "20260716120000_prepared_food_catalog.sql",
    "20260723140000_account_session_generation_foundation.sql",
    "20260723170000_recipe_visibility_read_hardening.sql",
    "20260724090000_recipe_tag_parent_visibility_upper_bound.sql",
    "20260724110000_recipe_managed_image_registry_foundation.sql",
    "20260724120000_recipe_image_cleanup_outbox.sql",
    "20260724130000_recipe_image_upload_reservation.sql",
    "20260724140000_recipe_image_private_storage_boundary.sql",
    "20260724180000_recipe_image_attach_cas.sql",
    "20260729170500_recipe_snapshot_authority_foundation.sql",
    "20260730090000_hybrid_auth_remote_identity_epoch_mirror.sql",
    "20260730140000_hybrid_internal_operations_facades.sql",
    "20260730150000_account_delete_hybrid_session_authority.sql",
    "20260730210000_product_ingredient_link_foundation.sql",
    "20260731110000_product_ingredient_link_contract_runtime.sql",
    "20260731111000_product_ingredient_link_account_cleanup.sql",
    "20260801120000_full_local_auth_db_foundation.sql",
    "20260801150000_full_local_account_bootstrap.sql",
    "20260801151000_full_local_request_authority.sql",
    "20260802120000_recipe_snapshot_consumer_read_authority.sql",
    "20260802130000_personal_recipe_customization_write_core.sql",
    "20260802210000_recipe_content_snapshot_future_propagation.sql",
    "20260803090000_full_local_session_issue_time_precision.sql",
    "20260803091000_full_local_optional_nbf_authority.sql",
    "20260803092000_recipe_future_internal_scope.sql",
    "20260803093000_full_local_read_only_request_authority.sql",
    "20260809110000_full_local_request_transaction_and_youtube_scope.sql",
    "20260803101000_recipe_content_snapshot_future_propagation.sql",
    "20260804100000_recipe_snapshot_entrypoint_projection.sql",
  ]);
  const refreshAuthorityMigrations = readdirSync(
    new URL("../supabase/migrations/", import.meta.url),
  )
    .filter((name) => /^[0-9]{14}_full_local_session_refresh_authority\.sql$/u.test(name))
    .sort();
  if (refreshAuthorityMigrations.length > 1) {
    throw new Error("Docker migration chain found multiple refresh-authority migrations.");
  }
  const migrationDir = new URL("../supabase/migrations/", import.meta.url);
  const migrations = readdirSync(migrationDir)
    .filter((name) => required.has(name) || refreshAuthorityMigrations.includes(name))
    .sort();
  if (migrations.length !== required.size + refreshAuthorityMigrations.length) {
    throw new Error("Docker migration chain is incomplete.");
  }
  const recipeSnapshotFixtureDependency = `
    alter table public.cooking_methods
      add column if not exists category_code varchar(50);
    create table if not exists public.recipe_step_cooking_methods (
      id uuid primary key default gen_random_uuid(),
      step_id uuid not null references public.recipe_steps(id) on delete cascade,
      method_id uuid not null references public.cooking_methods(id) on delete restrict,
      position integer not null,
      created_at timestamptz not null default now(),
      constraint recipe_step_cooking_methods_position_positive check (position > 0),
      constraint recipe_step_cooking_methods_step_method_unique unique (step_id, method_id),
      constraint recipe_step_cooking_methods_step_position_unique unique (step_id, position)
    );
  `;
  const sql = `${migrations.map((name) => [
    name === "20260723170000_recipe_visibility_read_hardening.sql"
      ? recipeSnapshotFixtureDependency
      : "",
    `\\echo applying ${name}`,
    "begin;",
    readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8"),
    "commit;",
  ].join("\n")).join("\n")}\nnotify pgrst, 'reload schema';\n`;
  commandWithInput(
    "docker",
    ["compose", "--project-name", project, "-f", composeFile, "exec", "-T", "postgres", "psql", "-U", "supabase_admin", "-d", "postgres", "-v", "ON_ERROR_STOP=1"],
    env,
    sql,
  );
}

async function waitForPostgrestSchemaReload(internalPort: number, serviceRoleKey: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await fetch(
      `http://127.0.0.1:${internalPort}/rest/v1/rpc/read_full_local_auth_control`,
      {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
          "content-type": "application/json",
          "x-homecook-internal-scope": "auth-flow",
        },
        body: "{}",
      },
    );
    if (response.ok) return;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error("PostgREST schema reload did not become queryable.");
}

describe("full-local production Docker verification gate", () => {
  it("keeps the browser-first refresh docker smoke inside the exact lifecycle bundle", () => {
    expect(packageJson.scripts?.["verify:full-local-session-refresh-lifecycle"]).toBe(
      "pnpm exec vitest run tests/full-local-session-authority.test.ts tests/full-local-auth-db-foundation.test.ts tests/full-local-request-authority-migration.test.ts tests/hybrid-session-authority-bootstrap.test.ts tests/hybrid-session-authority-gateway.test.ts && pnpm test:full-local-auth-db-foundation:postgres && pnpm test:full-local-production:runtime",
    );
  });
});

run("full-local production Docker runtime", () => {
  it.each(["compose", "database", "storage", "restore-manifest", "recovery-manifest"])(
    "removes only exact attempt-owned replacement resources after %s failure and permits identical retry",
    async (failureStage) => {
      const suffix = `${process.pid}-${failureStage}`.replaceAll(/[^a-z0-9-]/giu, "-");
      const project = `homecook-retry-${suffix}`;
      const attemptToken = `attempt-token-${suffix}`;
      const postgresVolume = `${project}-postgres`;
      const storageVolume = `${project}-storage`;
      const decoyVolume = `${project}-decoy`;
      const ownedContainer = `${project}-postgres-1`;
      const decoyContainer = `${project}-dev-decoy`;
      const artifactDirectory = mkdtempSync(join(tmpdir(), "homecook-retry-artifacts-"));
      const restoreArtifact = join(artifactDirectory, "restore.json");
      const restoreAuthentication = join(artifactDirectory, "restore.json.auth.json");
      const recoveryArtifact = join(artifactDirectory, "recovery.json");
      const recoveryAuthentication = join(artifactDirectory, "recovery.json.auth.json");
      const preexistingArtifact = join(artifactDirectory, "operator-evidence.json");
      writeFileSync(preexistingArtifact, "preserve", { mode: 0o600 });
      const volumeArgs = (name: string, composeVolume: string, token: string) => [
        "volume",
        "create",
        "--label",
        `com.docker.compose.project=${project}`,
        "--label",
        `com.docker.compose.volume=${composeVolume}`,
        "--label",
        `homecook.local/restore-attempt=${token}`,
        name,
      ];
      try {
        command("docker", volumeArgs(decoyVolume, "storage-data", "other-attempt"), process.env);
        const nodeImage = fullLocalImageRefsForPlatform("linux/arm64").node;
        command("docker", [
          "create",
          "--platform",
          "linux/arm64",
          "--name",
          decoyContainer,
          "--label",
          "com.docker.compose.project=homecook-dev-decoy",
          "--label",
          "com.docker.compose.service=postgres",
          "--label",
          `homecook.local/restore-attempt=${attemptToken}`,
          nodeImage,
          "node",
          "--version",
        ], process.env);
        const artifactPaths = failureStage === "recovery-manifest"
          ? [restoreArtifact, restoreAuthentication, recoveryArtifact, recoveryAuthentication]
          : failureStage === "restore-manifest"
            ? [restoreArtifact, restoreAuthentication]
            : [];
        const inventory = (kind: "container" | "volume") => {
          const ids = command(
            "docker",
            kind === "volume"
              ? ["volume", "ls", "--quiet"]
              : ["container", "ls", "--all", "--quiet"],
            process.env,
          ).split(/\r?\n/u).filter(Boolean);
          if (ids.length === 0) return [];
          return JSON.parse(command(
            "docker",
            kind === "volume"
              ? ["volume", "inspect", ...ids]
              : ["container", "inspect", ...ids],
            process.env,
          )) as Array<Record<string, unknown>>;
        };
        const recordArtifacts = (token: string) => artifactPaths.map((path) => {
            const stat = statSync(path);
            return {
              attemptToken: token,
              dev: stat.dev,
              ino: stat.ino,
              path,
              sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
              size: stat.size,
            };
          });
        const createAttemptResources = (token: string) => {
          command("docker", volumeArgs(postgresVolume, "postgres-data", token), process.env);
          command("docker", volumeArgs(storageVolume, "storage-data", token), process.env);
          command("docker", [
            "create",
            "--platform",
            "linux/arm64",
            "--name",
            ownedContainer,
            "--label",
            `com.docker.compose.project=${project}`,
            "--label",
            "com.docker.compose.service=postgres",
            "--label",
            `homecook.local/restore-attempt=${token}`,
            nodeImage,
            "node",
            "--version",
          ], process.env);
          for (const path of artifactPaths) {
            writeFileSync(path, token, { mode: 0o600 });
          }
        };
        const cleanupInputs = {
          composeProject: project,
          expectedServices: ["postgres", "storage"],
          expectedVolumes: [
            { composeVolume: "postgres-data", name: postgresVolume },
            { composeVolume: "storage-data", name: storageVolume },
          ],
          inventoryContainers: () => inventory("container"),
          inventoryVolumes: () => inventory("volume"),
          removeArtifact: (artifact: { path: string }) => rmSync(artifact.path),
          removeContainer: (containerId: string) => command(
            "docker",
            ["rm", "--force", containerId],
            process.env,
          ),
          removeVolume: (name: string) => command(
            "docker",
            ["volume", "rm", name],
            process.env,
          ),
        };
        const createdArtifacts: ReturnType<typeof recordArtifacts> = [];

        await expect(withReplacementRestoreAttemptCleanup({
          ...cleanupInputs,
          attemptToken,
          createdArtifacts,
          execute: () => {
            createAttemptResources(attemptToken);
            createdArtifacts.push(...recordArtifacts(attemptToken));
            throw new Error(`${failureStage} restore failure`);
          },
        })).rejects.toThrow(`${failureStage} restore failure`);

        expect(spawnSync("docker", ["volume", "inspect", postgresVolume]).status).not.toBe(0);
        expect(spawnSync("docker", ["volume", "inspect", storageVolume]).status).not.toBe(0);
        expect(spawnSync("docker", ["volume", "inspect", decoyVolume]).status).toBe(0);
        expect(spawnSync("docker", ["container", "inspect", ownedContainer]).status).not.toBe(0);
        expect(spawnSync("docker", ["container", "inspect", decoyContainer]).status).toBe(0);
        for (const path of artifactPaths) {
          expect(() => readFileSync(path, "utf8")).toThrow();
        }
        expect(readFileSync(preexistingArtifact, "utf8")).toBe("preserve");

        const retryToken = `${attemptToken}-retry`;
        const retryArtifacts: ReturnType<typeof recordArtifacts> = [];
        await expect(withReplacementRestoreAttemptCleanup({
          ...cleanupInputs,
          attemptToken: retryToken,
          createdArtifacts: retryArtifacts,
          execute: () => {
            createAttemptResources(retryToken);
            retryArtifacts.push(...recordArtifacts(retryToken));
            return "restored";
          },
        })).resolves.toBe("restored");
        expect(spawnSync("docker", ["volume", "inspect", postgresVolume]).status).toBe(0);
        expect(spawnSync("docker", ["volume", "inspect", storageVolume]).status).toBe(0);
        expect(spawnSync("docker", ["container", "inspect", ownedContainer]).status).toBe(0);
        for (const path of artifactPaths) {
          expect(readFileSync(path, "utf8")).toBe(retryToken);
        }
      } finally {
        for (const container of [ownedContainer, decoyContainer]) {
          spawnSync("docker", ["rm", "--force", container], { stdio: "ignore" });
        }
        for (const volume of [postgresVolume, storageVolume, decoyVolume]) {
          spawnSync("docker", ["volume", "rm", volume], { stdio: "ignore" });
        }
        rmSync(artifactDirectory, { force: true, recursive: true });
      }
    },
    30_000,
  );

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
        "https://app.mumeok.kr/auth/callback,https://app.mumeok.kr/auth/link/callback",
      FULL_LOCAL_API_EXTERNAL_URL: "https://auth.mumeok.kr/auth/v1",
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
      FULL_LOCAL_PUBLIC_AUTH_URL: "https://auth.mumeok.kr",
      FULL_LOCAL_SECRET_DIR: secretDirectory,
      FULL_LOCAL_SITE_URL: "https://app.mumeok.kr",
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
      const authContainer = composeServiceContainer(project, env, "auth");
      const postgresContainer = composeServiceContainer(project, env, "postgres");
      const postgrestContainer = composeServiceContainer(project, env, "postgrest");
      const storageContainer = composeServiceContainer(project, env, "storage");
      const authNetworks = JSON.parse(command(
        "docker",
        ["inspect", "--format", "{{json .NetworkSettings.Networks}}", authContainer],
        env,
      )) as Record<string, unknown>;
      const postgresNetworks = JSON.parse(command(
        "docker",
        ["inspect", "--format", "{{json .NetworkSettings.Networks}}", postgresContainer],
        env,
      )) as Record<string, unknown>;
      const postgrestNetworks = JSON.parse(command(
        "docker",
        ["inspect", "--format", "{{json .NetworkSettings.Networks}}", postgrestContainer],
        env,
      )) as Record<string, unknown>;
      const storageNetworks = JSON.parse(command(
        "docker",
        ["inspect", "--format", "{{json .NetworkSettings.Networks}}", storageContainer],
        env,
      )) as Record<string, unknown>;
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
      const attestationPayload = Buffer.from(JSON.stringify({
        method: "GET",
        path: "/",
      })).toString("base64url");
      const invalidAttestation = await fetch(
        `http://127.0.0.1:${internalPort}/rest/v1/`,
        {
          headers: {
            ...headers,
            "x-homecook-session-attestation": attestationPayload,
            "x-homecook-session-attestation-signature": "0".repeat(64),
          },
        },
      );
      const validAttestation = await fetch(
        `http://127.0.0.1:${internalPort}/rest/v1/`,
        {
          headers: {
            ...headers,
            "x-homecook-session-attestation": attestationPayload,
            "x-homecook-session-attestation-signature": createHmac(
              "sha256",
              secrets.session_attestation_hmac_key_v1,
            ).update(attestationPayload).digest("hex"),
          },
        },
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
      expect(Object.keys(authNetworks).sort()).toEqual([
        `${project}_auth-egress`,
        `${project}_data-internal`,
      ]);
      expect(Object.keys(postgresNetworks)).toEqual([`${project}_data-internal`]);
      expect(Object.keys(postgrestNetworks)).toEqual([`${project}_data-internal`]);
      expect(Object.keys(storageNetworks)).toEqual([`${project}_data-internal`]);
      expect(invalidAttestation.status).toBe(401);
      expect(validAttestation.status).not.toBe(401);

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
        try {
          command(
            "docker",
            ["volume", "rm", "--force", env.FULL_LOCAL_POSTGRES_VOLUME_NAME],
            env,
          );
        } finally {
          rmSync(root, { force: true, recursive: true });
        }
      }
    }
    expect(failure).toBeUndefined();
  }, 240_000);

  it("replays browser-first refreshed JWT through public auth refresh, real authority RPC, and protected PostgREST", async () => {
    const root = mkdtempSync(join(tmpdir(), "homecook-full-local-refresh-"));
    const project = `homecook-full-local-refresh-${Date.now()}`;
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
        "https://app.mumeok.kr/auth/callback,https://app.mumeok.kr/auth/link/callback",
      FULL_LOCAL_API_EXTERNAL_URL: "https://auth.mumeok.kr/auth/v1",
      FULL_LOCAL_AUTH_IMAGE: images.auth,
      FULL_LOCAL_AUTH_PROXY_PORT: String(authPort),
      FULL_LOCAL_COMPOSE_PROJECT_NAME: project,
      FULL_LOCAL_DOCKER_PLATFORM: "linux/arm64",
      FULL_LOCAL_ENABLE_ANONYMOUS_USERS: "false",
      FULL_LOCAL_ENABLE_EMAIL_AUTOCONFIRM: "true",
      // Fixture-only enablement for this refresh lifecycle test.
      // Production contract is verified in the earlier smoke test where
      // email login remains disabled; here we only need a real session +
      // refresh token pair for an admin-created confirmed user.
      FULL_LOCAL_ENABLE_EMAIL_SIGNUP: "true",
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
      FULL_LOCAL_PUBLIC_AUTH_URL: "https://auth.mumeok.kr",
      FULL_LOCAL_SECRET_DIR: secretDirectory,
      FULL_LOCAL_SITE_URL: "https://app.mumeok.kr",
      FULL_LOCAL_STORAGE_FILE_SIZE_LIMIT: "52428800",
      FULL_LOCAL_STORAGE_GLOBAL_BUCKET: "homecook-test",
      FULL_LOCAL_STORAGE_IMAGE: images.storage,
      FULL_LOCAL_STORAGE_REGION: "homecook-local-1",
      FULL_LOCAL_STORAGE_TENANT_ID: "homecook-test",
      FULL_LOCAL_STORAGE_VOLUME_NAME: `${project}-storage`,
    };

    try {
      compose(project, env, ["up", "-d"]);
      await waitForHealthy(project, env);

      const password = "HomecookTestPassword!123456789";
      applyDockerMigrationChain(project, env);
      composeOutput(project, env, [
        "exec", "-T", "postgres", "psql", "-U", "supabase_admin", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c",
        `
          grant usage on schema private, public, recipe_visibility_guard to postgres;
          grant select, update on private.full_local_auth_control to postgres;
          grant select, insert, update, delete on all tables in schema public to postgres;
        `,
      ]);
      await waitForPostgrestSchemaReload(internalPort, secrets.service_role_key);

      const createUser = await authJsonRequest({
        authPort,
        path: "/auth/v1/admin/users",
        method: "POST",
        headers: {
          apikey: secrets.secret_key,
          authorization: `Bearer ${secrets.secret_key}`,
        },
        body: {
          email: "docker-refresh@example.invalid",
          email_confirm: true,
          password,
          user_metadata: { nickname: "docker-refresh", provider: "google" },
        },
      });
      expect([200, 201]).toContain(createUser.response.status);
      const createdUser = createUser.json as {
        id: string;
        created_at: string;
        email: string;
      };
      composeOutput(project, env, [
        "exec", "-T", "postgres", "psql", "-U", "supabase_admin", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c",
        `
          insert into public.users (id, nickname, email, social_provider, social_id)
          values ('${createdUser.id}', 'docker-refresh', '${createdUser.email}', 'google', '${createdUser.id}')
          on conflict (id) do nothing;
          insert into public.user_account_lifecycles (
            owner_uuid,
            account_generation,
            auth_identity_created_at_snapshot,
            origin,
            status,
            activated_at
          ) values (
            '${createdUser.id}',
            1,
            '${createdUser.created_at}',
            'runtime',
            'active',
            now() - interval '10 seconds'
          )
          on conflict do nothing;
          insert into public.account_generation_cutover_attempts (
            id,
            state,
            capability_revision,
            result_json,
            promoted_at
          ) values (
            '00000000-0000-4000-8000-000000000103'::uuid,
            'promoted',
            2,
            '{}'::jsonb,
            now() - interval '10 seconds'
          );
          insert into public.recipes (
            id,
            title,
            source_type,
            created_by
          ) values (
            '00000000-0000-4000-8000-000000000101'::uuid,
            'browser-first refresh recipe',
            'manual',
            '${createdUser.id}'::uuid
          );
          insert into public.meal_plan_columns (
            id,
            user_id,
            name,
            sort_order
          ) values (
            '00000000-0000-4000-8000-000000000102'::uuid,
            '${createdUser.id}'::uuid,
            'refresh test',
            0
          );
          update public.account_generation_capability_state
          set state = 'generation_active',
              revision = revision + 1,
              current_cutover_attempt_id = '00000000-0000-4000-8000-000000000103'::uuid,
              activated_at = now() - interval '10 seconds'
          where singleton;
          update private.full_local_auth_control
          set authority = 'local',
              flows_open = true,
              cutover_epoch = 2,
              hmac_key_version = 2,
              local_issuer = 'https://auth.mumeok.kr/auth/v1',
              local_activated_at = now() - interval '10 seconds',
              updated_at = now()
          where singleton;
        `,
      ]);
      const passwordGrant = await authJsonRequest({
        authPort,
        path: "/auth/v1/token?grant_type=password",
        method: "POST",
        headers: { apikey: secrets.publishable_key },
        body: {
          email: createdUser.email,
          password,
        },
      });
      expect(
        passwordGrant.response.status,
        typeof passwordGrant.json === "string"
          ? passwordGrant.json
          : JSON.stringify(passwordGrant.json),
      ).toBe(200);
      const sessionA = passwordGrant.json as {
        access_token: string;
        refresh_token: string;
      };
      const claimsA = readJwtClaims(sessionA.access_token);
      const sessionKeyHash = createSessionKeyHash({
        secret: secrets.session_generation_hmac_key_v2,
        keyVersion: 2,
        issuer: claimsA.iss,
        ownerUuid: createdUser.id,
        sessionId: claimsA.session_id,
        identityCreatedAt: createdUser.created_at,
      });

      composeOutput(project, env, [
        "exec", "-T", "postgres", "psql", "-U", "supabase_admin", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c",
        `
          select set_config(
            'request.jwt.claims',
            '{"role":"service_role"}',
            false
          );
          select public.record_full_local_session_authority_v2(
            p_issuer := 'https://auth.mumeok.kr/auth/v1',
            p_owner_uuid := '${createdUser.id}'::uuid,
            p_identity_created_at := '${createdUser.created_at}'::timestamptz,
            p_session_id := '${claimsA.session_id}'::uuid,
            p_session_key_hash := '${sessionKeyHash}',
            p_hmac_key_version := 2,
            p_auth_cutover_epoch := 2,
            p_session_issued_at := to_timestamp(${claimsA.iat}),
            p_last_token_issued_at := to_timestamp(${claimsA.iat}),
            p_verified_at := to_timestamp(${claimsA.iat} + 1),
            p_access_token_expires_at := to_timestamp(${claimsA.exp}),
            p_binding_expires_at := to_timestamp(${claimsA.exp})
          );
        `,
      ]);
      const refresh = await readNewerRefreshedSession({
        authPort,
        publishableKey: secrets.publishable_key,
        sessionA,
      });
      const { claimsB, sessionB } = refresh;
      expect(claimsB.session_id).toBe(claimsA.session_id);
      expect(claimsB.iat).toBeGreaterThan(claimsA.iat);
      expect(claimsB.exp).toBeGreaterThan(claimsA.exp);

      const authorityFetch = createHybridAuthorityFetch({
        getAccessToken: async () => sessionB.access_token,
        remoteLivenessFetch: globalThis.fetch,
        localUpstreamFetch: globalThis.fetch,
        loadRemoteJwks: async () => {
          const response = await fetch(
            `http://127.0.0.1:${authPort}/auth/v1/.well-known/jwks.json`,
            { headers: { apikey: secrets.publishable_key } },
          );
          if (!response.ok) {
            throw new Error(`GoTrue JWKS returned ${response.status}`);
          }
          return response.json();
        },
        assertSessionAuthority: async (input) => {
          const enriched = input as typeof input & {
            accessTokenExpiresAt?: string;
            lastTokenIssuedAt?: string;
            sessionId?: string;
            verifiedAt?: string;
          };
          const response = await fetch(
            `http://127.0.0.1:${internalPort}/rest/v1/rpc/assert_and_renew_full_local_session_authority_v2`,
            {
              method: "POST",
              headers: {
                "content-type": "application/json",
                apikey: secrets.service_role_key,
                authorization: `Bearer ${secrets.service_role_key}`,
                "x-homecook-internal-scope": "request-authority",
              },
              body: JSON.stringify({
                p_issuer: input.binding.issuer,
                p_owner_uuid: input.binding.owner_uuid,
                p_identity_created_at: input.binding.identity_created_at,
                p_session_id: enriched.sessionId,
                p_session_key_hash: input.binding.session_key_hash,
                p_hmac_key_version: input.binding.hmac_key_version,
                p_auth_cutover_epoch: input.authCutoverEpoch ?? 2,
                p_session_issued_at: input.sessionIssuedAt,
                p_last_token_issued_at: enriched.lastTokenIssuedAt,
                p_verified_at: enriched.verifiedAt,
                p_access_token_expires_at: enriched.accessTokenExpiresAt,
                p_binding_expires_at: enriched.accessTokenExpiresAt,
              }),
            },
          );
          if (!response.ok) {
            throw new Error(await response.text());
          }
        },
        auth: {
          issuer: "https://auth.mumeok.kr/auth/v1",
          url: `http://127.0.0.1:${authPort}`,
          publishableKey: secrets.publishable_key,
        },
        attestationSecret: secrets.session_attestation_hmac_key_v1,
        resolveSessionBindingKey: async () => ({
          authCutoverEpoch: 2,
          keyVersion: 2,
          secret: secrets.session_generation_hmac_key_v2,
        }),
        nowSeconds: () => Math.max(
          claimsB.iat,
          Math.floor(Date.now() / 1_000),
        ),
      });

      const protectedResponses = await Promise.all(Array.from({ length: 10 }, () =>
        authorityFetch(
          `http://127.0.0.1:${internalPort}/rest/v1/meal_plan_columns?id=eq.00000000-0000-4000-8000-000000000102&select=id`,
          { headers: { apikey: secrets.anon_key } },
        ),
      ));
      for (const response of protectedResponses) {
        const responseBody = await response.clone().text();
        expect(response.status, responseBody).toBe(200);
      }

      const mutationResponse = await fetch(
        `http://127.0.0.1:${internalPort}/rest/v1/rpc/write_future_meal_with_snapshot_authority`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            apikey: secrets.service_role_key,
            authorization: `Bearer ${secrets.service_role_key}`,
            "x-homecook-internal-scope": "future-meal-write",
          },
          body: JSON.stringify({
            p_owner_uuid: createdUser.id,
            p_auth_identity_created_at_snapshot: createdUser.created_at,
            p_session_key_hash: sessionKeyHash,
            p_hmac_key_version: 2,
            p_session_issued_at: new Date(claimsB.iat * 1_000).toISOString(),
            p_action: "create",
            p_meal_id: null,
            p_recipe_id: "00000000-0000-4000-8000-000000000101",
            p_plan_date: "2026-08-09",
            p_column_id: "00000000-0000-4000-8000-000000000102",
            p_planned_servings: 2,
            p_leftover_dish_id: null,
            p_now: new Date(claimsB.iat * 1_000).toISOString(),
          }),
        },
      );
      expect(mutationResponse.status, await mutationResponse.text()).toBe(200);
      expect(composeOutput(project, env, [
        "exec", "-T", "postgres", "psql", "-U", "supabase_admin", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1", "-c",
        `
          select concat_ws(
            ':',
            count(*)::text,
            count(distinct id)::text
          )
          from public.meals
          where user_id = '${createdUser.id}'::uuid
            and recipe_id = '00000000-0000-4000-8000-000000000101'::uuid
            and column_id = '00000000-0000-4000-8000-000000000102'::uuid;
        `,
      ]).trim()).toBe("1:1");
      expect(composeOutput(project, env, [
        "exec", "-T", "postgres", "psql", "-U", "supabase_admin", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1", "-c",
        `
          select concat_ws(
            ':',
            session_issued_at = to_timestamp(${claimsA.iat}),
            last_token_issued_at = to_timestamp(${claimsB.iat}),
            binding_expires_at = to_timestamp(${claimsB.exp}),
            binding_state
          )
          from public.user_session_generation_bindings
          where session_key_hash = '${sessionKeyHash}';
        `,
      ]).trim()).toBe("t:t:t:active");

      const logArtifacts = compose(project, env, ["ps", "-q"])
        .trim().split("\n").filter(Boolean).map((container) =>
          command("docker", ["logs", container], env),
        );
      expect(assertNoSecretLeakage({
        artifacts: logArtifacts,
        secrets: [
          password,
          sessionA.access_token,
          sessionA.refresh_token,
          sessionB.access_token,
          createdUser.id,
        ],
      })).toBe(true);
    } finally {
      try {
        compose(project, env, ["down", "--volumes", "--remove-orphans"]);
      } finally {
        try {
          command(
            "docker",
            ["volume", "rm", "--force", env.FULL_LOCAL_POSTGRES_VOLUME_NAME],
            env,
          );
        } finally {
          rmSync(root, { force: true, recursive: true });
        }
      }
    }
  }, 240_000);
});
