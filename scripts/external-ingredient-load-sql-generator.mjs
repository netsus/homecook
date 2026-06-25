#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const INSERTABLE_CANONICAL_DECISIONS = new Set(["approve", "rename"]);
const VALID_CATEGORIES = new Set(["채소", "과일", "육류", "해산물", "양념", "유제품", "곡류", "기타"]);
const UUID_NAMESPACE = "homecook:launch-ingredient-load:2026-06-25";

function parseCliArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--" || !token.startsWith("--")) continue;

    const key = token.slice(2);
    const nextToken = argv[index + 1];

    if (!nextToken || nextToken.startsWith("--")) {
      args[key] = true;
      continue;
    }

    if (args[key] === undefined) {
      args[key] = nextToken;
    } else if (Array.isArray(args[key])) {
      args[key].push(nextToken);
    } else {
      args[key] = [args[key], nextToken];
    }

    index += 1;
  }

  return args;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrNull(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();

    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number") return String(value);

  return null;
}

function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

function foldName(value) {
  return normalizeName(value)
    .toLocaleLowerCase("ko-KR")
    .replace(/[\s\p{P}\p{S}]/gu, "");
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlNullableString(value, type = "text") {
  const text = stringOrNull(value);

  return text ? sqlString(text) : `null::${type}`;
}

function deterministicUuid(seed) {
  const bytes = createHash("sha256").update(`${UUID_NAMESPACE}:${seed}`).digest();
  const uuidBytes = Uint8Array.from(bytes.subarray(0, 16));
  uuidBytes[6] = (uuidBytes[6] & 0x0f) | 0x50;
  uuidBytes[8] = (uuidBytes[8] & 0x3f) | 0x80;
  const hex = [...uuidBytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function normalizePathList(value) {
  return (Array.isArray(value) ? value : value ? [value] : [])
    .flatMap((entry) => String(entry).split(","))
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizePayload(payload) {
  if (Array.isArray(payload)) {
    return {
      generated_at: null,
      decisions: payload,
    };
  }

  if (isRecord(payload) && Array.isArray(payload.decisions)) {
    return payload;
  }

  throw new Error("review decision file must be an array or an object with decisions");
}

async function readJson(filePath) {
  return normalizePayload(JSON.parse(await readFile(filePath, "utf8")));
}

async function readExistingIngredientNames(sqlPaths) {
  const names = new Set();

  for (const sqlPath of sqlPaths) {
    const sql = await readFile(sqlPath, "utf8");
    const ingredientInsertMatches = sql.matchAll(
      /insert\s+into\s+public\.ingredients\s*\(([^)]*)\)\s*values\s*([\s\S]*?)\bon\s+conflict/gi,
    );

    for (const match of ingredientInsertMatches) {
      const columns = match[1].split(",").map((column) => column.trim().toLowerCase());
      const standardNameIndex = columns.indexOf("standard_name");
      if (standardNameIndex < 0) continue;

      for (const tuple of parseSqlValueTuples(match[2])) {
        const name = normalizeName(tuple[standardNameIndex]);
        if (name) names.add(name);
      }
    }
  }

  return names;
}

function parseSqlValueTuples(valuesBlock) {
  const tuples = [];
  let currentTuple = null;
  let currentValue = "";
  let inString = false;

  for (let index = 0; index < valuesBlock.length; index += 1) {
    const char = valuesBlock[index];
    const nextChar = valuesBlock[index + 1];

    if (!currentTuple) {
      if (char === "(") {
        currentTuple = [];
        currentValue = "";
      }
      continue;
    }

    if (inString) {
      if (char === "'" && nextChar === "'") {
        currentValue += "'";
        index += 1;
        continue;
      }

      if (char === "'") {
        inString = false;
        continue;
      }

      currentValue += char;
      continue;
    }

    if (char === "'") {
      inString = true;
      continue;
    }

    if (char === ",") {
      currentTuple.push(currentValue.trim());
      currentValue = "";
      continue;
    }

    if (char === ")") {
      currentTuple.push(currentValue.trim());
      tuples.push(currentTuple);
      currentTuple = null;
      currentValue = "";
      continue;
    }

    currentValue += char;
  }

  return tuples;
}

function effectiveCanonicalName(row) {
  if (row.decision === "rename") {
    return normalizeName(row.rename_to) || normalizeName(row.standard_name);
  }

  return normalizeName(row.standard_name);
}

function buildIngredientValues(decisions) {
  const rows = [];
  const byFoldedName = new Map();

  for (const decision of decisions) {
    if (decision.type !== "canonical" || !INSERTABLE_CANONICAL_DECISIONS.has(decision.decision)) {
      continue;
    }

    const standardName = effectiveCanonicalName(decision);
    const category = normalizeName(decision.category);
    if (!standardName) continue;

    const folded = foldName(standardName);
    if (byFoldedName.has(folded)) {
      byFoldedName.get(folded).duplicate_review_ids.push(decision.review_id);
      continue;
    }

    const row = {
      id: deterministicUuid(`ingredient:${folded}`),
      review_id: stringOrNull(decision.review_id) ?? "",
      standard_name: standardName,
      category,
      default_unit: stringOrNull(decision.default_unit),
      duplicate_review_ids: [],
    };
    rows.push(row);
    byFoldedName.set(folded, row);
  }

  return rows;
}

function buildTargetNameByFoldedName(ingredientValues, existingIngredientNames) {
  const targetNameByFoldedName = new Map();

  for (const row of ingredientValues) {
    targetNameByFoldedName.set(foldName(row.standard_name), row.standard_name);
  }

  for (const existingName of existingIngredientNames) {
    const folded = foldName(existingName);
    if (!targetNameByFoldedName.has(folded)) {
      targetNameByFoldedName.set(folded, existingName);
    }
  }

  return targetNameByFoldedName;
}

function synonymTargetName(decision) {
  return (
    normalizeName(decision.mapped_to_standard_name) ||
    normalizeName(decision.rename_to) ||
    normalizeName(decision.standard_name)
  );
}

function buildSynonymValues(decisions, targetNameByFoldedName) {
  const rows = [];
  const pairKeys = new Set();
  const synonymTargetsByFoldedSynonym = new Map();

  for (const decision of decisions) {
    if (decision.type !== "synonym" || decision.decision !== "approve") continue;

    const requestedStandardName = synonymTargetName(decision);
    const standardName = targetNameByFoldedName.get(foldName(requestedStandardName)) ?? requestedStandardName;
    const synonym = normalizeName(decision.synonym);
    const foldedStandardName = foldName(standardName);
    const foldedSynonym = foldName(synonym);
    if (!standardName || !synonym || foldedStandardName === foldedSynonym) continue;

    const pairKey = `${foldedStandardName}:${foldedSynonym}`;
    if (pairKeys.has(pairKey)) continue;
    pairKeys.add(pairKey);

    const targetSet = synonymTargetsByFoldedSynonym.get(foldedSynonym) ?? new Set();
    targetSet.add(foldedStandardName);
    synonymTargetsByFoldedSynonym.set(foldedSynonym, targetSet);

    rows.push({
      id: deterministicUuid(`synonym:${pairKey}`),
      review_id: stringOrNull(decision.review_id) ?? "",
      standard_name: standardName,
      synonym,
    });
  }

  return { rows, synonymTargetsByFoldedSynonym };
}

function validateValues({ decisions, ingredientValues, synonymValues, synonymTargetsByFoldedSynonym, existingIngredientNames }) {
  const duplicateStandardNames = ingredientValues.filter((row) => row.duplicate_review_ids.length > 0);
  const targetNames = new Set([
    ...ingredientValues.map((row) => foldName(row.standard_name)),
    ...[...existingIngredientNames].map(foldName),
  ]);
  const missingSynonymTargets = synonymValues.filter((row) => !targetNames.has(foldName(row.standard_name)));
  const ambiguousSynonyms = [...synonymTargetsByFoldedSynonym.entries()]
    .filter(([, targets]) => targets.size > 1)
    .map(([foldedSynonym, targets]) => ({
      folded_synonym: foldedSynonym,
      target_count: targets.size,
      targets: [...targets],
    }));
  const invalidCategories = ingredientValues.filter((row) => !VALID_CATEGORIES.has(row.category));
  const blocked =
    duplicateStandardNames.length > 0 ||
    missingSynonymTargets.length > 0 ||
    ambiguousSynonyms.length > 0 ||
    invalidCategories.length > 0;

  return {
    blocked,
    duplicate_standard_name_count: duplicateStandardNames.length,
    missing_synonym_target_count: missingSynonymTargets.length,
    ambiguous_synonym_count: ambiguousSynonyms.length,
    invalid_category_count: invalidCategories.length,
    duplicate_standard_names: duplicateStandardNames.map((row) => ({
      standard_name: row.standard_name,
      review_id: row.review_id,
      duplicate_review_ids: row.duplicate_review_ids,
    })),
    missing_synonym_targets: missingSynonymTargets.map((row) => ({
      standard_name: row.standard_name,
      synonym: row.synonym,
      review_id: row.review_id,
    })),
    ambiguous_synonyms: ambiguousSynonyms,
    invalid_categories: invalidCategories.map((row) => ({
      standard_name: row.standard_name,
      category: row.category,
      review_id: row.review_id,
    })),
    excluded_decision_count: decisions.filter((row) => row.decision === "exclude").length,
  };
}

function renderMigrationSql({ ingredientValues, synonymValues, generatedAt, inputPath }) {
  return `-- Launch 28 full external ingredient seed promotion.
-- Generated from ${inputPath}
-- Generated at ${generatedAt}
-- DML-only and idempotent. Existing ingredients are not overwritten.

insert into public.ingredients (id, standard_name, category, default_unit, created_at)
values
${ingredientValues.map(renderIngredientValue).join(",\n")}
on conflict do nothing;

insert into public.ingredient_synonyms (id, ingredient_id, synonym)
select v.id, i.id, lower(trim(v.synonym))
from (values
${synonymValues.map(renderSynonymValue).join(",\n")}
) as v(id, standard_name, synonym)
join public.ingredients i
  on i.standard_name = v.standard_name
where lower(trim(v.synonym)) <> lower(trim(v.standard_name))
on conflict do nothing;
`;
}

function renderIngredientValue(row) {
  return `  (${sqlString(row.id)}::uuid, ${sqlString(row.standard_name)}, ${sqlString(row.category)}, ${sqlNullableString(
    row.default_unit,
    "varchar",
  )}, ${sqlString(row.created_at)}::timestamptz)`;
}

function renderSynonymValue(row) {
  return `  (${sqlString(row.id)}::uuid, ${sqlString(row.standard_name)}, ${sqlString(row.synonym)})`;
}

function renderRollbackSql({ ingredientValues, synonymValues, generatedAt }) {
  return `-- Rollback for launch 28 full external ingredient seed promotion.
-- Generated at ${generatedAt}
-- Deletes only deterministic IDs generated for this launch batch.

delete from public.ingredient_synonyms
where id in (
${synonymValues.map((row) => `  ${sqlString(row.id)}::uuid`).join(",\n")}
);

delete from public.ingredients
where id in (
${ingredientValues.map((row) => `  ${sqlString(row.id)}::uuid`).join(",\n")}
);
`;
}

function renderSummaryMarkdown(summary) {
  return `# Ingredient Load SQL Summary

- Source decisions: ${summary.source_decision_file}
- Generated at: ${summary.generated_at}
- Ingredient values: ${summary.ingredient_value_count}
- Synonym values: ${summary.synonym_value_count}
- Existing ingredient references: ${summary.existing_ingredient_reference_count}
- Excluded decisions: ${summary.excluded_decision_count}
- Blocked: ${summary.validation.blocked}

## Validation

| Check | Count |
| --- | ---: |
| Duplicate standard names | ${summary.validation.duplicate_standard_name_count} |
| Missing synonym targets | ${summary.validation.missing_synonym_target_count} |
| Ambiguous synonyms | ${summary.validation.ambiguous_synonym_count} |
| Invalid categories | ${summary.validation.invalid_category_count} |
`;
}

async function ensureParentDir(filePath) {
  const parentDir = path.dirname(filePath);
  if (parentDir && parentDir !== ".") {
    await mkdir(parentDir, { recursive: true });
  }
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const inputPath = stringOrNull(args["review-decisions"]);
  const migrationOutput = stringOrNull(args["migration-output"]);
  const rollbackOutput = stringOrNull(args["rollback-output"]);
  const summaryOutput = stringOrNull(args["summary-output"]);
  const summaryMarkdownOutput = stringOrNull(args["summary-markdown-output"]);
  const generatedAt = stringOrNull(args["generated-at"]) ?? new Date().toISOString();

  if (!inputPath || !migrationOutput || !rollbackOutput || !summaryOutput) {
    console.error(
      "Usage: node scripts/external-ingredient-load-sql-generator.mjs --review-decisions <reviewed.json> --migration-output <migration.sql> --rollback-output <rollback.sql> --summary-output <summary.json> [--summary-markdown-output <summary.md>] [--existing-ingredients-sql <seed.sql>] [--generated-at <iso>]",
    );
    process.exitCode = 1;
    return;
  }

  const payload = await readJson(inputPath);
  const existingIngredientNames = await readExistingIngredientNames(normalizePathList(args["existing-ingredients-sql"]));
  const ingredientValues = buildIngredientValues(payload.decisions).map((row) => ({
    ...row,
    created_at: generatedAt,
  }));
  const targetNameByFoldedName = buildTargetNameByFoldedName(ingredientValues, existingIngredientNames);
  const { rows: synonymValues, synonymTargetsByFoldedSynonym } = buildSynonymValues(
    payload.decisions,
    targetNameByFoldedName,
  );
  const validation = validateValues({
    decisions: payload.decisions,
    ingredientValues,
    synonymValues,
    synonymTargetsByFoldedSynonym,
    existingIngredientNames,
  });
  const summary = {
    generated_at: generatedAt,
    source_decision_file: inputPath,
    source_decision_count: payload.decisions.length,
    ingredient_value_count: ingredientValues.length,
    synonym_value_count: synonymValues.length,
    existing_ingredient_reference_count: existingIngredientNames.size,
    excluded_decision_count: validation.excluded_decision_count,
    validation,
  };

  if (validation.blocked) {
    await ensureParentDir(summaryOutput);
    await writeFile(summaryOutput, `${JSON.stringify(summary, null, 2)}\n`);
    throw new Error(`SQL generation blocked by validation failures. See ${summaryOutput}`);
  }

  await Promise.all([
    ensureParentDir(migrationOutput),
    ensureParentDir(rollbackOutput),
    ensureParentDir(summaryOutput),
    summaryMarkdownOutput ? ensureParentDir(summaryMarkdownOutput) : Promise.resolve(),
  ]);
  await writeFile(migrationOutput, renderMigrationSql({ ingredientValues, synonymValues, generatedAt, inputPath }));
  await writeFile(rollbackOutput, renderRollbackSql({ ingredientValues, synonymValues, generatedAt }));
  await writeFile(summaryOutput, `${JSON.stringify(summary, null, 2)}\n`);
  if (summaryMarkdownOutput) {
    await writeFile(summaryMarkdownOutput, renderSummaryMarkdown(summary));
  }

  process.stdout.write(`Wrote ${migrationOutput}\n`);
  process.stdout.write(`Wrote ${rollbackOutput}\n`);
  process.stdout.write(`Wrote ${summaryOutput}\n`);
  if (summaryMarkdownOutput) {
    process.stdout.write(`Wrote ${summaryMarkdownOutput}\n`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
