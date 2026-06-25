#!/usr/bin/env node

import path from "node:path";

import {
  countBy,
  envValue,
  foldText,
  isRecord,
  normalizeRecipeTitle,
  parseCliArgs,
  readJson,
  readLocalEnv,
  stringOrNull,
  writeJson,
  writeText,
} from "./lib/external-recipe-ingest.mjs";

const DEFAULT_OUTPUT_DIR = ".artifacts/external-recipe-ingest/hygiene-report";

async function fetchSupabaseTable({ table, select, localEnv }) {
  const supabaseUrl = envValue("NEXT_PUBLIC_SUPABASE_URL", localEnv);
  const anonKey = envValue("NEXT_PUBLIC_SUPABASE_ANON_KEY", localEnv);

  if (!supabaseUrl || !anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required.");
  }

  const url = new URL(`/rest/v1/${table}`, supabaseUrl);
  url.searchParams.set("select", select);
  url.searchParams.set("limit", "10000");

  const response = await fetch(url, {
    headers: {
      apikey: anonKey,
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase REST ${table} failed: HTTP ${response.status} ${await response.text()}`);
  }

  return response.json();
}

async function loadRemoteDbExport(localEnv) {
  const [recipes, recipeSources, recipeIngredients, recipeSteps, recipeTags] = await Promise.all([
    fetchSupabaseTable({
      table: "recipes",
      select: "id,title,source_type,created_by,thumbnail_url,tags,created_at,updated_at",
      localEnv,
    }),
    fetchSupabaseTable({
      table: "recipe_sources",
      select: "recipe_id,youtube_url,youtube_video_id,extraction_methods,extraction_meta_json",
      localEnv,
    }),
    fetchSupabaseTable({
      table: "recipe_ingredients",
      select: "recipe_id",
      localEnv,
    }),
    fetchSupabaseTable({
      table: "recipe_steps",
      select: "recipe_id",
      localEnv,
    }),
    fetchSupabaseTable({
      table: "recipe_tags",
      select: "recipe_id,tag_id",
      localEnv,
    }),
  ]);

  return { recipes, recipe_sources: recipeSources, recipe_ingredients: recipeIngredients, recipe_steps: recipeSteps, recipe_tags: recipeTags };
}

function sourceMetadataForRecipe(recipe, sourceRowsByRecipeId) {
  const source = sourceRowsByRecipeId.get(recipe.id);
  const meta = isRecord(source?.extraction_meta_json) ? source.extraction_meta_json : {};

  return {
    source,
    meta,
    sourceProvider: stringOrNull(meta.source_provider) ?? stringOrNull(meta.provider),
    sourceLicense: stringOrNull(meta.license) ?? stringOrNull(meta.source_license),
    sourceUrl: stringOrNull(meta.source_url),
    imageProvenance: stringOrNull(meta.image_provenance) ?? stringOrNull(meta.image_source),
  };
}

function buildHygieneReport(dbExport, generatedAt) {
  const sourceRowsByRecipeId = new Map(
    (dbExport.recipe_sources ?? []).map((source) => [source.recipe_id, source]),
  );
  const ingredientCounts = countBy((dbExport.recipe_ingredients ?? []).map((row) => row.recipe_id));
  const stepCounts = countBy((dbExport.recipe_steps ?? []).map((row) => row.recipe_id));
  const tagCounts = countBy((dbExport.recipe_tags ?? []).map((row) => row.recipe_id));
  const titleCounts = countBy((dbExport.recipes ?? []).map((recipe) => foldText(recipe.title)));

  const recipes = (dbExport.recipes ?? []).map((recipe) => {
    const title = normalizeRecipeTitle(recipe.title);
    const titleKey = foldText(title);
    const metadata = sourceMetadataForRecipe(recipe, sourceRowsByRecipeId);
    const flags = [];

    if (/[ㄱ-ㅎㅏ-ㅣ\u1100-\u11ff]/u.test(title)) flags.push("jamo_fixture_like_title");
    if (recipe.source_type === "manual" && Array.from(title).length <= 4) flags.push("short_manual_title_review");
    if ((titleCounts[titleKey] ?? 0) > 1) flags.push("duplicate_normalized_title");
    if (!metadata.source) flags.push("missing_recipe_source_row");
    if (recipe.source_type === "system" && !metadata.sourceLicense) flags.push("missing_system_source_license");
    if (recipe.thumbnail_url && !metadata.imageProvenance && !metadata.sourceLicense) {
      flags.push("thumbnail_without_source_provenance");
    }
    if ((ingredientCounts[recipe.id] ?? 0) === 0) flags.push("no_ingredients");
    if ((stepCounts[recipe.id] ?? 0) === 0) flags.push("no_steps");

    return {
      id: recipe.id,
      title,
      source_type: recipe.source_type,
      created_by: recipe.created_by,
      ingredient_count: ingredientCounts[recipe.id] ?? 0,
      step_count: stepCounts[recipe.id] ?? 0,
      tag_count: tagCounts[recipe.id] ?? 0,
      source_provider: metadata.sourceProvider,
      source_license: metadata.sourceLicense,
      source_url: metadata.sourceUrl,
      flags,
    };
  });

  return {
    generated_at: generatedAt,
    production_db_writes: 0,
    summary: {
      recipe_count: recipes.length,
      recipe_sources_count: dbExport.recipe_sources?.length ?? 0,
      recipe_ingredients_count: dbExport.recipe_ingredients?.length ?? 0,
      recipe_steps_count: dbExport.recipe_steps?.length ?? 0,
      recipe_tags_count: dbExport.recipe_tags?.length ?? 0,
      flagged_recipe_count: recipes.filter((recipe) => recipe.flags.length > 0).length,
      production_db_writes: 0,
      source_type_counts: countBy(recipes.map((recipe) => recipe.source_type)),
      flag_counts: countBy(recipes.flatMap((recipe) => recipe.flags)),
    },
    recipes,
  };
}

function renderMarkdown(report) {
  const lines = [
    `# Existing Recipe Hygiene Report - ${report.generated_at.slice(0, 10)}`,
    "",
    "## Summary",
    "",
    `- Recipes: ${report.summary.recipe_count}`,
    `- Recipe sources: ${report.summary.recipe_sources_count}`,
    `- Recipe ingredients: ${report.summary.recipe_ingredients_count}`,
    `- Recipe steps: ${report.summary.recipe_steps_count}`,
    `- Recipe tags: ${report.summary.recipe_tags_count}`,
    `- Flagged recipes: ${report.summary.flagged_recipe_count}`,
    `- Production DB writes: ${report.production_db_writes}`,
    "",
    "## Source Types",
    "",
    "| source_type | count |",
    "| --- | ---: |",
    ...Object.entries(report.summary.source_type_counts).map(([key, count]) => `| ${key} | ${count} |`),
    "",
    "## Flag Counts",
    "",
    "| flag | count |",
    "| --- | ---: |",
    ...Object.entries(report.summary.flag_counts).map(([key, count]) => `| ${key} | ${count} |`),
    "",
    "## Flagged Recipes",
    "",
    "| title | source_type | ingredients | steps | tags | flags |",
    "| --- | --- | ---: | ---: | ---: | --- |",
    ...report.recipes
      .filter((recipe) => recipe.flags.length > 0)
      .map((recipe) => `| ${recipe.title} | ${recipe.source_type ?? ""} | ${recipe.ingredient_count} | ${recipe.step_count} | ${recipe.tag_count} | ${recipe.flags.join(", ")} |`),
    "",
    "## Notes",
    "",
    "- This script is read-only and uses Supabase REST reads or a mock export file.",
    "- It does not delete or update existing recipes.",
  ];

  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const generatedAt = stringOrNull(args["generated-at"]) ?? new Date().toISOString();
  const outputDir = stringOrNull(args["output-dir"]) ?? DEFAULT_OUTPUT_DIR;
  const localEnv = await readLocalEnv();
  const dbExport = args["mock-db-export"]
    ? await readJson(args["mock-db-export"])
    : await loadRemoteDbExport(localEnv);
  const report = buildHygieneReport(dbExport, generatedAt);

  await writeJson(path.join(outputDir, "existing-recipe-hygiene-report.json"), report);
  await writeText(path.join(outputDir, "existing-recipe-hygiene-report.md"), renderMarkdown(report));

  process.stdout.write(`Wrote ${path.join(outputDir, "existing-recipe-hygiene-report.json")}\n`);
  process.stdout.write(`Wrote ${path.join(outputDir, "existing-recipe-hygiene-report.md")}\n`);
  process.stdout.write(`Production DB writes: ${report.production_db_writes}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
