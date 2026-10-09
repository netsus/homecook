#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  buildIngredientLookupNameCandidates,
  normalizeIngredientSearchName,
} from "../lib/ingredient-search.ts";

const CANDIDATE = "v59-source-first-quantity";
const NEW_REVIEWED_SYNONYM = "맛술(미림)";
const FIXTURE_PATH = "tests/fixtures/youtube-ingredient-resolution/reviewed-v1.json";

function parseArgs(argv) {
  const normalizedArgs = argv[0] === "--" ? argv.slice(1) : argv;
  const values = new Map();
  for (let index = 0; index < normalizedArgs.length; index += 2) {
    const key = normalizedArgs[index];
    const value = normalizedArgs[index + 1];
    if (!key?.startsWith("--") || !value) {
      throw new Error("Usage: --evidence-root <path> --out <path>");
    }
    values.set(key, value);
  }
  const evidenceRoot = values.get("--evidence-root");
  const out = values.get("--out");
  if (!evidenceRoot || !out || values.size !== 2) {
    throw new Error("Usage: --evidence-root <path> --out <path>");
  }
  return { evidenceRoot: path.resolve(evidenceRoot), out: path.resolve(out) };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function buildRawText(ingredient) {
  return [ingredient.originalName ?? ingredient.name, ingredient.amountRawText]
    .filter((value) => typeof value === "string" && value.trim())
    .join(" ")
    .trim();
}

function transitionCounts(rows) {
  return rows.reduce((counts, row) => {
    counts[row.transition] = (counts[row.transition] ?? 0) + 1;
    return counts;
  }, {});
}

function observation(candidateIds) {
  const ids = [...new Set(candidateIds)].sort();
  if (ids.length === 0) return { status: "unresolved", candidate_ids: [], final_id: null };
  if (ids.length === 1) return { status: "resolved", candidate_ids: ids, final_id: ids[0] };
  return { status: "needs_review", candidate_ids: ids, final_id: null };
}

function resolveAgainstCatalog(context, catalog, expandLookupCandidates) {
  const names = expandLookupCandidates ? buildIngredientLookupNameCandidates(context) : [context.name];
  for (const name of names) {
    const key = normalizeIngredientSearchName(name);
    const directIds = catalog.ingredients
      .filter((row) => normalizeIngredientSearchName(row.standard_name) === key)
      .map((row) => row.id);
    if (directIds.length > 0) return observation(directIds);
    const synonymIds = catalog.synonyms
      .filter((row) => normalizeIngredientSearchName(row.synonym) === key)
      .map((row) => row.ingredient_id);
    if (synonymIds.length > 0) return observation(synonymIds);
  }
  return observation([]);
}

function classifyTransition(before, after) {
  if (before.status === after.status && before.final_id === after.final_id
    && before.candidate_ids.join("\0") === after.candidate_ids.join("\0")) return "unchanged";
  if (before.status === "unresolved" && after.status === "resolved") return "newly_resolved";
  if (before.status === "resolved" && after.status === "resolved") return "resolved_id_changed";
  if (before.status === "resolved" && after.status === "needs_review") return "resolved_to_needs_review";
  if (before.status === "resolved" && after.status === "unresolved") return "resolved_to_unresolved";
  if (before.status === "needs_review" && after.status === "resolved") return "needs_review_to_resolved";
  if (before.status === "needs_review" && after.status === "needs_review") return "needs_review_candidates_changed";
  if (after.status === "needs_review") return "newly_needs_review";
  return "other_status_change";
}

const { evidenceRoot, out } = parseArgs(process.argv.slice(2));
const reportPath = path.join(evidenceRoot, "grade-report-r2.json");
const archiveDirectory = path.join(evidenceRoot, "grade-report-r2.json.legacy-v2.json.inputs");
const manifestPath = path.join(archiveDirectory, "manifest.json");
const [reportBytes, manifestBytes, fixtureBytes] = await Promise.all([
  readFile(reportPath),
  readFile(manifestPath),
  readFile(path.resolve(FIXTURE_PATH)),
]);
const report = JSON.parse(reportBytes.toString("utf8"));
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const fixture = JSON.parse(fixtureBytes.toString("utf8"));
const expectedVideos = new Set(report.perVideo
  .filter((row) => row.candidate === CANDIDATE)
  .map((row) => row.videoId));
if (expectedVideos.size !== 30) {
  throw new Error(`Expected 30 ${CANDIDATE} videos, found ${expectedVideos.size}`);
}

const archivedOutputs = manifest.files.filter((row) =>
  row.file.includes(`/${CANDIDATE}-`) && row.file.endsWith("/extraction-output.json"));
if (archivedOutputs.length !== expectedVideos.size) {
  throw new Error(`Expected ${expectedVideos.size} archived outputs, found ${archivedOutputs.length}`);
}

const catalogSourceBytes = await readFile(path.resolve(fixture.catalog_snapshot.source));
if (sha256(catalogSourceBytes) !== fixture.catalog_snapshot.source_sha256) {
  throw new Error("Reviewed catalog source hash changed");
}
const candidateCatalog = fixture.catalog_snapshot;
const baselineCatalog = {
  ingredients: candidateCatalog.ingredients,
  synonyms: candidateCatalog.synonyms.filter((row) =>
    normalizeIngredientSearchName(row.synonym) !== normalizeIngredientSearchName(NEW_REVIEWED_SYNONYM)),
};
const addedSynonymKeys = new Set(candidateCatalog.synonyms
  .filter((row) => !baselineCatalog.synonyms.some((baseline) =>
    baseline.ingredient_id === row.ingredient_id
      && normalizeIngredientSearchName(baseline.synonym) === normalizeIngredientSearchName(row.synonym)))
  .map((row) => normalizeIngredientSearchName(row.synonym)));

const occurrences = [];
for (const archived of archivedOutputs) {
  const match = new RegExp(`/${CANDIDATE}-([^/]+)-r1/`).exec(archived.file);
  const videoId = match?.[1];
  if (!videoId || !expectedVideos.has(videoId)) {
    throw new Error(`Unexpected archived candidate path: ${archived.file}`);
  }
  const bytes = await readFile(path.join(archiveDirectory, archived.archiveRelativePath));
  if (sha256(bytes) !== archived.sha256 || bytes.length !== archived.byteLength) {
    throw new Error(`Archived output identity mismatch: ${archived.archiveRelativePath}`);
  }
  const output = JSON.parse(bytes.toString("utf8"));
  output.recipes.forEach((recipe, recipeIndex) => recipe.ingredients.forEach((ingredient, ingredientIndex) => {
    const context = {
      name: ingredient.name,
      unit: ingredient.unit ?? null,
      rawText: buildRawText(ingredient),
    };
    const candidates = buildIngredientLookupNameCandidates(context);
    const policyDeltaEligible = candidates.length > 1
      || addedSynonymKeys.has(normalizeIngredientSearchName(context.name));
    occurrences.push({
      video_id: videoId,
      recipe_index: recipeIndex,
      ingredient_index: ingredientIndex,
      name: ingredient.name,
      original_name: ingredient.originalName ?? ingredient.name,
      unit: ingredient.unit ?? null,
      amount_raw_text: ingredient.amountRawText ?? null,
      lookup_raw_text: context.rawText,
      lookup_candidates: candidates,
      policy_delta_eligible: policyDeltaEligible,
      archived_output_sha256: archived.sha256,
    });
  }));
}

const changedRows = occurrences.filter((row) => row.policy_delta_eligible).map((row) => {
  const context = { name: row.name, unit: row.unit, rawText: row.lookup_raw_text };
  const before = resolveAgainstCatalog(context, baselineCatalog, false);
  const after = resolveAgainstCatalog(context, candidateCatalog, true);
  return {
    ...row,
    before,
    after,
    transition: classifyTransition(before, after),
  };
});
const counts = transitionCounts(changedRows);
const uniqueNames = new Set(occurrences.map((row) => normalizeIngredientSearchName(row.name)));
const reviewedStableRows = fixture.semantic_cases
  .filter((row) => row.before.status === "resolved"
    && buildIngredientLookupNameCandidates({
      name: row.extracted_name,
      unit: row.lookup_context?.unit ?? row.source_evidence.unit,
      rawText: row.lookup_context?.raw_text ?? row.source_evidence.raw_text,
    }).length === 1)
  .map((row) => ({
    name: row.extracted_name,
    final_id: row.before.final_id,
    reason: "exact rank-0 policy is unchanged; lower-ranked candidates cannot replace an existing exact match",
  }));

const result = {
  schema_version: 1,
  kind: "youtube-ingredient-resolution-regression-delta",
  candidate: CANDIDATE,
  scope: {
    video_count: expectedVideos.size,
    ingredient_occurrence_count: occurrences.length,
    unique_normalized_name_count: uniqueNames.size,
    policy_unchanged_occurrence_count: occurrences.length - changedRows.length,
    policy_delta_eligible_occurrence_count: changedRows.length,
  },
  lineage: {
    grade_report: "grade-report-r2.json",
    grade_report_sha256: sha256(reportBytes),
    archive_manifest: "grade-report-r2.json.legacy-v2.json.inputs/manifest.json",
    archive_manifest_sha256: sha256(manifestBytes),
    archived_outputs_verified: archivedOutputs.length,
    source_outputs_modified: false,
  },
  catalog_basis: {
    kind: "independently-reviewed-affected-identity-slice",
    fixture: FIXTURE_PATH,
    fixture_sha256: sha256(fixtureBytes),
    source: fixture.catalog_snapshot.source,
    source_sha256: fixture.catalog_snapshot.source_sha256,
    note: "The repository has no frozen full synonym dump. Only policy-delta rows are resolved against this reviewed slice; unchanged rows are not assigned synthetic accuracy outcomes.",
  },
  evaluation_contract: {
    model_calls: 0,
    video_downloads: 0,
    frozen_strict_grading_changed: false,
    accuracy_claim_for_unreviewed_rows: false,
    original_outputs_overwritten: false,
    lookup_context_reconstruction: "rawText = originalName + amountRawText; name, unit and quantity fields remain unchanged",
    invariant: "rank 0 exact matches win before rank 1 fallbacks, so an existing exact link cannot switch IDs through candidate expansion",
  },
  transition_summary: {
    newly_resolved: counts.newly_resolved ?? 0,
    resolved_id_changed: counts.resolved_id_changed ?? 0,
    resolved_to_needs_review: counts.resolved_to_needs_review ?? 0,
    resolved_to_unresolved: counts.resolved_to_unresolved ?? 0,
    needs_review_to_resolved: counts.needs_review_to_resolved ?? 0,
    needs_review_candidates_changed: counts.needs_review_candidates_changed ?? 0,
    newly_needs_review: counts.newly_needs_review ?? 0,
    other_status_change: counts.other_status_change ?? 0,
    unchanged_delta_eligible: counts.unchanged ?? 0,
  },
  changed_rows: changedRows,
  reviewed_stable_exact_rows: reviewedStableRows,
  limitations: [
    "This is a model-free resolver delta scan, not an extraction-quality or whole-corpus ID-accuracy score.",
    "Rows without independent expected IDs are counted only as policy-unchanged or delta-eligible; they are not labeled correct or incorrect.",
    "Full-catalog baseline/candidate SQL behavior is checked separately in the isolated migration replay; no production database was queried or changed.",
  ],
};

await writeFile(out, `${JSON.stringify(result, null, 2)}\n`, { flag: "w", mode: 0o644 });
console.warn(JSON.stringify({
  output: out,
  scope: result.scope,
  transition_summary: result.transition_summary,
}, null, 2));
