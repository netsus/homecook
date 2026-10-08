import { FEEDBACK_SCOPE_SQL } from "../scripts/lib/prelaunch-feedback-readiness.mjs";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { parsePrelaunchOptions } from "../scripts/lib/prelaunch-web-deploy.mjs";
import {
  assertFeedbackReview,
  assertFeedbackAppliedLedger,
  assertFeedbackReviewPin,
  assertFeedbackScopePreserved,
  assertFeedbackSource,
  captureFeedbackDatabaseBefore,
  FEEDBACK_LEDGER_SQL,
  FEEDBACK_LIVE_SHA,
  FEEDBACK_ROWS_SQL,
  feedbackScopeEvidence,
} from "../scripts/lib/prelaunch-feedback-readiness.mjs";
import { IMMUTABLE_SCOPE_SQL, LEDGER_VALID_SQL } from "../scripts/lib/marketing-round2-controlled-deploy.mjs";
import { BETA_CANONICAL_POSTIMAGE_SQL } from "../scripts/lib/prelaunch-beta-readiness.mjs";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const scope = (name: string, source: string) => ({ name, source, owner: "postgres", acl: ["postgres=X/postgres"], securityDefiner: true, config: ["search_path=pg_catalog, public, private, pg_temp"] });
type ScopeEvidence = Omit<ReturnType<typeof scope>, "source"> & { bodySha256: string };
const proofNames = ["db_authority", "db_migration", "operator_approval", "privacy_consent", "retention_runbook", "turnstile_live", "direct_access_denial", "header_overwrite", "launch_binding"];
function review() {
  return {
    schema: "homecook.prelaunch-feedback-review.v1", from: FEEDBACK_LIVE_SHA, to: "b".repeat(40), migrationSourceRef: "c".repeat(40), migrationCount: 204,
    originalReadinessSha256: sha("original readiness"), proofDigests: Object.fromEntries(proofNames.map(key => [key, sha(key)])),
    files: { "app/globals.css": [sha("before"), sha("after")], "components/recipe/example.tsx": [null, sha("new")] }, protectedSources: ["app/globals.css"],
    preApplyProof: { path: "/private/review/db-before.json", sha256: sha("before DB") },
    expectedScopeFunctions: feedbackScopeEvidence([scope("verify_full_local_internal_scope", "perform private.previous();")]),
  };
}

describe("reviewed feedback rollout boundaries", () => {
  it("requires the explicit source SHA, already-applied mode, and existing private DB config", () => {
    const args = ["--reviewed-feedback-readiness", "--already-applied-db", "--db-config", "/private/db.env", "--reviewed-ref", "b".repeat(40)];
    expect(parsePrelaunchOptions(args)).toMatchObject({ reviewedFeedbackReadiness: true, alreadyAppliedDb: true });
    expect(() => parsePrelaunchOptions(["--reviewed-feedback-readiness"])).toThrow("already-applied-db");
    expect(() => parsePrelaunchOptions(args.slice(0, 4))).toThrow("reviewed-ref");
    expect(() => parsePrelaunchOptions([...args, "--reviewed-beta-readiness"])).toThrow("함께");
    expect(() => parsePrelaunchOptions([...args, "--reviewed-repair-readiness"])).toThrow("함께");
  });

  it("prohibits execution without an absolute private manifest and immutable digest", () => {
    expect(() => assertFeedbackReviewPin({ path: null, sha256: null })).toThrow("not configured");
    expect(() => assertFeedbackReviewPin({ path: "./review.json", sha256: sha("review") })).toThrow("not configured");
    expect(() => assertFeedbackReviewPin({ path: "/private/review.json", sha256: "unreviewed" })).toThrow("not configured");
    expect(() => assertFeedbackReviewPin({ path: "/private/review.json", sha256: sha("review") })).not.toThrow();
  });

  it("binds the complete source diff and both previous and candidate bytes", () => {
    const manifest = review();
    const files = Object.keys(manifest.files);
    const input = { review: manifest, liveSha: manifest.from, releaseSha: manifest.to, files, actualFiles: files, digests: manifest.files };
    expect(() => assertFeedbackSource(input)).not.toThrow();
    expect(() => assertFeedbackSource({ ...input, releaseSha: "d".repeat(40) })).toThrow("source pair");
    expect(() => assertFeedbackSource({ ...input, files: files.slice(0, 1) })).toThrow("complete source diff");
    expect(() => assertFeedbackSource({ ...input, actualFiles: [...files, "app/layout.tsx"] })).toThrow("complete source diff");
    expect(() => assertFeedbackSource({ ...input, digests: { ...manifest.files, "app/globals.css": [sha("different before"), sha("after")] } })).toThrow("source bytes");
  });

  it("does not accept infrastructure/SQL in a web-only candidate or unpinned proofs", () => {
    const manifest = review();
    expect(() => assertFeedbackReview({ ...manifest, files: { "infra/runtime.yml": [null, sha("infra")] } })).toThrow("web-only");
    expect(() => assertFeedbackReview({ ...manifest, files: { "supabase/migrations/new.sql": [null, sha("SQL")] } })).toThrow("web-only");
    expect(() => assertFeedbackReview({ ...manifest, migrationCount: 197 })).toThrow("204-entry");
    expect(() => assertFeedbackReview({ ...manifest, proofDigests: {} })).toThrow("proof pins");
    expect(() => assertFeedbackReview({ ...manifest, protectedSources: ["unreviewed.ts"] })).toThrow("protected source");
  });

  it("requires all 204 real ledger entries with the reviewed bytes and ordering", () => {
    const source = Array.from({ length: 204 }, (_, i) => ({ filename: `${String(i).padStart(14, "0")}_reviewed.sql`, sha256: sha(String(i)) }));
    expect(() => assertFeedbackAppliedLedger(source, structuredClone(source))).not.toThrow();
    expect(() => assertFeedbackAppliedLedger(source, source.slice(0, -1))).toThrow("ledger differs");
    expect(() => assertFeedbackAppliedLedger(source, [...source, source[0]])).toThrow("ledger differs");
    expect(() => assertFeedbackAppliedLedger(source, [...source].reverse())).toThrow("ledger differs");
    expect(() => assertFeedbackAppliedLedger(source, source.map((row, i) => i === 196 ? { ...row, sha256: sha("mutated") } : row))).toThrow("ledger differs");
    expect(() => assertFeedbackAppliedLedger(source.slice(0, -1), source.slice(0, -1))).toThrow("ledger differs");
  });

  it("allows an exact reviewed wrapper only when its old active body and named delegates survive", () => {
    const before: ScopeEvidence[] = feedbackScopeEvidence([scope("verify_full_local_internal_scope", "old active"), scope("verify_full_local_internal_scope_base", "original fence")]);
    const after: ScopeEvidence[] = feedbackScopeEvidence([scope("verify_full_local_internal_scope", "new reviewed wrapper"), scope("verify_scope_pre_action_notifications_20260928", "old active"), scope("verify_full_local_internal_scope_base", "original fence")]);
    expect(() => assertFeedbackScopePreserved(before, after, after)).not.toThrow();
    const dropped = after.filter(row => row.name !== "verify_scope_pre_action_notifications_20260928");
    expect(() => assertFeedbackScopePreserved(before, dropped, dropped)).toThrow("delegate or authority");
    const changed = after.map(row => row.name.endsWith("_base") ? { ...row, bodySha256: sha("relaxed fence") } : row);
    expect(() => assertFeedbackScopePreserved(before, changed, changed)).toThrow("delegate or authority");
    expect(() => assertFeedbackScopePreserved(before, after, after.slice(0, 1))).toThrow("reviewed post-apply");
    const aclChanged = after.map(row => row.name.endsWith("_base") ? { ...row, acl: ["anon=X/postgres"] } : row);
    expect(() => assertFeedbackScopePreserved(before, aclChanged, aclChanged)).toThrow("delegate or authority");
  });

  it("collects only readonly evidence and refuses a receipt/catalog mismatch", async () => {
    const receipt = { immutableScopeHash: "immutable", postimage: "marketing" };
    const evidence = new Map([
      [LEDGER_VALID_SQL, "t"], [FEEDBACK_LEDGER_SQL, "[]"],
      ["SELECT receipt FROM marketing_round2_deploy.receipt WHERE singleton;", JSON.stringify(receipt)],
      [IMMUTABLE_SCOPE_SQL, "immutable"], [BETA_CANONICAL_POSTIMAGE_SQL, "marketing"],
      [FEEDBACK_ROWS_SQL, '{"marketing_round2_events":{"count":0,"sha256":"empty"}}'],
      [FEEDBACK_SCOPE_SQL, JSON.stringify([scope("verify_full_local_internal_scope", "original source")])],
    ]);
    const adapter = { inspect: vi.fn(async () => ({ postgresContainerId: "exact-local" })), query: vi.fn(async (query: string) => evidence.get(query)!) };
    const result = await captureFeedbackDatabaseBefore(adapter);
    expect(result).toMatchObject({ schema: "homecook.prelaunch-feedback-db-before.v1", immutableScope: "immutable", marketingPostimage: "marketing", target: { postgresContainerId: "exact-local" } });
    expect(result.rowsSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(adapter.query.mock.calls.every(([sql]) => sql.startsWith("SELECT "))).toBe(true);
    evidence.set(BETA_CANONICAL_POSTIMAGE_SQL, "changed");
    await expect(captureFeedbackDatabaseBefore(adapter)).rejects.toThrow("receipt no longer matches");
  });
});
