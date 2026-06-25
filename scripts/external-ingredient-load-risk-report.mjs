#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const INSERTABLE_DECISIONS = new Set(["approve", "rename"]);
const VALID_TYPES = new Set(["canonical", "synonym"]);
const VALID_CATEGORIES = new Set(["채소", "과일", "육류", "해산물", "양념", "유제품", "곡류", "기타"]);

const BROAD_OR_PROCESSED_PATTERN =
  /기타|가공품|가공 식품|제품|혼합|부산물|비스킷|쿠키|크래커|사탕|완제품|즉석|스낵|과자/;
const READY_FOOD_PATTERN =
  /김치|라면|국$|탕$|찌개$|전$|죽$|밥$|떡$|케이크|쿠키|웨하스|피자|버거|샌드위치|만두|튀김|볶음|구이|조림|무침|샐러드|잼$|주스$|즙$|액젓$|젓갈$/;
const STATE_OR_FORM_PATTERN =
  /^(생|생것|삶은|데친|말린|건조|볶은|튀긴|구운|찐|조리|냉동|냉장|불린|깐|다진|채썬|분말|가루|액상|통조림|절임|반건조|반건시)/;
const GENERIC_SYNONYMS = new Set([
  "가루",
  "고기",
  "국수",
  "나물",
  "분말",
  "생선",
  "소스",
  "액젓",
  "잼",
  "장",
  "젓갈",
  "즙",
  "치즈",
  "파",
  "해물",
]);
const HIGH_RISK_FLAGS = new Set([
  "duplicate_canonical_name",
  "approved_synonym_target_missing",
  "mapped_to_missing_canonical",
  "ambiguous_approved_synonym",
  "same_as_standard_name",
  "invalid_type",
  "invalid_category",
]);
const MEDIUM_RISK_FLAGS = new Set([
  "renamed_canonical",
  "mapped_synonym",
  "promoted_from_synonym_review",
  "broad_or_processed_name",
  "ready_food_name",
  "state_or_form_name",
]);

function parseCliArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--" || !token.startsWith("--")) {
      continue;
    }

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
    .replace(/\([^)]*\)|\[[^\]]*\]|【[^】]*】/g, " ")
    .replace(/[·ㆍ_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[-–—]+|[-–—]+$/g, "");
}

function foldName(value) {
  return normalizeName(value)
    .toLocaleLowerCase("ko-KR")
    .replace(/[\s\p{P}\p{S}]/gu, "");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizePathList(value) {
  return (Array.isArray(value) ? value : value ? [value] : [])
    .flatMap((entry) => String(entry).split(","))
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function effectiveStandardName(decision) {
  if (decision.decision === "rename") {
    return normalizeName(decision.rename_to) || normalizeName(decision.standard_name);
  }

  return normalizeName(decision.standard_name);
}

function promotionRefs(decision) {
  return unique([
    stringOrNull(decision.promoted_from_review_id),
    ...(Array.isArray(decision.promoted_from_review_ids) ? decision.promoted_from_review_ids.map(stringOrNull) : []),
  ]);
}

function severityForFlags(flags) {
  if (flags.some((flag) => HIGH_RISK_FLAGS.has(flag))) return "high";
  if (flags.some((flag) => MEDIUM_RISK_FLAGS.has(flag))) return "medium";

  return "low";
}

function sortRiskRows(left, right) {
  const severityRank = { high: 0, medium: 1, low: 2 };
  const severityDelta = severityRank[left.severity] - severityRank[right.severity];
  if (severityDelta !== 0) return severityDelta;
  const flagDelta = right.risk_flags.length - left.risk_flags.length;
  if (flagDelta !== 0) return flagDelta;

  return `${left.standard_name}:${left.synonym ?? ""}`.localeCompare(
    `${right.standard_name}:${right.synonym ?? ""}`,
    "ko-KR",
  );
}

async function readJson(filePath) {
  const payload = JSON.parse(await readFile(filePath, "utf8"));
  if (Array.isArray(payload)) return { generated_at: null, decisions: payload };

  if (isRecord(payload) && Array.isArray(payload.decisions)) {
    return payload;
  }

  throw new Error(`review decision file must be an array or { decisions: [] }: ${filePath}`);
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
  let escapeNextQuote = false;

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

      if (char === "'" && !escapeNextQuote) {
        inString = false;
        continue;
      }

      currentValue += char;
      escapeNextQuote = false;
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

function groupByFoldedName(rows, key) {
  const groups = new Map();

  for (const row of rows) {
    const folded = foldName(row[key]);
    if (!folded) continue;
    const group = groups.get(folded) ?? [];
    group.push(row);
    groups.set(folded, group);
  }

  return groups;
}

function buildCanonicalRows(decisions) {
  return decisions
    .filter((decision) => decision.type === "canonical" && INSERTABLE_DECISIONS.has(decision.decision))
    .map((decision) => ({
      review_id: stringOrNull(decision.review_id) ?? "",
      type: decision.type,
      decision: decision.decision,
      standard_name: effectiveStandardName(decision),
      original_standard_name: normalizeName(decision.standard_name),
      category: stringOrNull(decision.category),
      rename_to: normalizeName(decision.rename_to),
      notes: stringOrNull(decision.notes) ?? "",
      promoted_from_review_ids: promotionRefs(decision),
      source: decision,
    }))
    .filter((row) => row.standard_name);
}

function buildSynonymRows(decisions) {
  return decisions
    .filter((decision) => decision.type === "synonym" && decision.decision === "approve")
    .map((decision) => ({
      review_id: stringOrNull(decision.review_id) ?? "",
      type: decision.type,
      decision: decision.decision,
      standard_name: normalizeName(decision.standard_name),
      synonym: normalizeName(decision.synonym),
      category: stringOrNull(decision.category),
      notes: stringOrNull(decision.notes) ?? "",
      mapped_from_standard_name: normalizeName(decision.mapped_from_standard_name),
      mapped_to_standard_name: normalizeName(decision.mapped_to_standard_name),
      source: decision,
    }))
    .filter((row) => row.standard_name || row.synonym);
}

function riskCanonicalRows({ canonicalRows }) {
  const canonicalGroups = groupByFoldedName(canonicalRows, "standard_name");
  const duplicateFoldedNames = new Set(
    [...canonicalGroups.entries()].filter(([, rows]) => rows.length > 1).map(([folded]) => folded),
  );

  return canonicalRows
    .map((row) => {
      const flags = [];

      if (!VALID_TYPES.has(row.type)) flags.push("invalid_type");
      if (row.category && !VALID_CATEGORIES.has(row.category)) flags.push("invalid_category");
      if (duplicateFoldedNames.has(foldName(row.standard_name))) flags.push("duplicate_canonical_name");
      if (row.decision === "rename") flags.push("renamed_canonical");
      if (row.promoted_from_review_ids.length > 0) flags.push("promoted_from_synonym_review");
      if (foldName(row.standard_name).length <= 1) flags.push("single_character_name");
      if (BROAD_OR_PROCESSED_PATTERN.test(row.standard_name)) flags.push("broad_or_processed_name");
      if (READY_FOOD_PATTERN.test(row.standard_name)) flags.push("ready_food_name");
      if (STATE_OR_FORM_PATTERN.test(row.standard_name)) flags.push("state_or_form_name");

      return {
        review_id: row.review_id,
        standard_name: row.standard_name,
        original_standard_name: row.original_standard_name,
        category: row.category,
        decision: row.decision,
        rename_to: row.rename_to,
        risk_flags: flags,
        severity: flags.length > 0 ? severityForFlags(flags) : "none",
        notes: row.notes,
      };
    })
    .filter((row) => row.risk_flags.length > 0)
    .sort(sortRiskRows);
}

function riskSynonymRows({ synonymRows, targetNames }) {
  const synonymGroups = groupByFoldedName(synonymRows, "synonym");
  const ambiguousSynonyms = new Set(
    [...synonymGroups.entries()]
      .filter(([, rows]) => new Set(rows.map((row) => foldName(row.standard_name))).size > 1)
      .map(([folded]) => folded),
  );

  return synonymRows
    .map((row) => {
      const flags = [];
      const foldedTarget = foldName(row.standard_name);
      const foldedSynonym = foldName(row.synonym);
      const hasTarget = targetNames.has(foldedTarget);

      if (!row.standard_name) flags.push("missing_standard_name");
      if (!row.synonym) flags.push("missing_synonym");
      if (row.category && !VALID_CATEGORIES.has(row.category)) flags.push("invalid_category");
      if (foldedTarget && foldedSynonym && foldedTarget === foldedSynonym) flags.push("same_as_standard_name");
      if (foldedSynonym && ambiguousSynonyms.has(foldedSynonym)) flags.push("ambiguous_approved_synonym");
      if (foldedSynonym && GENERIC_SYNONYMS.has(foldedSynonym)) flags.push("generic_synonym");
      if (foldedTarget && !hasTarget) {
        flags.push(row.mapped_to_standard_name ? "mapped_to_missing_canonical" : "approved_synonym_target_missing");
      }
      if (row.mapped_to_standard_name) flags.push("mapped_synonym");

      return {
        review_id: row.review_id,
        standard_name: row.standard_name,
        synonym: row.synonym,
        category: row.category,
        risk_flags: flags,
        severity: flags.length > 0 ? severityForFlags(flags) : "none",
        mapped_from_standard_name: row.mapped_from_standard_name,
        mapped_to_standard_name: row.mapped_to_standard_name,
        notes: row.notes,
      };
    })
    .filter((row) => row.risk_flags.length > 0)
    .sort(sortRiskRows);
}

function countRowsWithFlag(rows, flag) {
  return rows.filter((row) => row.risk_flags.includes(flag)).length;
}

function countUniqueSynonymsWithFlag(rows, flag) {
  return new Set(rows.filter((row) => row.risk_flags.includes(flag)).map((row) => foldName(row.synonym))).size;
}

function countUniqueStandardNamesWithFlag(rows, flag) {
  return new Set(rows.filter((row) => row.risk_flags.includes(flag)).map((row) => foldName(row.standard_name))).size;
}

function buildReport({ inputPath, payload, canonicalRows, synonymRows, canonicalRisks, synonymRisks, existingNames, generatedAt }) {
  const targetNames = new Set([...canonicalRows.map((row) => foldName(row.standard_name)), ...[...existingNames].map(foldName)]);

  return {
    generated_at: generatedAt,
    input_file: inputPath,
    source_generated_at: payload.generated_at ?? null,
    summary: {
      input_decision_count: payload.decisions.length,
      insertable_canonical_count: canonicalRows.length,
      approved_synonym_count: synonymRows.length,
      existing_ingredient_reference_count: existingNames.size,
      target_standard_name_count: targetNames.size,
      canonical_risk_row_count: canonicalRisks.length,
      synonym_risk_row_count: synonymRisks.length,
      high_risk_row_count: [...canonicalRisks, ...synonymRisks].filter((row) => row.severity === "high").length,
      duplicate_canonical_name_count: countUniqueStandardNamesWithFlag(canonicalRisks, "duplicate_canonical_name"),
      missing_synonym_target_count:
        countRowsWithFlag(synonymRisks, "approved_synonym_target_missing") +
        countRowsWithFlag(synonymRisks, "mapped_to_missing_canonical"),
      ambiguous_synonym_count: countUniqueSynonymsWithFlag(synonymRisks, "ambiguous_approved_synonym"),
      promoted_canonical_count: countRowsWithFlag(canonicalRisks, "promoted_from_synonym_review"),
      renamed_canonical_count: countRowsWithFlag(canonicalRisks, "renamed_canonical"),
      mapped_synonym_count: countRowsWithFlag(synonymRisks, "mapped_synonym"),
    },
    canonical_risks: canonicalRisks,
    synonym_risks: synonymRisks,
  };
}

function markdownTable(rows, columns, limit = 30) {
  if (rows.length === 0) return "없음\n";

  const visibleRows = rows.slice(0, limit);
  const header = `| ${columns.map((column) => column.label).join(" | ")} |`;
  const divider = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = visibleRows
    .map((row) => `| ${columns.map((column) => markdownCell(column.value(row))).join(" | ")} |`)
    .join("\n");
  const suffix = rows.length > limit ? `\n\n외 ${rows.length - limit}개는 TSV/JSON에서 확인하세요.\n` : "\n";

  return `${header}\n${divider}\n${body}${suffix}`;
}

function markdownCell(value) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ");
}

function toTsv(rows, columns) {
  const lines = [columns.map((column) => column.key).join("\t")];

  for (const row of rows) {
    lines.push(
      columns
        .map((column) => {
          const value = column.value(row);

          return String(value ?? "")
            .replace(/\t/g, " ")
            .replace(/\r?\n/g, " ");
        })
        .join("\t"),
    );
  }

  return `${lines.join("\n")}\n`;
}

function renderMarkdown(report) {
  const { summary } = report;

  return `# 재료 DB 적재 전 리스크 리포트

- 생성: ${report.generated_at}
- 입력: ${report.input_file}
- 검토 대상 대표 재료: ${summary.insertable_canonical_count}개
- 검토 대상 동의어: ${summary.approved_synonym_count}개
- 기존 대표 재료 참조: ${summary.existing_ingredient_reference_count}개
- high 리스크 row: ${summary.high_risk_row_count}개

## 요약

| 항목 | 개수 |
| --- | ---: |
| 중복 대표명 | ${summary.duplicate_canonical_name_count} |
| 대표 재료가 없는 동의어 | ${summary.missing_synonym_target_count} |
| 같은 동의어가 여러 대표명에 승인됨 | ${summary.ambiguous_synonym_count} |
| 동의어에서 승격된 대표 재료 | ${summary.promoted_canonical_count} |
| 이름 변경된 대표 재료 | ${summary.renamed_canonical_count} |
| 다른 대표명으로 매핑된 동의어 | ${summary.mapped_synonym_count} |

## 대표 재료 리스크

${markdownTable(report.canonical_risks, [
  { label: "심각도", value: (row) => row.severity },
  { label: "대표명", value: (row) => row.standard_name },
  { label: "분류", value: (row) => row.category },
  { label: "리스크", value: (row) => row.risk_flags.join(", ") },
  { label: "원래 이름", value: (row) => row.original_standard_name },
])}

## 동의어 리스크

${markdownTable(report.synonym_risks, [
  { label: "심각도", value: (row) => row.severity },
  { label: "대표명", value: (row) => row.standard_name },
  { label: "동의어", value: (row) => row.synonym },
  { label: "리스크", value: (row) => row.risk_flags.join(", ") },
  { label: "매핑 전", value: (row) => row.mapped_from_standard_name },
])}
`;
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const inputPath = stringOrNull(args["review-decisions"]);
  const outputDir = stringOrNull(args["output-dir"]);
  const generatedAt = stringOrNull(args["generated-at"]) ?? new Date().toISOString();

  if (!inputPath || !outputDir) {
    console.error(
      "Usage: node scripts/external-ingredient-load-risk-report.mjs --review-decisions <decisions.json> --output-dir <dir> [--existing-ingredients-sql <seed.sql>] [--generated-at <iso>]",
    );
    process.exitCode = 1;
    return;
  }

  const payload = await readJson(inputPath);
  const existingNames = await readExistingIngredientNames(normalizePathList(args["existing-ingredients-sql"]));
  const canonicalRows = buildCanonicalRows(payload.decisions);
  const synonymRows = buildSynonymRows(payload.decisions);
  const targetNames = new Set([...canonicalRows.map((row) => foldName(row.standard_name)), ...[...existingNames].map(foldName)]);
  const canonicalRisks = riskCanonicalRows({ canonicalRows });
  const synonymRisks = riskSynonymRows({ synonymRows, targetNames });
  const report = buildReport({
    inputPath,
    payload,
    canonicalRows,
    synonymRows,
    canonicalRisks,
    synonymRisks,
    existingNames,
    generatedAt,
  });

  await mkdir(outputDir, { recursive: true });

  const reportPath = path.join(outputDir, "ingredient-load-risk-report.json");
  const markdownPath = path.join(outputDir, "ingredient-load-risk-report.md");
  const canonicalTsvPath = path.join(outputDir, "canonical-risk-rows.tsv");
  const synonymTsvPath = path.join(outputDir, "synonym-risk-rows.tsv");

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(markdownPath, renderMarkdown(report));
  await writeFile(
    canonicalTsvPath,
    toTsv(report.canonical_risks, [
      { key: "severity", value: (row) => row.severity },
      { key: "review_id", value: (row) => row.review_id },
      { key: "standard_name", value: (row) => row.standard_name },
      { key: "category", value: (row) => row.category },
      { key: "risk_flags", value: (row) => row.risk_flags.join(",") },
      { key: "original_standard_name", value: (row) => row.original_standard_name },
      { key: "notes", value: (row) => row.notes },
    ]),
  );
  await writeFile(
    synonymTsvPath,
    toTsv(report.synonym_risks, [
      { key: "severity", value: (row) => row.severity },
      { key: "review_id", value: (row) => row.review_id },
      { key: "standard_name", value: (row) => row.standard_name },
      { key: "synonym", value: (row) => row.synonym },
      { key: "risk_flags", value: (row) => row.risk_flags.join(",") },
      { key: "mapped_from_standard_name", value: (row) => row.mapped_from_standard_name },
      { key: "mapped_to_standard_name", value: (row) => row.mapped_to_standard_name },
      { key: "notes", value: (row) => row.notes },
    ]),
  );

  process.stdout.write(
    [`Wrote ${reportPath}`, `Wrote ${markdownPath}`, `Wrote ${canonicalTsvPath}`, `Wrote ${synonymTsvPath}`].join(
      "\n",
    ),
  );
  process.stdout.write("\n");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
