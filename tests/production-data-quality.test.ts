import { describe, expect, it } from "vitest";

import {
  buildDataQualityFindings,
  validateProductionEnv,
} from "../scripts/lib/production-data-quality.mjs";

describe("production data quality gate", () => {
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

