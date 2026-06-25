#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const STATE_OR_FORM_PATTERN =
  /^(생것|삶은것|데친것|말린것|건조|건조한것|볶은것|튀긴것|구운것|끓인것|찐것|조리됨|조리한것|깐것|다진것|분말|가루|도정|냉동|냉장|불린것|액상|통조림|젓갈|껍질 포함|껍질포함|해당없음|해당 없음)$/;
const BROAD_OR_PROCESSED_PATTERN = /기타|가공품|가공 식품|제품|혼합|부산물|분말제품|식품$/;
const BODY_PART_PATTERN =
  /^(등심|안심|목심|목살|앞다리|뒷다리|다리|가슴|날개|갈비|사태|양지|우둔|설도|삼겹살|채끝|어깨|간|심장|위|허파|콩팥|신장|대장|소장|막창|곱창|모래주머니|선지|골|혀|족|머리|꼬리|껍질|뼈|줄기|잎|뿌리)$/;
const ATTRIBUTE_OR_VARIETY_PATTERN =
  /^(한우|육우|젖소|토종|재래종|수입산|국산|살코기|식물성|배지재배|노지|시설재배|녹색|적색|붉은색|검은색|흰색|백색|흑색|노란색|황색|자색|갈색|검은콩|백미|현미|밥|죽|떡|국|탕|찌개|전|튀김|구이|볶음|너겟)$/;
const MEAT_BASE_NAME_PATTERN =
  /^(소고기|돼지고기|닭고기|오리고기|양고기|어린양고기|염소고기|송아지고기|말고기|토끼고기|거위고기|꿩고기|칠면조고기)$/;
const MEAT_CUT_PATTERN = /^(등심|안심|목심|목살|앞다리|뒷다리|다리|가슴|날개|갈비|사태|양지|우둔|설도|삼겹살|채끝|어깨)$/;
const NOTABLE_MEAT_SUBCUT_PATTERN =
  /^(살치살|부채살|토시살|안창살|제비추리|치마살|앞치마살|업진살|꾸리살|홍두깨살|보섭살|설깃살|도가니살)$/;
const SERVICE_MEAT_BASE_NAME_ALIASES = new Map([["어린양고기", "양고기"]]);

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

    args[key] = nextToken;
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

function stableHash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

function unique(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined && value !== ""))];
}

function countBy(values) {
  const counts = {};

  for (const value of values) {
    if (!value) continue;
    counts[value] = (counts[value] ?? 0) + 1;
  }

  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right, "ko-KR")));
}

function mostFrequent(values, fallback = null) {
  const counts = new Map();

  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return (
    [...counts.entries()].sort((left, right) => {
      if (right[1] !== left[1]) return right[1] - left[1];
      if (left[0].length !== right[0].length) return left[0].length - right[0].length;

      return left[0].localeCompare(right[0], "ko-KR");
    })[0]?.[0] ?? fallback
  );
}

function sourceRowId(candidate) {
  return stringOrNull(candidate.source_row_id) ?? `row:${candidate.row_index ?? "unknown"}`;
}

function rawFoodName(candidate) {
  const rawPayload = isRecord(candidate.raw_payload) ? candidate.raw_payload : {};
  const rawPublicData = isRecord(rawPayload.raw_public_data_xml_item)
    ? rawPayload.raw_public_data_xml_item
    : {};

  return (
    stringOrNull(rawPayload.fdNm) ??
    stringOrNull(rawPayload.food_Nm) ??
    stringOrNull(rawPayload.FOOD_NM) ??
    stringOrNull(rawPublicData.food_Nm) ??
    stringOrNull(candidate.original_name) ??
    stringOrNull(candidate.normalized_name) ??
    ""
  );
}

function rawFoodNameParts(value) {
  return String(value ?? "")
    .split(/[,，]/)
    .map((rawPart) => {
      const parentheticalParts = [...rawPart.matchAll(/\(([^)]*)\)|\[([^\]]*)\]|【([^】]*)】/g)]
        .flatMap((match) => String(match[1] ?? match[2] ?? match[3] ?? "").split(/[·ㆍ_/]+/))
        .map(normalizeName)
        .filter(Boolean);

      return {
        name: normalizeName(rawPart),
        parentheticalParts,
      };
    })
    .filter((part) => part.name || part.parentheticalParts.length > 0);
}

function isMeatCandidate(candidate) {
  const rawPayload = isRecord(candidate.raw_payload) ? candidate.raw_payload : {};

  return (
    candidate.category_candidate?.label === "육류" ||
    stringOrNull(rawPayload.fdGrupp) === "I" ||
    stringOrNull(rawPayload.fdGruppNm)?.includes("육류")
  );
}

function serviceMeatBaseName(value) {
  return SERVICE_MEAT_BASE_NAME_ALIASES.get(value) ?? value;
}

function canonicalStandardNameForCandidate(candidate) {
  const fallbackName = stringOrNull(candidate.normalized_name) ?? normalizeName(rawFoodName(candidate));
  if (!fallbackName || !isMeatCandidate(candidate)) return fallbackName;

  const rawParts = aliasPartsFromRawName(rawFoodName(candidate));
  const baseIndex = rawParts.findIndex((part) => MEAT_BASE_NAME_PATTERN.test(part));
  const rawBaseName =
    baseIndex >= 0 ? rawParts[baseIndex] : MEAT_BASE_NAME_PATTERN.test(fallbackName) ? fallbackName : null;
  const baseName = rawBaseName ? serviceMeatBaseName(rawBaseName) : null;

  if (!baseName) return fallbackName;

  const rawStructuredParts = rawFoodNameParts(rawFoodName(candidate));
  const cutSearchStart = Math.max(baseIndex + 1, 0);
  const notableSubcut = rawStructuredParts
    .slice(cutSearchStart)
    .flatMap((part) => part.parentheticalParts)
    .find((part) => NOTABLE_MEAT_SUBCUT_PATTERN.test(part));
  const cutName =
    notableSubcut ?? rawParts.slice(cutSearchStart).find((part) => MEAT_CUT_PATTERN.test(part));

  return cutName ? `${baseName} ${cutName}` : baseName;
}

function canonicalFoldedNameForCandidate(candidate) {
  return foldName(canonicalStandardNameForCandidate(candidate));
}

function isCanonicalNameComponent({ alias, standardName }) {
  const aliasFolded = foldName(serviceMeatBaseName(alias));
  if (!aliasFolded) return false;

  return standardName.split(/\s+/).some((part) => foldName(part) === aliasFolded);
}

function sourceFingerprint(candidate) {
  return stringOrNull(candidate.source_fingerprint) ?? stableHash(candidate);
}

function sortByName(left, right) {
  return left.standard_name.localeCompare(right.standard_name, "ko-KR");
}

function candidateSortValue(candidate) {
  return [
    stringOrNull(candidate.normalized_name) ?? "",
    String(candidate.row_index ?? ""),
    sourceFingerprint(candidate),
  ].join(":");
}

function groupCandidates(candidates) {
  const groups = new Map();

  for (const candidate of candidates) {
    const foldedName = canonicalFoldedNameForCandidate(candidate);
    if (!foldedName) continue;

    groups.set(foldedName, [...(groups.get(foldedName) ?? []), candidate]);
  }

  return [...groups.entries()]
    .map(([foldedName, rows]) => ({ foldedName, rows }))
    .sort((left, right) => {
      const leftName = mostFrequent(left.rows.map(canonicalStandardNameForCandidate), left.foldedName);
      const rightName = mostFrequent(right.rows.map(canonicalStandardNameForCandidate), right.foldedName);

      return leftName.localeCompare(rightName, "ko-KR");
    });
}

function riskFlagsForStandardName(standardName) {
  const flags = [];

  if (BROAD_OR_PROCESSED_PATTERN.test(standardName)) {
    flags.push("broad_or_processed_name");
  }

  if (STATE_OR_FORM_PATTERN.test(standardName)) {
    flags.push("state_or_form_name");
  }

  if (BODY_PART_PATTERN.test(standardName)) {
    flags.push("body_part_name");
  }

  return flags;
}

function representativeForGroup(rows, standardName) {
  return [...rows]
    .sort((left, right) => {
      const leftExact = canonicalStandardNameForCandidate(left) === standardName ? 0 : 1;
      const rightExact = canonicalStandardNameForCandidate(right) === standardName ? 0 : 1;
      if (leftExact !== rightExact) return leftExact - rightExact;

      return candidateSortValue(left).localeCompare(candidateSortValue(right), "ko-KR");
    })[0];
}

function buildCanonicalCandidate(group) {
  const standardName = mostFrequent(
    group.rows.map(canonicalStandardNameForCandidate),
    group.foldedName,
  );
  const representative = representativeForGroup(group.rows, standardName);
  const category = mostFrequent(
    group.rows.map((candidate) => candidate.category_candidate?.label),
    representative.category_candidate?.label ?? "기타",
  );
  const riskFlags = riskFlagsForStandardName(standardName);
  const rawNames = unique(group.rows.map(rawFoodName));

  return {
    review_id: `canonical:${group.foldedName}`,
    review_status: "pending_review",
    suggested_action: riskFlags.length > 0 ? "review_before_insert" : "candidate_insert",
    standard_name: standardName,
    folded_name: group.foldedName,
    category,
    category_confidence: representative.category_candidate?.confidence ?? "unknown",
    source_count: group.rows.length,
    duplicate_source_count: Math.max(0, group.rows.length - 1),
    source_system_counts: countBy(group.rows.map((candidate) => candidate.source_system)),
    source_row_ids_sample: unique(group.rows.map(sourceRowId)).slice(0, 10),
    source_fingerprints_sample: unique(group.rows.map(sourceFingerprint)).slice(0, 10),
    representative_source_fingerprint: sourceFingerprint(representative),
    sample_original_names: unique(group.rows.map((candidate) => stringOrNull(candidate.original_name))).slice(0, 10),
    sample_raw_names: rawNames.slice(0, 10),
    risk_flags: riskFlags,
    reviewer_notes: "",
  };
}

function aliasPartsFromRawName(value) {
  return String(value ?? "")
    .split(/[,，]/)
    .map(normalizeName)
    .filter(Boolean);
}

function classifyAlias({ alias, standardName }) {
  const aliasFolded = foldName(alias);

  if (!aliasFolded || aliasFolded === foldName(standardName)) {
    return { status: "skip_same_as_standard", risk_flags: [] };
  }

  if (STATE_OR_FORM_PATTERN.test(alias)) {
    return { status: "exclude_state_or_form", risk_flags: ["state_or_form_alias"] };
  }

  if (BODY_PART_PATTERN.test(alias)) {
    return { status: "exclude_body_part", risk_flags: ["body_part_alias"] };
  }

  if (alias === "갓" && /버섯/.test(standardName)) {
    return { status: "exclude_body_part", risk_flags: ["body_part_alias"] };
  }

  if (ATTRIBUTE_OR_VARIETY_PATTERN.test(alias)) {
    return { status: "exclude_attribute_or_variety", risk_flags: ["attribute_or_variety_alias"] };
  }

  if (BROAD_OR_PROCESSED_PATTERN.test(alias)) {
    return { status: "exclude_broad_or_processed", risk_flags: ["broad_or_processed_alias"] };
  }

  return { status: "candidate", risk_flags: [] };
}

function buildSynonymAndHeldRows({ group, canonicalCandidate, representativeFingerprint }) {
  const synonymByKey = new Map();
  const heldRows = [];
  const standardName = canonicalCandidate.standard_name;

  function upsertSynonymCandidate({ alias, candidate = null, reasonCode, riskFlags = [] }) {
    const synonymKey = `${foldName(standardName)}:${foldName(alias)}`;
    const existing = synonymByKey.get(synonymKey);
    const sourceFingerprints = candidate
      ? [sourceFingerprint(candidate)]
      : canonicalCandidate.source_fingerprints_sample.slice(0, 1);
    const sourceRowIds = candidate ? [sourceRowId(candidate)] : canonicalCandidate.source_row_ids_sample.slice(0, 1);
    const sampleRawNames = candidate ? [rawFoodName(candidate)] : canonicalCandidate.sample_raw_names.slice(0, 1);

    synonymByKey.set(synonymKey, {
      review_id: `synonym:${synonymKey}`,
      review_status: "pending_review",
      standard_name: standardName,
      synonym: alias,
      category: canonicalCandidate.category,
      reason_code: reasonCode,
      source_count: (existing?.source_count ?? 0) + 1,
      source_fingerprints_sample: unique([...(existing?.source_fingerprints_sample ?? []), ...sourceFingerprints]).slice(
        0,
        10,
      ),
      source_row_ids_sample: unique([...(existing?.source_row_ids_sample ?? []), ...sourceRowIds]).slice(0, 10),
      sample_raw_names: unique([...(existing?.sample_raw_names ?? []), ...sampleRawNames]).slice(0, 10),
      risk_flags: unique([...(existing?.risk_flags ?? []), ...riskFlags]),
      reviewer_notes: "",
    });
  }

  for (const candidate of group.rows) {
    if (sourceFingerprint(candidate) !== representativeFingerprint) {
      heldRows.push({
        status: "held_duplicate_source_row",
        standard_name: standardName,
        normalized_name: candidate.normalized_name,
        source_fingerprint: sourceFingerprint(candidate),
        source_row_id: sourceRowId(candidate),
        source_system: candidate.source_system,
        reason_codes: ["duplicate_cluster_source_row"],
        raw_name: rawFoodName(candidate),
      });
    }

    for (const alias of aliasPartsFromRawName(rawFoodName(candidate))) {
      if (isCanonicalNameComponent({ alias, standardName })) continue;

      const classification = classifyAlias({ alias, standardName });

      if (classification.status === "skip_same_as_standard") continue;

      if (classification.status !== "candidate") {
        heldRows.push({
          status: "synonym_excluded_by_rule",
          standard_name: standardName,
          synonym: alias,
          source_fingerprint: sourceFingerprint(candidate),
          source_row_id: sourceRowId(candidate),
          reason_codes: [classification.status],
          risk_flags: classification.risk_flags,
          raw_name: rawFoodName(candidate),
        });
        continue;
      }

      upsertSynonymCandidate({
        alias,
        candidate,
        reasonCode: "raw_rda_alias_part",
      });
    }
  }

  for (const alias of serviceSynonymsForStandardName(standardName)) {
    upsertSynonymCandidate({
      alias,
      reasonCode: "service_lamb_alias",
    });
  }

  return {
    synonyms: [...synonymByKey.values()].sort((left, right) => {
      const byStandard = left.standard_name.localeCompare(right.standard_name, "ko-KR");
      if (byStandard !== 0) return byStandard;

      return left.synonym.localeCompare(right.synonym, "ko-KR");
    }),
    heldRows,
  };
}

function serviceSynonymsForStandardName(standardName) {
  if (standardName === "양고기") {
    return ["어린양고기", "램"];
  }

  if (!standardName.startsWith("양고기 ")) {
    return [];
  }

  const cutName = standardName.replace(/^양고기\s+/, "");
  const aliases = [`어린양고기 ${cutName}`];

  if (cutName === "갈비") {
    aliases.push("램갈비");
  }

  return aliases;
}

function buildReviewPack(report, generatedAt) {
  const candidates = Array.isArray(report.candidates) ? report.candidates : [];
  const groups = groupCandidates(candidates);
  const canonicalCandidates = [];
  const synonymCandidates = [];
  const heldRows = [];

  for (const group of groups) {
    const canonicalCandidate = buildCanonicalCandidate(group);
    canonicalCandidates.push(canonicalCandidate);

    const { synonyms, heldRows: groupHeldRows } = buildSynonymAndHeldRows({
      group,
      canonicalCandidate,
      representativeFingerprint: canonicalCandidate.representative_source_fingerprint,
    });
    synonymCandidates.push(...synonyms);
    heldRows.push(...groupHeldRows);
  }

  const categoryCounts = countBy(canonicalCandidates.map((candidate) => candidate.category));
  const reviewBeforeInsertCount = canonicalCandidates.filter(
    (candidate) => candidate.suggested_action === "review_before_insert",
  ).length;
  const topDuplicateClusters = [...canonicalCandidates]
    .sort((left, right) => right.source_count - left.source_count || sortByName(left, right))
    .slice(0, 20)
    .map((candidate) => ({
      standard_name: candidate.standard_name,
      category: candidate.category,
      source_count: candidate.source_count,
      duplicate_source_count: candidate.duplicate_source_count,
      sample_raw_names: candidate.sample_raw_names.slice(0, 3),
    }));
  const sourceSummary = report.summary ?? {};
  const commonSummary = {
    source_report_batch_id: report.batch_id ?? null,
    source_candidate_count: sourceSummary.candidate_count ?? candidates.length,
    source_duplicate_count: sourceSummary.duplicate_count ?? null,
    canonical_candidate_count: canonicalCandidates.length,
    synonym_candidate_count: synonymCandidates.length,
    held_row_count: heldRows.length,
    review_before_insert_count: reviewBeforeInsertCount,
    category_counts: categoryCounts,
  };

  return {
    canonicalPack: {
      generated_at: generatedAt,
      source_report_batch_id: report.batch_id ?? null,
      summary: commonSummary,
      candidates: canonicalCandidates.sort(sortByName),
    },
    synonymPack: {
      generated_at: generatedAt,
      source_report_batch_id: report.batch_id ?? null,
      summary: {
        ...commonSummary,
        synonym_candidate_count: synonymCandidates.length,
      },
      candidates: synonymCandidates,
    },
    heldPack: {
      generated_at: generatedAt,
      source_report_batch_id: report.batch_id ?? null,
      summary: {
        ...commonSummary,
        held_row_count: heldRows.length,
        held_status_counts: countBy(heldRows.map((row) => row.status)),
      },
      rows: heldRows.sort((left, right) => {
        const byStatus = left.status.localeCompare(right.status, "ko-KR");
        if (byStatus !== 0) return byStatus;

        return left.standard_name.localeCompare(right.standard_name, "ko-KR");
      }),
    },
    summary: {
      ...commonSummary,
      top_duplicate_clusters: topDuplicateClusters,
    },
  };
}

function buildSummaryMarkdown(summary, outputFiles) {
  const categoryLines = Object.entries(summary.category_counts)
    .map(([category, count]) => `- ${category}: ${count}`)
    .join("\n");
  const topClusterLines = summary.top_duplicate_clusters
    .slice(0, 10)
    .map(
      (cluster, index) =>
        `${index + 1}. ${cluster.standard_name} (${cluster.category}) - source ${cluster.source_count}개`,
    )
    .join("\n");

  return [
    "# Launch Ingredient Candidate Review Pack",
    "",
    "## 요약",
    "",
    `- 원본 후보 row: ${summary.source_candidate_count}개`,
    `- 대표 재료 후보: ${summary.canonical_candidate_count}개`,
    `- 동의어 후보: ${summary.synonym_candidate_count}개`,
    `- 보류/제외 source row: ${summary.held_row_count}개`,
    `- 우선 수동 검토 필요 대표 후보: ${summary.review_before_insert_count}개`,
    "",
    "## 카테고리별 대표 후보",
    "",
    categoryLines,
    "",
    "## 중복 source가 많은 대표 후보 Top 10",
    "",
    topClusterLines,
    "",
    "## 검토 순서 제안",
    "",
    "1. canonical-ingredient-candidates.json에서 `suggested_action=review_before_insert` 항목을 먼저 확인한다.",
    "2. 같은 파일에서 `candidate_insert` 항목 중 서비스에 실제로 필요한 재료명을 승인한다.",
    "3. synonym-candidates.json은 같은 재료의 안전한 별칭만 승인한다.",
    "4. rejected-source-rows.json은 자동 삽입하지 않을 source row와 제외된 synonym 후보의 근거 확인용으로만 사용한다.",
    "",
    "## Output Files",
    "",
    `- Canonical candidates: ${outputFiles.canonicalPath}`,
    `- Synonym candidates: ${outputFiles.synonymPath}`,
    `- Held/rejected source rows: ${outputFiles.heldPath}`,
    `- Summary: ${outputFiles.summaryPath}`,
    "",
  ].join("\n");
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));

  if (args.help) {
    process.stdout.write(
      "Usage: pnpm external:ingredients:review-pack -- --candidate-report <candidate-report.json> [--output-dir <dir>] [--generated-at <iso>]\n",
    );

    return;
  }

  if (typeof args["candidate-report"] !== "string" || args["candidate-report"].trim().length === 0) {
    throw new Error("Missing required --candidate-report <candidate-report.json>.");
  }

  const candidateReportPath = args["candidate-report"];
  const generatedAt = typeof args["generated-at"] === "string" ? args["generated-at"] : new Date().toISOString();
  const outputDir =
    typeof args["output-dir"] === "string" && args["output-dir"].trim().length > 0
      ? args["output-dir"]
      : path.join(path.dirname(candidateReportPath), "review-pack");

  const report = JSON.parse(await readFile(candidateReportPath, "utf8"));
  const reviewPack = buildReviewPack(report, generatedAt);

  await mkdir(outputDir, { recursive: true });

  const outputFiles = {
    canonicalPath: path.join(outputDir, "canonical-ingredient-candidates.json"),
    synonymPath: path.join(outputDir, "synonym-candidates.json"),
    heldPath: path.join(outputDir, "rejected-source-rows.json"),
    summaryPath: path.join(outputDir, "candidate-review-summary.md"),
  };
  const summaryMarkdown = buildSummaryMarkdown(reviewPack.summary, outputFiles);

  await writeJson(outputFiles.canonicalPath, reviewPack.canonicalPack);
  await writeJson(outputFiles.synonymPath, reviewPack.synonymPack);
  await writeJson(outputFiles.heldPath, reviewPack.heldPack);
  await writeFile(outputFiles.summaryPath, summaryMarkdown);

  process.stdout.write(`${summaryMarkdown}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
