import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  readLocalGoogleOAuthEnv,
  withLocalGoogleOAuthEnv,
} from "../scripts/lib/local-google-oauth-env.mjs";

describe("local Google OAuth env helpers", () => {
  it("reads Google client and secret from .env.local fallback", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "local-google-oauth-env-"));

    writeFileSync(
      join(rootDir, ".env.local"),
      [
        "SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=client-id",
        "SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET=client-secret",
        "",
      ].join("\n"),
      "utf8",
    );

    expect(readLocalGoogleOAuthEnv(process.env, rootDir)).toEqual({
      clientId: "client-id",
      secret: "client-secret",
      enabled: true,
    });
  });

  it("maps legacy Google env names to the official Supabase keys", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "local-google-oauth-env-legacy-"));
    const env = withLocalGoogleOAuthEnv({
      ...process.env,
      SUPABASE_AUTH_GOOGLE_CLIENT_ID: "legacy-client-id",
      SUPABASE_AUTH_GOOGLE_SECRET: "legacy-client-secret",
    }, rootDir);
    const googleEnv = env as Record<string, string | undefined>;

    expect(googleEnv.SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID).toBe("legacy-client-id");
    expect(googleEnv.SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET).toBe("legacy-client-secret");
    expect(env.NEXT_PUBLIC_HOMECOOK_ENABLE_LOCAL_GOOGLE_OAUTH).toBe("1");
  });
});
