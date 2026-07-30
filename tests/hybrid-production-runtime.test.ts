import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  assertDockerEnginePlatform,
  assertProductionComposeModel,
  assertRestoreAllowed,
  assertSafeTarArchive,
  buildPostDataRestoreList,
  evaluateCapacityPreflight,
  evaluateMemoryCapacityPreflight,
  planOrderedRecovery,
  validateHybridProductionConfig,
  validateSemanticRestoreEvidence,
} from "../scripts/lib/hybrid-production-runtime.mjs";

const GIB = 1024 ** 3;
const LEGACY_SECRET =
  "storage-legacy-secret-at-least-32-bytes-0007";

function legacyJwt(role: "anon" | "service_role", secret = LEGACY_SECRET) {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({
    aud: "authenticated",
    exp: 2_524_608_000,
    iat: 1_700_000_000,
    iss: "supabase",
    role,
  });
  const signature = createHmac("sha256", secret)
    .update(`${header}.${payload}`, "utf8")
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

function validConfig(overrides: Record<string, string> = {}) {
  return {
    AUTH_SUPABASE_EXPECTED_ISSUER:
      "https://example-project.supabase.co/auth/v1",
    AUTH_SUPABASE_JWKS_URL:
      "https://example-project.supabase.co/auth/v1/.well-known/jwks.json",
    AUTH_SUPABASE_URL: "https://example-project.supabase.co",
    HOMECOOK_DATA_AUTHORITY: "remote",
    HOMECOOK_HYBRID_BACKUP_KEY_ID: "homecook-hybrid-backup-v1",
    HOMECOOK_HYBRID_GATEWAY_PORT: "54381",
    HOMECOOK_HYBRID_SECRET_SOURCE: "process-env",
    HYBRID_DOCKER_PLATFORM: "linux/arm64",
    HYBRID_POSTGRES_VOLUME_NAME: "homecook-hybrid-test-postgres",
    HYBRID_STORAGE_VOLUME_NAME: "homecook-hybrid-test-storage",
    ...overrides,
  };
}

function validSecrets(overrides: Record<string, string> = {}) {
  return {
    AUTH_SUPABASE_PUBLISHABLE_KEY:
      "auth-publishable-key-that-is-long-enough-0001",
    DATA_SUPABASE_PUBLISHABLE_KEY: legacyJwt("anon"),
    DATA_SUPABASE_SECRET_KEY: legacyJwt("service_role"),
    HOMECOOK_SESSION_ATTESTATION_HMAC_KEY_V1:
      "attestation-hmac-key-that-is-at-least-32-bytes-0004",
    HOMECOOK_SESSION_GENERATION_HMAC_KEY_V1:
      "binding-hmac-key-that-is-at-least-32-bytes-0005",
    HYBRID_COMBINED_JWKS: JSON.stringify({
      keys: [
        {
          alg: "ES256",
          crv: "P-256",
          kid: "remote-key-1",
          kty: "EC",
          use: "sig",
          x: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
          y: "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
        },
        {
          alg: "HS256",
          k: Buffer.from(LEGACY_SECRET, "utf8").toString("base64url"),
          kid: "local-legacy-hs256",
          kty: "oct",
          use: "sig",
        },
      ],
    }),
    HYBRID_POSTGRES_PASSWORD:
      "postgres-password-that-is-at-least-32-bytes-0006",
    HYBRID_STORAGE_LEGACY_JWT_SECRET: LEGACY_SECRET,
    ...overrides,
  };
}

describe("hybrid production Compose contract", () => {
  it("uses persistent named volumes and publishes only the gateway on loopback", () => {
    const compose = readFileSync(
      "infra/hybrid-supabase/docker-compose.production.yml",
      "utf8",
    );

    expect(compose).not.toContain("auth-stub");
    expect(compose).not.toContain("HYBRID_TEST_");
    expect(compose).not.toMatch(/\btmpfs\s*:/);
    expect(compose).not.toMatch(/:-\s*(?:password|secret|test|integration)/iu);
    expect(compose).toMatch(
      /127\.0\.0\.1:\$\{HOMECOOK_HYBRID_GATEWAY_PORT:\?[^}]+}:8080/,
    );
    expect(compose.match(/\bports\s*:/g)).toHaveLength(1);
    expect(compose).toMatch(/HYBRID_POSTGRES_VOLUME_NAME/);
    expect(compose).toMatch(/HYBRID_STORAGE_VOLUME_NAME/);
    expect(compose.match(/platform:\s*\$\{HYBRID_DOCKER_PLATFORM:/g))
      .toHaveLength(5);
    expect(compose).toMatch(
      /postgrest:[\s\S]*command:\s*\[[^\]]*"postgrest"[^\]]*"\+RTS"[^\]]*"-N2"[^\]]*"-RTS"[^\]]*\]/u,
    );
    expect(compose).toMatch(/restart:\s*unless-stopped/g);
    expect(compose).toMatch(
      /gateway:[\s\S]*postgres:[\s\S]*condition:\s*service_healthy/,
    );
    expect(compose).toMatch(
      /gateway:[\s\S]*postgrest-probe:[\s\S]*condition:\s*service_healthy/,
    );
    expect(compose).toMatch(
      /gateway:[\s\S]*storage:[\s\S]*condition:\s*service_healthy/,
    );
    expect(compose).toMatch(
      /gateway:[\s\S]*DATA_SUPABASE_PUBLISHABLE_KEY:/u,
    );
    const dockerIgnore = readFileSync(".dockerignore", "utf8");
    expect(dockerIgnore).toMatch(/^\*\*/u);
    expect(dockerIgnore).not.toMatch(/!\.env/u);
    expect(dockerIgnore).toContain(
      "!infra/hybrid-supabase/loopback-gateway.mjs",
    );
  });

  it("rejects any non-loopback or upstream host publication", () => {
    expect(() =>
      assertProductionComposeModel({
        services: {
          gateway: {
            ports: [
              {
                published: "54381",
                target: 8080,
                host_ip: "0.0.0.0",
              },
            ],
          },
          postgres: {
            ports: [
              {
                published: "5432",
                target: 5432,
                host_ip: "127.0.0.1",
              },
            ],
          },
          postgrest: {},
          storage: {},
        },
      }),
    ).toThrow(/loopback|gateway/u);
  });
});

describe("hybrid production environment validation", () => {
  it("accepts separated remote/local authority values without logging secrets", () => {
    expect(
      validateHybridProductionConfig({
        config: validConfig(),
        secrets: validSecrets(),
        configFileMode: 0o600,
      }),
    ).toMatchObject({
      authority: "remote",
      dockerPlatform: "linux/arm64",
      gatewayPort: 54381,
      secretCount: 8,
    });
  });

  it("rejects an unsupported or emulated Docker platform", () => {
    expect(() =>
      validateHybridProductionConfig({
        config: validConfig({ HYBRID_DOCKER_PLATFORM: "linux/386" }),
        secrets: validSecrets(),
        configFileMode: 0o600,
      }),
    ).toThrow(/HYBRID_DOCKER_PLATFORM/u);

    expect(() =>
      assertDockerEnginePlatform({
        configuredPlatform: "linux/amd64",
        engineArchitecture: "aarch64",
        engineOs: "linux",
      }),
    ).toThrow(/native Docker engine platform/u);

    expect(
      assertDockerEnginePlatform({
        configuredPlatform: "linux/arm64",
        engineArchitecture: "aarch64",
        engineOs: "linux",
      }),
    ).toBe("linux/arm64");
  });

  it.each([
    ["placeholder", { DATA_SUPABASE_SECRET_KEY: "replace-me" }],
    [
      "same-key",
      {
        DATA_SUPABASE_SECRET_KEY:
          legacyJwt("anon"),
      },
    ],
    ["short-key", { HYBRID_POSTGRES_PASSWORD: "short" }],
    [
      "unsafe-postgres-uri-password",
      {
        HYBRID_POSTGRES_PASSWORD:
          "postgres-password-with-unsafe-uri-characters-@/",
      },
    ],
  ])("rejects %s secrets", (_name, override) => {
    expect(() =>
      validateHybridProductionConfig({
        config: validConfig(),
        secrets: validSecrets(override),
        configFileMode: 0o600,
      }),
    ).toThrow();
  });

  it("rejects a readable-by-group production config file", () => {
    expect(() =>
      validateHybridProductionConfig({
        config: validConfig(),
        secrets: validSecrets(),
        configFileMode: 0o640,
      }),
    ).toThrow(/0600/u);
  });

  it("rejects malformed remote verification keys in combined JWKS", () => {
    expect(() =>
      validateHybridProductionConfig({
        config: validConfig(),
        secrets: validSecrets({
          HYBRID_COMBINED_JWKS: JSON.stringify({
            keys: [
              {
                alg: "ES256",
                crv: "P-256",
                kid: "malformed-remote",
                kty: "EC",
                use: "sig",
              },
              {
                alg: "HS256",
                k: Buffer.from(LEGACY_SECRET, "utf8").toString("base64url"),
                kid: "local-legacy-hs256",
                kty: "oct",
                use: "sig",
              },
            ],
          }),
        }),
        configFileMode: 0o600,
      }),
    ).toThrow(/JWKS|key/u);
  });

  it.each([
    [
      "plain publishable string",
      { DATA_SUPABASE_PUBLISHABLE_KEY: "a".repeat(128) },
    ],
    [
      "wrong service role",
      { DATA_SUPABASE_SECRET_KEY: legacyJwt("anon") },
    ],
    [
      "wrong HMAC signer",
      {
        DATA_SUPABASE_SECRET_KEY: legacyJwt(
          "service_role",
          "different-storage-secret-at-least-32-bytes",
        ),
      },
    ],
    [
      "wrong audience",
      {
        DATA_SUPABASE_PUBLISHABLE_KEY: (() => {
          const encode = (value: object) =>
            Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
          const header = encode({ alg: "HS256", typ: "JWT" });
          const payload = encode({
            aud: "other",
            exp: 2_524_608_000,
            iat: 1_700_000_000,
            iss: "supabase",
            role: "anon",
          });
          const signature = createHmac("sha256", LEGACY_SECRET)
            .update(`${header}.${payload}`, "utf8")
            .digest("base64url");
          return `${header}.${payload}.${signature}`;
        })(),
      },
    ],
  ])("rejects %s instead of a valid local legacy JWT", (_name, override) => {
    expect(() =>
      validateHybridProductionConfig({
        config: validConfig(),
        secrets: validSecrets(override),
        configFileMode: 0o600,
      }),
    ).toThrow(/JWT|role|signature/u);
  });
});

describe("hybrid production restore safety", () => {
  it("rejects traversal, links, and unexpected complete-v2 archive entries", () => {
    expect(() =>
      assertSafeTarArchive({
        exactEntries: [
          "database.dump",
          "manifest.json",
          "storage.tar.gz",
        ],
        names: "database.dump\n../escape\nstorage.tar.gz\n",
        verbose:
          "-rw-------  0 user group 1 Jan 1 00:00 database.dump\n"
          + "-rw-------  0 user group 1 Jan 1 00:00 ../escape\n"
          + "-rw-------  0 user group 1 Jan 1 00:00 storage.tar.gz\n",
      }),
    ).toThrow(/unsafe archive path|entries/u);

    expect(() =>
      assertSafeTarArchive({
        names: "./\n./object-link\n",
        verbose:
          "drwx------  0 user group 0 Jan 1 00:00 ./\n"
          + "lrwxr-xr-x  0 user group 0 Jan 1 00:00 ./object-link -> /tmp\n",
      }),
    ).toThrow(/regular files and directories/u);
  });

  it("omits only legacy auth.users FK entries during compatibility restore", () => {
    const restoreList = [
      "101; 2606 123 CONSTRAINT public admin_members admin_members_user_id_fkey supabase_admin",
      "102; 2606 124 CONSTRAINT public admin_members admin_members_granted_by_fkey supabase_admin",
      "103; 2606 125 CONSTRAINT public admin_audit_logs admin_audit_logs_actor_admin_user_id_fkey supabase_admin",
      "104; 1259 126 INDEX public admin_members_pkey supabase_admin",
    ].join("\n");

    expect(buildPostDataRestoreList(restoreList, true)).toBe([
      ";101; 2606 123 CONSTRAINT public admin_members admin_members_user_id_fkey supabase_admin",
      ";102; 2606 124 CONSTRAINT public admin_members admin_members_granted_by_fkey supabase_admin",
      ";103; 2606 125 CONSTRAINT public admin_audit_logs admin_audit_logs_actor_admin_user_id_fkey supabase_admin",
      "104; 1259 126 INDEX public admin_members_pkey supabase_admin",
    ].join("\n"));
    expect(buildPostDataRestoreList(restoreList, false)).toBe(restoreList);
  });

  it("refuses destructive restore without an explicit flag and pre-restore backup", () => {
    expect(() =>
      assertRestoreAllowed({
        destructive: false,
        preRestoreBackupPath: null,
        preRestoreBackupVerified: false,
      }),
    ).toThrow(/destructive/u);

    expect(() =>
      assertRestoreAllowed({
        destructive: true,
        preRestoreBackupPath: null,
        preRestoreBackupVerified: false,
      }),
    ).toThrow(/pre-restore backup/u);
  });

  it("requires the exact semantic restore order", () => {
    expect(() =>
      validateSemanticRestoreEvidence({
        phases: [
          "pre-data-schema",
          "application-data",
          "hybrid-compatibility-fk-replacement",
          "post-data-validation",
        ],
        authUsers: 0,
        authUsersResidual: 0,
        publicManifest: { source: "digest-a", target: "digest-a" },
        storageManifest: { source: "digest-b", target: "digest-b" },
      }),
    ).toThrow(/restore order/u);
  });

  it.each([
    ["auth.users rows", { authUsers: 1, authUsersResidual: 0 }],
    ["auth.users dependency", { authUsers: 0, authUsersResidual: 1 }],
  ])("rejects %s after restore", (_name, counts) => {
    expect(() =>
      validateSemanticRestoreEvidence({
        phases: [
          "pre-data-schema",
          "hybrid-compatibility-fk-replacement",
          "application-data",
          "post-data-validation",
        ],
        ...counts,
        publicManifest: { source: "digest-a", target: "digest-a" },
        storageManifest: { source: "digest-b", target: "digest-b" },
      }),
    ).toThrow(/auth\.users/u);
  });

  it("rejects DB or Storage manifest mismatch", () => {
    expect(() =>
      validateSemanticRestoreEvidence({
        phases: [
          "pre-data-schema",
          "hybrid-compatibility-fk-replacement",
          "application-data",
          "post-data-validation",
        ],
        authUsers: 0,
        authUsersResidual: 0,
        publicManifest: { source: "digest-a", target: "digest-other" },
        storageManifest: { source: "digest-b", target: "digest-b" },
      }),
    ).toThrow(/manifest mismatch/u);
  });
});

describe("hybrid production recovery and capacity", () => {
  it("refuses to advance when an ordered dependency is unhealthy", () => {
    expect(() =>
      planOrderedRecovery({
        postgres: "healthy",
        postgrest: "unhealthy",
        storage: "healthy",
        gateway: "not-started",
      }),
    ).toThrow(/postgrest/u);
  });

  it("is idempotent after every dependency is already healthy", () => {
    expect(
      planOrderedRecovery({
        postgres: "healthy",
        postgrest: "healthy",
        storage: "healthy",
        gateway: "healthy",
      }),
    ).toEqual([]);
  });

  it("enforces max(80GiB, three times current DB+Storage bytes)", () => {
    expect(
      evaluateCapacityPreflight({
        dataBytes: 4 * 1024 ** 2,
        freeBytes: 120 * GIB,
      }),
    ).toMatchObject({ pass: true, requiredBytes: 80 * GIB });

    expect(
      evaluateCapacityPreflight({
        dataBytes: 30 * GIB,
        freeBytes: 89 * GIB,
      }),
    ).toMatchObject({ pass: false, requiredBytes: 90 * GIB });
  });

  it("requires Docker, Mac RAM, and swap headroom above measured service peaks", () => {
    const services = {
      gateway: { currentBytes: 128 * 1024 ** 2, peakBytes: 160 * 1024 ** 2 },
      postgres: { currentBytes: 256 * 1024 ** 2, peakBytes: 320 * 1024 ** 2 },
      postgrest: { currentBytes: 96 * 1024 ** 2, peakBytes: 128 * 1024 ** 2 },
      storage: { currentBytes: 192 * 1024 ** 2, peakBytes: 256 * 1024 ** 2 },
    };

    expect(
      evaluateMemoryCapacityPreflight({
        dockerMemoryLimitBytes: 8 * GIB,
        macAvailableBytes: 16 * GIB,
        services,
        swapFreeBytes: 4 * GIB,
        swapTotalBytes: 8 * GIB,
      }),
    ).toMatchObject({
      pass: true,
      totalCurrentBytes: 672 * 1024 ** 2,
      totalPeakBytes: 864 * 1024 ** 2,
    });

    expect(
      evaluateMemoryCapacityPreflight({
        dockerMemoryLimitBytes: 1 * GIB,
        macAvailableBytes: 1 * GIB,
        services,
        swapFreeBytes: 0,
        swapTotalBytes: 8 * GIB,
      }),
    ).toMatchObject({
      dockerPass: false,
      macRamPass: false,
      pass: false,
      swapPass: false,
    });
  });
});

describe("hybrid production verification routing", () => {
  it("automates production artifacts while keeping live reboot, shadow, and cutover manual", () => {
    const verifier = readFileSync(
      "scripts/verify-hybrid-supabase.mjs",
      "utf8",
    );

    for (const mode of [
      "production-runtime-artifacts",
      "backup-restore-dry-run",
      "ordered-recovery-dry-run",
      "capacity-preflight-dry-run",
      "network-loopback-fixture",
    ]) {
      expect(verifier).toContain(`"${mode}"`);
    }
    expect(verifier).toMatch(
      /manualOnlyModes[\s\S]*mac-reboot-ordered-recovery-live/u,
    );
    expect(verifier).toMatch(/manualOnlyModes[\s\S]*shadow-read/u);
    expect(verifier).toMatch(/manualOnlyModes[\s\S]*final-cutover/u);
  });

  it("builds the current allowlisted gateway source during production install", () => {
    const cli = readFileSync(
      "scripts/hybrid-production-runtime.mjs",
      "utf8",
    );

    expect(cli).toMatch(
      /case "install"[\s\S]*compose\(runtime, \["build", "gateway"\]/u,
    );
    expect(cli).toMatch(
      /docker[\s\S]*pull[\s\S]*--platform[\s\S]*HYBRID_DOCKER_PLATFORM/u,
    );
    expect(cli).toMatch(
      /delete env\.DOCKER_DEFAULT_PLATFORM/u,
    );
    expect(cli).toMatch(/Docker image architecture mismatch/u);
    expect(cli).not.toContain("runtime-storage-bootstrap.sql");
    expect(cli).not.toContain("runtime-bootstrap.sql");
    expect(cli).toContain("auth_users_external_depend_residual");
    expect(cli).toContain("pg_catalog.pg_depend");
    expect(cli).toMatch(
      /Storage reference manifest does not match the persisted files/u,
    );
    expect(cli).toMatch(
      /verifyPreRestoreBackup[\s\S]*extractBackup/u,
    );
    expect(cli).toContain('"/backup/$1"');
    expect(cli).not.toContain("/backup/${basename(archivePath)}");
  });
});
