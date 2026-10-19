import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  SAVED_RECIPE_NUTRITION_FEATURE, SAVED_RECIPE_NUTRITION_REVIEW_PIN,
  SAVED_RECIPE_NUTRITION_MIGRATIONS, savedRecipeNutritionBinding,
} from "../../scripts/lib/saved-recipe-nutrition-maintenance.mjs";
import { COOKING_EXPERIENCE_REVIEW_PIN } from "../../scripts/lib/cooking-experience-maintenance.mjs";

export const hash = value => createHash("sha256").update(value).digest("hex");
export const sha = value => value.repeat(64);
export const ref = value => value.repeat(40);
export const route = "app/api/v1/recipes/[id]/route.ts";
export const operator = "scripts/lib/saved-recipe-nutrition-maintenance.mjs";
export const operatorPair = ["319506c51d235a8eb2844dd6f9a95a75833e4547d1bd8b44e4f5479824ae5655", "cd5668ce05f0fdcf89e448243d7244af1f204ffc539719bf9f1e3aea07dba070"];

export async function successorWithPin(pin) {
  const url = new URL("../../scripts/lib/prelaunch-db-app-successor.mjs", import.meta.url);
  const text = readFileSync(url, "utf8");
  const declaration = /^export const DB_APP_SUCCESSOR_REVIEW_PIN\s*=\s*Object\.freeze\([^;]+\);/mu;
  if (!declaration.test(text)) throw Error("App successor PIN declaration moved");
  const scoped = text.replace(declaration, `export const DB_APP_SUCCESSOR_REVIEW_PIN = Object.freeze(${JSON.stringify(pin)});`)
    .replace(/from (["'])(\.\/[^"'\n]+)\1/gu, (_all, _quote, relative) => `from "${pathToFileURL(resolve(fileURLToPath(new URL(".", url)), relative)).href}"`);
  return import(`data:text/javascript;base64,${Buffer.from(scoped).toString("base64")}`);
}

/** Public synthetic SQL/catalog evidence only. No private authority file is read. */
export function committedMaintenance() {
  const fixture = JSON.parse(readFileSync(new URL("./saved-recipe-nutrition-maintenance-postimages.json", import.meta.url), "utf8"));
  const target = { owned: true, synthetic: true };
  const database = structuredClone(fixture.reviewDatabase);
  database.targetSha256 = hash(JSON.stringify(target));
  const pointer = name => ({ path: `/synthetic-db238/${name}`, sha256: sha("1") });
  const review = {
    schema: "homecook.prelaunch-protected-rollout-review.v1", feature: SAVED_RECIPE_NUTRITION_FEATURE,
    from: "196c498f4e1ecc326d6bd7b6c22e4f0b2cb56ed6", to: ref("b"),
    approved: { database: true, reader: false, writerOn: false },
    databasePrecedesReader: true, readerPrecedesDatabase: false, legacyReaderCompatible: true,
    files: Object.fromEntries(SAVED_RECIPE_NUTRITION_MIGRATIONS.map(row => [`supabase/migrations/${row.filename}`, [null, row.sha256]])),
    database, isolatedEvidence: pointer("isolated"), isolatedEvidenceSha256: sha("1"),
    legacyReaderEvidence: pointer("legacy"), postimages: pointer("images"),
    platformInventory: pointer("platform"), backupReadiness: pointer("readiness"),
    closedArtifactSha256: sha("2"), legacyMarkerDatabasePlanSha256: sha("3"),
    historicalProofsSha256: sha("4"), controlSha256: sha("5"), closedReviewSha256: sha("6"), consentGeneration: 1,
    legacyReader: { ref: "196c498f4e1ecc326d6bd7b6c22e4f0b2cb56ed6", buildId: "synthetic-legacy", plistSha256: sha("7") },
    predecessorMaintenance: { schema: "homecook.cooking-experience-maintenance.v1", ledgerCount: 235,
      reviewSha256: COOKING_EXPERIENCE_REVIEW_PIN.sha256, receipt: pointer("original235"),
      targetSha256: database.targetSha256, databasePlanSha256: sha("9") },
  };
  const record = {
    schema: "homecook.prelaunch-protected-db-attempt.v1", feature: review.feature, status: "committed",
    reviewSha256: SAVED_RECIPE_NUTRITION_REVIEW_PIN.sha256, from: review.from, to: review.to,
    targetSha256: database.targetSha256, predecessorMaintenance: review.predecessorMaintenance,
    databasePlanSha256: hash(JSON.stringify({ source: database.after, applied: database.after })),
    unchangedCatalogSha256: database.unchangedCatalogSha256, catalogComparison: database.catalogComparison,
    catalogMode: database.catalogMode, canonicalCatalog: database.canonicalCatalog.after,
    catalogSha256: fixture.after.catalogSha256, immutableSha256: fixture.after.immutableSha256,
    stableImmutableSha256: fixture.after.stableImmutableSha256,
    savedRecipeNutritionPostCatalog: { catalogSha256: fixture.after.catalogSha256,
      immutableSha256: fixture.after.immutableSha256, stableImmutableSha256: fixture.after.stableImmutableSha256 },
    savedRecipeNutritionFunctionOids: fixture.after.functions.map(row => [row.signature, row.oid]),
    savedRecipeNutritionScopeLink: { outerOid: 101, aliasOid: 100 },
    rowsPreservedInTransaction: true, controlsPreservedInTransaction: true,
    featureMetadataPreservedInTransaction: true, scopeAliasOidPreservedInTransaction: true,
    readerReady: false, writerEnabled: false, readerFloor: review.to, legacyReaderCompatible: true,
    normalDataSha256: sha("1"), preservedRowsSha256: sha("2"), attestationRowsSha256: sha("3"),
    controlsSha256: sha("4"), executionRowsSha256: sha("5"), ledgerPreservedRowsSha256: sha("6"),
    backup: { fullArchiveDecoded: true, sha256: sha("7"), rolesSha256: sha("8"), target },
  };
  const p = pointer("receipt");
  const maintenance = { review, record, pointer: p, guardPointer: { ...p } };
  savedRecipeNutritionBinding(maintenance);
  return maintenance;
}

export function successorInput() {
  const maintenance = committedMaintenance();
  const from = ref("c"), to = ref("d");
  const live = { ref: from, buildId: "synthetic-current-web", plistSha256: sha("7") };
  const digests = { [route]: [sha("1"), sha("2")] };
  const review = { schema: "homecook.db238-app-successor.v1", from, to, live: { ...live },
    maintenance: structuredClone(savedRecipeNutritionBinding(maintenance)), files: structuredClone(digests) };
  return { review, maintenance, from, to, live, files: Object.keys(digests), digests,
    readerFloorAncestor: true, liveAncestor: true,
    options: { ref: to, refOption: "--reviewed-ref", alreadyAppliedDb: true, dbConfig: "/synthetic-db238/unread-config" } };
}
