import { createHash } from "node:crypto";
import { isAbsolute } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { savedRecipeNutritionBinding } from "./saved-recipe-nutrition-maintenance.mjs";

// Separate app-source approval. Never repoint the original DB238 authority.
export const DB_APP_SUCCESSOR_REVIEW_PIN = Object.freeze({ path: "/Users/cwj/.homecook/operations/db238-app-successor-20261020-i3ju8d/approved-app-review.json", sha256: "ee3d6baf1b42fe168ed53977fe230e80e89e034840764696669697225992bf32" });
const historicalOperator = "scripts/lib/saved-recipe-nutrition-maintenance.mjs";
const historicalOperatorPair = [
  "319506c51d235a8eb2844dd6f9a95a75833e4547d1bd8b44e4f5479824ae5655",
  "cd5668ce05f0fdcf89e448243d7244af1f204ffc539719bf9f1e3aea07dba070",
];
// This reviewed type-cleanup batch, not a general app/authorization escape hatch.
const appFiles = new Set([
  "app/api/v1/cooking/sessions/[session_id]/cancel/route.ts",
  "app/api/v1/cooking/sessions/route.ts",
  ...["eat", "keep", "uneat"].map(action => `app/api/v1/leftovers/[leftover_id]/${action}/route.ts`),
  "app/api/v1/leftovers/route.ts", "app/api/v1/pantry/bundles/route.ts",
  "app/api/v1/recipe-books/[book_id]/route.ts", "app/api/v1/recipe-books/route.ts",
  "app/api/v1/recipes/[id]/cook-mode/route.ts", "app/api/v1/recipes/[id]/route.ts",
  ...["items/[item_id]", "items/bulk", "items/reorder", "share-text"].map(part => `app/api/v1/shopping/lists/[list_id]/${part}/route.ts`),
  "app/api/v1/shopping/lists/[list_id]/route.ts", "app/api/v1/shopping/lists/route.ts",
  "app/api/v1/shopping/preview/route.ts", "lib/server/ingredient-ai-nutrition-refresh.ts",
  "lib/server/meal-log-route.ts", "lib/server/pantry.ts", "lib/server/recipe-nutrition-service.ts",
  "lib/server/user-bootstrap.ts",
]);
const sha256 = value => createHash("sha256").update(value).digest("hex");
const digest = value => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
const commit = value => typeof value === "string" && /^[a-f0-9]{40}$/u.test(value);
function check(value, code) { if (!value) throw new Error(`DB_APP_SUCCESSOR_${code}`); }

export function readDbAppSuccessorReview(readPrivateBytes) {
  const pin = DB_APP_SUCCESSOR_REVIEW_PIN;
  check(typeof pin.path === "string" && isAbsolute(pin.path) && digest(pin.sha256), "PIN_UNBOUND");
  const bytes = readPrivateBytes(pin.path);
  check(sha256(bytes) === pin.sha256, "REVIEW_DIGEST");
  return JSON.parse(bytes.toString());
}

export function assertDbAppSuccessor({ review, maintenance, from, to, live, files, digests,
  readerFloorAncestor, liveAncestor, options }) {
  const binding = savedRecipeNutritionBinding(maintenance);
  check(review?.schema === "homecook.db238-app-successor.v1", "REVIEW_SCHEMA");
  check(isDeepStrictEqual(review.maintenance, binding), "MAINTENANCE");
  check(commit(from) && commit(to) && from !== to && review.from === from && review.to === to
    && live?.ref === from && typeof live.buildId === "string" && live.buildId.length > 0
    && digest(live.plistSha256) && isDeepStrictEqual(review.live, live), "SOURCE");
  check(readerFloorAncestor === true && liveAncestor === true, "ANCESTRY");
  check(options?.refOption === "--reviewed-ref" && options.alreadyAppliedDb === true
    && typeof options.dbConfig === "string" && options.dbConfig.length > 0 && !options.envFile
    && !options.dbCompatible && !options.dbBaseline && !options.skipAutomatedTests
    && !Object.entries(options).some(([key, value]) => key.startsWith("reviewed") && Boolean(value)), "OPTIONS");
  check(Array.isArray(files) && files.length > 0 && new Set(files).size === files.length
    && review.files && isDeepStrictEqual([...files].sort(), Object.keys(review.files).sort())
    && isDeepStrictEqual(digests, review.files), "FILES");
  const supportFiles = new Set();
  for (const file of files) {
    check(typeof file === "string" && !file.split("/").some(part => ["", ".", ".."].includes(part)), "SCOPE");
    const pair = digests[file];
    check(Array.isArray(pair) && pair.length === 2 && pair.every(value => value === null || digest(value))
      && pair[0] !== pair[1], "BLOB");
    if (file === historicalOperator) {
      check(isDeepStrictEqual(pair, historicalOperatorPair), "OPERATOR");
      supportFiles.add(file);
    } else {
      check(appFiles.has(file) || /^(?:docs|tests)\/[A-Za-z0-9_./[\]-]+$/u.test(file), "SCOPE");
    }
  }
  return { supportFiles };
}
