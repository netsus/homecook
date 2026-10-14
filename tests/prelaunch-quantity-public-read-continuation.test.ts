import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertRound2InheritanceBoundaries, inheritRound2Readiness, retargetPlist } from "../scripts/lib/prelaunch-web-deploy.mjs";

const policy = "lib/server/hybrid-auth/public-read-policy-runtime.mjs";
const pair = ["d7399684db1e10d0bc86847dad3e2d6a361d61f7c1589446b37b9eb0dc089639", "e0d54ee86c56eeae6df11cd7ddf7346e744c72323d098599dc62425c006ac37e"];
function fixture() {
  const previous = { Label: "com.homecook.production", WorkingDirectory: "/fixture/live", ProgramArguments: ["/fixture/node", "/fixture/live/scripts/start-production.mjs", "-H", "127.0.0.1", "-p", "3100"],
    EnvironmentVariables: { MUMEOK_ROUND2_ENABLED: "false", MUMEOK_ROUND2_LEADS_ENABLED: "false" } };
  return { previous, next: retargetPlist(previous, "/fixture/next"), files: [policy], quantityPublicReadDigests: pair };
}
describe("exact C04 public-read continuation", () => {
  it("admits only the reviewed policy bytes while keeping the complete file list", () => {
    const input = fixture();
    expect(() => assertRound2InheritanceBoundaries(input)).not.toThrow();
    expect(input.files).toEqual([policy]);
  });
  it.each([null, [], [pair[0]], [null, pair[1]], [pair[0], null], [...pair].reverse(), [pair[0], "a".repeat(64)], ["a".repeat(64), pair[1]]].map(digests => [digests]))("rejects missing, changed, deleted or reversed evidence %j", digests => {
    expect(() => assertRound2InheritanceBoundaries({ ...fixture(), quantityPublicReadDigests: digests })).toThrow("보호");
  });
  it.each(["lib/server/hybrid-auth/gateway.ts", "lib/server/marketing-round2.ts", "app/privacy/page.tsx", "supabase/migrations/new.sql", "infra/worker.yml"])("rejects additional protected path %s", extra => {
    expect(() => assertRound2InheritanceBoundaries({ ...fixture(), files: [policy, extra] })).toThrow("보호");
  });
  it("preserves database and execution/environment rejection", () => {
    const input = fixture();
    expect(() => assertRound2InheritanceBoundaries({ ...input, databaseDeployment: true })).toThrow("보호");
    expect(() => assertRound2InheritanceBoundaries({ ...input, next: { ...input.next, EnvironmentVariables: { ...input.next.EnvironmentVariables, HOMECOOK_AUTH_MODE: "changed" } } })).toThrow("키");
    expect(() => assertRound2InheritanceBoundaries({ ...input, next: { ...input.next, ProgramArguments: ["/other/node"] } })).toThrow("키");
  });
  it.each(["true", undefined])("requires both closed flags before and after (%s)", flag => {
    for (const side of ["previous", "next"] as const) for (const key of ["MUMEOK_ROUND2_ENABLED", "MUMEOK_ROUND2_LEADS_ENABLED"]) {
      const input = fixture();
      const changed = { ...input[side], EnvironmentVariables: { ...input[side].EnvironmentVariables, [key]: flag } };
      expect(() => assertRound2InheritanceBoundaries({ ...input, [side]: changed })).toThrow("보호");
    }
  });
  it("does not transfer the exception into active readiness inheritance", () => {
    const input = fixture(), liveSha = "a".repeat(40);
    const previous = { ...input.previous, EnvironmentVariables: { ...input.previous.EnvironmentVariables,
      MUMEOK_ROUND2_RELEASE_SHA: liveSha, MUMEOK_ROUND2_REPOSITORY_ROOT: input.previous.WorkingDirectory, MUMEOK_ROUND2_READINESS_PATH: "/fixture/readiness.json" } };
    expect(() => inheritRound2Readiness({ ...input, previous, next: retargetPlist(previous, "/fixture/next"), liveSha, releaseSha: "b".repeat(40),
      readiness: { version: 1, profile: "production", origin: "https://app.mumeok.kr", hostname: "app.mumeok.kr", verified_at: "2026-10-15T00:00:00Z", release_sha: liveSha } })).toThrow("보호");
  });
});

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
function cliFixture() {
  const root = mkdtempSync(join(tmpdir(), "c04-public-read-git-")); roots.push(root);
  const git = (args: string[]) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git(["init", "-q"]);
  const writeCommit = (value: string) => {
    mkdirSync(dirname(join(root, policy)), { recursive: true }); writeFileSync(join(root, policy), value);
    git(["add", "--", policy]); git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "core.hooksPath=/dev/null", "commit", "-qm", "synthetic fixture"]);
    return git(["rev-parse", "HEAD"]);
  };
  const before = "before bytes \n", after = "after bytes \n\n", from = writeCommit(before), target = writeCommit(after);
  writeFileSync(join(root, policy), "uncommitted bytes must not be read");
  const source = readFileSync("scripts/deploy-prelaunch-web.mjs", "utf8");
  const start = source.indexOf("function quantityPublicReadDigests("), end = source.indexOf("async function stageRound2Readiness(", start);
  if (start < 0 || end <= start) throw new Error("Exact Git evidence helper missing");
  const helper = source.slice(start, end);
  const calls: string[][] = [];
  const readBlob = (bin: string, args: string[], options: object) => { calls.push(args); return execFileSync(bin, args, options); };
  const bindings = { repository: root, git, execFileSync: readBlob, hash, QUANTITY_V4_FEATURE: "ingredient-quantity-v4" };
  const read = new Function(...Object.keys(bindings), helper + ";return quantityPublicReadDigests;")(...Object.values(bindings));
  const live = { ref: from, plist: fixture().previous }, selection = { target, files: [policy, "components/recipe/recipe-detail-screen.tsx"], scope: { database: [] } };
  const context = { rollout: { feature: "ingredient-quantity-v4", quantityStage: "worker" }, marker: { protectedRollout: true }, review: {} };
  return { root, source, helper, bindings, read, calls, git, live, selection, context, expected: [hash(before), hash(after)] };
}
describe("CLI Git evidence and continuation wiring", () => {
  it("hashes exact Git blob bytes from live.ref and target, excluding working-tree changes", () => {
    const f = cliFixture();
    expect(f.read(f.live, f.selection, f.context)).toEqual(f.expected);
    expect(f.calls).toEqual([f.live.ref, f.selection.target].map(ref => ["-C", f.root, "show", `${ref}:${policy}`]));
    expect(f.read(f.live, { ...f.selection, target: f.live.ref }, f.context)).toEqual([f.expected[0], f.expected[0]]);
    expect(() => assertRound2InheritanceBoundaries({ ...fixture(), quantityPublicReadDigests: f.expected })).toThrow("보호");
  });
  it("does not read Git bytes for unknown, non-C04, non-worker context or unchanged policy", () => {
    const f = cliFixture();
    for (const context of [null, {}, { rollout: {} }, { rollout: { feature: "other", quantityStage: "worker" } }, { rollout: { feature: "ingredient-quantity-v4", quantityStage: "consumers" } }]) {
      expect(f.read(f.live, f.selection, context)).toBeNull();
    }
    expect(f.read(f.live, { ...f.selection, files: ["components/recipe/recipe-detail-screen.tsx"] }, f.context)).toBeNull();
    expect(f.calls).toHaveLength(0);
  });
  it("represents deletion as null and preserves closed denial", () => {
    const f = cliFixture(); f.git(["rm", "-f", "--", policy]);
    f.git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "core.hooksPath=/dev/null", "commit", "-qm", "delete fixture"]);
    const digests = f.read(f.live, { ...f.selection, target: f.git(["rev-parse", "HEAD"]) }, f.context);
    expect(digests).toEqual([f.expected[0], null]);
    expect(() => assertRound2InheritanceBoundaries({ ...fixture(), quantityPublicReadDigests: digests })).toThrow("보호");
  });
  it.each(["plan", "stage"])("%s passes actual Git evidence and the unfiltered full diff to the boundary", async phase => {
    const f = cliFixture(), boundary = vi.fn(), verifyBaseline = vi.fn(), say = vi.fn();
    const options = { ref: f.selection.target, refOption: "--reviewed-ref", alreadyAppliedDb: true };
    const common = { ...f.bindings, assertRound2InheritanceBoundaries: boundary, retargetPlist, isDeepStrictEqual,
      DeploymentError: Error, verifyProtectedBaseline: verifyBaseline, verifyClosedR2Control: vi.fn(),
      loadClosedR2Review: () => f.context.review, readEnvironmentPatch: () => ({}), assertClosedR2ContinuationOptions: vi.fn() };
    if (phase === "stage") {
      const start = f.source.indexOf("async function stageRound2Readiness("), end = f.source.indexOf("function copyEnvironment(", start);
      expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
      const stage = new Function(...Object.keys(common), f.helper + f.source.slice(start, end) + ";return stageRound2Readiness;")(...Object.values(common));
      await stage(fixture().next, "/fixture/release", f.live, f.selection, false, options, { fixture: true }, f.context);
      expect(verifyBaseline).toHaveBeenCalledWith(f.context.rollout, { fixture: true }, options);
    } else {
      const start = f.source.indexOf('  if (action === "plan") {', f.source.indexOf("async function main()")), end = f.source.indexOf('  mkdirSync(join(root, "releases")', start);
      expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
      const bindings = { ...common, action: "plan", protectedReview: null, options, current: () => f.live,
        requireClosedR2Mode: () => f.context, plan: () => f.selection, say };
      await new Function(...Object.keys(bindings), f.helper + "return (async () => {" + f.source.slice(start, end) + "})();")(...Object.values(bindings));
      expect(JSON.parse(say.mock.calls[0][0]).files).toEqual(f.selection.files);
    }
    expect(boundary).toHaveBeenCalledTimes(1);
    expect(boundary.mock.calls[0][0]).toMatchObject({ files: f.selection.files, quantityPublicReadDigests: f.expected, databaseDeployment: false });
    expect(boundary.mock.calls[0][0].files).toBe(f.selection.files);
    expect(f.calls).toHaveLength(2);
  });
});
