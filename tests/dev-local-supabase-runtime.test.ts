import { describe, expect, it } from "vitest";

import {
  buildLocalSupabaseNextDevArgs,
  getLocalSupabaseNextArtifactsToReset,
  toLocalSupabaseNextEnvFileContent,
} from "../scripts/lib/dev-local-supabase-runtime.mjs";

describe("dev local supabase runtime", () => {
  it("runs next dev with turbopack enabled", () => {
    expect(buildLocalSupabaseNextDevArgs(["-p", "3000"])).toEqual([
      "exec",
      "next",
      "dev",
      "--turbopack",
      "-p",
      "3000",
    ]);
  });

  it("resets the .next directory before starting the local app server", () => {
    expect(getLocalSupabaseNextArtifactsToReset("/tmp/homecook")).toEqual([
      "/tmp/homecook/.next",
    ]);
  });

  it("writes YouTube import env vars into the generated Next env file", () => {
    const content = toLocalSupabaseNextEnvFileContent({
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
      SUPABASE_SERVICE_ROLE_KEY: "service",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      YOUTUBE_API_KEY: "AIza-test-key",
      HOMECOOK_ENABLE_YOUTUBE_IMPORT: "1",
      NEXT_PUBLIC_HOMECOOK_ENABLE_YOUTUBE_IMPORT: "1",
    });

    expect(content).toContain("YOUTUBE_API_KEY=AIza-test-key");
    expect(content).toContain("HOMECOOK_ENABLE_YOUTUBE_IMPORT=1");
    expect(content).toContain("NEXT_PUBLIC_HOMECOOK_ENABLE_YOUTUBE_IMPORT=1");
  });
});
