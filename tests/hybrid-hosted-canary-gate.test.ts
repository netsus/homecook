import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const script = readFileSync(
  "scripts/run-hybrid-revoked-session-canary.mjs",
  "utf8",
);

describe("hosted revoked-session canary execution gate", () => {
  it("requires a disposable session and an explicit destructive flag", () => {
    expect(script).toMatch(/--allow-hosted-session-revocation/);
    expect(script).toMatch(/HYBRID_CANARY_DISPOSABLE/);
    expect(script).toMatch(/YES-REVOKE-THIS-SESSION/);
    expect(script).toMatch(/--expected-project-ref/);
    expect(script).toMatch(/vfubnhtawezmheylfhsv/);
  });

  it("checks liveness before and after local-scope logout without logging tokens", () => {
    expect(script).toMatch(/auth\/v1\/user/);
    expect(script).toMatch(/scope:\s*"local"/);
    expect(script).toMatch(/session_not_found/);
    expect(script).not.toMatch(/console\.(?:log|error)\([^)]*accessToken/);
  });
});
