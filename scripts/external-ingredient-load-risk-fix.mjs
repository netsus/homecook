#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

const DUPLICATE_REPRESENTATIVE_FIXES = [
  {
    duplicate_review_id: "canonical:국수",
    target_standard_name: "소면",
    synonym: "국수",
    category: "곡류",
  },
  {
    duplicate_review_id: "canonical:닭고기가슴",
    target_standard_name: "닭가슴살",
    synonym: "닭고기 가슴",
    category: "육류",
  },
  {
    duplicate_review_id: "canonical:멥쌀떡",
    target_standard_name: "가래떡",
    synonym: "멥쌀떡",
    category: "곡류",
  },
];

const PROMOTED_MISSING_TARGETS = [
  { standard_name: "새우젓", category: "해산물", reason: "새우젓 종류 동의어의 대표 재료" },
  { standard_name: "양상추", category: "채소", reason: "상추 품종 동의어의 대표 재료" },
  { standard_name: "연시", category: "과일", reason: "청도반시 매핑 대상" },
  { standard_name: "웨하스", category: "곡류", reason: "바닐라 웨하스 매핑 대상" },
  { standard_name: "젓갈", category: "해산물", reason: "양념젓갈 매핑 대상" },
  { standard_name: "청포도", category: "과일", reason: "청포도 품종 동의어의 대표 재료" },
  { standard_name: "캠벨 포도", category: "과일", reason: "캠벨얼리 매핑 대상" },
  { standard_name: "팥 앙금", category: "곡류", reason: "앙금/단팥 매핑 대상" },
  { standard_name: "호떡", category: "곡류", reason: "호떡빵 매핑 대상" },
  { standard_name: "호밀가루", category: "곡류", reason: "호밀 rename 의도를 보존하는 별도 대표 재료" },
];

const ROW_REWRITES = new Map([
  [
    "canonical:호밀",
    (row, generatedAt) => ({
      ...row,
      decision: "approve",
      rename_to: "",
      notes: appendNote(row.notes, "load-risk-fix: 통호밀 동의어 target 보존을 위해 호밀 대표 재료로 유지"),
      updated_at: generatedAt,
    }),
  ],
  [
    "synonym:감:연시",
    (row, generatedAt) => ({
      ...row,
      decision: "exclude",
      notes: appendNote(row.notes, "load-risk-fix: 연시는 별도 대표 재료로 승격되어 감의 동의어에서 제외"),
      updated_at: generatedAt,
    }),
  ],
  [
    "synonym:개암:헤이즐넛",
    (row, generatedAt) => ({
      ...row,
      decision: "exclude",
      notes: appendNote(row.notes, "load-risk-fix: 헤이즐넛이 대표 재료가 되므로 역방향 동의어로 재생성"),
      updated_at: generatedAt,
    }),
  ],
  [
    "synonym:포도:캠벨얼리",
    (row, generatedAt) => ({
      ...row,
      standard_name: "캠벨 포도",
      mapped_to_standard_name: "캠벨 포도",
      notes: appendNote(row.notes, "load-risk-fix: 캠벨보다 이해하기 쉬운 대표명 캠벨 포도로 매핑"),
      updated_at: generatedAt,
    }),
  ],
]);

const EXTRA_SYNONYMS = [
  {
    review_id: "synonym:헤이즐넛:개암",
    standard_name: "헤이즐넛",
    synonym: "개암",
    category: "과일",
    notes: "load-risk-fix: 개암 rename 후 검색 보존",
  },
];

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

  if (typeof value === "number") return String(value);

  return null;
}

function appendNote(existingNote, note) {
  const existing = stringOrNull(existingNote);

  if (!existing) return note;
  if (existing.includes(note)) return existing;

  return `${existing} | ${note}`;
}

function synonymReviewId(standardName, synonym) {
  return `synonym:${standardName}:${synonym}`.replace(/\s+/g, "");
}

function canonicalReviewId(standardName) {
  return `canonical:${standardName}`.replace(/\s+/g, "");
}

function normalizePayload(payload) {
  if (Array.isArray(payload)) {
    return {
      generated_at: null,
      decisions: payload,
    };
  }

  if (payload && Array.isArray(payload.decisions)) {
    return payload;
  }

  throw new Error("input must be an array or an object with decisions");
}

function fixDuplicateRepresentatives(decisions, generatedAt) {
  const additions = [];
  const fixesByReviewId = new Map(
    DUPLICATE_REPRESENTATIVE_FIXES.map((fix) => [fix.duplicate_review_id, fix]),
  );

  const fixedDecisions = decisions.map((row) => {
    const fix = fixesByReviewId.get(row.review_id);
    if (!fix) return row;

    additions.push({
      review_id: synonymReviewId(fix.target_standard_name, fix.synonym),
      type: "synonym",
      standard_name: fix.target_standard_name,
      synonym: fix.synonym,
      category: fix.category,
      decision: "approve",
      rename_to: "",
      notes: `load-risk-fix: 중복 대표명을 피하려고 ${row.standard_name}을 ${fix.target_standard_name} 동의어로 이동`,
      updated_at: generatedAt,
      mapped_from_standard_name: row.standard_name,
      mapped_to_standard_name: fix.target_standard_name,
    });

    return {
      ...row,
      decision: "exclude",
      rename_to: "",
      notes: appendNote(row.notes, `load-risk-fix: ${fix.target_standard_name} 대표 row와 중복되어 동의어로 이동`),
      updated_at: generatedAt,
    };
  });

  return { fixedDecisions, additions };
}

function applyRowRewrites(decisions, generatedAt) {
  return decisions.map((row) => ROW_REWRITES.get(row.review_id)?.(row, generatedAt) ?? row);
}

function addMissingTargets(decisions, generatedAt) {
  const existingReviewIds = new Set(decisions.map((row) => row.review_id));
  const additions = [];

  for (const target of PROMOTED_MISSING_TARGETS) {
    const reviewId = canonicalReviewId(target.standard_name);
    if (existingReviewIds.has(reviewId)) continue;

    additions.push({
      review_id: reviewId,
      type: "canonical",
      standard_name: target.standard_name,
      synonym: "",
      category: target.category,
      decision: "approve",
      rename_to: "",
      notes: `load-risk-fix: missing synonym target 승격 - ${target.reason}`,
      updated_at: generatedAt,
      promoted_from_review_id: "",
      mapped_to_standard_name: "",
    });
    existingReviewIds.add(reviewId);
  }

  return additions;
}

function addExtraSynonyms(decisions, generatedAt) {
  const existingReviewIds = new Set(decisions.map((row) => row.review_id));

  return EXTRA_SYNONYMS.filter((row) => !existingReviewIds.has(row.review_id)).map((row) => ({
    ...row,
    type: "synonym",
    decision: "approve",
    rename_to: "",
    updated_at: generatedAt,
    mapped_to_standard_name: row.standard_name,
  }));
}

function summarize(decisions) {
  const byType = {};
  const byDecision = {};

  for (const row of decisions) {
    byType[row.type] = (byType[row.type] ?? 0) + 1;
    byDecision[row.decision] = (byDecision[row.decision] ?? 0) + 1;
  }

  return {
    decision_count: decisions.length,
    by_type: Object.fromEntries(Object.entries(byType).sort(([left], [right]) => left.localeCompare(right))),
    by_decision: Object.fromEntries(Object.entries(byDecision).sort(([left], [right]) => left.localeCompare(right))),
  };
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const inputPath = stringOrNull(args.input);
  const outputPath = stringOrNull(args.output);
  const generatedAt = stringOrNull(args["generated-at"]) ?? new Date().toISOString();

  if (!inputPath || !outputPath) {
    console.error(
      "Usage: node scripts/external-ingredient-load-risk-fix.mjs --input <load-ready.json> --output <fixed.json> [--generated-at <iso>]",
    );
    process.exitCode = 1;
    return;
  }

  const payload = normalizePayload(JSON.parse(await readFile(inputPath, "utf8")));
  const rewrittenDecisions = applyRowRewrites(payload.decisions, generatedAt);
  const { fixedDecisions, additions: synonymAdditions } = fixDuplicateRepresentatives(
    rewrittenDecisions,
    generatedAt,
  );
  const targetAdditions = addMissingTargets(fixedDecisions, generatedAt);
  const extraSynonyms = addExtraSynonyms([...fixedDecisions, ...targetAdditions, ...synonymAdditions], generatedAt);
  const decisions = [...fixedDecisions, ...targetAdditions, ...synonymAdditions, ...extraSynonyms];

  const output = {
    ...payload,
    generated_at: generatedAt,
    decisions,
    source_decision_file: inputPath,
    normalization_note: appendNote(
      payload.normalization_note,
      "load-risk-fix: high 리스크 중복 대표명과 missing synonym target을 정리한 적재 후보",
    ),
    summary: {
      ...(payload.summary ?? {}),
      ...summarize(decisions),
      load_risk_fix: {
        duplicate_representatives_fixed: DUPLICATE_REPRESENTATIVE_FIXES.length,
        missing_targets_promoted: targetAdditions.length,
        synonym_rows_added: synonymAdditions.length + extraSynonyms.length,
        row_rewrites_applied: [...ROW_REWRITES.keys()].filter((reviewId) =>
          payload.decisions.some((row) => row.review_id === reviewId),
        ).length,
      },
    },
  };

  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  process.stdout.write(`Wrote ${outputPath}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
