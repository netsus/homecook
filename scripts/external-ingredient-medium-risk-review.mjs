#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const AUTO_EXCLUDE_CANONICAL_REASONS = new Map([
  ["과자", "너무 넓은 완제품 분류라 검색/치환 대표명으로 부적합"],
  ["케이크", "너무 넓은 완제품 분류라 검색/치환 대표명으로 부적합"],
  ["빵", "너무 넓은 완제품 분류라 식빵/바게트 같은 구체 대표명만 유지"],
  ["샐러드 드레싱", "너무 넓은 양념 분류라 구체 드레싱만 유지"],
  ["사탕", "완성 간식 분류라 재료 대표명으로 부적합"],
  ["쿠키", "완성 간식류라 재료 대표명에서 제외"],
  ["비스킷", "완성 간식류라 재료 대표명에서 제외"],
  ["크래커", "완성 간식류라 재료 대표명에서 제외"],
  ["감자 과자", "완성 간식류라 재료 대표명에서 제외"],
  ["멥쌀 과자", "완성 간식류라 재료 대표명에서 제외"],
  ["옥수수 과자", "완성 간식류라 재료 대표명에서 제외"],
  ["찹쌀 과자", "완성 간식류라 재료 대표명에서 제외"],
  ["호두과자", "완성 간식류라 재료 대표명에서 제외"],
  ["땅콩샌드", "완성 간식류라 재료 대표명에서 제외"],
  ["치즈샌드", "완성 간식류라 재료 대표명에서 제외"],
  ["초코파이", "완성 간식류라 재료 대표명에서 제외"],
  ["도넛", "완성 간식류라 재료 대표명에서 제외"],
  ["찹쌀도넛", "완성 간식류라 재료 대표명에서 제외"],
  ["꽈배기", "완성 간식류라 재료 대표명에서 제외"],
  ["경단 카스텔라", "완성 간식류라 재료 대표명에서 제외"],
  ["마늘바게트", "완성 간식류라 재료 대표명에서 제외"],
  ["만주", "완성 간식류라 재료 대표명에서 제외"],
  ["모나카", "완성 간식류라 재료 대표명에서 제외"],
  ["사과파이", "완성 간식류라 재료 대표명에서 제외"],
  ["약과", "완성 간식류라 재료 대표명에서 제외"],
  ["전병", "완성 간식류라 재료 대표명에서 제외"],
  ["쌀엿강정", "완성 간식류라 재료 대표명에서 제외"],
  ["피칸파이", "완성 간식류라 재료 대표명에서 제외"],
  ["치즈 케이크", "완성 디저트라 재료 대표명에서 제외"],
  ["파운드 케이크", "완성 디저트라 재료 대표명에서 제외"],
  ["팬케이크", "완성 디저트라 팬케이크가루만 재료로 유지"],
  ["피자", "완성 음식이라 재료 대표명에서 제외"],
  ["콘샐러드", "완성 반찬/샐러드라 재료 대표명에서 제외"],
  ["양배추 샐러드", "완성 반찬/샐러드라 재료 대표명에서 제외"],
  ["감자 튀김", "완성 음식이라 재료 대표명에서 제외"],
  ["무말랭이 무침", "완성 반찬이라 재료 대표명에서 제외"],
  ["감 주스", "음료로 소비되는 완제품이라 출시 재료 대표명에서 제외"],
  ["구아바 주스", "음료로 소비되는 완제품이라 출시 재료 대표명에서 제외"],
  ["귤 음료", "음료로 소비되는 완제품이라 출시 재료 대표명에서 제외"],
  ["귤 주스", "음료로 소비되는 완제품이라 출시 재료 대표명에서 제외"],
  ["귤 착즙", "음료/착즙 완제품이라 출시 재료 대표명에서 제외"],
  ["당근 주스", "음료로 소비되는 완제품이라 출시 재료 대표명에서 제외"],
  ["당근 착즙", "음료/착즙 완제품이라 출시 재료 대표명에서 제외"],
  ["당근즙", "음료로 소비되는 완제품이라 출시 재료 대표명에서 제외"],
  ["딸기 음료", "음료로 소비되는 완제품이라 출시 재료 대표명에서 제외"],
  ["딸기 주스", "음료로 소비되는 완제품이라 출시 재료 대표명에서 제외"],
  ["망고 음료", "음료로 소비되는 완제품이라 출시 재료 대표명에서 제외"],
  ["배 음료", "음료로 소비되는 완제품이라 출시 재료 대표명에서 제외"],
  ["배 착즙", "음료/착즙 완제품이라 출시 재료 대표명에서 제외"],
  ["배즙", "음료로 소비되는 완제품이라 출시 재료 대표명에서 제외"],
  ["브로콜리 착즙", "음료/착즙 완제품이라 출시 재료 대표명에서 제외"],
  ["비트 착즙", "음료/착즙 완제품이라 출시 재료 대표명에서 제외"],
  ["사과 음료", "음료로 소비되는 완제품이라 출시 재료 대표명에서 제외"],
  ["사과 주스", "음료로 소비되는 완제품이라 출시 재료 대표명에서 제외"],
  ["사과 착즙", "음료/착즙 완제품이라 출시 재료 대표명에서 제외"],
  ["셀러리 착즙", "음료/착즙 완제품이라 출시 재료 대표명에서 제외"],
  ["수박 착즙", "음료/착즙 완제품이라 출시 재료 대표명에서 제외"],
  ["아세로라 주스", "음료로 소비되는 완제품이라 출시 재료 대표명에서 제외"],
  ["알로에 음료", "음료로 소비되는 완제품이라 출시 재료 대표명에서 제외"],
  ["양배추 착즙", "음료/착즙 완제품이라 출시 재료 대표명에서 제외"],
  ["양파즙", "음료로 소비되는 완제품이라 출시 재료 대표명에서 제외"],
  ["오렌지 음료", "음료로 소비되는 완제품이라 출시 재료 대표명에서 제외"],
  ["오렌지 주스", "음료로 소비되는 완제품이라 출시 재료 대표명에서 제외"],
  ["오렌지 착즙", "음료/착즙 완제품이라 출시 재료 대표명에서 제외"],
  ["자몽 주스", "음료로 소비되는 완제품이라 출시 재료 대표명에서 제외"],
  ["자몽 착즙", "음료/착즙 완제품이라 출시 재료 대표명에서 제외"],
  ["참외 착즙", "음료/착즙 완제품이라 출시 재료 대표명에서 제외"],
  ["칡즙", "음료로 소비되는 완제품이라 출시 재료 대표명에서 제외"],
  ["케일 착즙", "음료/착즙 완제품이라 출시 재료 대표명에서 제외"],
  ["크랜베리 주스", "음료로 소비되는 완제품이라 출시 재료 대표명에서 제외"],
  ["키위 주스", "음료로 소비되는 완제품이라 출시 재료 대표명에서 제외"],
  ["토마토 음료", "음료로 소비되는 완제품이라 출시 재료 대표명에서 제외"],
  ["토마토 주스", "음료로 소비되는 완제품이라 출시 재료 대표명에서 제외"],
  ["토마토 착즙", "음료/착즙 완제품이라 출시 재료 대표명에서 제외"],
  ["파인애플 주스", "음료로 소비되는 완제품이라 출시 재료 대표명에서 제외"],
  ["파인애플 착즙", "음료/착즙 완제품이라 출시 재료 대표명에서 제외"],
  ["파프리카 착즙", "음료/착즙 완제품이라 출시 재료 대표명에서 제외"],
  ["포도 음료", "음료로 소비되는 완제품이라 출시 재료 대표명에서 제외"],
  ["포도 주스", "음료로 소비되는 완제품이라 출시 재료 대표명에서 제외"],
  ["포도 착즙", "음료/착즙 완제품이라 출시 재료 대표명에서 제외"],
  ["포도즙", "음료로 소비되는 완제품이라 출시 재료 대표명에서 제외"],
  ["호박즙", "음료로 소비되는 완제품이라 출시 재료 대표명에서 제외"],
  ["때죽", "완성 죽류라 재료 대표명에서 제외"],
  ["멥쌀밥", "완성 밥류라 재료 대표명에서 제외"],
  ["수수떡", "완성 떡류라 재료 대표명에서 제외"],
  ["옥수수 샐러드", "완성 반찬/샐러드라 재료 대표명에서 제외"],
  ["잣죽", "완성 죽류라 재료 대표명에서 제외"],
  ["즉석밥", "완성 밥류라 재료 대표명에서 제외"],
  ["참깨죽", "완성 죽류라 재료 대표명에서 제외"],
  ["찹쌀빵", "완성 빵류라 재료 대표명에서 제외"],
  ["건빵", "완성 간식류라 재료 대표명에서 제외"],
  ["뻥튀기", "완성 간식류라 재료 대표명에서 제외"],
  ["튀밥", "완성 간식류라 재료 대표명에서 제외"],
  ["꿀떡", "완성 떡류라 재료 대표명에서 제외"],
  ["시루떡", "완성 떡류라 재료 대표명에서 제외"],
  ["건포도빵", "완성 빵류라 재료 대표명에서 제외"],
  ["마늘빵", "완성 빵류라 재료 대표명에서 제외"],
  ["모카빵", "완성 빵류라 재료 대표명에서 제외"],
  ["붕어빵", "완성 간식류라 재료 대표명에서 제외"],
  ["소시지빵", "완성 빵류라 재료 대표명에서 제외"],
  ["옥수수빵", "완성 빵류라 재료 대표명에서 제외"],
  ["와플", "완성 간식류라 재료 대표명에서 제외"],
  ["찐빵", "완성 빵류라 재료 대표명에서 제외"],
  ["크로켓", "완성 음식이라 재료 대표명에서 제외"],
  ["크루아상", "완성 빵류라 재료 대표명에서 제외"],
  ["크림빵", "완성 빵류라 재료 대표명에서 제외"],
  ["팥빵", "완성 빵류라 재료 대표명에서 제외"],
  ["페이스트리", "완성 빵류라 재료 대표명에서 제외"],
  ["강냉이", "완성 간식류라 재료 대표명에서 제외"],
  ["팝콘", "완성 간식류라 재료 대표명에서 제외"],
  ["호떡", "완성 간식류라 재료 대표명에서 제외"],
]);

const CURATED_RENAMES = new Map([
  ["레몬 착즙", { rename_to: "레몬즙", reason: "라임즙과 같은 표기 기준으로 착즙명을 레몬즙으로 정리" }],
  ["멥쌀밥", { rename_to: "쌀밥", reason: "대표 재료에서 멥쌀 표현을 쌀 기준으로 정리" }],
]);

const PRACTICAL_KEEP_NAMES = new Set([
  "가래떡",
  "김치",
  "라면",
  "라면 건더기 스프",
  "라면 스프",
  "라임즙",
  "레몬 착즙",
  "배즙",
  "모닝빵",
  "바게트",
  "베이글",
  "비스킷",
  "마시멜로",
  "밀떡",
  "부침가루",
  "빵가루",
  "사과 주스",
  "새우젓",
  "소면",
  "샐러드 드레싱",
  "식빵",
  "액젓",
  "양파즙",
  "젓갈",
  "찹쌀떡",
  "또띠아",
  "오렌지 주스",
  "즉석밥",
  "콘샐러드",
  "쿠키",
  "크래커",
  "크랜베리 주스",
  "토마토 주스",
  "튀김가루",
  "팬케이크가루",
  "파인애플 주스",
  "호밀빵",
]);

const PRACTICAL_KEEP_PATTERNS = [
  /김치$/,
  /깍두기$/,
  /동치미$/,
  /단무지$/,
  /쌈무$/,
  /치킨무$/,
  /젓갈$/,
  /액젓$/,
  /가루$/,
  /밀가루$/,
  /소스$/,
  /장$/,
  /스프$/,
  /치즈$/,
  /식빵$/,
  /바게트$/,
  /베이글$/,
  /또띠아$/,
  /빵가루$/,
  /라면$/,
  /누룽지$/,
  /김$/,
  /당면$/,
  /면$/,
];

const NEEDS_REVIEW_PATTERNS = [
  /주스$/,
  /착즙$/,
  /음료$/,
  /즙$/,
  /빵$/,
  /떡$/,
  /죽$/,
  /밥$/,
  /샐러드$/,
  /튀김$/,
  /과자$/,
  /사탕$/,
  /케이크$/,
  /파이$/,
  /도넛$/,
  /샌드$/,
  /와플$/,
  /크로켓$/,
  /크루아상$/,
  /페이스트리$/,
  /마시멜로$/,
  /팝콘$/,
  /뻥튀기$/,
  /튀밥$/,
  /강냉이$/,
  /건빵$/,
  /즉석밥$/,
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

function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
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

function appendNote(existingNote, note) {
  const existing = stringOrNull(existingNote);

  if (!existing) return note;
  if (existing.includes(note)) return existing;

  return `${existing} | ${note}`;
}

function classifyCanonical(row) {
  const standardName = normalizeName(row.standard_name);
  if (PRACTICAL_KEEP_NAMES.has(standardName)) {
    return { action: "keep", reason: "실제 조리 재료로 자주 쓰는 구체 대표명" };
  }

  const excludeReason = AUTO_EXCLUDE_CANONICAL_REASONS.get(standardName);
  if (excludeReason) return { action: "exclude", reason: excludeReason };

  if (PRACTICAL_KEEP_PATTERNS.some((pattern) => pattern.test(standardName))) {
    return { action: "keep", reason: "실제 조리 재료로 쓰일 가능성이 높은 구체 대표명" };
  }

  if (NEEDS_REVIEW_PATTERNS.some((pattern) => pattern.test(standardName))) {
    return { action: "review", reason: "완제품/음료/간식명일 수 있어 수동 판단 필요" };
  }

  return { action: "keep", reason: "medium flag는 있으나 명확한 제외 근거가 없음" };
}

function summarize(decisions, reviewSummary) {
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
    medium_risk_review: reviewSummary,
  };
}

function renderMarkdown({
  generatedAt,
  inputPath,
  reviewSummary,
  excludedCanonicalRows,
  excludedSynonymRows,
  keptRows,
  renamedRows,
  reviewRows,
}) {
  return `# Medium 리스크 1차 리뷰

- 생성: ${generatedAt}
- 입력: ${inputPath}
- 자동 제외 대표 재료: ${reviewSummary.auto_excluded_canonical_count}개
- 자동 제외 동의어: ${reviewSummary.auto_excluded_synonym_count}개
- 자동 유지 대표 재료: ${reviewSummary.auto_kept_canonical_count}개
- 자동 이름 정리 대표 재료: ${reviewSummary.auto_renamed_canonical_count}개
- 확인 필요 대표 재료: ${reviewSummary.needs_user_review_count}개

## 자동 제외

${markdownTable(excludedCanonicalRows, [
  { label: "대표명", value: (row) => row.standard_name },
  { label: "분류", value: (row) => row.category },
  { label: "이유", value: (row) => row.medium_review_reason },
])}

## 자동 제외된 동의어

${markdownTable(excludedSynonymRows, [
  { label: "대표명", value: (row) => row.standard_name },
  { label: "동의어", value: (row) => row.synonym },
  { label: "이유", value: (row) => row.medium_review_reason },
])}

## 자동 이름 정리

${markdownTable(renamedRows, [
  { label: "원래 대표명", value: (row) => row.standard_name },
  { label: "등록 대표명", value: (row) => row.rename_to },
  { label: "분류", value: (row) => row.category },
  { label: "이유", value: (row) => row.medium_review_reason },
])}

## 확인 필요

${markdownTable(reviewRows, [
  { label: "대표명", value: (row) => row.standard_name },
  { label: "분류", value: (row) => row.category },
  { label: "이유", value: (row) => row.medium_review_reason },
])}

## 자동 유지 샘플

${markdownTable(keptRows.slice(0, 60), [
  { label: "대표명", value: (row) => row.standard_name },
  { label: "분류", value: (row) => row.category },
  { label: "이유", value: (row) => row.medium_review_reason },
])}
`;
}

function markdownTable(rows, columns) {
  if (rows.length === 0) return "없음\n";

  return [
    `| ${columns.map((column) => column.label).join(" | ")} |`,
    `| ${columns.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${columns.map((column) => markdownCell(column.value(row))).join(" | ")} |`),
    "",
  ].join("\n");
}

function markdownCell(value) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ");
}

function toTsv(rows, columns) {
  const lines = [columns.map((column) => column.key).join("\t")];

  for (const row of rows) {
    lines.push(
      columns
        .map((column) =>
          String(column.value(row) ?? "")
            .replace(/\t/g, " ")
            .replace(/\r?\n/g, " "),
        )
        .join("\t"),
    );
  }

  return `${lines.join("\n")}\n`;
}

function reviewMediumRisks(decisions, generatedAt) {
  const excludedCanonicalRows = [];
  const excludedSynonymRows = [];
  const keptRows = [];
  const renamedRows = [];
  const reviewRows = [];
  const excludedCanonicalNames = new Map();

  const firstPass = decisions.map((row) => {
    if (row.type !== "canonical" || row.decision !== "approve") return row;

    const rename = CURATED_RENAMES.get(normalizeName(row.standard_name));
    if (rename) {
      const renamed = {
        ...row,
        decision: "rename",
        rename_to: rename.rename_to,
        notes: appendNote(row.notes, `medium-risk-review: ${rename.reason}`),
        updated_at: generatedAt,
        medium_review_action: "rename",
        medium_review_reason: rename.reason,
      };
      renamedRows.push(renamed);
      return renamed;
    }

    const classification = classifyCanonical(row);
    const reviewed = {
      ...row,
      medium_review_action: classification.action,
      medium_review_reason: classification.reason,
    };

    if (classification.action === "exclude") {
      excludedCanonicalNames.set(normalizeName(row.standard_name), classification.reason);
      const excluded = {
        ...reviewed,
        decision: "exclude",
        notes: appendNote(row.notes, `medium-risk-review: ${classification.reason}`),
        updated_at: generatedAt,
      };
      excludedCanonicalRows.push(excluded);
      return excluded;
    }

    if (classification.action === "review") {
      reviewRows.push(reviewed);
      return reviewed;
    }

    keptRows.push(reviewed);
    return reviewed;
  });

  const secondPass = firstPass.map((row) => {
    if (row.type !== "synonym" || row.decision !== "approve") return row;

    const excludedTargetReason = excludedCanonicalNames.get(normalizeName(row.standard_name));
    if (!excludedTargetReason) return row;

    const excluded = {
      ...row,
      decision: "exclude",
      notes: appendNote(row.notes, `medium-risk-review: 제외된 대표 재료(${row.standard_name})에 연결된 동의어라 함께 제외`),
      updated_at: generatedAt,
      medium_review_action: "exclude",
      medium_review_reason: excludedTargetReason,
    };
    excludedSynonymRows.push(excluded);
    return excluded;
  });

  const reviewSummary = {
    auto_excluded_canonical_count: excludedCanonicalRows.length,
    auto_excluded_synonym_count: excludedSynonymRows.length,
    auto_kept_canonical_count: keptRows.length,
    auto_renamed_canonical_count: renamedRows.length,
    needs_user_review_count: reviewRows.length,
  };

  return {
    decisions: secondPass,
    reviewSummary,
    excludedCanonicalRows,
    excludedSynonymRows,
    keptRows,
    renamedRows,
    reviewRows,
  };
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const inputPath = stringOrNull(args.input);
  const outputPath = stringOrNull(args.output);
  const reviewDir = stringOrNull(args["review-dir"]);
  const generatedAt = stringOrNull(args["generated-at"]) ?? new Date().toISOString();

  if (!inputPath || !outputPath || !reviewDir) {
    console.error(
      "Usage: node scripts/external-ingredient-medium-risk-review.mjs --input <fixed.json> --output <reviewed.json> --review-dir <dir> [--generated-at <iso>]",
    );
    process.exitCode = 1;
    return;
  }

  const payload = normalizePayload(JSON.parse(await readFile(inputPath, "utf8")));
  const review = reviewMediumRisks(payload.decisions, generatedAt);
  const output = {
    ...payload,
    generated_at: generatedAt,
    source_decision_file: inputPath,
    normalization_note: appendNote(
      payload.normalization_note,
      "medium-risk-review: 명확한 완제품/넓은 대표어를 제외하고 확인 필요 항목을 별도 리포트로 분리",
    ),
    decisions: review.decisions,
    summary: {
      ...(payload.summary ?? {}),
      ...summarize(review.decisions, review.reviewSummary),
    },
  };

  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  await mkdir(reviewDir, { recursive: true });
  await writeFile(
    path.join(reviewDir, "medium-risk-review-report.json"),
    `${JSON.stringify(
      {
        generated_at: generatedAt,
        input_file: inputPath,
        summary: review.reviewSummary,
        auto_excluded_canonical: review.excludedCanonicalRows,
        auto_excluded_synonyms: review.excludedSynonymRows,
        auto_kept_canonical: review.keptRows,
        auto_renamed_canonical: review.renamedRows,
        needs_user_review: review.reviewRows,
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    path.join(reviewDir, "medium-risk-review-report.md"),
    renderMarkdown({
      generatedAt,
      inputPath,
      reviewSummary: review.reviewSummary,
      excludedCanonicalRows: review.excludedCanonicalRows,
      excludedSynonymRows: review.excludedSynonymRows,
      keptRows: review.keptRows,
      renamedRows: review.renamedRows,
      reviewRows: review.reviewRows,
    }),
  );
  await writeFile(
    path.join(reviewDir, "medium-risk-needs-review.tsv"),
    toTsv(review.reviewRows, [
      { key: "standard_name", value: (row) => row.standard_name },
      { key: "category", value: (row) => row.category },
      { key: "reason", value: (row) => row.medium_review_reason },
      { key: "notes", value: (row) => row.notes },
    ]),
  );

  process.stdout.write(`Wrote ${outputPath}\n`);
  process.stdout.write(`Wrote ${path.join(reviewDir, "medium-risk-review-report.md")}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
