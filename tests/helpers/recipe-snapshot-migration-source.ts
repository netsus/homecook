import { readFileSync } from "node:fs";
import { join } from "node:path";

const NUTRITION_MIGRATION =
  "20260716090000_add_recipe_nutrition_snapshots.sql";
const AUTHORITY_MIGRATION =
  "20260729170500_recipe_snapshot_authority_foundation.sql";

type MigrationSourceLoaderOptions = {
  migrationsDirectory: string;
  readFile?: (filePath: string) => string;
};

export type RecipeSnapshotMigrationSources = Readonly<{
  nutrition: string;
  authority: string;
}>;

export function loadRecipeSnapshotMigrationSources({
  migrationsDirectory,
  readFile = (filePath) => readFileSync(filePath, "utf8"),
}: MigrationSourceLoaderOptions): RecipeSnapshotMigrationSources {
  return Object.freeze({
    nutrition: readFile(join(migrationsDirectory, NUTRITION_MIGRATION)),
    authority: readFile(join(migrationsDirectory, AUTHORITY_MIGRATION)),
  });
}

let cachedSources: RecipeSnapshotMigrationSources | undefined;

export function readRecipeSnapshotMigrationSources(
  migrationsDirectory: string,
): RecipeSnapshotMigrationSources {
  cachedSources ??= loadRecipeSnapshotMigrationSources({ migrationsDirectory });
  return cachedSources;
}
