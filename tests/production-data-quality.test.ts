import { describe, expect, it } from "vitest";

import {
  buildDataQualityFindings,
  parseProductionDataQualityArgs,
  PRODUCTION_DATA_SCAN_TABLES,
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
  });
});
