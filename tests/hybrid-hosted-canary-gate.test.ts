import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

describe("historical hosted revoked-session canary", () => {
  it("fails closed even when every former hosted-mutation credential is supplied", () => {
    const result = spawnSync(
      process.execPath,
      [
        "scripts/run-hybrid-revoked-session-canary.mjs",
        "--allow-hosted-session-revocation",
        "--expected-project-ref",
        "forbidden-project",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          HYBRID_CANARY_ACCESS_TOKEN: "forbidden-access-token",
          HYBRID_CANARY_DISPOSABLE: "YES-REVOKE-THIS-SESSION",
          HYBRID_CANARY_REFRESH_TOKEN: "forbidden-refresh-token",
          NEXT_PUBLIC_AUTH_SUPABASE_PUBLISHABLE_KEY: "forbidden-publishable-key",
          NEXT_PUBLIC_AUTH_SUPABASE_URL:
            "https://forbidden-project.supabase.co",
        },
      },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "FORBIDDEN: hosted revoked-session canary is historical",
    );
  });
});
