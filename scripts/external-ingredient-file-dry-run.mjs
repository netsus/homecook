#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const CONFIRMED_SOURCE_LICENSE_TOKENS = new Set([
  "approved",
  "approved-source",
  "cc-by",
  "cc0",
  "open-data",
  "public-domain",
  "public-open-data",
  "kogl-type-1",
]);

const EXTERNAL_INGREDIENT_REVIEW_STATUSES = new Set([
  "pending_review",
  "approved",
  "rejected",
  "needs_source_check",
]);

const INGREDIENT_CATEGORY_LABELS = new Set(["채소", "육류", "해산물", "양념", "유제품", "곡류", "기타"]);
const EMPTY_LEVEL_VALUES = new Set(["", "0", "00", "해당없음", "해당 없음", "기타"]);
const GENERIC_LEVEL_NAMES = new Set(["파"]);

function parseCliArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const nextToken = argv[index + 1];

    if (!nextToken || nextToken.startsWith("--")) {
      args[key] = true;
      continue;
    }

    args[key] = nextToken;
    index += 1;
  }

  return args;
}

function stringOrNull(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();

    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return null;
}

function stringOrEmpty(value) {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);

  return "";
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeExternalIngredientName(value) {
  return stringOrEmpty(value)
    .normalize("NFKC")
    .replace(/\([^)]*\)|\[[^\]]*\]|【[^】]*】/g, " ")
    .replace(/[·ㆍ_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[-–—]+|[-–—]+$/g, "");
}

function foldExternalIngredientName(value) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/[\s\p{P}\p{S}]/gu, "");
}

function fieldText(row, keys) {
  return keys
    .map((key) => stringOrNull(row[key]))
    .filter(Boolean)
    .join(" ");
}

function meaningfulLevel(value) {
  const text = stringOrNull(value);

  if (!text || EMPTY_LEVEL_VALUES.has(text)) return null;

  return text;
}

function inferDataGoKrSourceSystem(row) {
  const sourceText = fieldText(row, ["SRC_NM", "INSTT_NM"]);

  if (/식품의약품안전처|식약처/.test(sourceText)) return "mfds";
  if (/농촌진흥청|국가표준식품성분표|농식품올바로/.test(sourceText)) return "rda";
  if (/국립수산과학원|수산/.test(sourceText)) return "nifs";

  return "data-go-kr";
}

function inferLegacyCategoryFromDataGoKrNutritionRow(row) {
  const categoryText = fieldText(row, [
    "TYPE_NM",
    "FOOD_LV3_NM",
    "FOOD_LV4_NM",
    "FOOD_LV5_NM",
    "FOOD_LV6_NM",
  ]);

  if (/수산|어패|해조|해산|생선|어류|패류|갑각|연체/.test(categoryText)) return "해산물";
  if (/육류|축산|닭고기|돼지고기|소고기|쇠고기|난류|달걀|계란/.test(categoryText)) {
    return "육류";
  }
  if (/우유|유제품|유가공|치즈|버터|크림/.test(categoryText)) return "유제품";
  if (/곡류|쌀|현미|보리|밀|두류|서류|감자|고구마|전분|견과|종실|콩류/.test(categoryText)) {
    return "곡류";
  }
  if (/채소|버섯|나물|엽채|근채|양파|마늘|대파|쪽파|고추|배추/.test(categoryText)) {
    return "채소";
  }
  if (/조미|장류|소스|양념|유지|식용유|고춧가루|소금|설탕|식초/.test(categoryText)) {
    return "양념";
  }

  return "기타";
}

function chooseDataGoKrIngredientName(row) {
  const foodName = stringOrNull(row.FOOD_NM) ?? "";
  const level4 = meaningfulLevel(row.FOOD_LV4_NM);
  const level5 = meaningfulLevel(row.FOOD_LV5_NM);
  const level6 = meaningfulLevel(row.FOOD_LV6_NM);

  if (level4 && (level4.endsWith("류") || GENERIC_LEVEL_NAMES.has(level4)) && level5) {
    return level5;
  }

  return level4 ?? level5 ?? level6 ?? foodName;
}

function inferLegacyCategoryFromRdaFoodGroup(row) {
  const groupCode = stringOrNull(row.fdGrupp);
  const groupName = stringOrNull(row.fdGruppNm) ?? "";

  if (groupCode === "K" || groupCode === "L" || /어패|수산|해조|해산/.test(groupName)) {
    return "해산물";
  }
  if (groupCode === "I" || groupCode === "J" || /육류|난류|달걀|계란/.test(groupName)) {
    return "육류";
  }
  if (groupCode === "M" || /우유|유제품/.test(groupName)) return "유제품";
  if (["A", "B", "D", "E"].includes(groupCode ?? "") || /곡류|감자|전분|두류|견과/.test(groupName)) {
    return "곡류";
  }
  if (groupCode === "F" || groupCode === "G" || /채소|버섯/.test(groupName)) return "채소";
  if (groupCode === "N" || groupCode === "R" || /유지|조미료/.test(groupName)) return "양념";

  return "기타";
}

function chooseRdaFoodCompositionIngredientName(row) {
  const foodName = stringOrNull(row.fdNm) ?? "";
  const parts = foodName
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parts[0] && GENERIC_LEVEL_NAMES.has(parts[0]) && parts[1]) {
    return parts[1];
  }

  return parts[0] ?? foodName;
}

function mapDataGoKrNutritionRowsToExternalIngredientSourceRows(rows, options) {
  return rows.map((row, rowIndex) => ({
    row_index: rowIndex,
    source_system: inferDataGoKrSourceSystem(row),
    source_file: options.sourceFile,
    source_version: options.sourceVersion ?? null,
    source_date: stringOrNull(row.CRTR_YMD) ?? options.sourceDate ?? null,
    source_license: options.sourceLicense ?? null,
    source_row_id: stringOrNull(row.FOOD_CD),
    original_name: chooseDataGoKrIngredientName(row),
    legacy_category: inferLegacyCategoryFromDataGoKrNutritionRow(row),
    raw_payload: row,
  }));
}

function mapRdaFoodCompositionRowsToExternalIngredientSourceRows(rows, options) {
  return rows.map((row, rowIndex) => ({
    row_index: rowIndex,
    source_system: "rda",
    source_file: options.sourceFile,
    source_version: options.sourceVersion ?? stringOrNull(row.originNm),
    source_date: options.sourceDate ?? null,
    source_license: options.sourceLicense ?? null,
    source_row_id: stringOrNull(row.fdCode),
    original_name: chooseRdaFoodCompositionIngredientName(row),
    legacy_category: inferLegacyCategoryFromRdaFoodGroup(row),
    raw_payload: row,
  }));
}

function parseExternalIngredientSourceRows(input) {
  if (!Array.isArray(input)) {
    return {
      rows: [],
      file_errors: ["External ingredient source input must be an array of rows."],
    };
  }

  const fileErrors = [];
  const rows = input.flatMap((rawRow, rowIndex) => {
    if (!isRecord(rawRow)) {
      fileErrors.push(`Row ${rowIndex} must be an object.`);

      return [];
    }

    const rawPayload = isRecord(rawRow.raw_payload) ? rawRow.raw_payload : rawRow;

    return [
      {
        row_index: rowIndex,
        source_system: stringOrEmpty(rawRow.source_system).trim(),
        source_file: stringOrEmpty(rawRow.source_file).trim(),
        source_version: stringOrNull(rawRow.source_version),
        source_date: stringOrNull(rawRow.source_date),
        source_license: stringOrNull(rawRow.source_license),
        source_row_id: stringOrNull(rawRow.source_row_id),
        original_name: stringOrEmpty(rawRow.original_name),
        legacy_category: stringOrNull(rawRow.legacy_category),
        raw_payload: rawPayload,
      },
    ];
  });

  return {
    rows,
    file_errors: fileErrors,
  };
}

function parseSourceInput(input, inputPath) {
  if (Array.isArray(input)) {
    return parseExternalIngredientSourceRows(input);
  }

  if (!isRecord(input)) {
    return {
      rows: [],
      file_errors: ["External ingredient source input must be an array or supported export object."],
    };
  }

  const sourceFile = path.basename(inputPath);
  const rows = [
    ...mapDataGoKrNutritionRowsToExternalIngredientSourceRows(
      Array.isArray(input.dataGoKrProcessedFoodRows) ? input.dataGoKrProcessedFoodRows : [],
      {
        sourceFile: `${sourceFile}#data-go-kr-processed-food`,
        sourceLicense: "public-open-data",
      },
    ),
    ...mapRdaFoodCompositionRowsToExternalIngredientSourceRows(
      Array.isArray(input.rdaFoodCompositionRows) ? input.rdaFoodCompositionRows : [],
      {
        sourceFile: `${sourceFile}#rda-food-composition`,
        sourceLicense: "kogl-type-1",
      },
    ),
  ];

  if (rows.length === 0) {
    return {
      rows,
      file_errors: [
        "Supported export object must include dataGoKrProcessedFoodRows or rdaFoodCompositionRows arrays.",
      ],
    };
  }

  return { rows, file_errors: [] };
}

function parseReviewDecisionsInput(input) {
  const decisions = Array.isArray(input) ? input : isRecord(input) ? input.decisions : null;

  if (!Array.isArray(decisions)) {
    throw new Error("Review decisions input must be an array or an object with a decisions array.");
  }

  return decisions.map((decision, decisionIndex) => {
    if (!isRecord(decision)) {
      throw new Error(`Review decision ${decisionIndex} must be an object.`);
    }

    const sourceFingerprint = stringOrNull(decision.source_fingerprint);
    const status = stringOrNull(decision.status);

    if (!sourceFingerprint) {
      throw new Error(`Review decision ${decisionIndex} is missing source_fingerprint.`);
    }

    if (!status || !EXTERNAL_INGREDIENT_REVIEW_STATUSES.has(status)) {
      throw new Error(`Review decision ${decisionIndex} has an invalid status.`);
    }

    return {
      source_fingerprint: sourceFingerprint,
      status,
    };
  });
}

async function readReviewDecisions(reviewDecisionsPath) {
  if (!reviewDecisionsPath) return [];

  return parseReviewDecisionsInput(JSON.parse(await readFile(reviewDecisionsPath, "utf8")));
}

function hasConfirmedSourceLicense(sourceLicense) {
  return (
    sourceLicense !== null &&
    CONFIRMED_SOURCE_LICENSE_TOKENS.has(sourceLicense.toLocaleLowerCase("ko-KR"))
  );
}

function getCategoryCandidate(legacyCategory) {
  if (legacyCategory && INGREDIENT_CATEGORY_LABELS.has(legacyCategory.trim())) {
    return {
      label: legacyCategory.trim(),
      confidence: "high",
      reason_code: "source_legacy_category_match",
    };
  }

  return {
    label: "기타",
    confidence: "low",
    reason_code: "unknown_legacy_category_candidate",
  };
}

function buildSourceFingerprint(row) {
  return sha256(
    stableStringify({
      source_system: row.source_system,
      source_file: row.source_file,
      source_version: row.source_version,
      source_date: row.source_date,
      source_row_id: row.source_row_id,
      original_name: row.original_name,
      raw_payload: row.raw_payload,
    }),
  );
}

function applyDuplicateCandidates(candidates) {
  const byNormalizedName = new Map();
  const byFoldedName = new Map();

  for (const candidate of candidates) {
    if (!candidate.normalized_name) continue;

    byNormalizedName.set(candidate.normalized_name, [
      ...(byNormalizedName.get(candidate.normalized_name) ?? []),
      candidate,
    ]);
    byFoldedName.set(candidate.folded_name, [...(byFoldedName.get(candidate.folded_name) ?? []), candidate]);
  }

  for (const sameNameCandidates of byNormalizedName.values()) {
    if (sameNameCandidates.length < 2) continue;

    for (const candidate of sameNameCandidates) {
      const firstOtherCandidate = sameNameCandidates.find(
        (otherCandidate) => otherCandidate.source_fingerprint !== candidate.source_fingerprint,
      );

      if (!firstOtherCandidate) continue;

      candidate.duplicate_candidates.push({
        kind: "exact_normalized_name",
        matched_source_fingerprint: firstOtherCandidate.source_fingerprint,
        matched_name: firstOtherCandidate.normalized_name,
      });
    }
  }

  for (const sameFoldCandidates of byFoldedName.values()) {
    if (sameFoldCandidates.length < 2) continue;

    for (const candidate of sameFoldCandidates) {
      const firstOtherCandidate = sameFoldCandidates.find(
        (otherCandidate) =>
          otherCandidate.source_fingerprint !== candidate.source_fingerprint &&
          otherCandidate.normalized_name !== candidate.normalized_name,
      );

      if (!firstOtherCandidate) continue;

      candidate.duplicate_candidates.push({
        kind: "folded_name",
        matched_source_fingerprint: firstOtherCandidate.source_fingerprint,
        matched_name: firstOtherCandidate.normalized_name,
      });
    }
  }
}

function getReasonCodes(candidate) {
  const reasonCodes = [];

  if (!candidate.normalized_name) {
    reasonCodes.push("empty_original_name");
  }

  if (!hasConfirmedSourceLicense(candidate.source_license)) {
    reasonCodes.push("source_license_unconfirmed");
  }

  if (candidate.category_candidate.confidence === "low") {
    reasonCodes.push(candidate.category_candidate.reason_code);
  }

  if (candidate.duplicate_candidates.length > 0) {
    reasonCodes.push(...candidate.duplicate_candidates.map((duplicate) => duplicate.kind));
  }

  return reasonCodes;
}

function chooseReviewStatus(candidate, reviewDecisionByFingerprint) {
  if (!candidate.normalized_name) return "rejected";
  if (!hasConfirmedSourceLicense(candidate.source_license)) return "needs_source_check";

  return reviewDecisionByFingerprint.get(candidate.source_fingerprint) ?? "pending_review";
}

function buildExternalIngredientCandidateReport(rows, generatedAt, reviewDecisions = []) {
  const invalidRows = [];
  const reviewDecisionByFingerprint = new Map(
    reviewDecisions.map((decision) => [decision.source_fingerprint, decision.status]),
  );
  const candidates = rows.flatMap((row) => {
    if (!row.source_system || !row.source_file) {
      invalidRows.push({
        row_index: row.row_index,
        source_row_id: row.source_row_id,
        code: "missing_source_metadata",
        message: "source_system and source_file are required before candidate generation.",
      });

      return [];
    }

    const normalizedName = normalizeExternalIngredientName(row.original_name);
    const sourceFingerprint = buildSourceFingerprint(row);
    const candidate = {
      row_index: row.row_index,
      source_fingerprint: sourceFingerprint,
      source_system: row.source_system,
      source_file: row.source_file,
      source_version: row.source_version,
      source_date: row.source_date,
      source_license: row.source_license,
      source_row_id: row.source_row_id,
      original_name: row.original_name,
      normalized_name: normalizedName,
      folded_name: foldExternalIngredientName(normalizedName),
      raw_payload: row.raw_payload,
      review_status: "pending_review",
      category_candidate: getCategoryCandidate(row.legacy_category),
      duplicate_candidates: [],
      reason_codes: [],
    };

    candidate.review_status = chooseReviewStatus(candidate, reviewDecisionByFingerprint);

    return [candidate];
  });

  applyDuplicateCandidates(candidates);

  for (const candidate of candidates) {
    candidate.reason_codes = getReasonCodes(candidate);
  }

  const batchId = sha256(candidates.map((candidate) => candidate.source_fingerprint).sort().join(":"));

  return {
    batch_id: batchId,
    generated_at: generatedAt,
    blocked: invalidRows.length > 0,
    invalid_rows: invalidRows,
    candidates,
    summary: {
      total_rows: rows.length,
      candidate_count: candidates.length,
      approved_count: candidates.filter((candidate) => candidate.review_status === "approved").length,
      rejected_count: candidates.filter((candidate) => candidate.review_status === "rejected").length,
      pending_review_count: candidates.filter((candidate) => candidate.review_status === "pending_review")
        .length,
      needs_source_check_count: candidates.filter(
        (candidate) => candidate.review_status === "needs_source_check",
      ).length,
      duplicate_count: candidates.filter((candidate) => candidate.duplicate_candidates.length > 0).length,
      low_confidence_category_count: candidates.filter(
        (candidate) => candidate.category_candidate.confidence === "low",
      ).length,
    },
  };
}

function buildApprovedIngredientSeedPromotionArtifact(report, artifactId, generatedAt) {
  if (report.blocked) {
    return {
      artifact_id: artifactId,
      generated_at: generatedAt,
      source_report_batch_id: report.batch_id,
      seed_rows: [],
      skipped_rows: report.candidates.map((candidate) => ({
        source_fingerprint: candidate.source_fingerprint,
        normalized_name: candidate.normalized_name,
        review_status: candidate.review_status,
        reason_codes: ["blocked_report"],
      })),
    };
  }

  const approvedCandidates = report.candidates.filter(
    (candidate) => candidate.review_status === "approved",
  );

  return {
    artifact_id: artifactId,
    generated_at: generatedAt,
    source_report_batch_id: report.batch_id,
    seed_rows: approvedCandidates.map((candidate) => ({
      seed_idempotency_key: `external:${candidate.source_fingerprint}`,
      standard_name: candidate.normalized_name,
      legacy_category: candidate.category_candidate.label,
      source_fingerprint: candidate.source_fingerprint,
      source_system: candidate.source_system,
      source_file: candidate.source_file,
      source_row_id: candidate.source_row_id,
    })),
    skipped_rows: report.candidates
      .filter((candidate) => candidate.review_status !== "approved")
      .map((candidate) => ({
        source_fingerprint: candidate.source_fingerprint,
        normalized_name: candidate.normalized_name,
        review_status: candidate.review_status,
        reason_codes: candidate.reason_codes,
      })),
  };
}

function defaultOutputDir(generatedAt) {
  return path.join(
    ".artifacts",
    "external-ingredient-ingest",
    generatedAt.replace(/[:.]/g, "-"),
  );
}

function buildSummaryMarkdown(report, seedArtifact, outputFiles) {
  return [
    "# External Ingredient File Dry Run",
    "",
    `Generated at: ${report.generated_at}`,
    "",
    "## Safety",
    "",
    "- Production DB writes: 0",
    "- Network requests: 0",
    "- No API key was read or required.",
    "",
    "## Output Files",
    "",
    `- Candidate report: ${outputFiles.reportPath}`,
    `- Approved seed promotion artifact: ${outputFiles.seedPath}`,
    `- Summary: ${outputFiles.summaryPath}`,
    "",
    "## Candidate Summary",
    "",
    `- Total source rows: ${report.summary.total_rows}`,
    `- Candidates: ${report.summary.candidate_count}`,
    `- Pending review: ${report.summary.pending_review_count}`,
    `- Needs source check: ${report.summary.needs_source_check_count}`,
    `- Rejected: ${report.summary.rejected_count}`,
    `- Approved seed rows: ${seedArtifact.seed_rows.length}`,
    `- Duplicate candidates: ${report.summary.duplicate_count}`,
    `- Low-confidence categories: ${report.summary.low_confidence_category_count}`,
    "",
  ].join("\n");
}

async function writeJsonFile(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));

  if (args.help) {
    process.stdout.write(
      "Usage: pnpm external:ingredients:dry-run -- --input <file.json> [--review-decisions <file.json>] [--output-dir <dir>] [--generated-at <iso>]\n",
    );

    return;
  }

  if (typeof args.input !== "string" || args.input.trim().length === 0) {
    throw new Error("Missing required --input <file.json>.");
  }

  const inputPath = args.input;
  const reviewDecisionsPath =
    typeof args["review-decisions"] === "string" && args["review-decisions"].trim().length > 0
      ? args["review-decisions"]
      : null;
  const generatedAt = typeof args["generated-at"] === "string" ? args["generated-at"] : new Date().toISOString();
  const outputDir =
    typeof args["output-dir"] === "string" && args["output-dir"].trim().length > 0
      ? args["output-dir"]
      : defaultOutputDir(generatedAt);

  const input = JSON.parse(await readFile(inputPath, "utf8"));
  const reviewDecisions = await readReviewDecisions(reviewDecisionsPath);
  const parseResult = parseSourceInput(input, inputPath);

  if (parseResult.file_errors.length > 0) {
    throw new Error(parseResult.file_errors.join("\n"));
  }

  const report = buildExternalIngredientCandidateReport(parseResult.rows, generatedAt, reviewDecisions);
  const seedArtifact = buildApprovedIngredientSeedPromotionArtifact(
    report,
    `external-ingredient-seed:${report.batch_id}`,
    generatedAt,
  );

  await mkdir(outputDir, { recursive: true });

  const reportPath = path.join(outputDir, "candidate-report.json");
  const seedPath = path.join(outputDir, "approved-seed-promotion-artifact.json");
  const summaryPath = path.join(outputDir, "summary.md");
  const summary = buildSummaryMarkdown(report, seedArtifact, {
    reportPath,
    seedPath,
    summaryPath,
  });

  await writeJsonFile(reportPath, report);
  await writeJsonFile(seedPath, seedArtifact);
  await writeFile(summaryPath, summary);

  process.stdout.write(`${summary}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
