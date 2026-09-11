import { describe, expect, it } from "vitest";
import { assertUiIsolatedTarget } from "../scripts/verify-marketing-round2-ui-isolated.mjs";

describe("R2 real UI fixture target fence", () => {
  const target = { projectId: "hcg_123_a1b2c3", dataApiUrl: "http://127.0.0.1:58007", cliVersion: "2.110.0", migrationSha256: "a".repeat(64) };
  it("accepts only the fresh pinned isolated identity", () => {
    expect(() => assertUiIsolatedTarget(target)).not.toThrow();
  });
  it.each([
    { projectId: "homecook-full-local-isolated" },
    { projectId: "homecook-full-local-postgres" },
    { dataApiUrl: "https://project.supabase.co" },
    { dataApiUrl: "http://localhost:58007" },
    { dataApiUrl: "http://127.0.0.1:0" },
    { dataApiUrl: "http://127.0.0.1:58007/path" },
    { dataApiUrl: "http://user:password@127.0.0.1:58007" },
    { cliVersion: "2.109.0" },
    { migrationSha256: "unknown" },
  ])("rejects an unsafe or unproven identity %j", change => {
    expect(() => assertUiIsolatedTarget({ ...target, ...change })).toThrow("Unsafe R2 UI isolated identity");
  });
});
