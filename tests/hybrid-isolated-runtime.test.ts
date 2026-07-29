import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

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

  it("sets only the isolated runtime login-role passwords after the locked image bootstrap", () => {
    const bootstrap = readFileSync(
      "infra/hybrid-supabase/hybrid-role-passwords.sh",
      "utf8",
    );

    expect(bootstrap).toMatch(/ON_ERROR_STOP=1/);
    expect(bootstrap).toMatch(/ALTER ROLE authenticator WITH PASSWORD/);
    expect(bootstrap).toMatch(
      /ALTER ROLE supabase_storage_admin WITH PASSWORD/,
    );
    expect(bootstrap).not.toMatch(/ALTER ROLE (anon|authenticated|service_role)/);
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

  it("records an exact-version runtime smoke with no published ports", () => {
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
