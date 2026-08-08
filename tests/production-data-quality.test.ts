import { describe, expect, it } from "vitest";

import {
  buildDataQualityFindings,
  parseProductionDataQualityArgs,
  PRODUCTION_DATA_SCAN_TABLES,
  scanLocalMacProductionData,
  scanProductionData,
  shouldUseLocalMacProductionDataScan,
  validateProductionEnv,
} from "../scripts/lib/production-data-quality.mjs";

describe("production data quality gate", () => {
  it("accepts the pnpm argument separator before validator options", () => {
    expect(parseProductionDataQualityArgs(["--", "--require-db"])).toMatchObject({
      requireDb: true,
    });
  });

  it("probes recipe visibility columns required by the production read contract", () => {
    const recipesScan = PRODUCTION_DATA_SCAN_TABLES.find(
      (table) => table.table === "recipes",
    );

    expect(recipesScan?.columns).toContain("visibility");
    expect(recipesScan?.columns).toContain("deleted_at");
  });

  it("blocks QA fixture and local auth flags in production-like environments", () => {
    const result = validateProductionEnv({
      NODE_ENV: "production",
      HOMECOOK_ENABLE_QA_FIXTURES: "1",
      NEXT_PUBLIC_HOMECOOK_ENABLE_LOCAL_DEV_AUTH: "true",
      HOMECOOK_YOUTUBE_FIXTURE_PROVIDER: "fixture",
      NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
    });

    expect(result.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining([
        "PRODUCTION_QA_FLAG_ENABLED",
        "PRODUCTION_YOUTUBE_FIXTURE_PROVIDER_ENABLED",
        "PRODUCTION_LOCAL_SUPABASE_URL",
      ]),
    );
  });

  it("does not block local development envs", () => {
    const result = validateProductionEnv({
      NODE_ENV: "development",
      NEXT_PUBLIC_HOMECOOK_ENABLE_QA_FIXTURES: "1",
      NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
    });

    expect(result.errors).toEqual([]);
    expect(result.productionLike).toBe(false);
  });

  it("allows a localhost app URL only for explicit local-only production", () => {
    const result = validateProductionEnv({
      NODE_ENV: "production",
      HOMECOOK_PRODUCTION_EXPOSURE: "local-only",
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3100",
      NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3100",
    });

    expect(result.errors).toEqual([]);
    expect(result.warnings).toContain(
      "local-only production은 현재 Mac 밖으로 공개하지 않아야 합니다.",
    );
  });

  it("allows a loopback Supabase URL only for explicit local-only production", () => {
    const result = validateProductionEnv({
      NODE_ENV: "production",
      HOMECOOK_PRODUCTION_EXPOSURE: "local-only",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3100",
      NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3100",
    });

    expect(result.errors).toEqual([]);
  });

  it("still blocks a loopback Supabase URL for public production", () => {
    const result = validateProductionEnv({
      NODE_ENV: "production",
      HOMECOOK_PRODUCTION_EXPOSURE: "public",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_APP_URL: "https://homecook.example",
    });

    expect(result.errors).toEqual([
      expect.objectContaining({
        code: "PRODUCTION_LOCAL_SUPABASE_URL",
      }),
    ]);
  });

  it("requires loopback app origins before allowing a local-only Supabase URL", () => {
    const result = validateProductionEnv({
      NODE_ENV: "production",
      HOMECOOK_PRODUCTION_EXPOSURE: "local-only",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_APP_URL: "https://homecook.example",
      NEXT_PUBLIC_SITE_URL: "https://homecook.example",
    });

    expect(result.errors).toEqual([
      expect.objectContaining({
        code: "PRODUCTION_LOCAL_SUPABASE_URL",
      }),
    ]);
  });

  it.each([
    "http://localhost.:54321",
    "http://[::1]:54321",
    "http://[::ffff:127.0.0.1]:54321",
  ])("blocks canonical loopback variant %s for public production", (supabaseUrl) => {
    const result = validateProductionEnv({
      NODE_ENV: "test",
      VERCEL_ENV: "production",
      HOMECOOK_PRODUCTION_EXPOSURE: "public",
      NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
      NEXT_PUBLIC_APP_URL: "https://homecook.example",
    });

    expect(result.errors).toEqual([
      expect.objectContaining({
        code: "PRODUCTION_LOCAL_SUPABASE_URL",
      }),
    ]);
  });

  it("blocks loopback Supabase when the production data gate is explicitly enabled", () => {
    const result = validateProductionEnv({
      NODE_ENV: "test",
      HOMECOOK_VALIDATE_PRODUCTION_DATA: "1",
      NEXT_PUBLIC_SUPABASE_URL: "http://[::1]:54321",
      NEXT_PUBLIC_APP_URL: "https://homecook.example",
    });

    expect(result.errors).toEqual([
      expect.objectContaining({
        code: "PRODUCTION_LOCAL_SUPABASE_URL",
      }),
    ]);
  });

  it("still blocks localhost URLs when local-only production is not explicit", () => {
    const result = validateProductionEnv({
      NODE_ENV: "production",
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3100",
    });

    expect(result.errors).toEqual([
      expect.objectContaining({
        code: "PRODUCTION_LOCAL_APP_URL",
      }),
    ]);
  });

  it("finds test pollution patterns in scanned production rows", () => {
    const findings = buildDataQualityFindings({
      recipes: [
        {
          id: "recipe-1",
          title: "LoRo 테스트 레시피",
          description: "fixture draft",
          thumbnail_url: "https://example.com/test.png",
        },
      ],
      users: [
        {
          id: "user-1",
          nickname: "로컬 테스트 계정",
          email: "local-tester@homecook.local",
          social_id: "local-demo-main",
          profile_image_url: "http://localhost:3000/avatar.png",
        },
      ],
    });

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "recipes",
          field: "title",
          rule: "loro",
        }),
        expect.objectContaining({
          table: "recipes",
          field: "thumbnail_url",
          rule: "example-domain",
        }),
        expect.objectContaining({
          table: "users",
          field: "profile_image_url",
          rule: "localhost",
        }),
      ]),
    );
    expect(findings[0]).not.toHaveProperty("value");
  });

  it("selects the direct scanner for local/local authority so incomplete config fails closed", () => {
    expect(shouldUseLocalMacProductionDataScan({
      env: {
        HOMECOOK_AUTH_AUTHORITY: "local",
        HOMECOOK_DATA_AUTHORITY: "local",
        HOMECOOK_FULL_LOCAL_SECRET_DIR: "/Users/tester/.homecook/secrets/full-local-supabase",
      },
    })).toBe(true);

    expect(shouldUseLocalMacProductionDataScan({
      env: {
        HOMECOOK_AUTH_AUTHORITY: "remote",
        HOMECOOK_DATA_AUTHORITY: "local",
        HOMECOOK_FULL_LOCAL_SECRET_DIR: "/Users/tester/.homecook/secrets/full-local-supabase",
      },
    })).toBe(false);

    expect(shouldUseLocalMacProductionDataScan({
      env: {
        HOMECOOK_AUTH_AUTHORITY: "local",
        HOMECOOK_DATA_AUTHORITY: "local",
      },
    })).toBe(true);
  });

  it("routes exact local Mac production scans through the direct full-local scanner", async () => {
    const calls: string[] = [];

    await scanProductionData({
      rootDir: "/Users/tester/homecook",
      env: {
        HOMECOOK_AUTH_AUTHORITY: "local",
        HOMECOOK_DATA_AUTHORITY: "local",
        HOMECOOK_FULL_LOCAL_SECRET_DIR: "/Users/tester/.homecook/secrets/full-local-supabase",
      },
      shouldUseLocalScanner: () => true,
      localScanner: async () => {
        calls.push("local");
        return { errors: [], skipped: false, skipReason: null, findings: [] };
      },
      remoteScanner: async () => {
        calls.push("remote");
        return { errors: [], skipped: false, skipReason: null, findings: [] };
      },
    });

    expect(calls).toEqual(["local"]);
  });

  it.each([
    ["missing", ""],
    ["multiple", "111111111111\n222222222222\n"],
  ])("fails closed when the local postgres container is %s", async (_, stdout) => {
    const result = await scanLocalMacProductionData({
      rootDir: "/Users/tester/homecook",
      env: {
        HOMECOOK_FULL_LOCAL_SECRET_DIR: "/Users/tester/.homecook/secrets/full-local-supabase",
      },
      readFileImpl: (filePath) => {
        if (filePath.endsWith(".env.production.local")) {
          return [
            "FULL_LOCAL_DOCKER_PLATFORM=linux/arm64",
            "FULL_LOCAL_AUTH_IMAGE=supabase/gotrue@sha256:385184459f57569c54c25209f51f3b2be99ddd7c4ce9e3555b5d3eea8447b7cf",
            "FULL_LOCAL_COMPOSE_PROJECT_NAME=homecook-full-local-isolated",
            "FULL_LOCAL_INTERNAL_GATEWAY_PORT=54481",
            "FULL_LOCAL_AUTH_PROXY_PORT=54482",
            "FULL_LOCAL_INTERNAL_GATEWAY_URL=http://127.0.0.1:54481",
            "FULL_LOCAL_INTERNAL_S3_URL=http://127.0.0.1:54481/storage/v1/s3",
            "FULL_LOCAL_PUBLIC_AUTH_URL=https://auth.mumeok.kr",
            "FULL_LOCAL_API_EXTERNAL_URL=https://auth.mumeok.kr/auth/v1",
            "FULL_LOCAL_SITE_URL=https://app.mumeok.kr",
            "FULL_LOCAL_ADDITIONAL_REDIRECT_URLS=https://app.mumeok.kr/auth/callback,https://app.mumeok.kr/auth/link/callback",
            "FULL_LOCAL_ENABLE_EMAIL_SIGNUP=false",
            "FULL_LOCAL_ENABLE_EMAIL_AUTOCONFIRM=false",
            "FULL_LOCAL_ENABLE_PHONE_SIGNUP=false",
            "FULL_LOCAL_ENABLE_ANONYMOUS_USERS=false",
            "FULL_LOCAL_KONG_IMAGE=kong/kong@sha256:6addf50e6bd8d578314cb9ce4f2d2d1e3781d2edecef59f707e00c6e05d384f5",
            "FULL_LOCAL_NODE_IMAGE=docker.io/library/node@sha256:74e144386aaec923ce092c3371b351d96c4f977a4ac3f58431fa9164b9399534",
            "FULL_LOCAL_POSTGRES_IMAGE=public.ecr.aws/supabase/postgres@sha256:a9946f08d31e8eb1149229c94e5c26603a9233116807cbbd93d75179cbac516a",
            "FULL_LOCAL_POSTGREST_IMAGE=postgrest/postgrest@sha256:844785450d6b046ee97f1c67ea37e3ff6b4ed7ee3570b1b91c03f66f032c4805",
            "FULL_LOCAL_STORAGE_IMAGE=supabase/storage-api@sha256:9326eb9c6b74c0a5ba393ab46a08a51d16bc5ea5f2978fc5b0f17fc67c64a4de",
            "FULL_LOCAL_POSTGRES_VOLUME_NAME=homecook-full-local-postgres",
            "FULL_LOCAL_STORAGE_VOLUME_NAME=homecook-full-local-storage",
            "FULL_LOCAL_SECRET_DIR=/Users/tester/.homecook/secrets/full-local-supabase",
          ].join("\n");
        }

        return "x".repeat(32);
      },
      statImpl: (filePath) => ({
        mode: filePath.endsWith(".env.production.local")
          || !filePath.endsWith("full-local-supabase")
          ? 0o100600
          : 0o040700,
      }),
      realpathImpl: (filePath) => filePath,
      runCommand: () => ({
        status: 0,
        stdout,
        stderr: "sensitive docker details",
      }),
    });

    expect(result.errors).toEqual([
      expect.objectContaining({
        code: "PRODUCTION_LOCAL_DB_SCAN_FAILED",
      }),
    ]);
    expect(result.errors[0]?.message).not.toContain("sensitive");
  });

  it("fails closed when the local SQL output is not valid JSON", async () => {
    let callCount = 0;
    const result = await scanLocalMacProductionData({
      rootDir: "/Users/tester/homecook",
      env: {
        HOMECOOK_FULL_LOCAL_SECRET_DIR: "/Users/tester/.homecook/secrets/full-local-supabase",
      },
      readFileImpl: (filePath) => {
        if (filePath.endsWith(".env.production.local")) {
          return [
            "FULL_LOCAL_DOCKER_PLATFORM=linux/arm64",
            "FULL_LOCAL_AUTH_IMAGE=supabase/gotrue@sha256:385184459f57569c54c25209f51f3b2be99ddd7c4ce9e3555b5d3eea8447b7cf",
            "FULL_LOCAL_COMPOSE_PROJECT_NAME=homecook-full-local-isolated",
            "FULL_LOCAL_INTERNAL_GATEWAY_PORT=54481",
            "FULL_LOCAL_AUTH_PROXY_PORT=54482",
            "FULL_LOCAL_INTERNAL_GATEWAY_URL=http://127.0.0.1:54481",
            "FULL_LOCAL_INTERNAL_S3_URL=http://127.0.0.1:54481/storage/v1/s3",
            "FULL_LOCAL_PUBLIC_AUTH_URL=https://auth.mumeok.kr",
            "FULL_LOCAL_API_EXTERNAL_URL=https://auth.mumeok.kr/auth/v1",
            "FULL_LOCAL_SITE_URL=https://app.mumeok.kr",
            "FULL_LOCAL_ADDITIONAL_REDIRECT_URLS=https://app.mumeok.kr/auth/callback,https://app.mumeok.kr/auth/link/callback",
            "FULL_LOCAL_ENABLE_EMAIL_SIGNUP=false",
            "FULL_LOCAL_ENABLE_EMAIL_AUTOCONFIRM=false",
            "FULL_LOCAL_ENABLE_PHONE_SIGNUP=false",
            "FULL_LOCAL_ENABLE_ANONYMOUS_USERS=false",
            "FULL_LOCAL_KONG_IMAGE=kong/kong@sha256:6addf50e6bd8d578314cb9ce4f2d2d1e3781d2edecef59f707e00c6e05d384f5",
            "FULL_LOCAL_NODE_IMAGE=docker.io/library/node@sha256:74e144386aaec923ce092c3371b351d96c4f977a4ac3f58431fa9164b9399534",
            "FULL_LOCAL_POSTGRES_IMAGE=public.ecr.aws/supabase/postgres@sha256:a9946f08d31e8eb1149229c94e5c26603a9233116807cbbd93d75179cbac516a",
            "FULL_LOCAL_POSTGREST_IMAGE=postgrest/postgrest@sha256:844785450d6b046ee97f1c67ea37e3ff6b4ed7ee3570b1b91c03f66f032c4805",
            "FULL_LOCAL_STORAGE_IMAGE=supabase/storage-api@sha256:9326eb9c6b74c0a5ba393ab46a08a51d16bc5ea5f2978fc5b0f17fc67c64a4de",
            "FULL_LOCAL_POSTGRES_VOLUME_NAME=homecook-full-local-postgres",
            "FULL_LOCAL_STORAGE_VOLUME_NAME=homecook-full-local-storage",
            "FULL_LOCAL_SECRET_DIR=/Users/tester/.homecook/secrets/full-local-supabase",
          ].join("\n");
        }

        return "x".repeat(32);
      },
      statImpl: (filePath) => ({
        mode: filePath.endsWith(".env.production.local")
          || !filePath.endsWith("full-local-supabase")
          ? 0o100600
          : 0o040700,
      }),
      realpathImpl: (filePath) => filePath,
      runCommand: () => {
        callCount += 1;
        return {
          status: 0,
          stdout: callCount === 1 ? "111111111111\n" : "not-json",
          stderr: "sensitive sql output",
        };
      },
    });

    expect(result.errors).toEqual([
      expect.objectContaining({
        code: "PRODUCTION_LOCAL_DB_SCAN_FAILED",
      }),
    ]);
  });
});
