import { describe, expect, it } from "vitest";

import { isLocalStorageLiveEnvAvailable } from
  "./recipe-image-storage-live-guard";

const localStatusEnv = {
  API_URL: "http://127.0.0.1:54321",
  DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  SERVICE_ROLE_KEY: "local-service-role",
};

describe("recipe image Storage live guard", () => {
  it("skips when live Storage credentials are absent", () => {
    expect(isLocalStorageLiveEnvAvailable({})).toBe(false);
    expect(isLocalStorageLiveEnvAvailable({
      localOnlyOptIn: "1",
      serviceRoleKey: "local-service-role",
      storageUrl: "http://127.0.0.1:54321",
    })).toBe(false);
  });

  it("requires an explicit local-write opt-in before any live write", () => {
    expect(() => isLocalStorageLiveEnvAvailable({
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      serviceRoleKey: "local-service-role",
      storageUrl: "http://127.0.0.1:54321",
    })).toThrow("HOMECOOK_STORAGE_LIVE_LOCAL_ONLY=1");
  });

  it("rejects non-local Storage and DB endpoints even with opt-in", () => {
    expect(() => isLocalStorageLiveEnvAvailable({
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      localOnlyOptIn: "1",
      serviceRoleKey: "local-service-role",
      statusEnv: localStatusEnv,
      storageUrl: "https://project.supabase.co",
    })).toThrow("HOMECOOK_STORAGE_LIVE_URL must point to local Supabase");

    expect(() => isLocalStorageLiveEnvAvailable({
      databaseUrl: "postgresql://postgres:postgres@db.example.com/postgres",
      localOnlyOptIn: "1",
      serviceRoleKey: "local-service-role",
      statusEnv: localStatusEnv,
      storageUrl: "http://127.0.0.1:54321",
    })).toThrow("HOMECOOK_STORAGE_LIVE_DB_URL must point to local Supabase");
  });

  it("rejects loopback endpoints that do not match Supabase CLI status", () => {
    expect(() => isLocalStorageLiveEnvAvailable({
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      localOnlyOptIn: "1",
      serviceRoleKey: "different-service-role",
      statusEnv: localStatusEnv,
      storageUrl: "http://127.0.0.1:54321",
    })).toThrow("live Storage env must match local Supabase status");

    expect(() => isLocalStorageLiveEnvAvailable({
      databaseUrl: "postgresql://postgres:postgres@localhost:54322/postgres",
      localOnlyOptIn: "1",
      serviceRoleKey: "local-service-role",
      statusEnv: localStatusEnv,
      storageUrl: "http://127.0.0.1:54321",
    })).toThrow("live DB env must match local Supabase status");
  });

  it("accepts the default local Supabase API and database endpoints", () => {
    expect(isLocalStorageLiveEnvAvailable({
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      localOnlyOptIn: "1",
      serviceRoleKey: "local-service-role",
      statusEnv: localStatusEnv,
      storageUrl: "http://127.0.0.1:54321",
    })).toBe(true);
  });
});
