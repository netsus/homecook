import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const { spawnSyncMock } = vi.hoisted(() => ({
  spawnSyncMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawnSync: spawnSyncMock,
}));

import { createLocalSupabaseNextEnv } from "../scripts/lib/local-supabase-env.mjs";

describe("local Supabase env helpers", () => {
  beforeEach(() => {
    spawnSyncMock.mockReset();
    spawnSyncMock.mockReturnValue({
      status: 0,
      stdout: [
        "API_URL=http://127.0.0.1:54321",
        "ANON_KEY=anon-key",
        "SERVICE_ROLE_KEY=service-role-key",
        "",
      ].join("\n"),
      stderr: "",
    });
  });

  it("carries YouTube import env vars from .env.local into the Next dev env", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "local-supabase-env-"));

    writeFileSync(
      join(rootDir, ".env.local"),
      [
        "HOMECOOK_ENABLE_YOUTUBE_IMPORT=1",
        "NEXT_PUBLIC_HOMECOOK_ENABLE_YOUTUBE_IMPORT=1",
        "YOUTUBE_API_KEY=AIza-test-key",
        "",
      ].join("\n"),
      "utf8",
    );

    const env = createLocalSupabaseNextEnv({} as NodeJS.ProcessEnv, rootDir) as Record<string, string | undefined>;

    expect(env.HOMECOOK_ENABLE_YOUTUBE_IMPORT).toBe("1");
    expect(env.NEXT_PUBLIC_HOMECOOK_ENABLE_YOUTUBE_IMPORT).toBe("1");
    expect(env.YOUTUBE_API_KEY).toBe("AIza-test-key");
  });
});
