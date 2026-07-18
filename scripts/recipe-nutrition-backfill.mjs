#!/usr/bin/env node

import { spawnSync } from "node:child_process";

import { createClient } from "@supabase/supabase-js";

import {
  loadAllRecipeNutritionInventory,
  RecipeNutritionBackfillError,
  createSupabaseRecipeNutritionBackfillRepository,
  rollbackAllRecipeNutritionRecalculation,
  runAllRecipeNutritionRecalculationLifecycle,
  rollbackFoodSafetyRecipeNutritionBackfill,
  runFoodSafetyRecipeNutritionBackfill,
  sanitizeRecipeNutritionBackfillReport,
  validateAllRecipeNutritionInventoryArtifact,
} from "./lib/recipe-nutrition-backfill.mjs";
import {
  initializeAllRecipeNutritionCheckpoint,
  readAllRecipeNutritionCheckpoint,
  readAllRecipeNutritionInventoryArtifact,
  writeAllRecipeNutritionInventoryArtifact,
  writeAllRecipeNutritionCheckpoint,
  ensureMealPinBackfillCheckpoint,
  initializeRecipeNutritionCheckpoint,
  readRecipeNutritionCheckpoint,
  writeMealPinBackfillCheckpoint,
  writeRecipeNutritionCheckpoint,
} from "./lib/recipe-nutrition-checkpoint.mjs";

const HELP = `Usage:
  node scripts/recipe-nutrition-backfill.mjs recipe-dry-run [--batch-size 30] [--after <recipe-id>]
  node scripts/recipe-nutrition-backfill.mjs recipe-apply --checkpoint <path> --allow-write [--batch-size 30] [--after <recipe-id>]
  node scripts/recipe-nutrition-backfill.mjs recipe-rollback --checkpoint <path> --allow-write
  node scripts/recipe-nutrition-backfill.mjs meal-dry-run [--batch-size 250] [--after <meal-id>]
  node scripts/recipe-nutrition-backfill.mjs meal-apply --checkpoint <path> --allow-write [--batch-size 250] [--after <meal-id>]
  node scripts/recipe-nutrition-backfill.mjs all-recipes-inventory --output <path> [--inventory-page-size 250]
  node scripts/recipe-nutrition-backfill.mjs all-recipes-dry-run --inventory <path> [--batch-size 30] [--inventory-page-size 250]
  node scripts/recipe-nutrition-backfill.mjs all-recipes-apply --inventory <path> --checkpoint <path> --allow-write [--batch-size 30] [--inventory-page-size 250]
  node scripts/recipe-nutrition-backfill.mjs all-recipes-rollback --inventory <path> --checkpoint <path> --allow-write [--inventory-page-size 250]

Write commands additionally require HOMECOOK_RECIPE_NUTRITION_WRITE_APPROVED=1.
`;

function parseArguments(argv) {
  const [command, ...rest] = argv;
  const options = {
    command,
    after: null,
    batchSize: command?.startsWith("meal-") ? 250 : 30,
    checkpoint: null,
    inventory: null,
    inventoryPageSize: 250,
    output: null,
    allowWrite: false,
  };
  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];
    if (value === "--allow-write") {
      options.allowWrite = true;
    } else if (value === "--after") {
      options.after = rest[index + 1] ?? null;
      index += 1;
    } else if (value === "--batch-size") {
      options.batchSize = Number(rest[index + 1]);
      index += 1;
    } else if (value === "--checkpoint") {
      options.checkpoint = rest[index + 1] ?? null;
      index += 1;
    } else if (value === "--inventory") {
      options.inventory = rest[index + 1] ?? null;
      index += 1;
    } else if (value === "--inventory-page-size") {
      options.inventoryPageSize = Number(rest[index + 1]);
      index += 1;
    } else if (value === "--output") {
      options.output = rest[index + 1] ?? null;
      index += 1;
    } else {
      throw new RecipeNutritionBackfillError("INVALID_BACKFILL_ARGUMENTS");
    }
  }
  return options;
}

function requireWriteApproval(options) {
  if (!options.allowWrite || process.env.HOMECOOK_RECIPE_NUTRITION_WRITE_APPROVED !== "1") {
    throw new RecipeNutritionBackfillError("WRITE_APPROVAL_REQUIRED");
  }
}

function isLoopbackOperatorUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) &&
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

function createOperatorClient({ requireLocal }) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey || (requireLocal && !isLoopbackOperatorUrl(url))) {
    throw new RecipeNutritionBackfillError("LOCAL_OPERATOR_ENV_REQUIRED");
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function printReport(report) {
  process.stdout.write(`${JSON.stringify(sanitizeRecipeNutritionBackfillReport(report))}\n`);
}

function readInventoryArtifact(inventoryPath) {
  if (!inventoryPath) {
    throw new RecipeNutritionBackfillError("ALL_RECIPE_INVENTORY_REQUIRED");
  }
  try {
    return validateAllRecipeNutritionInventoryArtifact(
      readAllRecipeNutritionInventoryArtifact(inventoryPath),
    );
  } catch (error) {
    if (error instanceof RecipeNutritionBackfillError) throw error;
    throw new RecipeNutritionBackfillError("ALL_RECIPE_INVENTORY_INVALID");
  }
}

async function runRecipeCommand(options, client) {
  const repository = createSupabaseRecipeNutritionBackfillRepository(client);
  if (options.command === "recipe-rollback") {
    if (!options.checkpoint) {
      throw new RecipeNutritionBackfillError("BACKFILL_CHECKPOINT_REQUIRED");
    }
    const result = await rollbackFoodSafetyRecipeNutritionBackfill({
      repository,
      checkpoints: readRecipeNutritionCheckpoint(options.checkpoint),
    });
    printReport(result);
    return;
  }

  const mode = options.command === "recipe-apply" ? "apply" : "dry-run";
  const result = await runFoodSafetyRecipeNutritionBackfill({
    repository,
    mode,
    batchSize: options.batchSize,
    afterRecipeId: options.after,
    onCheckpoint: mode === "apply"
      ? async (checkpoints) => writeRecipeNutritionCheckpoint(options.checkpoint, checkpoints)
      : undefined,
  });
  if (mode === "apply") {
    writeRecipeNutritionCheckpoint(options.checkpoint, result.checkpoints);
  }
  printReport(result);
}

async function runAllRecipeCommand(options, client) {
  const repository = createSupabaseRecipeNutritionBackfillRepository(client);

  if (options.command === "all-recipes-inventory") {
    const { inventory } = await loadAllRecipeNutritionInventory({
      repository,
      queryVersion: "all-recipes-inventory-sql-v1",
      pageSize: options.inventoryPageSize,
    });
    writeAllRecipeNutritionInventoryArtifact(options.output, inventory);
    process.stdout.write(`${JSON.stringify({
      scope: inventory.scope,
      row_count: inventory.row_count,
      checksum: inventory.checksum,
    })}\n`);
    return;
  }

  const inventory = readInventoryArtifact(options.inventory);
  if (options.after !== null) {
    throw new RecipeNutritionBackfillError("ALL_RECIPE_CURSOR_UNSAFE");
  }
  if (options.command === "all-recipes-rollback") {
    if (!options.checkpoint) {
      throw new RecipeNutritionBackfillError("BACKFILL_CHECKPOINT_REQUIRED");
    }
    const checkpoint = readAllRecipeNutritionCheckpoint(options.checkpoint);
    if (
      checkpoint.inventory_checksum !== inventory.checksum ||
      checkpoint.inventory_row_count !== inventory.row_count
    ) {
      throw new RecipeNutritionBackfillError("ALL_RECIPE_INVENTORY_DRIFT");
    }
    printReport(await rollbackAllRecipeNutritionRecalculation({
      repository,
      inventory,
      checkpoints: checkpoint.checkpoints,
      inventoryPageSize: options.inventoryPageSize,
    }));
    return;
  }

  const mode = options.command === "all-recipes-apply" ? "apply" : "dry-run";
  if (mode === "apply") {
    initializeAllRecipeNutritionCheckpoint(
      options.checkpoint,
      inventory.checksum,
      inventory.row_count,
    );
  }
  const totals = await runAllRecipeNutritionRecalculationLifecycle({
    repository,
    inventory,
    mode,
    batchSize: options.batchSize,
    inventoryPageSize: options.inventoryPageSize,
    onCheckpoint: mode === "apply"
      ? async (batchJournal) => {
        writeAllRecipeNutritionCheckpoint(
          options.checkpoint,
          inventory.checksum,
          inventory.row_count,
          batchJournal,
        );
      }
      : undefined,
  });
  if (mode === "apply") {
    writeAllRecipeNutritionCheckpoint(
      options.checkpoint,
      inventory.checksum,
      inventory.row_count,
      totals.checkpoints,
    );
  }
  printReport(totals);
}

async function runMealCommand(options, client) {
  if (!Number.isInteger(options.batchSize) || options.batchSize < 1 || options.batchSize > 1000) {
    throw new RecipeNutritionBackfillError("INVALID_BACKFILL_BATCH_SIZE");
  }
  const checkpointCursor = options.command === "meal-apply"
    ? ensureMealPinBackfillCheckpoint(options.checkpoint)
    : null;
  const result = await client.rpc("backfill_foodsafety_recipe_nutrition_meal_pins", {
    p_dry_run: options.command === "meal-dry-run",
    p_after_meal_id: options.after ?? checkpointCursor,
    p_batch_size: options.batchSize,
  });
  if (result.error || !result.data) {
    throw new RecipeNutritionBackfillError("MEAL_PIN_BACKFILL_FAILED");
  }
  if (options.command === "meal-apply") {
    writeMealPinBackfillCheckpoint(options.checkpoint, result.data.next_cursor ?? null);
  }
  printReport(result.data);
}

async function main() {
  if (process.argv.includes("--help") || process.argv.length <= 2) {
    process.stdout.write(HELP);
    return;
  }
  const options = parseArguments(process.argv.slice(2));
  const commands = new Set([
    "recipe-dry-run",
    "recipe-apply",
    "recipe-rollback",
    "meal-dry-run",
    "meal-apply",
    "all-recipes-inventory",
    "all-recipes-dry-run",
    "all-recipes-apply",
    "all-recipes-rollback",
  ]);
  if (!commands.has(options.command)) {
    throw new RecipeNutritionBackfillError("INVALID_BACKFILL_MODE");
  }
  if (options.command.endsWith("-apply") || options.command === "recipe-rollback" ||
    options.command === "all-recipes-rollback") {
    requireWriteApproval(options);
  }
  if ((options.command === "recipe-apply" || options.command === "recipe-rollback" ||
    options.command === "meal-apply" || options.command === "all-recipes-apply" ||
    options.command === "all-recipes-rollback") &&
    !options.checkpoint) {
    throw new RecipeNutritionBackfillError("BACKFILL_CHECKPOINT_REQUIRED");
  }
  if (options.command.startsWith("all-recipes-") && options.command !== "all-recipes-inventory") {
    if (!options.inventory) {
      throw new RecipeNutritionBackfillError("ALL_RECIPE_INVENTORY_REQUIRED");
    }
    if (options.after !== null) {
      throw new RecipeNutritionBackfillError("ALL_RECIPE_CURSOR_UNSAFE");
    }
  }
  if (options.command === "all-recipes-inventory" && !options.output) {
    throw new RecipeNutritionBackfillError("ALL_RECIPE_INVENTORY_OUTPUT_REQUIRED");
  }
  if (["recipe-dry-run", "recipe-apply", "all-recipes-dry-run", "all-recipes-apply"].includes(options.command) &&
    !process.execArgv.includes("--experimental-strip-types")) {
    const child = spawnSync(process.execPath, [
      "--experimental-strip-types",
      "--disable-warning=ExperimentalWarning",
      "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
      ...process.argv.slice(1),
    ], {
      env: process.env,
      stdio: "inherit",
    });
    process.exitCode = child.status ?? 1;
    return;
  }
  const requiresWrite = options.command.endsWith("-apply") ||
    options.command === "recipe-rollback" ||
    options.command === "all-recipes-rollback";
  const allRecipeCommand = options.command.startsWith("all-recipes-");
  const client = createOperatorClient({ requireLocal: requiresWrite || allRecipeCommand });
  if (options.command === "recipe-apply") {
    initializeRecipeNutritionCheckpoint(options.checkpoint);
  }
  if (options.command.startsWith("all-recipes-")) {
    await runAllRecipeCommand(options, client);
  } else if (options.command.startsWith("recipe-")) {
    await runRecipeCommand(options, client);
  } else {
    await runMealCommand(options, client);
  }
}

main().catch((error) => {
  const code = error instanceof RecipeNutritionBackfillError
    ? error.code
    : "RECIPE_NUTRITION_BACKFILL_FAILED";
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
});
