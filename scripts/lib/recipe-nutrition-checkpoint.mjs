import { randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, normalize } from "node:path";

import { RecipeNutritionBackfillError } from "./recipe-nutrition-backfill.mjs";

const CHECKPOINT_SCHEMA_VERSION = "recipe-nutrition-backfill-checkpoint-v3";
const MEAL_CHECKPOINT_SCHEMA_VERSION = "recipe-nutrition-meal-pin-checkpoint-v1";
const CHECKPOINT_SCOPE = "foodsafety-30";
const MAX_CHECKPOINT_BYTES = 64 * 1024;

function fail(code = "INVALID_BACKFILL_CHECKPOINT_PATH") {
  throw new RecipeNutritionBackfillError(code);
}

function validateCheckpoints(checkpoints) {
  if (!Array.isArray(checkpoints) || checkpoints.length > 30) {
    fail("INVALID_BACKFILL_CHECKPOINT");
  }
  const recipeIds = new Set();
  for (const checkpoint of checkpoints) {
    if (!checkpoint || typeof checkpoint !== "object" || Array.isArray(checkpoint) ||
      Object.keys(checkpoint).sort().join(",") !==
        "applied_snapshot_id,expected_input_hash,previous_snapshot_id,recipe_id,state" ||
      typeof checkpoint.recipe_id !== "string" || checkpoint.recipe_id.length === 0 ||
      typeof checkpoint.expected_input_hash !== "string" ||
      !/^[0-9a-f]{64}$/.test(checkpoint.expected_input_hash) ||
      typeof checkpoint.applied_snapshot_id !== "string" ||
      checkpoint.applied_snapshot_id.length === 0 ||
      !["planned", "applied"].includes(checkpoint.state) ||
      (checkpoint.previous_snapshot_id !== null &&
        (typeof checkpoint.previous_snapshot_id !== "string" ||
          checkpoint.previous_snapshot_id.length === 0)) ||
      recipeIds.has(checkpoint.recipe_id)) {
      fail("INVALID_BACKFILL_CHECKPOINT");
    }
    recipeIds.add(checkpoint.recipe_id);
  }
  return checkpoints;
}

function assertSafeParent(checkpointPath) {
  if (typeof checkpointPath !== "string" || !isAbsolute(checkpointPath) ||
    normalize(checkpointPath) !== checkpointPath) {
    fail();
  }
  const parentPath = dirname(checkpointPath);
  let parentStat;
  try {
    parentStat = lstatSync(parentPath);
  } catch {
    fail();
  }
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink() ||
    (parentStat.mode & 0o022) !== 0) {
    fail();
  }
  return realpathSync(parentPath);
}

function assertSafeTarget(checkpointPath, { mustExist }) {
  if (!existsSync(checkpointPath)) {
    if (mustExist) fail();
    return;
  }
  const stat = lstatSync(checkpointPath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_CHECKPOINT_BYTES ||
    (stat.mode & 0o077) !== 0) {
    fail();
  }
}

function writeCheckpointDocument(checkpointPath, document) {
  const parentPath = assertSafeParent(checkpointPath);
  const canonicalCheckpointPath = join(parentPath, basename(checkpointPath));
  assertSafeTarget(canonicalCheckpointPath, { mustExist: false });
  const temporaryPath = join(parentPath, `.${randomUUID()}.recipe-nutrition-checkpoint.tmp`);
  let fileDescriptor;
  try {
    fileDescriptor = openSync(
      temporaryPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      0o600,
    );
    writeFileSync(fileDescriptor, `${JSON.stringify(document, null, 2)}\n`, "utf8");
    fsyncSync(fileDescriptor);
    closeSync(fileDescriptor);
    fileDescriptor = undefined;
    renameSync(temporaryPath, canonicalCheckpointPath);
    chmodSync(canonicalCheckpointPath, 0o600);
    const directoryDescriptor = openSync(parentPath, constants.O_RDONLY);
    try {
      fsyncSync(directoryDescriptor);
    } finally {
      closeSync(directoryDescriptor);
    }
  } catch (error) {
    if (fileDescriptor !== undefined) {
      try {
        closeSync(fileDescriptor);
      } catch {}
    }
    try {
      unlinkSync(temporaryPath);
    } catch {}
    if (error instanceof RecipeNutritionBackfillError) throw error;
    fail("BACKFILL_CHECKPOINT_WRITE_FAILED");
  }
}

export function writeRecipeNutritionCheckpoint(checkpointPath, checkpoints) {
  writeCheckpointDocument(checkpointPath, {
    schema_version: CHECKPOINT_SCHEMA_VERSION,
    scope: CHECKPOINT_SCOPE,
    checkpoints: validateCheckpoints(checkpoints),
  });
}

export function readRecipeNutritionCheckpoint(checkpointPath) {
  const parentPath = assertSafeParent(checkpointPath);
  const canonicalCheckpointPath = join(parentPath, basename(checkpointPath));
  assertSafeTarget(canonicalCheckpointPath, { mustExist: true });
  let document;
  try {
    document = JSON.parse(readFileSync(canonicalCheckpointPath, "utf8"));
  } catch {
    fail("INVALID_BACKFILL_CHECKPOINT");
  }
  if (!document || typeof document !== "object" || Array.isArray(document) ||
    Object.keys(document).sort().join(",") !== "checkpoints,schema_version,scope" ||
    document.schema_version !== CHECKPOINT_SCHEMA_VERSION ||
    document.scope !== CHECKPOINT_SCOPE) {
    fail("INVALID_BACKFILL_CHECKPOINT");
  }
  return validateCheckpoints(document.checkpoints);
}

export function initializeRecipeNutritionCheckpoint(checkpointPath) {
  const parentPath = assertSafeParent(checkpointPath);
  const canonicalCheckpointPath = join(parentPath, basename(checkpointPath));
  if (existsSync(canonicalCheckpointPath)) {
    const checkpoints = readRecipeNutritionCheckpoint(checkpointPath);
    if (checkpoints.length > 0) {
      fail("BACKFILL_CHECKPOINT_NOT_EMPTY");
    }
    return;
  }
  writeRecipeNutritionCheckpoint(checkpointPath, []);
}

function validateMealCursor(nextCursor) {
  if (nextCursor !== null && (typeof nextCursor !== "string" || nextCursor.length === 0)) {
    fail("INVALID_BACKFILL_CHECKPOINT");
  }
  return nextCursor;
}

export function writeMealPinBackfillCheckpoint(checkpointPath, nextCursor) {
  writeCheckpointDocument(checkpointPath, {
    schema_version: MEAL_CHECKPOINT_SCHEMA_VERSION,
    scope: CHECKPOINT_SCOPE,
    next_cursor: validateMealCursor(nextCursor),
  });
}

export function readMealPinBackfillCheckpoint(checkpointPath) {
  const parentPath = assertSafeParent(checkpointPath);
  const canonicalCheckpointPath = join(parentPath, basename(checkpointPath));
  assertSafeTarget(canonicalCheckpointPath, { mustExist: true });
  let document;
  try {
    document = JSON.parse(readFileSync(canonicalCheckpointPath, "utf8"));
  } catch {
    fail("INVALID_BACKFILL_CHECKPOINT");
  }
  if (!document || typeof document !== "object" || Array.isArray(document) ||
    Object.keys(document).sort().join(",") !== "next_cursor,schema_version,scope" ||
    document.schema_version !== MEAL_CHECKPOINT_SCHEMA_VERSION ||
    document.scope !== CHECKPOINT_SCOPE) {
    fail("INVALID_BACKFILL_CHECKPOINT");
  }
  return validateMealCursor(document.next_cursor);
}

export function ensureMealPinBackfillCheckpoint(checkpointPath) {
  const parentPath = assertSafeParent(checkpointPath);
  const canonicalCheckpointPath = join(parentPath, basename(checkpointPath));
  if (existsSync(canonicalCheckpointPath)) {
    return readMealPinBackfillCheckpoint(checkpointPath);
  }
  writeMealPinBackfillCheckpoint(checkpointPath, null);
  return null;
}
