/** One reviewed feedback rollout. Unconfigured pins deliberately prohibit execution. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { inheritRound2Readiness } from "./prelaunch-web-deploy.mjs";
import { createRecordingDockerAdapter, privatePath, IMMUTABLE_SCOPE_SQL, LEDGER_VALID_SQL } from "./marketing-round2-controlled-deploy.mjs";
import { BETA_ALIASES_UNROUTED_SQL, BETA_CANONICAL_POSTIMAGE_SQL, BETA_WRAPPERS_SQL } from "./prelaunch-beta-readiness.mjs";

export const FEEDBACK_LIVE_SHA = "5d05a180b6c0850dc4e87bfe0945a609ff450e90";
// Fill only after the source pair, before/after DB evidence, and manifest bytes
// have been reviewed. Neither CLI arguments nor environment may override pins.
export const FEEDBACK_REVIEW_PIN = Object.freeze({ path: null, sha256: null });
const SHA = /^[a-f0-9]{64}$/u;
const REF = /^[a-f0-9]{40}$/u;
const PROOFS = ["db_authority", "db_migration", "operator_approval", "privacy_consent", "retention_runbook", "turnstile_live"];
const PROXY_PROOFS = ["direct_access_denial", "header_overwrite", "launch_binding"];
const requireValue = (value, message) => { if (!value) throw new Error(`Reviewed feedback readiness: ${message}`); };
const hash = value => createHash("sha256").update(value).digest("hex");
const sorted = values => [...values].sort();

export const FEEDBACK_LEDGER_SQL = "SELECT coalesce(jsonb_agg(jsonb_build_object('filename',filename,'sha256',sha256) ORDER BY filename),'[]'::jsonb) FROM homecook_deploy.migrations;";
export const FEEDBACK_ROWS_SQL = `SELECT jsonb_object_agg(relation, evidence) FROM (${[
  "marketing_validation_sessions", "marketing_round2_participations", "marketing_round2_events", "marketing_round2_lead_requests",
].map(name => `SELECT '${name}' relation, jsonb_build_object('count', count(*), 'sha256', encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text,'UTF8')),'hex')) evidence FROM public.${name} t`).join(" UNION ALL ")}) rows;`;

export function feedbackScopeEvidence(rows) {
  requireValue(Array.isArray(rows) && rows.length > 0, "scope evidence missing");
  return rows.map(row => {
    requireValue(typeof row.name === "string" && /^verify_full_local_internal_scope[a-z0-9_]*$/u.test(row.name)
      && typeof row.source === "string", "invalid scope function");
    return { name: row.name, bodySha256: hash(row.source), owner: row.owner,
      acl: row.acl, securityDefiner: row.securityDefiner, config: row.config };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

export function assertFeedbackReview(review) {
  requireValue(review?.schema === "homecook.prelaunch-feedback-review.v1", "invalid review manifest");
  requireValue(review.from === FEEDBACK_LIVE_SHA && REF.test(review.to ?? "")
    && REF.test(review.migrationSourceRef ?? ""), "unreviewed source pair");
  requireValue(review.migrationCount === 197, "exact reviewed 197-entry ledger required");
  requireValue(SHA.test(review.originalReadinessSha256 ?? "")
    && isDeepStrictEqual(sorted(Object.keys(review.proofDigests ?? {})), sorted([...PROOFS, ...PROXY_PROOFS]))
    && Object.values(review.proofDigests).every(value => SHA.test(value)), "original readiness/proof pins required");
  requireValue(review.files && typeof review.files === "object" && !Array.isArray(review.files)
    && Object.keys(review.files).length > 0, "complete source pins missing");
  for (const [path, pair] of Object.entries(review.files)) {
    requireValue(!path.startsWith("/") && !path.split("/").includes("..") && Array.isArray(pair)
      && pair.length === 2 && pair.every(value => value === null || SHA.test(value))
      && pair.some(value => value !== null), "invalid source pin");
    requireValue(!path.startsWith("supabase/") && !path.startsWith("infra/"), "feedback candidate must be web-only");
  }
  requireValue(Array.isArray(review.protectedSources) && new Set(review.protectedSources).size === review.protectedSources.length
    && review.protectedSources.every(path => Object.hasOwn(review.files, path)), "invalid protected source review");
  requireValue(isAbsolute(review.preApplyProof?.path ?? "") && SHA.test(review.preApplyProof?.sha256 ?? ""), "pinned pre-apply proof required");
  requireValue(Array.isArray(review.expectedScopeFunctions) && review.expectedScopeFunctions.length > 0
    && new Set(review.expectedScopeFunctions.map(row => row.name)).size === review.expectedScopeFunctions.length
    && review.expectedScopeFunctions.every(row => SHA.test(row.bodySha256 ?? "") && row.owner === "postgres" && row.securityDefiner === true
      && isDeepStrictEqual(row.config, ["search_path=pg_catalog, public, private, pg_temp"])), "reviewed scope chain required");
  return review;
}

export function assertFeedbackReviewPin(pin) {
  requireValue(isAbsolute(pin?.path ?? "") && SHA.test(pin?.sha256 ?? ""), "review pins are not configured; execution prohibited");
}

export async function loadFeedbackReview() {
  assertFeedbackReviewPin(FEEDBACK_REVIEW_PIN);
  await privatePath(FEEDBACK_REVIEW_PIN.path);
  const bytes = readFileSync(FEEDBACK_REVIEW_PIN.path);
  requireValue(hash(bytes) === FEEDBACK_REVIEW_PIN.sha256, "review manifest bytes changed");
  return assertFeedbackReview(JSON.parse(bytes));
}

async function readPreApplyProof(review) {
  await privatePath(review.preApplyProof.path);
  const bytes = readFileSync(review.preApplyProof.path);
  requireValue(hash(bytes) === review.preApplyProof.sha256, "pre-apply proof changed");
  const proof = JSON.parse(bytes);
  requireValue(proof.schema === "homecook.prelaunch-feedback-db-before.v1"
    && typeof proof.observedAt === "string" && Number.isFinite(Date.parse(proof.observedAt))
    && Array.isArray(proof.ledger) && proof.ledger.length === 185
    && SHA.test(proof.receiptSha256 ?? "") && SHA.test(proof.immutableScope ?? "")
    && SHA.test(proof.marketingPostimage ?? "") && SHA.test(proof.rowsSha256 ?? "")
    && Array.isArray(proof.scopeFunctions), "invalid pre-apply proof");
  return proof;
}

/** Read-only collection. Caller saves this BEFORE applying SQL and reviews/pins it. */
export async function captureFeedbackDatabaseBefore(adapter) {
  const target = await adapter.inspect();
  requireValue(await adapter.query(LEDGER_VALID_SQL) === "t", "R2 ledger authority drift");
  const receipt = JSON.parse(await adapter.query("SELECT receipt FROM marketing_round2_deploy.receipt WHERE singleton;"));
  const immutableScope = await adapter.query(IMMUTABLE_SCOPE_SQL);
  const marketingPostimage = await adapter.query(BETA_CANONICAL_POSTIMAGE_SQL);
  requireValue(immutableScope === receipt.immutableScopeHash && marketingPostimage === receipt.postimage, "original R2 receipt no longer matches its authority/catalog");
  return { schema: "homecook.prelaunch-feedback-db-before.v1", observedAt: new Date().toISOString(), target,
    ledger: JSON.parse(await adapter.query(FEEDBACK_LEDGER_SQL)),
    receiptSha256: hash(JSON.stringify(receipt)), immutableScope, marketingPostimage,
    rowsSha256: hash(JSON.stringify(JSON.parse(await adapter.query(FEEDBACK_ROWS_SQL)))),
    scopeFunctions: feedbackScopeEvidence(JSON.parse(await adapter.query(BETA_WRAPPERS_SQL))),
  };
}

export function assertFeedbackScopePreserved(before, after, expected) {
  requireValue(isDeepStrictEqual(after, [...expected].sort((a, b) => a.name.localeCompare(b.name))), "scope chain differs from reviewed post-apply evidence");
  for (const original of before) {
    const sameBody = candidate => isDeepStrictEqual({ ...candidate, name: original.name }, original);
    // New scope wrappers may rename only the previous active entrypoint. Existing
    // named delegates must keep both their identity and authority unchanged.
    requireValue(after.some(candidate => sameBody(candidate)
      && (original.name === "verify_full_local_internal_scope" || candidate.name === original.name)), "existing scope delegate or authority changed");
  }
}

function gitAt(repositoryRoot) {
  return args => execFileSync("git", ["-C", repositoryRoot, ...args], { maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
}

export function assertFeedbackSource({ review, liveSha, releaseSha, files, actualFiles, digests }) {
  assertFeedbackReview(review);
  requireValue(liveSha === review.from && releaseSha === review.to, "unreviewed source pair");
  requireValue(isDeepStrictEqual(sorted(files), sorted(actualFiles)) && isDeepStrictEqual(sorted(files), sorted(Object.keys(review.files))), "complete source diff differs from review");
  requireValue(isDeepStrictEqual(digests, review.files), "reviewed source bytes changed");
}

export function assertFeedbackAppliedLedger(source, applied) {
  requireValue(Array.isArray(source) && source.length === 197 && isDeepStrictEqual(applied, source), "actual migration ledger differs from reviewed source");
}

/** Unlike the normal path, SQL belongs to the separately reviewed source ref,
 * not the web-only candidate. The complete real ledger must match all 197 files. */
export async function verifyFeedbackAppliedDatabase({ repositoryRoot, configPath, releaseSha }) {
  const review = await loadFeedbackReview();
  requireValue(releaseSha === review.to, "unreviewed database candidate");
  const proof = await readPreApplyProof(review);
  const git = gitAt(repositoryRoot);
  const names = git(["ls-tree", "--name-only", `${review.migrationSourceRef}:supabase/migrations`]).toString().trim().split("\n").filter(name => /^\d{14}_.+\.sql$/u.test(name)).sort();
  const source = names.map(filename => ({ filename, sha256: hash(git(["show", `${review.migrationSourceRef}:supabase/migrations/${filename}`])) }));
  requireValue(source.length === review.migrationCount && isDeepStrictEqual(source.slice(0, proof.ledger.length), proof.ledger), "migration source changed its reviewed predecessor");
  const adapter = await createRecordingDockerAdapter({ configPath, backupDirectory: dirname(review.preApplyProof.path) });
  requireValue(isDeepStrictEqual(await adapter.inspect(), proof.target), "database target drift");
  const applied = JSON.parse(await adapter.query(FEEDBACK_LEDGER_SQL));
  assertFeedbackAppliedLedger(source, applied);
  return { baselineRequired: false, pending: [], applied, source, migrationSourceRef: review.migrationSourceRef };
}

export async function reviewedFeedbackReadiness({ readiness, previous, next, liveSha, releaseSha, files, databasePlan, databaseDeployment, repositoryRoot, configPath }) {
  const review = await loadFeedbackReview();
  requireValue(hash(JSON.stringify(readiness)) === review.originalReadinessSha256, "original readiness changed");
  requireValue(databaseDeployment === false && databasePlan?.baselineRequired === false && databasePlan.pending?.length === 0
    && databasePlan.applied?.length === 197 && databasePlan.migrationSourceRef === review.migrationSourceRef, "verified separately applied database required");
  const git = gitAt(repositoryRoot);
  requireValue(git(["status", "--porcelain", "--untracked-files=no"]).length === 0, "candidate tracked files changed");
  git(["merge-base", "--is-ancestor", liveSha, releaseSha]);
  const actualFiles = git(["diff", "--name-only", "--no-renames", "-z", liveSha, releaseSha]).toString().split("\0").filter(Boolean);
  const digests = Object.fromEntries(Object.keys(review.files).map(path => [path, [liveSha, releaseSha].map(ref => git(["ls-tree", ref, "--", path]).length ? hash(git(["show", `${ref}:${path}`])) : null)]));
  assertFeedbackSource({ review, liveSha, releaseSha, files, actualFiles, digests });
  for (const path of files.filter(path => /^(app|components|lib|stores|types|hooks|public)\//u.test(path))) {
    const sourceHash = git(["ls-tree", review.migrationSourceRef, "--", path]).length
      ? hash(git(["show", `${review.migrationSourceRef}:${path}`])) : null;
    requireValue(sourceHash === review.files[path][1], "candidate application bytes differ from reviewed integrated source");
  }
  const environment = { ...next.EnvironmentVariables };
  for (const [key, value] of Object.entries({ MUMEOK_ROUND2_RELEASE_SHA: releaseSha, MUMEOK_ROUND2_REPOSITORY_ROOT: next.WorkingDirectory, MUMEOK_ROUND2_READINESS_PATH: join(dirname(next.WorkingDirectory), "round2-readiness.json") })) {
    requireValue(environment[key] === previous.EnvironmentVariables[key] || environment[key] === value, "unexpected readiness binding");
    environment[key] = previous.EnvironmentVariables[key];
  }
  const inherited = inheritRound2Readiness({ readiness, previous, next: { ...next, EnvironmentVariables: environment }, liveSha, releaseSha,
    files: files.filter(path => !review.protectedSources.includes(path)), databaseDeployment: false });
  requireValue(isDeepStrictEqual(sorted(Object.keys(readiness.proofs ?? {})), PROOFS), "original proof set changed");
  const proxyProofs = Object.entries(readiness.proxy ?? {}).filter(([, value]) => value && typeof value === "object");
  requireValue(isDeepStrictEqual(sorted(proxyProofs.map(([key]) => key)), PROXY_PROOFS), "original proxy proof set changed");
  const proofDigests = {};
  for (const [key, value] of [...Object.entries(readiness.proofs), ...proxyProofs]) {
    await privatePath(value.path);
    requireValue(SHA.test(value.sha256 ?? "") && value.sha256 === review.proofDigests[key]
      && hash(readFileSync(value.path)) === value.sha256, "original proof changed");
    proofDigests[key] = value.sha256;
  }
  const authority = JSON.parse(readFileSync(readiness.proofs.db_authority.path, "utf8"));
  const before = await readPreApplyProof(review);
  const adapter = await createRecordingDockerAdapter({ configPath, backupDirectory: dirname(review.preApplyProof.path) });
  const observed = await captureFeedbackDatabaseBefore(adapter);
  requireValue(isDeepStrictEqual(observed.target, before.target) && isDeepStrictEqual(observed.target, authority.target), "database target drift");
  requireValue(isDeepStrictEqual(observed.ledger, databasePlan.applied), "database ledger changed after verification");
  requireValue(observed.receiptSha256 === before.receiptSha256 && observed.immutableScope === before.immutableScope
    && observed.immutableScope === authority.immutableScopeHash && observed.marketingPostimage === before.marketingPostimage
    && observed.rowsSha256 === before.rowsSha256, "marketing data or authority boundary changed");
  assertFeedbackScopePreserved(before.scopeFunctions, observed.scopeFunctions, review.expectedScopeFunctions);
  requireValue(await adapter.query(BETA_ALIASES_UNROUTED_SQL) === "t", "historical owner-only aliases became routed");
  return { readiness: inherited, review: { schema: "homecook.prelaunch-feedback-source-review.v1", observedAt: new Date().toISOString(), liveSha, releaseSha,
    originalVerifiedAt: readiness.verified_at, proofDigests, sources: review.files, protectedSources: review.protectedSources,
    migrationSourceRef: review.migrationSourceRef, migrationCount: observed.ledger.length,
    reviewManifestSha256: FEEDBACK_REVIEW_PIN.sha256, preApplyProofSha256: review.preApplyProof.sha256,
    receiptSha256: observed.receiptSha256, immutableScope: observed.immutableScope, marketingPostimage: observed.marketingPostimage,
    rowsSha256: observed.rowsSha256, scopeFunctions: observed.scopeFunctions, aliasesUnrouted: true, providerReverified: false, databaseWrites: false } };
}
