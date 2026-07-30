import { createHmac } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertPinnedImageInspection,
  assertBackupMatchesCurrent,
  assertPreRestoreBackupBinding,
  assertDockerEnginePlatform,
  assertProductionComposeModel,
  assertRestoreAllowed,
  assertSafeTarArchive,
  buildAclRestoreList,
  buildPostDataRestoreList,
  canonicalCatalogManifest,
  compareCatalogManifests,
  evaluateCapacityPreflight,
  evaluateMemoryCapacityPreflight,
  evaluateRuntimeStatus,
  planPostRestoreMigrationAdvance,
  planOrderedRecovery,
  runRestorePublicationGate,
  runtimeImageRefsForPlatform,
  synchronizeRemoteJwks,
  validateHybridProductionConfig,
  validateInstalledSemanticState,
  validateSemanticRestoreEvidence,
  validateStoragePayloadInventory,
  validateStorageXattrManifest,
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
  const images = runtimeImageRefsForPlatform("linux/arm64");
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
    HYBRID_NODE_IMAGE: images.node,
    HYBRID_POSTGRES_IMAGE: images.postgres,
    HYBRID_POSTGRES_VOLUME_NAME: "homecook-hybrid-test-postgres",
    HYBRID_POSTGREST_IMAGE: images.postgrest,
    HYBRID_STORAGE_IMAGE: images.storage,
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

  it("pins every runtime image to the expected platform RepoDigest", () => {
    const arm64 = runtimeImageRefsForPlatform("linux/arm64");
    const amd64 = runtimeImageRefsForPlatform("linux/amd64");

    for (const images of [arm64, amd64]) {
      for (const image of Object.values(images)) {
        expect(image).toMatch(
          /^[^:@\s]+(?:\/[^:@\s]+)+@sha256:[0-9a-f]{64}$/u,
        );
        expect(image).not.toContain(":v");
      }
    }
    expect(arm64).not.toEqual(amd64);
    expect(() =>
      validateHybridProductionConfig({
        config: validConfig({
          HYBRID_POSTGREST_IMAGE: "postgrest/postgrest:v14.12",
        }),
        configFileMode: 0o600,
        secrets: validSecrets(),
      }),
    ).toThrow(/RepoDigest|HYBRID_POSTGREST_IMAGE/u);
    expect(() =>
      assertPinnedImageInspection({
        actualPlatform: "linux/arm64",
        configuredPlatform: "linux/arm64",
        expectedReference: arm64.postgrest,
        repoDigests: [
          arm64.postgrest.replace(
            /@sha256:[0-9a-f]{64}$/u,
            `@${"sha256:" + "f".repeat(64)}`,
          ),
        ],
      }),
    ).toThrow(/digest/u);
  });

  it("syncs the exact live remote JWKS atomically and fails closed on rotation or network loss", async () => {
    const directory = mkdtempSync(join(tmpdir(), "hybrid-jwks-test-"));
    const cachePath = join(directory, "remote-jwks.json");
    let remoteKeys = [
      JSON.parse(validSecrets().HYBRID_COMBINED_JWKS).keys[0],
    ];
    const server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ keys: remoteKeys }));
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("JWKS fixture did not bind a loopback port.");
    }
    const url = `http://127.0.0.1:${address.port}/jwks`;

    try {
      const result = await synchronizeRemoteJwks({
        allowInsecureLoopback: true,
        cachePath,
        combinedJwks: validSecrets().HYBRID_COMBINED_JWKS,
        url,
      });
      expect(result).toMatchObject({ keyCount: 1 });
      expect(result.digest).toMatch(/^[0-9a-f]{64}$/u);
      expect(statSync(cachePath).mode & 0o777).toBe(0o600);
      expect(JSON.parse(readFileSync(cachePath, "utf8"))).toEqual({
        keys: remoteKeys,
      });

      const previousCache = readFileSync(cachePath, "utf8");
      remoteKeys = [{
        ...remoteKeys[0],
        kid: "rotated-without-combined-key-update",
      }];
      await expect(
        synchronizeRemoteJwks({
          allowInsecureLoopback: true,
          cachePath,
          combinedJwks: validSecrets().HYBRID_COMBINED_JWKS,
          url,
        }),
      ).rejects.toThrow(/JWKS|rotation|mismatch/u);
      expect(readFileSync(cachePath, "utf8")).toBe(previousCache);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => error ? reject(error) : resolve()));
    }

    await expect(
      synchronizeRemoteJwks({
        allowInsecureLoopback: true,
        cachePath,
        combinedJwks: validSecrets().HYBRID_COMBINED_JWKS,
        url,
      }),
    ).rejects.toThrow(/JWKS|network|fetch/u);
    rmSync(directory, { force: true, recursive: true });
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
  const catalogSections = {
    dependencies: [{ dependent: "public.items", referenced: "private.guard" }],
    extensions: [{ name: "pgcrypto", schema: "extensions", version: "1.3" }],
    guard_functions: [{ name: "private.verify_hybrid_request_authority()" }],
    memberships: [{ member: "authenticator", role: "authenticated" }],
    object_owners_acls: [{ acl: "anon=r", name: "public.items", owner: "admin" }],
    private_data: [{ rows: 1, schema: "private", sha256: "a".repeat(64), table: "epochs" }],
    rls_policies: [{ force: true, policy: "owner", rls: true, table: "public.items" }],
    roles: [{ bypassrls: false, login: false, name: "authenticated", superuser: false }],
    triggers: [{ definition: "execute function private.guard()", name: "guard", table: "public.items" }],
  };

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

    expect(() =>
      assertSafeTarArchive({
        names: "--checkpoint-action=exec=malicious\n",
        verbose:
          "-rw-------  0 user group 1 Jan 1 00:00 "
          + "--checkpoint-action=exec=malicious\n",
      }),
    ).toThrow(/unsafe archive path/u);
  });

  it("allows only the two required PII-free Storage xattrs for every persisted file", () => {
    const path =
      "tenant/project/recipe-images/owner/object.jpg/version";
    const manifest = {
      files: [
        {
          attributes: {
            "user.supabase.cache-control":
              Buffer.from("max-age=3600").toString("base64"),
            "user.supabase.content-type":
              Buffer.from("image/jpeg").toString("base64"),
          },
          path,
        },
      ],
      format: "homecook-storage-xattrs-v1",
    };

    expect(validateStorageXattrManifest({
      manifest,
      storageFiles: [{ path }],
    })).toEqual(manifest);
    expect(() => validateStorageXattrManifest({
      manifest: {
        ...manifest,
        files: [
          {
            ...manifest.files[0],
            attributes: {
              ...manifest.files[0].attributes,
              "user.profile-email":
                Buffer.from("must-not-be-stored").toString("base64"),
            },
          },
        ],
      },
      storageFiles: [{ path }],
    })).toThrow(/xattr allowlist/u);
    expect(() => validateStorageXattrManifest({
      manifest: { files: [], format: manifest.format },
      storageFiles: [{ path }],
    })).toThrow(/file manifest/u);
  });

  it("requires the inner Storage payload set, size, and SHA to exactly match the outer manifest", () => {
    const metadataPath =
      ".homecook-complete-v2-storage-xattrs.json";
    const payloadPath =
      "tenant/project/recipe-images/owner/object.jpg/version";
    const storageFiles = [{
      bytes: 3,
      path: payloadPath,
      sha256: "a".repeat(64),
    }];
    const metadata = {
      bytes: 2,
      path: metadataPath,
      sha256: "b".repeat(64),
      type: "file",
    };
    const payload = {
      ...storageFiles[0],
      type: "file",
    };

    expect(validateStoragePayloadInventory({
      entries: [metadata, payload],
      metadataPath,
      storageFiles,
    })).toEqual([payload]);

    const adversarial = [
      {
        entries: [metadata],
        label: "missing payload",
      },
      {
        entries: [
          metadata,
          payload,
          {
            bytes: 1,
            path: "extra.bin",
            sha256: "c".repeat(64),
            type: "file",
          },
        ],
        label: "extra payload",
      },
      {
        entries: [metadata, payload, payload],
        label: "duplicate payload",
      },
      {
        entries: [
          metadata,
          payload,
          {
            bytes: 1,
            path: "../escape",
            sha256: "c".repeat(64),
            type: "file",
          },
        ],
        label: "path traversal",
      },
      {
        entries: [
          metadata,
          payload,
          {
            bytes: 0,
            path: "object-link",
            sha256: "c".repeat(64),
            type: "link",
          },
        ],
        label: "link",
      },
      {
        entries: [
          metadata,
          { ...payload, sha256: "d".repeat(64) },
        ],
        label: "hash mismatch",
      },
      {
        entries: [metadata, { ...payload, bytes: 4 }],
        label: "size mismatch",
      },
      {
        entries: [payload],
        label: "xattr manifest missing",
      },
    ];

    for (const fixture of adversarial) {
      expect(
        () => validateStoragePayloadInventory({
          entries: fixture.entries,
          metadataPath,
          storageFiles,
        }),
        fixture.label,
      ).toThrow(/Storage payload|archive path|regular files|metadata/u);
    }
  });

  it("hashes every inner Storage regular file during verify-backup before restore", () => {
    const cli = readFileSync(
      "scripts/hybrid-production-runtime.mjs",
      "utf8",
    );

    expect(cli).toMatch(
      /function inspectStorageXattrArchive[\s\S]*stdoutPath:[\s\S]*sha256File[\s\S]*validateStoragePayloadInventory/u,
    );
    expect(cli).toMatch(
      /function extractBackup[\s\S]*inspectStorageXattrArchive[\s\S]*return manifest/u,
    );
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

  it("restores archive ACL entries that pg_restore sections omit", () => {
    const restoreList = [
      "; Archive created at 2026-07-30",
      "101; 2615 2200 SCHEMA - public pg_database_owner",
      "102; 0 0 ACL - SCHEMA public pg_database_owner",
      "103; 1255 123 FUNCTION public gin_extract_value_trgm(text, internal) supabase_admin",
      "104; 0 0 ACL public FUNCTION gin_extract_value_trgm(text, internal) supabase_admin",
      "105; 0 0 DEFAULT ACL - DEFAULT PRIVILEGES FOR FUNCTIONS supabase_admin",
      "106; 0 0 COMMENT public FUNCTION gin_extract_value_trgm(text, internal) supabase_admin",
    ].join("\n");

    expect(buildAclRestoreList(restoreList)).toBe([
      "; Archive created at 2026-07-30",
      ";101; 2615 2200 SCHEMA - public pg_database_owner",
      "102; 0 0 ACL - SCHEMA public pg_database_owner",
      ";103; 1255 123 FUNCTION public gin_extract_value_trgm(text, internal) supabase_admin",
      "104; 0 0 ACL public FUNCTION gin_extract_value_trgm(text, internal) supabase_admin",
      "105; 0 0 DEFAULT ACL - DEFAULT PRIVILEGES FOR FUNCTIONS supabase_admin",
      ";106; 0 0 COMMENT public FUNCTION gin_extract_value_trgm(text, internal) supabase_admin",
    ].join("\n"));
  });

  it("refuses destructive restore without an explicit flag and pre-restore backup", () => {
    expect(() =>
      assertRestoreAllowed({
        destructive: false,
        preRestoreBackupPath: null,
        preRestoreBackupAbsent: false,
      }),
    ).toThrow(/destructive/u);

    expect(() =>
      assertRestoreAllowed({
        destructive: true,
        preRestoreBackupPath: null,
        preRestoreBackupAbsent: false,
      }),
    ).toThrow(/pre-restore backup/u);
  });

  it("binds the immediate pre-restore backup to the exact current project and manifests", () => {
    const expected = {
      catalogDigest: "c".repeat(64),
      createdAfterMs: Date.parse("2026-07-30T00:00:00.000Z"),
      databaseDigest: "d".repeat(64),
      postgresVolume: "target-postgres",
      project: "target-project",
      storageDigest: "s".repeat(64),
      storageVolume: "target-storage",
    };
    const metadata = {
      created_at: "2026-07-30T00:00:01.000Z",
      manifest: {
        catalog: { digest: expected.catalogDigest },
        database: { digest: expected.databaseDigest },
        storage: { digest: expected.storageDigest },
      },
      runtime: {
        compose_project: expected.project,
        postgres_volume: expected.postgresVolume,
        storage_volume: expected.storageVolume,
      },
    };

    expect(assertPreRestoreBackupBinding({ expected, metadata })).toBe(true);
    expect(() =>
      assertPreRestoreBackupBinding({
        expected,
        metadata: {
          ...metadata,
          created_at: "2026-07-29T23:59:59.000Z",
        },
      }),
    ).toThrow(/current|timestamp|pre-restore/u);
    expect(() =>
      assertPreRestoreBackupBinding({
        expected,
        metadata: {
          ...metadata,
          manifest: {
            ...metadata.manifest,
            database: { digest: "past-archive-digest" },
          },
        },
      }),
    ).toThrow(/current|manifest|pre-restore/u);
  });

  it("verifies a complete-v2 archive against the exact current runtime without restoring it", () => {
    const metadata = {
      manifest: {
        catalog: { digest: "c".repeat(64) },
        database: { digest: "d".repeat(64) },
        storage: { digest: "s".repeat(64) },
      },
      runtime: {
        compose_project: "target-project",
        postgres_volume: "target-postgres",
        storage_volume: "target-storage",
      },
    };
    const current = {
      catalog: { digest: "c".repeat(64) },
      database: { digest: "d".repeat(64) },
      storage: { digest: "s".repeat(64) },
    };

    expect(assertBackupMatchesCurrent({
      current,
      metadata,
      runtime: {
        project: "target-project",
        postgresVolume: "target-postgres",
        storageVolume: "target-storage",
      },
    })).toBe(true);
    expect(() =>
      assertBackupMatchesCurrent({
        current: {
          ...current,
          database: { digest: "changed" },
        },
        metadata,
        runtime: {
          project: "target-project",
          postgresVolume: "target-postgres",
          storageVolume: "target-storage",
        },
      }),
    ).toThrow(/current runtime/u);
  });

  it.each(Object.keys(catalogSections))(
    "rejects intentional %s catalog drift",
    (section) => {
      const source = canonicalCatalogManifest(catalogSections);
      const targetSections = structuredClone(catalogSections);
      targetSections[section as keyof typeof targetSections] = [
        ...targetSections[section as keyof typeof targetSections],
        { injected_drift: section },
      ] as never;
      const target = canonicalCatalogManifest(targetSections);
      expect(() => compareCatalogManifests(source, target))
        .toThrow(new RegExp(section, "u"));
    },
  );

  it("keeps the gateway private when final restore validation fails", () => {
    const calls: string[] = [];
    expect(() =>
      runRestorePublicationGate({
        forcePrivate: () => calls.push("force-private"),
        publish: () => calls.push("publish"),
        verify: () => {
          calls.push("verify");
          throw new Error("catalog mismatch");
        },
      }),
    ).toThrow(/catalog mismatch/u);
    expect(calls).toEqual(["verify", "force-private"]);
  });

  it("validates a restored archive against its signed migration count instead of newer repo files", () => {
    const restored = {
      auth_users: 0,
      auth_users_residual: 0,
      invalid_constraints: 0,
      migration_count: 120,
      runtime_ready: true,
    };

    expect(validateInstalledSemanticState(restored, 120)).toBe(true);
    expect(() => validateInstalledSemanticState(restored, 121))
      .toThrow(/migration count/u);
  });

  it("separates exact archive restore from current repo forward migrations", () => {
    expect(planPostRestoreMigrationAdvance({
      archiveMigrationCount: 120,
      currentMigrationCount: 121,
    })).toEqual({
      archiveMigrationCount: 120,
      currentMigrationCount: 121,
      forwardMigrationCount: 1,
    });
    expect(() => planPostRestoreMigrationAdvance({
      archiveMigrationCount: 122,
      currentMigrationCount: 121,
    })).toThrow(/newer than the current repo/u);

    const cli = readFileSync(
      "scripts/hybrid-production-runtime.mjs",
      "utf8",
    );
    expect(cli).toMatch(
      /archiveState = assertInstalled[\s\S]*archiveManifest = currentManifest[\s\S]*compareCatalogManifests[\s\S]*applyPendingMigrationsAtomically\(runtime\)[\s\S]*forwardState = assertInstalled/u,
    );
    expect(cli).toMatch(
      /forwardAppliedVersions\.length[\s\S]*migrationAdvance\.forwardMigrationCount[\s\S]*Forward migration plan did not match applied versions/u,
    );
    expect(cli).toMatch(
      /migration_count_applied:\s*forwardAppliedVersions\.length/u,
    );
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
        catalogManifest: { source: "catalog-a", target: "catalog-a" },
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
        catalogManifest: { source: "catalog-a", target: "catalog-a" },
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
        catalogManifest: { source: "catalog-a", target: "catalog-a" },
        publicManifest: { source: "digest-a", target: "digest-other" },
        storageManifest: { source: "digest-b", target: "digest-b" },
      }),
    ).toThrow(/manifest mismatch/u);
  });
});

describe("hybrid production recovery and capacity", () => {
  it("reports stopped and unhealthy runtimes as BLOCKED with distinct states", () => {
    expect(evaluateRuntimeStatus([])).toMatchObject({
      pass: false,
      runtimeState: "STOPPED",
      status: "BLOCKED",
    });
    expect(
      evaluateRuntimeStatus([
        { health: "healthy", service: "postgres", state: "running" },
        { health: "none", service: "postgrest", state: "running" },
        { health: "unhealthy", service: "postgrest-probe", state: "running" },
        { health: "healthy", service: "storage", state: "running" },
        { health: "healthy", service: "gateway", state: "running" },
      ]),
    ).toMatchObject({
      pass: false,
      runtimeState: "DEGRADED",
      status: "BLOCKED",
    });
    expect(
      evaluateRuntimeStatus([
        { health: "healthy", service: "postgres", state: "running" },
        { health: "none", service: "postgrest", state: "running" },
        { health: "healthy", service: "postgrest-probe", state: "running" },
        { health: "healthy", service: "storage", state: "running" },
        { health: "healthy", service: "gateway", state: "running" },
      ], { gatewayReady: true }),
    ).toMatchObject({
      pass: true,
      runtimeState: "READY",
      status: "PASS",
    });
  });
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
    expect(cli).toMatch(/assertPinnedImageInspection/u);
    expect(cli).toMatch(/RepoDigests/u);
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
    expect(cli).toContain("homecook-storage-xattrs-v1");
    expect(cli).toContain("user.supabase.content-type");
    expect(cli).toContain("user.supabase.cache-control");
  });

  it("applies repo-only forward migrations atomically behind a verified current backup", () => {
    const cli = readFileSync(
      "scripts/hybrid-production-runtime.mjs",
      "utf8",
    );
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

    expect(packageJson.scripts["hybrid-production:migrate-forward"])
      .toBe("node scripts/hybrid-production-runtime.mjs migrate-forward");
    expect(cli).toMatch(
      /case "migrate-forward"[\s\S]*verifyBackupArchive[\s\S]*applyPendingMigrationsAtomically[\s\S]*assertInstalled/u,
    );
    expect(cli).toMatch(
      /applyPendingMigrationsAtomically[\s\S]*lock table auth\.users in share row exclusive mode[\s\S]*insert into supabase_migrations\.schema_migrations[\s\S]*commit;/u,
    );
  });
});
