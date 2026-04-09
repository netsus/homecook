import { describe, expect, it } from "vitest";

import {
  buildLocalSupabaseNextDevArgs,
  getLocalSupabaseNextArtifactsToReset,
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
});
