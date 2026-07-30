import { execFileSync } from "node:child_process";
import {
  createHmac,
  generateKeyPairSync,
  randomBytes,
} from "node:crypto";
import {
  chmodSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";

import { describe, expect, it } from "vitest";

const run = process.env.HYBRID_PRODUCTION_DOCKER_SMOKE === "1"
  ? describe
  : describe.skip;
const composeFile = "infra/hybrid-supabase/docker-compose.production.yml";

function command(
  executable: string,
  args: string[],
  options: Parameters<typeof execFileSync>[2] = {},
) {
  return execFileSync(executable, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    ...options,
  }) as string;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("No loopback port was allocated."));
        return;
      }
      const { port } = address;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function randomUriCredential() {
  return ["postgres", randomBytes(32).toString("base64url")].join("-");
}

function legacyJwt(role: "anon" | "service_role", secret: string) {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  const now = Math.floor(Date.now() / 1_000);
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({
    aud: "authenticated",
    exp: now + 365 * 24 * 60 * 60,
    iat: now - 60,
    iss: "supabase",
    role,
  });
  const signature = createHmac("sha256", secret)
    .update(`${header}.${payload}`, "utf8")
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

function fixtureSecrets() {
  const localSecret =
    `runtime-storage-${randomBytes(32).toString("base64url")}`;
  const { publicKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  return {
    AUTH_SUPABASE_PUBLISHABLE_KEY:
      `sb_publishable_${randomBytes(32).toString("base64url")}`,
    DATA_SUPABASE_PUBLISHABLE_KEY: legacyJwt("anon", localSecret),
    DATA_SUPABASE_SECRET_KEY: legacyJwt("service_role", localSecret),
    HOMECOOK_HYBRID_BACKUP_KEY:
      `backup-only-${randomBytes(32).toString("base64url")}`,
    HOMECOOK_SESSION_ATTESTATION_HMAC_KEY_V1:
      `attestation-${randomBytes(32).toString("base64url")}`,
    HOMECOOK_SESSION_GENERATION_HMAC_KEY_V1:
      `generation-${randomBytes(32).toString("base64url")}`,
    HYBRID_COMBINED_JWKS: JSON.stringify({
      keys: [
        {
          ...publicKey.export({ format: "jwk" }),
          alg: "ES256",
          kid: "production-docker-remote",
          use: "sig",
        },
        {
          alg: "HS256",
          k: Buffer.from(localSecret, "utf8").toString("base64url"),
          kid: "production-docker-local",
          kty: "oct",
          use: "sig",
        },
      ],
    }),
    HYBRID_POSTGRES_PASSWORD: randomUriCredential(),
    HYBRID_STORAGE_LEGACY_JWT_SECRET: localSecret,
  };
}

function runtimeConfig(
  name: string,
  port: number,
  directory: string,
) {
  const engineArchitecture = command(
    "docker",
    ["info", "--format", "{{.Architecture}}"],
  ).trim();
  const dockerPlatform = ["aarch64", "arm64"].includes(engineArchitecture)
    ? "linux/arm64"
    : "linux/amd64";
  const values = {
    AUTH_SUPABASE_EXPECTED_ISSUER:
      "https://production-docker-fixture.supabase.co/auth/v1",
    AUTH_SUPABASE_JWKS_URL:
      "https://production-docker-fixture.supabase.co/auth/v1/.well-known/jwks.json",
    AUTH_SUPABASE_URL:
      "https://production-docker-fixture.supabase.co",
    HOMECOOK_DATA_AUTHORITY: "remote",
    HOMECOOK_HYBRID_BACKUP_KEY_ID:
      "homecook-hybrid-production-test-backup-v1",
    HOMECOOK_HYBRID_GATEWAY_PORT: String(port),
    HOMECOOK_HYBRID_SECRET_SOURCE: "process-env",
    HYBRID_COMPOSE_PROJECT_NAME: name,
    HYBRID_DOCKER_PLATFORM: dockerPlatform,
    HYBRID_GATEWAY_TIMEOUT_MS: "750",
    HYBRID_POSTGRES_DB: "homecook",
    HYBRID_POSTGRES_VOLUME_NAME: `${name}-postgres`,
    HYBRID_STORAGE_FILE_SIZE_LIMIT: "52428800",
    HYBRID_STORAGE_GLOBAL_BUCKET: name,
    HYBRID_STORAGE_TENANT_ID: name,
    HYBRID_STORAGE_VOLUME_NAME: `${name}-storage`,
  };
  const path = join(directory, `${name}.env`);
  writeFileSync(
    path,
    Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n") + "\n",
    { mode: 0o600 },
  );
  chmodSync(path, 0o600);
  return { path, values };
}

function cli(
  config: ReturnType<typeof runtimeConfig>,
  secrets: ReturnType<typeof fixtureSecrets>,
  args: string[],
) {
  return command(
    "node",
    [
      "scripts/hybrid-production-runtime.mjs",
      ...args,
      "--config",
      config.path,
      "--allow-process-env-secrets",
    ],
    { env: { ...process.env, ...secrets } },
  );
}

function compose(
  config: ReturnType<typeof runtimeConfig>,
  secrets: ReturnType<typeof fixtureSecrets>,
  args: string[],
) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...config.values,
    ...secrets,
  };
  delete env.DOCKER_DEFAULT_PLATFORM;
  return command(
    "docker",
    [
      "compose",
      "--project-name",
      config.values.HYBRID_COMPOSE_PROJECT_NAME,
      "-f",
      composeFile,
      ...args,
    ],
    { env },
  );
}

function psql(
  config: ReturnType<typeof runtimeConfig>,
  secrets: ReturnType<typeof fixtureSecrets>,
  sql: string,
) {
  return compose(config, secrets, [
    "exec",
    "-T",
    "postgres",
    "psql",
    "-XAt",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "supabase_admin",
    "-d",
    "homecook",
    "-c",
    sql,
  ]).trim();
}

function uploadStorageObject(
  config: ReturnType<typeof runtimeConfig>,
  secrets: ReturnType<typeof fixtureSecrets>,
) {
  const result = compose(config, secrets, [
    "exec",
    "-T",
    "-e",
    `SERVICE_JWT=${secrets.DATA_SUPABASE_SECRET_KEY}`,
    "gateway",
    "node",
    "--input-type=module",
    "-e",
    `
      const body = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      );
      const response = await fetch(
        "http://storage:5000/object/recipe-images-private/runtime/clean-volume.png",
        {
          method: "POST",
          headers: {
            authorization: "Bearer " + process.env.SERVICE_JWT,
            "content-type": "image/png",
            "x-upsert": "true",
          },
          body,
        },
      );
      process.stdout.write(JSON.stringify({
        status: response.status,
        body: await response.text(),
      }));
    `,
  ]);
  return JSON.parse(result) as { body: string; status: number };
}

function cleanup(
  config: ReturnType<typeof runtimeConfig>,
  secrets: ReturnType<typeof fixtureSecrets>,
) {
  try {
    compose(config, secrets, ["down", "-v", "--remove-orphans"]);
  } catch {
    // Best-effort cleanup is intentionally scoped to the randomized test project.
  }
}

run("hybrid production Mac Docker runtime", () => {
  it("installs, persists, backs up, restores to clean volumes, and keeps only the gateway on loopback", async () => {
    const directory = mkdtempSync(
      join(tmpdir(), "homecook-hybrid-production-docker-"),
    );
    const suffix = `${process.pid}-${randomBytes(4).toString("hex")}`;
    const secrets = fixtureSecrets();
    const source = runtimeConfig(
      `hc-prod-source-${suffix}`,
      await freePort(),
      directory,
    );
    const target = runtimeConfig(
      `hc-prod-target-${suffix}`,
      await freePort(),
      directory,
    );
    const sourceBackup = join(directory, "source-complete-v2.tar.gz.enc");
    const targetPreRestore = join(
      directory,
      "target-before-restore.tar.gz.enc",
    );

    expect(source.values.HOMECOOK_HYBRID_GATEWAY_PORT).not.toBe("3100");
    expect(target.values.HOMECOOK_HYBRID_GATEWAY_PORT).not.toBe("3100");

    try {
      expect(JSON.parse(cli(source, secrets, ["validate"]))).toMatchObject({
        compose: "valid",
        status: "PASS",
      });
      const installed = JSON.parse(cli(source, secrets, ["install"]));
      expect(installed.status).toBe("PASS");
      expect(installed.migrations).toBe(
        readdirSync("supabase/migrations")
          .filter((name) => name.endsWith(".sql")).length,
      );
      expect(JSON.parse(cli(source, secrets, ["install"]))).toMatchObject({
        migrations: 119,
        status: "PASS",
      });

      const health = await fetch(
        `http://127.0.0.1:${source.values.HOMECOOK_HYBRID_GATEWAY_PORT}/healthz`,
      );
      expect(health.status).toBe(200);
      expect(await health.json()).toEqual({ status: "healthy" });

      psql(
        source,
        secrets,
        `
          insert into public.ingredients (
            id, standard_name, category, default_unit
          ) values (
            '90000000-0000-4000-8000-000000000001',
            'production runtime persistence marker',
            '기타',
            '개'
          );
        `,
      );
      const upload = uploadStorageObject(source, secrets);
      expect(upload.status, upload.body).toBe(200);

      const sourceManifest = JSON.parse(
        cli(source, secrets, ["manifest"]),
      );
      expect(sourceManifest.semantic).toMatchObject({
        auth_users: 0,
        auth_users_residual: 0,
        invalid_constraints: 0,
        migration_count: 119,
        runtime_ready: true,
      });
      expect(sourceManifest.storage.references.count).toBeGreaterThan(0);
      expect(sourceManifest.storage.files.count).toBe(
        sourceManifest.storage.references.count,
      );
      expect(sourceManifest.storage.files.bytes).toBe(
        sourceManifest.storage.references.bytes,
      );

      expect(JSON.parse(cli(source, secrets, ["stop"]))).toMatchObject({
        preserved_named_volumes: true,
        status: "PASS",
      });
      expect(JSON.parse(cli(source, secrets, ["start"]))).toMatchObject({
        status: "PASS",
      });
      expect(
        psql(
          source,
          secrets,
          "select count(*) from public.ingredients where id = '90000000-0000-4000-8000-000000000001';",
        ),
      ).toBe("1");
      expect(JSON.parse(cli(source, secrets, ["recover"]))).toMatchObject({
        status: "PASS",
      });

      const exposure = JSON.parse(cli(source, secrets, ["network"]));
      expect(exposure.exposures).toEqual([
        expect.objectContaining({
          host_ip: "127.0.0.1",
          host_port: Number(
            source.values.HOMECOOK_HYBRID_GATEWAY_PORT,
          ),
          service: "gateway",
        }),
      ]);

      const sourceBackupResult = JSON.parse(
        cli(source, secrets, [
          "backup",
          "--output",
          sourceBackup,
        ]),
      );
      expect(sourceBackupResult).toMatchObject({
        status: "PASS",
        database_digest: sourceManifest.database.digest,
        storage_digest: sourceManifest.storage.digest,
      });
      expect(JSON.parse(cli(source, secrets, ["stop"]))).toMatchObject({
        status: "PASS",
      });

      expect(JSON.parse(cli(target, secrets, ["install"]))).toMatchObject({
        status: "PASS",
      });
      expect(
        JSON.parse(
          cli(target, secrets, [
            "backup",
            "--output",
            targetPreRestore,
            "--leave-stopped",
          ]),
        ).status,
      ).toBe("PASS");

      const restored = JSON.parse(
        cli(target, secrets, [
          "restore",
          "--archive",
          sourceBackup,
          "--destructive",
          "--pre-restore-backup",
          targetPreRestore,
        ]),
      );
      expect(restored).toMatchObject({
        status: "PASS",
        phases: [
          "pre-data-schema",
          "hybrid-compatibility-fk-replacement",
          "application-data",
          "post-data-validation",
        ],
        database_digest: sourceManifest.database.digest,
        storage_digest: sourceManifest.storage.digest,
      });

      const targetManifest = JSON.parse(
        cli(target, secrets, ["manifest"]),
      );
      expect(targetManifest.database.digest).toBe(
        sourceManifest.database.digest,
      );
      expect(targetManifest.storage.digest).toBe(
        sourceManifest.storage.digest,
      );
      expect(targetManifest.storage.references).toEqual(
        sourceManifest.storage.references,
      );
      expect(targetManifest.storage.files).toEqual(
        sourceManifest.storage.files,
      );

      compose(target, secrets, ["stop", "storage"]);
      const failedHealth = await fetch(
        `http://127.0.0.1:${target.values.HOMECOOK_HYBRID_GATEWAY_PORT}/healthz`,
      );
      expect(failedHealth.status).toBe(503);
      const failedRead = await fetch(
        `http://127.0.0.1:${target.values.HOMECOOK_HYBRID_GATEWAY_PORT}/rest/v1/ingredients?select=id%2Cstandard_name%2Ccategory%2Ccategory_code&order=standard_name.asc`,
        { headers: { "x-homecook-public-read-scope": "ingredients" } },
      );
      expect(failedRead.status).toBe(503);
      expect(await failedRead.json()).toMatchObject({
        error: { code: "ACCOUNT_LIFECYCLE_MAINTENANCE" },
      });
      expect(JSON.parse(cli(target, secrets, ["recover"]))).toMatchObject({
        status: "PASS",
      });
    } finally {
      cleanup(source, secrets);
      cleanup(target, secrets);
      rmSync(directory, { force: true, recursive: true });
    }
  }, 900_000);
});
