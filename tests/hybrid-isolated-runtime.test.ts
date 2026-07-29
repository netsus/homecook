import { execFileSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  buildBootstrapAuthorityRecord,
  createGatewayConfig,
} from "@/infra/hybrid-supabase/loopback-gateway.mjs";

describe("isolated hybrid integration runtime", () => {
  it("does not publish Postgres, PostgREST or Storage host ports", () => {
    const compose = readFileSync(
      "infra/hybrid-supabase/docker-compose.integration.yml",
      "utf8",
    );

    expect(compose).not.toMatch(/\bports\s*:/);
    expect(compose).toMatch(/internal:\s*true/);
    expect(compose).toMatch(
      /public\.ecr\.aws\/supabase\/postgres:17\.6\.1\.136/,
    );
    expect(compose).toMatch(/POSTGRES_USER:\s*supabase_admin/);
    expect(compose).toMatch(
      /hybrid-role-passwords\.sh:\/docker-entrypoint-initdb\.d\/zz-homecook-role-passwords\.sh:ro/,
    );
    expect(compose).toMatch(/postgrest\/postgrest:v14\.12/);
    expect(compose).toMatch(/supabase\/storage-api:v1\.60\.4/);
    expect(compose).toMatch(/PGRST_JWT_AUD:\s*authenticated/);
    expect(compose).toMatch(/PGRST_JWT_SECRET:.*COMBINED_JWKS/);
    expect(compose).toMatch(
      /PGRST_DB_PRE_REQUEST:\s*private\.verify_hybrid_request_authority/,
    );
    expect(compose).toMatch(
      /PGRST_DB_URI:\s*postgres:\/\/authenticator:/,
    );
    expect(compose).toMatch(/PGRST_DB_SCHEMAS:\s*public,storage/);
    expect(compose).not.toMatch(
      /PGRST_DB_URI:\s*postgres:\/\/postgres:/,
    );
    expect(compose).toMatch(
      /DATABASE_URL:\s*postgres:\/\/supabase_storage_admin:/,
    );
    expect(compose).toMatch(/JWT_JWKS:.*COMBINED_JWKS/);
    expect(compose).toMatch(
      /PGRST_JWT_SECRET:.*HYBRID_TEST_STORAGE_LEGACY_SECRET/,
    );
    expect(compose).toMatch(/\n  gateway:\n/);
    expect(compose).toMatch(/STORAGE_UPSTREAM_URL:\s*http:\/\/storage:5000/);
  });

  it("injects isolated login-role passwords and DB authority settings without literal secrets", () => {
    const bootstrap = readFileSync(
      "infra/hybrid-supabase/hybrid-role-passwords.sh",
      "utf8",
    );

    expect(bootstrap).toMatch(/ON_ERROR_STOP=1/);
    expect(bootstrap).toMatch(/ALTER ROLE authenticator WITH PASSWORD/);
    expect(bootstrap).toMatch(
      /ALTER ROLE supabase_storage_admin WITH PASSWORD/,
    );
    expect(bootstrap).toMatch(
      /ALTER DATABASE[\s\S]*app\.settings\.auth_expected_issuer/,
    );
    expect(bootstrap).toMatch(
      /ALTER DATABASE[\s\S]*app\.settings\.homecook_session_attestation_hmac_key_v1/,
    );
    expect(bootstrap).not.toMatch(/ALTER ROLE (anon|authenticated|service_role)/);
    expect(bootstrap).not.toContain("integration-attestation-hmac-key-32-bytes");
  });

  it("allows the local secret only on the exact binding control-plane RPCs", () => {
    const gateway = readFileSync(
      "infra/hybrid-supabase/loopback-gateway.mjs",
      "utf8",
    );

    expect(gateway).toMatch(/INTERNAL_CONTROL_PLANE_RPC_PATHS/);
    expect(gateway).toMatch(/timingSafeEqual/);
    expect(gateway).toMatch(
      /record_hybrid_remote_session_authority/,
    );
    expect(gateway).toMatch(
      /revoke_hybrid_remote_session_authority/,
    );
  });

  it("generates the auth-stub signing key per runtime instead of committing one", () => {
    const authStub = readFileSync(
      "infra/hybrid-supabase/auth-stub.mjs",
      "utf8",
    );

    expect(authStub).not.toMatch(/BEGIN (?:EC )?PRIVATE KEY/);
    expect(authStub).toMatch(/AUTH_STUB_PRIVATE_KEY_PEM_BASE64/);
  });

  it("locks the DB2 semantic rehearsal baseline without treating dev auth rows as authority", () => {
    const fixture = JSON.parse(readFileSync(
      "tests/fixtures/hybrid-rehearsal-db2.json",
      "utf8",
    )) as Record<string, number>;

    expect(fixture).toEqual({
      auth_users: 0,
      public_users: 5,
      public_rows_approx: 3442,
      storage_objects: 1,
    });
  });

  it("records the encrypted PG17 restore preflight and known pre-migration gaps", () => {
    const evidence = JSON.parse(readFileSync(
      "tests/fixtures/hybrid-stage01-restore-evidence.json",
      "utf8",
    )) as {
      backup: {
        filename: string;
        sha256: string;
        encrypted_size_bytes: number;
        file_mode: string;
        cipher: string;
        pbkdf2_iterations: number;
        archive_check: string;
        storage_object: {
          size_bytes: number;
          sha256_redacted: string;
          media_type: string;
        };
      };
      superseded_backup: { cutover_evidence: boolean; reason: string };
      restore: {
        image: string;
        published_ports: Record<string, never>;
        phases: string[];
        metrics: Record<string, number>;
      };
    };

    expect(evidence.backup).toMatchObject({
      filename: "homecook-hybrid-rehearsal-20260730-complete-v2.tar.gz.enc",
      sha256:
        "dd0d7c7e65ac48e7fda071cb2c08e6abd677689742ad97c56ec450e973530390",
      encrypted_size_bytes: 2816032,
      file_mode: "600",
      cipher: "AES-256-CBC",
      pbkdf2_iterations: 200000,
      archive_check: "PASS",
      storage_object: {
        size_bytes: 2127830,
        sha256_redacted: "e6d153...f57b",
        media_type: "image/jpeg",
      },
    });
    expect(evidence.superseded_backup).toMatchObject({
      cutover_evidence: false,
      reason: "storage-object-payload-missing",
    });
    expect(evidence.restore.image).toBe(
      "public.ecr.aws/supabase/postgres:17.6.1.121",
    );
    expect(evidence.restore.published_ports).toEqual({});
    expect(evidence.restore.phases).toEqual([
      "roles",
      "schema-application",
      "data-application",
    ]);
    expect(evidence.restore.metrics).toEqual({
      auth_users: 0,
      public_users: 5,
      public_tables: 82,
      storage_objects: 1,
      invalid_constraints: 0,
      admin_members_missing_auth: 1,
      admin_audit_missing_auth: 99,
    });
  });

  it("records the isolated Stage 2 migration before/after semantics", () => {
    const evidence = JSON.parse(readFileSync(
      "tests/fixtures/hybrid-stage2-migration-evidence.json",
      "utf8",
    )) as {
      target: { published_ports: Record<string, never> };
      after: Record<string, number | string>;
      transaction_canary: string;
    };

    expect(evidence.target.published_ports).toEqual({});
    expect(evidence.after).toMatchObject({
      auth_users: 0,
      public_users: 5,
      public_tables: 82,
      storage_objects: 1,
      invalid_constraints: 0,
      auth_users_fk_residual: 0,
      auth_users_proc_residual: 0,
      auth_users_external_depend_residual: 0,
      admin_members_missing_public: 0,
      admin_audit_missing_public: 0,
      account_generation_capability: "legacy",
    });
    expect(evidence.transaction_canary).toBe(
      "HYBRID_SESSION_AUTHORITY_TRANSACTION_PASS",
    );
  });

  it("preserves the historical runtime snapshot without treating it as measured proof", () => {
    const evidence = JSON.parse(readFileSync(
      "tests/fixtures/hybrid-stage2-runtime-evidence.json",
      "utf8",
    )) as {
      images: Record<string, string>;
      published_ports: Record<string, never>;
      role_connections: Record<string, string>;
      internal_http: Record<string, number>;
      production_writes: number;
      cutover_writes: number;
    };

    expect(evidence.images).toEqual({
      postgres: "public.ecr.aws/supabase/postgres:17.6.1.136",
      postgrest: "postgrest/postgrest:v14.12",
      storage: "supabase/storage-api:v1.60.4",
      gateway: "node:22.20.0-alpine",
    });
    expect(evidence.published_ports).toEqual({});
    expect(evidence.role_connections).toEqual({
      authenticator: "PASS",
      supabase_storage_admin: "PASS",
    });
    expect(evidence.internal_http).toEqual({
      postgrest: 200,
      storage: 200,
      gateway_unauthenticated: 409,
    });
    expect(evidence.production_writes).toBe(0);
    expect(evidence.cutover_writes).toBe(0);
  });
});

const composeRun = process.env.HYBRID_RUNTIME_COMPOSE === "1"
  ? describe
  : describe.skip;

function run(
  command: string,
  args: string[],
  options: Parameters<typeof execFileSync>[2] = {},
): string {
  return execFileSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    ...options,
  }) as string;
}

function gatewayExec(
  composeArgs: string[],
  script: string,
  extraEnv: Record<string, string>,
) {
  return run("docker", [
    ...composeArgs,
    "exec",
    "-T",
    ...Object.entries(extraEnv).flatMap(([name, value]) => ["-e", `${name}=${value}`]),
    "gateway",
    "node",
    "--input-type=module",
    "-e",
    script,
  ]);
}

composeRun("isolated hybrid integration runtime measured", () => {
  it("measures callback bootstrap, request app-settings injection, revoke fail-closed, anon GET, and upstream 503s", () => {
    const composeFile = "infra/hybrid-supabase/docker-compose.integration.yml";
    const project = `homecook-hybrid-${process.pid}`;
    const composeArgs = ["compose", "-p", project, "-f", composeFile];
    const nowSeconds = Math.floor(Date.now() / 1_000);
    const { privateKey: authStubPrivateKey } = generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
    });
    const authStubPrivateKeyPemBase64 = Buffer.from(
      authStubPrivateKey.export({
        format: "pem",
        type: "pkcs8",
      }),
    ).toString("base64");
    const authFixture = JSON.parse(run(
      "node",
      [
        "infra/hybrid-supabase/auth-stub.mjs",
        "issue-token",
        "--now-seconds",
        String(nowSeconds),
      ],
      {
        env: {
          ...process.env,
          AUTH_STUB_ISSUER: "http://auth-stub:4100/auth/v1",
          AUTH_STUB_PRIVATE_KEY_PEM_BASE64: authStubPrivateKeyPemBase64,
        },
      },
    )) as {
      access_token: string;
      claims: {
        iss: string;
        sub: string;
        session_id: string;
      };
      created_at: string;
      jwks: { keys: unknown[] };
    };
    const authFixtureB = JSON.parse(run(
      "node",
      [
        "infra/hybrid-supabase/auth-stub.mjs",
        "issue-token",
        "--owner-uuid",
        "33333333-3333-4333-8333-333333333333",
        "--session-id",
        "44444444-4444-4444-8444-444444444444",
        "--now-seconds",
        String(nowSeconds),
      ],
      {
        env: {
          ...process.env,
          AUTH_STUB_ISSUER: "http://auth-stub:4100/auth/v1",
          AUTH_STUB_PRIVATE_KEY_PEM_BASE64: authStubPrivateKeyPemBase64,
        },
      },
    )) as typeof authFixture;
    const serviceFixture = JSON.parse(run(
      "node",
      [
        "infra/hybrid-supabase/auth-stub.mjs",
        "issue-token",
        "--role",
        "service_role",
        "--now-seconds",
        String(nowSeconds),
      ],
      {
        env: {
          ...process.env,
          AUTH_STUB_ISSUER: "http://auth-stub:4100/auth/v1",
          AUTH_STUB_PRIVATE_KEY_PEM_BASE64: authStubPrivateKeyPemBase64,
        },
      },
    )) as {
      access_token: string;
    };
    const gatewayConfig = createGatewayConfig({
      ALLOW_INSECURE_LOCAL_AUTH_STUB: "1",
      AUTH_SUPABASE_URL: "http://auth-stub:4100",
      AUTH_SUPABASE_EXPECTED_ISSUER: "http://auth-stub:4100/auth/v1",
      AUTH_SUPABASE_JWKS_URL: "http://auth-stub:4100/auth/v1/.well-known/jwks.json",
      AUTH_SUPABASE_PUBLISHABLE_KEY: "integration-publishable-key",
      DATA_SUPABASE_SECRET_KEY: serviceFixture.access_token,
      HOMECOOK_SESSION_ATTESTATION_HMAC_KEY_V1:
        "integration-attestation-hmac-key-32-bytes",
      HOMECOOK_SESSION_GENERATION_HMAC_KEY_V1:
        "integration-binding-hmac-key-32-bytes",
      POSTGREST_UPSTREAM_URL: "http://postgrest:3000",
      STORAGE_UPSTREAM_URL: "http://storage:5000",
      HYBRID_GATEWAY_TIMEOUT_MS: "500",
    });
    const bootstrapBody = buildBootstrapAuthorityRecord({
      claims: {
        iss: authFixture.claims.iss,
        sub: authFixture.claims.sub,
        session_id: authFixture.claims.session_id,
      } as never,
      identityCreatedAt: authFixture.created_at,
      now: nowSeconds,
      config: gatewayConfig,
    });
    const bootstrapBodyB = buildBootstrapAuthorityRecord({
      claims: {
        iss: authFixtureB.claims.iss,
        sub: authFixtureB.claims.sub,
        session_id: authFixtureB.claims.session_id,
      } as never,
      identityCreatedAt: authFixtureB.created_at,
      now: nowSeconds,
      config: gatewayConfig,
    });
    const runtimeEnv = {
      ...process.env,
      DOCKER_DEFAULT_PLATFORM: process.arch === "arm64"
        ? "linux/arm64"
        : "linux/amd64",
      HYBRID_TEST_ALLOW_INSECURE_AUTH_STUB: "1",
      HYBRID_TEST_AUTH_STUB_PRIVATE_KEY_PEM_BASE64:
        authStubPrivateKeyPemBase64,
      HYBRID_TEST_AUTH_ISSUER: "http://auth-stub:4100/auth/v1",
      HYBRID_TEST_AUTH_JWKS_URL: "http://auth-stub:4100/auth/v1/.well-known/jwks.json",
      HYBRID_TEST_AUTH_URL: "http://auth-stub:4100",
      HYBRID_TEST_COMBINED_JWKS: JSON.stringify(authFixture.jwks),
      HYBRID_TEST_ANON_ALLOWED_PATHS: "/rest/v1/recipes",
      HYBRID_TEST_SERVICE_KEY: serviceFixture.access_token,
    };

    try {
      run("docker", [
        ...composeArgs,
        "up",
        "-d",
        "--wait",
        "postgres",
        "auth-stub",
      ], {
        env: runtimeEnv,
      });

      run("docker", [
        ...composeArgs,
        "exec",
        "-T",
        "postgres",
        "psql",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        "supabase_admin",
        "-d",
        "homecook_hybrid_test",
      ], {
        input: readFileSync("infra/hybrid-supabase/runtime-bootstrap.sql", "utf8"),
      });

      run("docker", [...composeArgs, "up", "-d", "--wait"], {
        env: {
          ...runtimeEnv,
        },
      });
      gatewayExec(
        composeArgs,
        `
          for (let attempt = 0; attempt < 60; attempt += 1) {
            try {
              const response = await fetch("http://postgrest:3000/");
              if (response.status !== 503) {
                process.exit(0);
              }
            } catch {}
            await new Promise((resolve) => setTimeout(resolve, 250));
          }
          process.exit(1);
        `,
        {},
      );
      gatewayExec(
        composeArgs,
        `
          for (let attempt = 0; attempt < 60; attempt += 1) {
            try {
              const response = await fetch("http://storage:5000/status");
              if (response.ok) {
                process.exit(0);
              }
            } catch {}
            await new Promise((resolve) => setTimeout(resolve, 250));
          }
          process.exit(1);
        `,
        {},
      );
      run("docker", [
        ...composeArgs,
        "exec",
        "-T",
        "postgres",
        "psql",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        "supabase_admin",
        "-d",
        "homecook_hybrid_test",
      ], {
        input: readFileSync(
          "infra/hybrid-supabase/runtime-storage-bootstrap.sql",
          "utf8",
        ),
      });

      const bootstrapResult = gatewayExec(
        composeArgs,
        `
          const response = await fetch("http://127.0.0.1:8080/rest/v1/rpc/record_hybrid_remote_session_authority", {
            method: "POST",
            headers: {
              authorization: \`Bearer \${process.env.DATA_SECRET}\`,
              "content-type": "application/json",
            },
            body: process.env.BOOTSTRAP_BODY,
          });
          console.log(JSON.stringify({ status: response.status, body: await response.text() }));
        `,
        {
          BOOTSTRAP_BODY: JSON.stringify(bootstrapBody),
          DATA_SECRET: serviceFixture.access_token,
        },
      );
      const parsedBootstrap = JSON.parse(bootstrapResult) as {
        status: number;
        body: string;
      };
      expect(parsedBootstrap.status, parsedBootstrap.body).toBe(200);

      const bootstrapResultB = gatewayExec(
        composeArgs,
        `
          const response = await fetch("http://127.0.0.1:8080/rest/v1/rpc/record_hybrid_remote_session_authority", {
            method: "POST",
            headers: {
              authorization: \`Bearer \${process.env.DATA_SECRET}\`,
              "content-type": "application/json",
            },
            body: process.env.BOOTSTRAP_BODY,
          });
          console.log(JSON.stringify({ status: response.status, body: await response.text() }));
        `,
        {
          BOOTSTRAP_BODY: JSON.stringify(bootstrapBodyB),
          DATA_SECRET: serviceFixture.access_token,
        },
      );
      const parsedBootstrapB = JSON.parse(bootstrapResultB) as {
        status: number;
        body: string;
      };
      expect(parsedBootstrapB.status, parsedBootstrapB.body).toBe(200);

      const rejectedUserControlPlane = gatewayExec(
        composeArgs,
        `
          const response = await fetch("http://127.0.0.1:8080/rest/v1/rpc/record_hybrid_remote_session_authority", {
            method: "POST",
            headers: {
              authorization: \`Bearer \${process.env.ACCESS_TOKEN}\`,
              "content-type": "application/json",
            },
            body: process.env.BOOTSTRAP_BODY,
          });
          console.log(JSON.stringify({ status: response.status, body: await response.text() }));
        `,
        {
          ACCESS_TOKEN: authFixture.access_token,
          BOOTSTRAP_BODY: JSON.stringify(bootstrapBody),
        },
      );
      expect(JSON.parse(rejectedUserControlPlane).status).toBe(403);

      const probeResult = gatewayExec(
        composeArgs,
        `
          const response = await fetch("http://127.0.0.1:8080/rest/v1/rpc/hybrid_runtime_request_probe", {
            method: "POST",
            headers: {
              authorization: \`Bearer \${process.env.ACCESS_TOKEN}\`,
              "content-type": "application/json",
            },
            body: "{}",
          });
          console.log(JSON.stringify({ status: response.status, body: await response.text() }));
        `,
        {
          ACCESS_TOKEN: authFixture.access_token,
        },
      );
      const parsedProbe = JSON.parse(probeResult) as { status: number; body: string };
      const probeBody = JSON.parse(parsedProbe.body) as {
        auth_expected_issuer: string;
        owner_uuid: string;
        probe_count: number;
        attestation_secret_length: number;
      };
      expect(parsedProbe.status, parsedProbe.body).toBe(200);
      expect(probeBody.owner_uuid).toBe(authFixture.claims.sub);
      expect(probeBody.auth_expected_issuer).toBe("http://auth-stub:4100/auth/v1");
      expect(probeBody.probe_count).toBe(1);
      expect(probeBody.attestation_secret_length).toBeGreaterThanOrEqual(32);

      const rlsResult = gatewayExec(
        composeArgs,
        `
          const results = {};
          for (const [name, token] of [
            ["owner", process.env.ACCESS_TOKEN_A],
            ["other", process.env.ACCESS_TOKEN_B],
          ]) {
            const response = await fetch(
              "http://127.0.0.1:8080/rest/v1/hybrid_runtime_probe?select=owner_uuid,note",
              { headers: { authorization: \`Bearer \${token}\` } },
            );
            results[name] = {
              status: response.status,
              body: await response.text(),
            };
          }
          const privateAnonymous = await fetch(
            "http://127.0.0.1:8080/rest/v1/hybrid_runtime_probe?select=owner_uuid",
          );
          results.privateAnonymous = {
            status: privateAnonymous.status,
            body: await privateAnonymous.text(),
          };
          console.log(JSON.stringify(results));
        `,
        {
          ACCESS_TOKEN_A: authFixture.access_token,
          ACCESS_TOKEN_B: authFixtureB.access_token,
        },
      );
      const parsedRls = JSON.parse(rlsResult) as Record<
        string,
        { status: number; body: string }
      >;
      expect(parsedRls.owner.status, parsedRls.owner.body).toBe(200);
      expect(JSON.parse(parsedRls.owner.body)).toHaveLength(1);
      expect(parsedRls.other.status, parsedRls.other.body).toBe(200);
      expect(JSON.parse(parsedRls.other.body)).toEqual([]);
      expect(parsedRls.privateAnonymous.status).toBe(409);

      const mutationResult = gatewayExec(
        composeArgs,
        `
          const ownerResponse = await fetch(
            "http://127.0.0.1:8080/rest/v1/hybrid_runtime_mutations",
            {
              method: "POST",
              headers: {
                authorization: \`Bearer \${process.env.ACCESS_TOKEN_A}\`,
                "content-type": "application/json",
              },
              body: JSON.stringify({
                id: "55555555-5555-4555-8555-555555555555",
                owner_uuid: process.env.OWNER_A,
                note: "owner-write",
              }),
            },
          );
          const crossOwnerResponse = await fetch(
            "http://127.0.0.1:8080/rest/v1/hybrid_runtime_mutations",
            {
              method: "POST",
              headers: {
                authorization: \`Bearer \${process.env.ACCESS_TOKEN_B}\`,
                "content-type": "application/json",
              },
              body: JSON.stringify({
                id: "66666666-6666-4666-8666-666666666666",
                owner_uuid: process.env.OWNER_A,
                note: "cross-owner-write",
              }),
            },
          );
          console.log(JSON.stringify({
            owner: {
              status: ownerResponse.status,
              body: await ownerResponse.text(),
            },
            crossOwner: {
              status: crossOwnerResponse.status,
              body: await crossOwnerResponse.text(),
            },
          }));
        `,
        {
          ACCESS_TOKEN_A: authFixture.access_token,
          ACCESS_TOKEN_B: authFixtureB.access_token,
          OWNER_A: authFixture.claims.sub,
        },
      );
      const parsedMutation = JSON.parse(mutationResult) as Record<
        string,
        { status: number; body: string }
      >;
      expect(parsedMutation.owner.status, parsedMutation.owner.body).toBe(201);
      expect(parsedMutation.crossOwner.status).toBeGreaterThanOrEqual(400);

      const storageMutation = gatewayExec(
        composeArgs,
        `
          const ownerUpload = await fetch(
            "http://127.0.0.1:8080/storage/v1/object/runtime-private/owner-a.txt",
            {
              method: "POST",
              headers: {
                authorization: \`Bearer \${process.env.ACCESS_TOKEN_A}\`,
                "content-type": "text/plain",
              },
              body: "owner-a",
            },
          );
          const crossOwnerOverwrite = await fetch(
            "http://127.0.0.1:8080/storage/v1/object/runtime-private/owner-a.txt",
            {
              method: "PUT",
              headers: {
                authorization: \`Bearer \${process.env.ACCESS_TOKEN_B}\`,
                "content-type": "text/plain",
                "x-upsert": "true",
              },
              body: "owner-b",
            },
          );
          console.log(JSON.stringify({
            owner: {
              status: ownerUpload.status,
              body: await ownerUpload.text(),
            },
            crossOwner: {
              status: crossOwnerOverwrite.status,
              body: await crossOwnerOverwrite.text(),
            },
          }));
        `,
        {
          ACCESS_TOKEN_A: authFixture.access_token,
          ACCESS_TOKEN_B: authFixtureB.access_token,
        },
      );
      const parsedStorageMutation = JSON.parse(storageMutation) as Record<
        string,
        { status: number; body: string }
      >;
      expect(
        parsedStorageMutation.owner.status,
        parsedStorageMutation.owner.body,
      ).toBe(200);
      expect(parsedStorageMutation.crossOwner.status).toBeGreaterThanOrEqual(400);

      const anonResult = gatewayExec(
        composeArgs,
        `
          const response = await fetch("http://127.0.0.1:8080/rest/v1/recipes?select=id,title");
          console.log(JSON.stringify({ status: response.status, body: await response.text() }));
        `,
        {},
      );
      expect(JSON.parse(anonResult).status).toBe(200);

      const revokeResult = gatewayExec(
        composeArgs,
        `
          const response = await fetch("http://127.0.0.1:8080/rest/v1/rpc/revoke_hybrid_remote_session_authority", {
            method: "POST",
            headers: {
              authorization: \`Bearer \${process.env.DATA_SECRET}\`,
              "content-type": "application/json",
            },
            body: process.env.REVOKE_BODY,
          });
          console.log(JSON.stringify({ status: response.status, body: await response.text() }));
        `,
        {
          DATA_SECRET: serviceFixture.access_token,
          REVOKE_BODY: JSON.stringify({
            p_session_key_hash: bootstrapBody.p_session_key_hash,
            p_hmac_key_version: 1,
          }),
        },
      );
      expect(JSON.parse(revokeResult).status).toBe(200);

      const rejectedRebootstrap = gatewayExec(
        composeArgs,
        `
          const response = await fetch("http://127.0.0.1:8080/rest/v1/rpc/record_hybrid_remote_session_authority", {
            method: "POST",
            headers: {
              authorization: \`Bearer \${process.env.DATA_SECRET}\`,
              "content-type": "application/json",
            },
            body: process.env.BOOTSTRAP_BODY,
          });
          console.log(JSON.stringify({ status: response.status, body: await response.text() }));
        `,
        {
          BOOTSTRAP_BODY: JSON.stringify(bootstrapBody),
          DATA_SECRET: serviceFixture.access_token,
        },
      );
      expect(JSON.parse(rejectedRebootstrap).status).not.toBe(200);

      const staleProbe = gatewayExec(
        composeArgs,
        `
          const response = await fetch("http://127.0.0.1:8080/rest/v1/rpc/hybrid_runtime_request_probe", {
            method: "POST",
            headers: {
              authorization: \`Bearer \${process.env.ACCESS_TOKEN}\`,
              "content-type": "application/json",
            },
            body: "{}",
          });
          console.log(JSON.stringify({ status: response.status, body: await response.text() }));
        `,
        {
          ACCESS_TOKEN: authFixture.access_token,
        },
      );
      expect(JSON.parse(staleProbe).status).toBe(409);

      const revokedMutations = gatewayExec(
        composeArgs,
        `
          const dataResponse = await fetch(
            "http://127.0.0.1:8080/rest/v1/hybrid_runtime_mutations",
            {
              method: "POST",
              headers: {
                authorization: \`Bearer \${process.env.ACCESS_TOKEN}\`,
                "content-type": "application/json",
              },
              body: JSON.stringify({
                id: "77777777-7777-4777-8777-777777777777",
                owner_uuid: process.env.OWNER_UUID,
                note: "revoked-write",
              }),
            },
          );
          const storageResponse = await fetch(
            "http://127.0.0.1:8080/storage/v1/object/runtime-private/revoked.txt",
            {
              method: "POST",
              headers: {
                authorization: \`Bearer \${process.env.ACCESS_TOKEN}\`,
                "content-type": "text/plain",
              },
              body: "revoked",
            },
          );
          console.log(JSON.stringify({
            dataStatus: dataResponse.status,
            storageStatus: storageResponse.status,
          }));
        `,
        {
          ACCESS_TOKEN: authFixture.access_token,
          OWNER_UUID: authFixture.claims.sub,
        },
      );
      expect(JSON.parse(revokedMutations)).toEqual({
        dataStatus: 409,
        storageStatus: 409,
      });

      const bindingCount = run("docker", [
        ...composeArgs,
        "exec",
        "-T",
        "postgres",
        "psql",
        "-At",
        "-U",
        "supabase_admin",
        "-d",
        "homecook_hybrid_test",
        "-c",
        "select count(*) from public.user_session_generation_bindings;",
      ]).trim();
      expect(bindingCount).toBe("2");

      const mutationCounts = run("docker", [
        ...composeArgs,
        "exec",
        "-T",
        "postgres",
        "psql",
        "-At",
        "-U",
        "supabase_admin",
        "-d",
        "homecook_hybrid_test",
        "-c",
        "select (select count(*) from public.hybrid_runtime_mutations) || ':' || (select count(*) from storage.objects where bucket_id = 'runtime-private');",
      ]).trim();
      expect(mutationCounts).toBe("1:1");

      run("docker", [...composeArgs, "stop", "auth-stub"]);
      const authOutage = gatewayExec(
        composeArgs,
        `
          const response = await fetch("http://127.0.0.1:8080/rest/v1/rpc/hybrid_runtime_request_probe", {
            method: "POST",
            headers: {
              authorization: \`Bearer \${process.env.ACCESS_TOKEN}\`,
              "content-type": "application/json",
            },
            body: "{}",
          });
          console.log(JSON.stringify({ status: response.status, body: await response.text() }));
        `,
        {
          ACCESS_TOKEN: authFixture.access_token,
        },
      );
      expect(JSON.parse(authOutage).status).toBe(503);

      run("docker", [...composeArgs, "stop", "postgrest"]);
      const postgrestOutage = gatewayExec(
        composeArgs,
        `
          const response = await fetch("http://127.0.0.1:8080/rest/v1/recipes?select=id,title");
          console.log(JSON.stringify({ status: response.status, body: await response.text() }));
        `,
        {},
      );
      expect(JSON.parse(postgrestOutage).status).toBe(503);

      run("docker", [...composeArgs, "stop", "storage"]);
      const storageOutage = gatewayExec(
        composeArgs,
        `
          const response = await fetch("http://127.0.0.1:8080/storage/v1/object/public/runtime/missing.jpg", {
            headers: {
              authorization: \`Bearer \${process.env.ACCESS_TOKEN}\`,
            },
          });
          console.log(JSON.stringify({ status: response.status, body: await response.text() }));
        `,
        {
          ACCESS_TOKEN: authFixture.access_token,
        },
      );
      expect(JSON.parse(storageOutage).status).toBe(503);
    } finally {
      run("docker", [...composeArgs, "down", "-v", "--remove-orphans"], {
        env: runtimeEnv,
      });
    }
  }, 180_000);
});
