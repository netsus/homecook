import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  PIECE_UNIT_ANONYMOUS_SQL, PIECE_UNIT_LEDGER_SQL, PIECE_UNIT_MIGRATIONS,
  PIECE_UNIT_ROWS_SQL, PIECE_UNIT_SCOPE_SQL, PIECE_UNIT_WORKER_SQL,
  assertPieceUnitAppliedLedger, pieceUnitAppliedDatabaseState, PIECE_UNIT_ROLLBACK_REASON, PIECE_UNIT_RECOVERY_MESSAGE, PIECE_UNIT_FUNCTIONS_SQL, PIECE_UNIT_HELPERS, PIECE_UNIT_CONSUMERS, PIECE_UNIT_MIGRATION_SHA256,
  assertPieceUnitAuthorityPreserved, assertPieceUnitMigrationTransition,
  assertPieceUnitPreservation, assertPieceUnitReview, assertPieceUnitReviewPin,
  assertPieceUnitSource,
  capturePieceUnitDatabaseBefore, pieceUnitFunctionEvidence,
} from "../scripts/lib/prelaunch-piece-unit-readiness.mjs";
import { ingredientSearchFunctionEvidence } from "../scripts/lib/prelaunch-ingredient-search-readiness.mjs";
import { AI_NUTRITION_DISABLED_SQL, AI_NUTRITION_SCOPE_SQL } from "../scripts/lib/prelaunch-ai-nutrition-readiness.mjs";
import { DeploymentError, parsePrelaunchOptions, deployTransaction } from "../scripts/lib/prelaunch-web-deploy.mjs";
import { IMMUTABLE_SCOPE_SQL, LEDGER_VALID_SQL } from "../scripts/lib/marketing-round2-controlled-deploy.mjs";
import { BETA_CANONICAL_POSTIMAGE_SQL } from "../scripts/lib/prelaunch-beta-readiness.mjs";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const active = "verify_full_local_anonymous_authority";
const alias = "verify_anonymous_pre_canonical_search_20261009";
const worker = "youtube_extraction_worker_rpc_owner";
const scope = (name: string, source: string) => ({ name, source, owner: "postgres", acl: ["postgres=X/postgres"], securityDefiner: true, config: ["search_path=pg_catalog, public, private, pg_temp"] });
type Evidence = Omit<ReturnType<typeof scope>, "source"> & { bodySha256: string };
const evidence = (rows: ReturnType<typeof scope>[]): Evidence[] => ingredientSearchFunctionEvidence(rows);
const wrapper = readFileSync("supabase/migrations/20261009090000_ingredient_canonical_search.sql", "utf8")
  .split("create or replace function private.verify_full_local_anonymous_authority()")[1].split("as $function$")[1].split("$function$;")[0];
const scopes = () => evidence([scope("verify_full_local_internal_scope", "active"), scope("verify_scope_pre_luna", "Luna predecessor")]);
const anonymousRows = () => [scope(active, wrapper), scope(alias, "old authority"), scope("verify_anonymous_pre_legacy", "legacy authority")];
const workerPrivileges = () => ({
  role: { name: worker, superuser: false, inherit: false, bypassRls: false, canLogin: false },
  rlsEnabled: true, tableSelect: false, tableWrite: false, privateEvidenceSelect: false,
  columns: ["ingredient_id", "presentation", "representative_ingredient_id", "updated_at"].map(name => ({ name, select: name !== "updated_at", write: false })),
  policies: [
    { name: "existing_owner", command: "r", permissive: true, roles: ["authenticated"], appliesToWorker: false, using: "old scope", check: null },
    { name: "ingredient_catalog_alias_worker_read", command: "r", permissive: true, roles: [worker], appliesToWorker: true, using: "(presentation = 'alias'::text)", check: null },
  ],
});
const beforeLedger = () => Array.from({ length: 212 }, (_, i) => ({ filename: `${String(i).padStart(14, "0")}_old.sql`, sha256: sha(String(i)) }));
const additions = () => PIECE_UNIT_MIGRATIONS.map(filename => ({ filename, sha256: PIECE_UNIT_MIGRATION_SHA256 }));
const pieceRows = (signatures: readonly string[]) => signatures.map(signature => ({
  signature, source: `body ${signature}`, definition: `definition ${signature}`, owner: 'postgres',
  acl: ['postgres=X/postgres'], securityDefiner: !PIECE_UNIT_HELPERS.includes(signature),
  config: [signature === 'private.ingredient_piece_candidates(uuid)' ? 'search_path=pg_catalog, public, pg_temp' : 'search_path=pg_catalog, pg_temp'],
  apiExecute: { anon: false, authenticated: false, service_role: false },
}));
type PieceEvidence = Omit<ReturnType<typeof pieceRows>[number], "source" | "definition"> & { bodySha256: string; definitionSha256: string };
const pieceEvidence = (signatures: readonly string[]): PieceEvidence[] => pieceUnitFunctionEvidence(pieceRows(signatures));
function review() {
  const migrations = additions();
  return {
    schema: "homecook.prelaunch-piece-unit-review.v1", from: "a".repeat(40), to: "b".repeat(40), migrationSourceRef: "c".repeat(40),
    previousMigrationCount: 212, migrationCount: 213, migrations,
    originalReadinessSha256: sha("readiness"),
    proofDigests: Object.fromEntries(["db_authority", "db_migration", "operator_approval", "privacy_consent", "retention_runbook", "turnstile_live", "direct_access_denial", "header_overwrite", "launch_binding"].map(name => [name, sha(name)])),
    files: { "lib/ingredients/search.ts": [sha("old"), sha("new")], ...Object.fromEntries(migrations.map(row => [`supabase/migrations/${row.filename}`, [null, row.sha256]])) },
    protectedSources: migrations.map(row => `supabase/migrations/${row.filename}`),
    preApplyProof: { path: "/private/before.json", sha256: sha("before") },
    preservationProof: { path: "/private/preserved.json", sha256: sha("preserved") },
    expectedScopeFunctions: scopes(), expectedAnonymousFunctions: evidence(anonymousRows()), expectedWorkerPrivileges: workerPrivileges(), expectedPieceFunctions: pieceEvidence([...PIECE_UNIT_HELPERS,...PIECE_UNIT_CONSUMERS]),
  };
}
const authorityStates = () => {
  const after = { scopeFunctions: scopes(), anonymousFunctions: evidence(anonymousRows()), workerPrivileges: workerPrivileges(), pieceFunctions: pieceEvidence([...PIECE_UNIT_HELPERS,...PIECE_UNIT_CONSUMERS]) };
  const before = { ...after, pieceFunctions: pieceEvidence(PIECE_UNIT_CONSUMERS) };
  return { before, after };
};

describe("reviewed piece unit deployment", () => {
  it("requires exact SHA, separately applied DB and mutually exclusive reviewed paths", () => {
    const args = ["--reviewed-piece-unit-readiness", "--already-applied-db", "--db-config", "/private/db.env", "--reviewed-ref", "b".repeat(40)];
    expect(parsePrelaunchOptions(args)).toMatchObject({ reviewedPieceUnitReadiness: true });
    expect(() => parsePrelaunchOptions(args.slice(0, 1))).toThrow("already-applied-db");
    expect(() => parsePrelaunchOptions(args.slice(0, 4))).toThrow("reviewed-ref");
    expect(() => parsePrelaunchOptions(args.filter(arg => !["--db-config", "/private/db.env"].includes(arg)))).toThrow("db-config");
    for (const flag of ["--reviewed-ai-nutrition-readiness", "--reviewed-feedback-readiness", "--reviewed-beta-readiness", "--reviewed-repair-readiness", "--reviewed-youtube-trial-readiness", "--reviewed-ingredient-search-readiness"])
      expect(() => parsePrelaunchOptions([...args, flag])).toThrow("함께");
  });
  it("fails closed without a private immutable pin", () => {
    expect(() => assertPieceUnitReviewPin({ path: null, sha256: null })).toThrow(DeploymentError);
    expect(() => assertPieceUnitReviewPin({ path: "relative", sha256: sha("pin") })).toThrow("not configured");
    expect(() => assertPieceUnitReviewPin({ path: "/private/pin", sha256: sha("pin") })).not.toThrow();
  });
  it("requires exact 212 to 213 transition and one SQL, source and proof pins", () => {
    const r = review();
    expect(() => assertPieceUnitReview(r)).not.toThrow();
    expect(() => assertPieceUnitReview({ ...r, previousMigrationCount: 207 })).toThrow("212-to-213");
    expect(() => assertPieceUnitReview({ ...r, migrations: [...r.migrations, ...r.migrations] })).toThrow("one migration");
    for (const path of ["infra/runtime.yml", "supabase/migrations/20261009090100_extra.sql"])
      expect(() => assertPieceUnitReview({ ...r, files: { ...r.files, [path]: [null, sha("extra")] } })).toThrow();
    expect(() => assertPieceUnitReview({ ...r, proofDigests: {} })).toThrow("proof pins");
    expect(() => assertPieceUnitReview({ ...r, protectedSources: ["unreviewed"] })).toThrow("protected source");
    expect(() => assertPieceUnitReview({ ...r, expectedAnonymousFunctions: r.expectedAnonymousFunctions.map(row => ({ ...row, acl: ["anon=X/postgres"] })) })).toThrow("owner-only");
  });
  it("pins full before and after source bytes", () => {
    const r = review(); const files = Object.keys(r.files);
    const input = { review: r, liveSha: r.from, releaseSha: r.to, files, actualFiles: files, digests: r.files };
    expect(() => assertPieceUnitSource(input)).not.toThrow();
    expect(() => assertPieceUnitSource({ ...input, liveSha: "d".repeat(40) })).toThrow("source pair");
    expect(() => assertPieceUnitSource({ ...input, actualFiles: [...files, "lib/unreviewed.ts"] })).toThrow("complete source diff");
    expect(() => assertPieceUnitSource({ ...input, digests: {} })).toThrow("source bytes");
  });
  it("preserves all predecessor SQL and admits exactly one new checksum", () => {
    const before = beforeLedger(); const extra = additions(); const after = [...before, ...extra];
    expect(() => assertPieceUnitMigrationTransition(before, after, extra)).not.toThrow();
    expect(() => assertPieceUnitAppliedLedger(after, structuredClone(after))).not.toThrow();
    expect(() => assertPieceUnitAppliedLedger(after, after.slice(1))).toThrow("ledger differs");
    expect(() => assertPieceUnitMigrationTransition(before, after.map((row, i) => i === 1 ? { ...row, sha256: sha("changed") } : row), extra)).toThrow("predecessor");
    expect(() => assertPieceUnitMigrationTransition(before, [...before, { ...extra[0], sha256: sha("changed") }], extra)).toThrow("new migration bytes");
  });
  it("preserves internal, anonymous and worker authority exactly", () => {
    const { before, after } = authorityStates();
    expect(() => assertPieceUnitAuthorityPreserved(before, after, review())).not.toThrow();
    expect(() => assertPieceUnitAuthorityPreserved(before, { ...after, scopeFunctions: after.scopeFunctions.slice(1) }, review())).toThrow("internal scope");
    const changed = { ...after, anonymousFunctions: after.anonymousFunctions.map(row => row.name === alias ? { ...row, bodySha256: sha("relaxed") } : row) };
    expect(() => assertPieceUnitAuthorityPreserved(before, changed, { ...review(), expectedAnonymousFunctions: changed.anonymousFunctions })).toThrow("anonymous authority");
    const policies = { ...after.workerPrivileges, policies: after.workerPrivileges.policies.map(row => row.name === "existing_owner" ? { ...row, using: "changed owner" } : row) };
    expect(() => assertPieceUnitAuthorityPreserved(before, { ...after, workerPrivileges: policies }, { ...review(), expectedWorkerPrivileges: policies })).toThrow("worker privileges");
  });
  it("requires all eleven reviewed function definitions and preserves old consumer authority", () => {
    const { before, after } = authorityStates(); const r = review();
    expect(() => assertPieceUnitReview({ ...r, expectedPieceFunctions: r.expectedPieceFunctions.slice(1) })).toThrow('exact piece');
    for (const property of ['bodySha256','definitionSha256'] as const) {
      const changed = { ...after, pieceFunctions: after.pieceFunctions.map((row, i) => i === 0 ? { ...row, [property]: sha('changed') } : row) };
      expect(() => assertPieceUnitAuthorityPreserved(before, changed, r)).toThrow('postimage');
    }
    const changed = { ...after, pieceFunctions: after.pieceFunctions.map(row => row.signature === PIECE_UNIT_CONSUMERS[0] ? { ...row, acl: ['authenticated=X/postgres'] } : row) };
    expect(() => assertPieceUnitAuthorityPreserved(before, changed, { ...r, expectedPieceFunctions: changed.pieceFunctions })).toThrow('consumer authority');
  });
  it("rejects helper privilege expansion even when the manifest tries to allow it", () => {
    const r = review();
    for (const change of [
      { securityDefiner: true }, { acl: ['anon=X/postgres'] },
      { apiExecute: { anon: false, authenticated: true, service_role: false } },
      { config: ['search_path=public'] },
    ]) expect(() => assertPieceUnitReview({ ...r, expectedPieceFunctions: r.expectedPieceFunctions.map(row => row.signature === PIECE_UNIT_HELPERS[0] ? { ...row, ...change } : row) })).toThrow('owner-only invokers');
  });
  it("binds equal nutrition/history checksums to the source and SQL reviewed", () => {
    const r = review(); const checksums = { officialNutrition: sha("nutrition"), historicalRecords: sha("history") };
    const proof = { schema: "homecook.piece-unit-preservation.v1", verified: true, migrationSourceRef: r.migrationSourceRef, migration: r.migrations[0], before: checksums, after: { ...checksums } };
    expect(() => assertPieceUnitPreservation(proof, r)).not.toThrow();
    expect(() => assertPieceUnitPreservation({ ...proof, migrationSourceRef: "d".repeat(40) }, r)).toThrow("preservation");
    expect(() => assertPieceUnitPreservation({ ...proof, after: { ...checksums, historicalRecords: sha("changed") } }, r)).toThrow("preservation");
    expect(() => assertPieceUnitPreservation({ ...proof, verified: false }, r)).toThrow("preservation");
  });
  it("initializes adapter before any read and captures the actual 212 internal chain", async () => {
    const receipt = { immutableScopeHash: sha("authority"), postimage: sha("marketing") };
    const values = new Map([
      [LEDGER_VALID_SQL, "t"], [PIECE_UNIT_LEDGER_SQL, JSON.stringify(beforeLedger())],
      ["SELECT receipt FROM marketing_round2_deploy.receipt WHERE singleton;", JSON.stringify(receipt)],
      [IMMUTABLE_SCOPE_SQL, receipt.immutableScopeHash], [BETA_CANONICAL_POSTIMAGE_SQL, receipt.postimage],
      [PIECE_UNIT_ROWS_SQL, '{"marketing_round2_events":{"count":0,"sha256":"empty"}}'],
      [AI_NUTRITION_SCOPE_SQL, JSON.stringify([scope("verify_full_local_internal_scope", "active")])],
      [AI_NUTRITION_DISABLED_SQL, "disabled"],
      [PIECE_UNIT_SCOPE_SQL, JSON.stringify([scope("verify_full_local_internal_scope", "active"), scope("verify_scope_pre_luna", "Luna predecessor")])],
      [PIECE_UNIT_ANONYMOUS_SQL, JSON.stringify(anonymousRows())],
      [PIECE_UNIT_FUNCTIONS_SQL, JSON.stringify(pieceRows(PIECE_UNIT_CONSUMERS))],
      [PIECE_UNIT_WORKER_SQL, JSON.stringify(authorityStates().before.workerPrivileges)],
    ]);
    let initialized = false;
    const adapter = { inspect: vi.fn(async () => { initialized = true; return { postgresContainerId: "exact-local" }; }), query: vi.fn(async (sql: string) => { if (!initialized) throw new Error("not initialized"); return values.get(sql)!; }) };
    const proof = await capturePieceUnitDatabaseBefore(adapter);
    expect(proof).toMatchObject({ schema: "homecook.prelaunch-piece-unit-db-before.v1", scopeFunctions: scopes(), ledger: beforeLedger() });
    expect(adapter.inspect).toHaveBeenCalledOnce();
    expect(adapter.query.mock.calls.every(([sql]) => sql.startsWith("SELECT "))).toBe(true);
    values.set(AI_NUTRITION_DISABLED_SQL, "enabled");
    await expect(capturePieceUnitDatabaseBefore(adapter)).rejects.toThrow("remain disabled");
    values.set(AI_NUTRITION_DISABLED_SQL, "disabled"); values.set(PIECE_UNIT_LEDGER_SQL, JSON.stringify([...beforeLedger(), ...additions()]));
    await expect(capturePieceUnitDatabaseBefore(adapter)).rejects.toThrow("212-entry");
  });
  it("records separately applied v3 guard as incompatible with web-only rollback", () => {
    const applied = [...beforeLedger(), ...additions()];
    const plan = { baselineRequired: false, pending: [], source: applied, applied, migrationSourceRef: 'c'.repeat(40), aiRuntimeGate: 'disabled' };
    expect(pieceUnitAppliedDatabaseState(plan)).toEqual({ changed: true, applied: additions(), backwardCompatible: false, reason: PIECE_UNIT_ROLLBACK_REASON });
    for (const change of [{ pending: ['unapplied'] }, { aiRuntimeGate: 'enabled' }, { applied: applied.slice(1) }, { baselineRequired: true }])
      expect(() => pieceUnitAppliedDatabaseState({ ...plan, ...change })).toThrow();
    const wrong = applied.map(row => row.filename === PIECE_UNIT_MIGRATIONS[0] ? { ...row, sha256: sha('wrong') } : row);
    expect(() => pieceUnitAppliedDatabaseState({ ...plan, source: wrong, applied: wrong })).toThrow('exact applied');
  });
  it("does not restore incompatible old web or report successful recovery after failed activation", async () => {
    const restore = vi.fn(); const verifyRestored = vi.fn();
    await expect(deployTransaction({ prepare: async () => {}, activate: async () => { throw new Error('activation'); }, verify: async () => {}, restore, verifyRestored, restoreProhibitedReason: PIECE_UNIT_RECOVERY_MESSAGE })).rejects.toThrow('DB는 되돌리지 않았으며 복구 기록을 유지');
    expect(restore).not.toHaveBeenCalled(); expect(verifyRestored).not.toHaveBeenCalled();
  });
  it("wires the new gate before preparation and again before activation", () => {
    const code = readFileSync("scripts/deploy-prelaunch-web.mjs", "utf8");
    expect(code).toContain("if (options.reviewedPieceUnitReadiness) await loadPieceUnitReview();");
    expect(code).toContain("return verifyPieceUnitAppliedDatabase(");
    expect(code).toContain("await reviewedPieceUnitReadiness({ ...input, databasePlan");
    expect(code).toContain("round2-piece-unit-source-review.json");
    expect(code).toContain("pieceUnitDatabase = pieceUnitAppliedDatabaseState(databasePlan);");
    expect(code).toContain("databaseVerification: databasePlan, database: pieceUnitDatabase");
    expect(code).toContain("atomicWrite(statePath, JSON.stringify({ ...previousState, database: pieceUnitDatabase }));");
    const preparationGuard = code.slice(code.indexOf("pieceUnitDatabase = pieceUnitAppliedDatabaseState(databasePlan);"), code.indexOf("const buildOptions ="));
    expect(preparationGuard).not.toContain("atomicWrite(recoveryPath");
    expect(code).toContain("...(reviewedDatabase ? { database: reviewedDatabase } : {})");
    expect(code).toContain("if (options.reviewedNutritionRecoveryReadiness || options.reviewedPieceUnitReadiness || options.reviewedYoutubeResolutionReadiness) atomicWrite(databaseStatePath, JSON.stringify(state.database));");
    expect(code).toContain("restoreProhibitedReason: options.reviewedPieceUnitReadiness ? PIECE_UNIT_RECOVERY_MESSAGE");
    expect(code).toContain("const database = assertDatabaseRollbackCompatible(state.database, recordedDatabase);");
    expect(code.indexOf("pieceUnitDatabase = pieceUnitAppliedDatabaseState(databasePlan);")).toBeLessThan(code.indexOf('await logged("pnpm", ["install"'));

    expect(code).toMatch(/options\.reviewedPieceUnitReadiness\) await stageRound2Readiness/);
  });
});
