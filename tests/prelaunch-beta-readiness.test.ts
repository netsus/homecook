import { describe, expect, it } from "vitest";
import { BETA_SOURCE, BETA_SOURCE_PINS, assertBetaSource, assertBetaWrapperChain, reviewedBetaReadiness } from "../scripts/lib/prelaunch-beta-readiness.mjs";
import { parsePrelaunchOptions, prelaunchVerificationScripts, runPrelaunchVerification, inheritRound2Readiness } from "../scripts/lib/prelaunch-web-deploy.mjs";

function reviewedSources() {
  const files = [...Object.keys(BETA_SOURCE_PINS), "components/planner/meal-log-add-sheet.tsx"];
  const digests: Record<string, (string | null)[]> = structuredClone(BETA_SOURCE_PINS);
  return {
    liveSha: BETA_SOURCE.from,
    releaseSha: BETA_SOURCE.to,
    files,
    actualFiles: [...files],
    digests,
    databaseDeployment: false,
    databasePlan: {
      baselineRequired: false,
      pending: [] as string[],
      applied: Object.entries(BETA_SOURCE_PINS).filter(([path]) => path.startsWith("supabase/")).map(([path, hashes]) => ({ filename: path.split("/").at(-1), sha256: hashes[1] })),
    },
  };
}

describe("one reviewed beta readiness source pair", () => {
  it("requires every reviewed protection boundary and the applied original SQL checksums", () => {
    expect(() => assertBetaSource(reviewedSources())).not.toThrow();
  });

  it.each(["liveSha", "releaseSha"])("rejects a different %s before reading proofs or opening a DB", async (key) => {
    const input = { ...reviewedSources(), [key]: "f".repeat(40) };
    expect(() => assertBetaSource(input)).toThrow("unreviewed source pair");
    await expect(reviewedBetaReadiness({ ...input, readiness: null, previous: null, next: null, repositoryRoot: null, configPath: null })).rejects.toThrow("unreviewed source pair");
  });

  it("rejects a filtered or duplicate source diff", () => {
    const input = reviewedSources();
    expect(() => assertBetaSource({ ...input, files: input.files.slice(1) })).toThrow("complete source diff");
    expect(() => assertBetaSource({ ...input, files: [...input.files, input.files[0]] })).toThrow("complete source diff");
  });

  it.each(Object.keys(BETA_SOURCE_PINS))("rejects unreviewed source bytes at %s", (path) => {
    const input = reviewedSources();
    input.digests[path][1] = "e".repeat(64);
    expect(() => assertBetaSource(input)).toThrow("source digest mismatch");
  });

  it("rejects an unexpectedly existing migration and missing or modified ledger entries", () => {
    const input = reviewedSources();
    const path = Object.keys(BETA_SOURCE_PINS).find((value) => value.startsWith("supabase/"))!;
    input.digests[path][0] = "d".repeat(64);
    expect(() => assertBetaSource(input)).toThrow("source digest mismatch");
    const missing = reviewedSources();
    missing.databasePlan.applied.pop();
    expect(() => assertBetaSource(missing)).toThrow("applied migration digest");
    const modified = reviewedSources();
    modified.databasePlan.applied[0].sha256 = "c".repeat(64);
    expect(() => assertBetaSource(modified)).toThrow("applied migration digest");
  });

  it("rejects concurrent SQL deployment, a new baseline, and unapplied SQL", () => {
    const input = reviewedSources();
    expect(() => assertBetaSource({ ...input, databaseDeployment: true })).toThrow("already be applied");
    expect(() => assertBetaSource({ ...input, databasePlan: { ...input.databasePlan, baselineRequired: true } })).toThrow("verified database");
    expect(() => assertBetaSource({ ...input, databasePlan: { ...input.databasePlan, pending: ["new.sql"] } })).toThrow("verified database");
  });

  it("rejects an authority chain without independently authenticated pre-change backup evidence", () => {
    expect(() => assertBetaWrapperChain([], null)).toThrow("backup scope proof required");
    expect(() => assertBetaWrapperChain([], { format: "homecook-backup-scope-functions-v1", archive_authenticated: true, archive_sha256: "a".repeat(64) })).toThrow("backup scope proof required");
  });

  it("does not turn the normal inheritance guard into a SQL or shared-auth waiver", () => {
    const previous = {
      Label: "com.homecook.production", WorkingDirectory: "/old",
      ProgramArguments: ["/node", "/old/scripts/start-production.mjs", "-H", "127.0.0.1", "-p", "3100"],
      EnvironmentVariables: { MUMEOK_ROUND2_RELEASE_SHA: BETA_SOURCE.from, MUMEOK_ROUND2_REPOSITORY_ROOT: "/old", MUMEOK_ROUND2_READINESS_PATH: "/old/readiness.json" },
    };
    const input = {
      readiness: { version: 1, profile: "production", origin: "https://app.mumeok.kr", hostname: "app.mumeok.kr", verified_at: "2026-09-11T19:16:32.923Z", release_sha: BETA_SOURCE.from },
      previous, next: previous, liveSha: BETA_SOURCE.from, releaseSha: BETA_SOURCE.to,
    };
    for (const path of Object.keys(BETA_SOURCE_PINS)) {
      expect(() => inheritRound2Readiness({ ...input, files: [path] })).toThrow("R2 보호");
    }
  });
});

describe("explicit relevant deployment tests", () => {
  const api = { api: ["app/api/food/route.ts"] };
  const manifest = { scripts: { "test:product": "vitest run product", "test:beta-flow-gaps:web": "vitest run beta", "verify:extra": "node verify.mjs" } };

  it("preserves product tests by default and runs the selected test command before additive verification", async () => {
    expect(prelaunchVerificationScripts(api, manifest)).toEqual(["test:product"]);
    const scripts = prelaunchVerificationScripts(api, manifest, "verify:extra", false, "test:beta-flow-gaps:web");
    expect(scripts).toEqual(["test:beta-flow-gaps:web", "verify:extra"]);
    const ran: string[] = [];
    await runPrelaunchVerification({ scripts, run: async (script: string) => { ran.push(script); } });
    expect(ran).toEqual(scripts);
    expect(prelaunchVerificationScripts({ api: [] }, manifest, undefined, false, "test:beta-flow-gaps:web")).toEqual(["test:beta-flow-gaps:web"]);
  });

  it("rejects absent commands, shell arguments, non-test commands and skip combinations", () => {
    for (const script of ["test:absent", "test:product --flag", "test:product; echo bad", "verify:extra", " "]) {
      expect(() => prelaunchVerificationScripts(api, manifest, undefined, false, script)).toThrow();
    }
    expect(() => prelaunchVerificationScripts(api, manifest, undefined, true, "test:product")).toThrow("함께");
    expect(() => parsePrelaunchOptions(["--skip-automated-tests", "--test-script", "test:product"])).toThrow("함께");
    expect(() => parsePrelaunchOptions(["--test-script", "verify:extra"])).toThrow("test 명령");
    expect(() => parsePrelaunchOptions(["--test-script", "test:product", "--test-script", "test:product"])).toThrow("중복");
  });

  it("requires verified existing DB and keeps reviewed release modes mutually exclusive", () => {
    const options = parsePrelaunchOptions(["--reviewed-beta-readiness", "--already-applied-db", "--db-config", "/private/local.env", "--test-script", "test:beta-flow-gaps:web"]);
    expect(options.reviewedBetaReadiness).toBe(true);
    expect(options.testScript).toBe("test:beta-flow-gaps:web");
    expect(() => parsePrelaunchOptions(["--reviewed-beta-readiness"])).toThrow("already-applied-db");
    expect(() => parsePrelaunchOptions(["--reviewed-beta-readiness", "--reviewed-repair-readiness", "--already-applied-db", "--db-config", "/private/local.env"])).toThrow("함께");
  });
});
