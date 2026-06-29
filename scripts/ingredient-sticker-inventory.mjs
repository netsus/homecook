#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const args = process.argv.slice(2);

function getArgValue(flag) {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  return args[index + 1] ?? null;
}

const writeJsonPath = getArgValue("--write-json");
const writeMarkdownPath = getArgValue("--write-md");
const summaryOnly = args.includes("--summary");

function listSqlFiles() {
  const migrationDir = path.join(repoRoot, "supabase", "migrations");
  const migrationFiles = fs
    .readdirSync(migrationDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => path.join(migrationDir, file));

  const seedFile = path.join(repoRoot, "supabase", "seed.sql");
  return [seedFile, ...migrationFiles].filter((file) => fs.existsSync(file));
}

function parseColumnList(rawColumns) {
  return rawColumns.split(",").map((column) => column.trim().replace(/^"|"$/g, ""));
}

function readQuotedLiteral(value) {
  let output = "";

  for (let index = 1; index < value.length; index += 1) {
    const char = value[index];
    const next = value[index + 1];

    if (char === "'" && next === "'") {
      output += "'";
      index += 1;
      continue;
    }

    if (char === "'") return output;

    output += char;
  }

  return output;
}

function sqlValueToJs(value) {
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();

  if (lower === "null" || lower.startsWith("null::")) return null;
  if (trimmed.startsWith("'")) return readQuotedLiteral(trimmed);
  return trimmed.replace(/::[a-zA-Z0-9_.[\]]+$/u, "");
}

function splitTupleValues(tuple) {
  const values = [];
  let buffer = "";
  let quote = false;
  let nestedDepth = 0;

  for (let index = 0; index < tuple.length; index += 1) {
    const char = tuple[index];
    const next = tuple[index + 1];

    if (quote) {
      buffer += char;
      if (char === "'" && next === "'") {
        buffer += next;
        index += 1;
      } else if (char === "'") {
        quote = false;
      }
      continue;
    }

    if (char === "'") {
      quote = true;
      buffer += char;
      continue;
    }

    if (char === "(") {
      nestedDepth += 1;
      buffer += char;
      continue;
    }

    if (char === ")") {
      nestedDepth -= 1;
      buffer += char;
      continue;
    }

    if (char === "," && nestedDepth === 0) {
      values.push(buffer.trim());
      buffer = "";
      continue;
    }

    buffer += char;
  }

  if (buffer.trim()) values.push(buffer.trim());
  return values;
}

function extractTuples(valuesBlock) {
  const tuples = [];
  let quote = false;
  let depth = 0;
  let start = -1;

  for (let index = 0; index < valuesBlock.length; index += 1) {
    const char = valuesBlock[index];
    const next = valuesBlock[index + 1];

    if (quote) {
      if (char === "'" && next === "'") {
        index += 1;
      } else if (char === "'") {
        quote = false;
      }
      continue;
    }

    if (char === "'") {
      quote = true;
      continue;
    }

    if (char === "(") {
      if (depth === 0) start = index + 1;
      depth += 1;
      continue;
    }

    if (char === ")") {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        tuples.push(valuesBlock.slice(start, index));
        start = -1;
      }
    }
  }

  return tuples;
}

function extractIngredientRows(filePath) {
  const sql = fs.readFileSync(filePath, "utf8");
  const relativePath = path.relative(repoRoot, filePath);
  const rows = [];
  const insertRegex =
    /insert\s+into\s+public\.ingredients\s*\(([^)]*)\)\s*values\s*([\s\S]*?)(?:\bon\s+conflict\b|;)/giu;

  for (const match of sql.matchAll(insertRegex)) {
    const columns = parseColumnList(match[1]);
    const tuples = extractTuples(match[2]);
    const standardNameIndex = columns.indexOf("standard_name");

    for (const tuple of tuples) {
      const rawValues = splitTupleValues(tuple);
      const values = rawValues.map(sqlValueToJs);
      const row = Object.fromEntries(columns.map((column, index) => [column, values[index]]));

      if (!rawValues[standardNameIndex]?.trim().startsWith("'")) continue;
      if (!row.standard_name) continue;

      rows.push({
        standardName: row.standard_name,
        category: row.category ?? null,
        categoryCode: row.category_code ?? null,
        defaultUnit: row.default_unit ?? null,
        sourceFile: relativePath,
      });
    }
  }

  return rows;
}

function buildInventory() {
  const seen = new Map();
  const duplicates = new Map();

  for (const file of listSqlFiles()) {
    for (const row of extractIngredientRows(file)) {
      const existing = seen.get(row.standardName);

      if (existing) {
        const duplicateRows = duplicates.get(row.standardName) ?? [];
        duplicateRows.push(row);
        duplicates.set(row.standardName, duplicateRows);
        continue;
      }

      seen.set(row.standardName, row);
    }
  }

  const ingredients = [...seen.values()].sort((a, b) =>
    a.standardName.localeCompare(b.standardName, "ko"),
  );

  const categoryCounts = ingredients.reduce((counts, ingredient) => {
    const category = ingredient.category ?? "미분류";
    counts[category] = (counts[category] ?? 0) + 1;
    return counts;
  }, {});

  return {
    generatedAt: new Date().toISOString(),
    source: "supabase/seed.sql + supabase/migrations/*.sql",
    total: ingredients.length,
    categoryCounts: Object.fromEntries(
      Object.entries(categoryCounts).sort(([left], [right]) => left.localeCompare(right, "ko")),
    ),
    duplicateStandardNameCount: duplicates.size,
    ingredients,
  };
}

function toMarkdown(inventory) {
  const categoryRows = Object.entries(inventory.categoryCounts)
    .map(([category, count]) => `| ${category} | ${count} |`)
    .join("\n");

  const sampleRows = inventory.ingredients
    .slice(0, 40)
    .map(
      (ingredient) =>
        `| ${ingredient.standardName} | ${ingredient.category ?? ""} | ${ingredient.defaultUnit ?? ""} |`,
    )
    .join("\n");

  return `# Ingredient Sticker Inventory

Generated by \`node scripts/ingredient-sticker-inventory.mjs --write-md docs/design/ingredient-sticker-inventory.md\`.

- Total unique ingredients: ${inventory.total}
- Duplicate names skipped: ${inventory.duplicateStandardNameCount}
- Source: ${inventory.source}

## Category Counts

| Category | Count |
| --- | ---: |
${categoryRows}

## First 40 Ingredients

| Ingredient | Category | Default unit |
| --- | --- | --- |
${sampleRows}
`;
}

const inventory = buildInventory();

if (writeJsonPath) {
  fs.writeFileSync(path.join(repoRoot, writeJsonPath), `${JSON.stringify(inventory, null, 2)}\n`);
}

if (writeMarkdownPath) {
  fs.writeFileSync(path.join(repoRoot, writeMarkdownPath), toMarkdown(inventory));
}

if (summaryOnly) {
  process.stdout.write(
    `${JSON.stringify({ total: inventory.total, categoryCounts: inventory.categoryCounts }, null, 2)}\n`,
  );
} else if (!writeJsonPath && !writeMarkdownPath) {
  process.stdout.write(`${JSON.stringify(inventory, null, 2)}\n`);
}
