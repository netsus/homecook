import { createHash } from "node:crypto";

const NUTRIENTS = Object.freeze([
  { code: "energy_kcal", unit: "kcal" },
  { code: "carbohydrate_g", unit: "g" },
  { code: "protein_g", unit: "g" },
  { code: "fat_g", unit: "g" },
  { code: "saturated_fat_g", unit: "g" },
  { code: "sugars_g", unit: "g" },
  { code: "fiber_g", unit: "g" },
  { code: "sodium_mg", unit: "mg" },
]);

function fail(code) {
  throw new Error(code);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim() !== "";
}

function sha256(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function clone(value) {
  return structuredClone(value);
}

function validateBasis(basis) {
  if (
    !isRecord(basis) ||
    Number(basis.amount) !== 100 ||
    !["g", "ml"].includes(String(basis.unit).toLowerCase())
  ) {
    fail("INVALID_NUTRITION_BASIS");
  }
  return {
    amount: 100,
    unit: String(basis.unit).toLowerCase(),
    source_text: nonEmpty(basis.source_text)
      ? basis.source_text
      : `100${String(basis.unit).toLowerCase()}`,
  };
}

function validateValues(values) {
  if (!isRecord(values)) fail("INVALID_NUTRITION_VALUES");
  return Object.fromEntries(NUTRIENTS.map(({ code, unit }) => {
    const source = values[code];
    const normalized = isRecord(source) ? source : { amount: source };
    const amount = normalized.amount;
    if (amount !== null && (!Number.isFinite(Number(amount)) || Number(amount) < 0)) {
      fail("INVALID_NUTRITION_VALUES");
    }
    return [code, {
      amount: amount === null || amount === undefined ? null : Number(amount),
      unit,
      missing_reason: amount === null || amount === undefined
        ? String(normalized.missing_reason ?? "blank")
        : null,
      source_token: String(normalized.source_token ?? (amount ?? "")),
      source_nutrient_code: nonEmpty(normalized.source_nutrient_code)
        ? normalized.source_nutrient_code
        : code,
    }];
  }));
}

function validateSource(source) {
  if (
    !isRecord(source) ||
    !nonEmpty(source.provider_code) ||
    !nonEmpty(source.dataset_name) ||
    !nonEmpty(source.source_version) ||
    !nonEmpty(source.source_url) ||
    !nonEmpty(source.license_name) ||
    !Number.isInteger(Number(source.priority_rank)) ||
    Number(source.priority_rank) <= 0
  ) {
    fail("INVALID_NUTRITION_SOURCE");
  }
  return {
    provider_code: source.provider_code.trim(),
    provider_label: nonEmpty(source.provider_label)
      ? source.provider_label.trim()
      : source.provider_code.trim(),
    dataset_name: source.dataset_name.trim(),
    source_version: source.source_version.trim(),
    data_basis_date: nonEmpty(source.data_basis_date) ? source.data_basis_date : null,
    source_url: source.source_url.trim(),
    license_name: source.license_name.trim(),
    license_url: nonEmpty(source.license_url) ? source.license_url.trim() : null,
    priority_rank: Number(source.priority_rank),
  };
}

function buildEntry({ ingredient, resolutionKind, source, sourceItem, reason }) {
  if (
    !nonEmpty(ingredient?.ingredient_id) ||
    !nonEmpty(ingredient?.ingredient_name) ||
    !isRecord(sourceItem) ||
    !nonEmpty(sourceItem.external_item_key) ||
    !nonEmpty(sourceItem.external_name)
  ) {
    fail("INVALID_REVIEW_RESOLUTION");
  }
  const validatedSource = validateSource(source);
  const basis = validateBasis(sourceItem.basis);
  const values = validateValues(sourceItem.values);
  const preparationState = nonEmpty(sourceItem.preparation_state)
    ? sourceItem.preparation_state.trim()
    : "as_published";
  const fingerprintBase = {
    provider_code: validatedSource.provider_code,
    dataset_name: validatedSource.dataset_name,
    source_version: validatedSource.source_version,
    external_item_key: sourceItem.external_item_key.trim(),
    external_name: sourceItem.external_name.trim(),
    preparation_state: preparationState,
    basis,
    values,
  };
  const stableFingerprint = nonEmpty(sourceItem.fingerprint)
    ? sourceItem.fingerprint.trim()
    : sha256(fingerprintBase);
  return {
    ingredient_id: ingredient.ingredient_id,
    ingredient_name: ingredient.ingredient_name,
    resolution_kind: resolutionKind,
    preparation_state: preparationState,
    decision_reason: nonEmpty(reason) ? reason : "사용자 영양성분 검수 승인",
    source: validatedSource,
    source_item: {
      external_item_key: sourceItem.external_item_key.trim(),
      external_name: sourceItem.external_name.trim(),
      source_basis_text: basis.source_text,
      edible_portion_text: nonEmpty(sourceItem.edible_portion?.text)
        ? sourceItem.edible_portion.text
        : `검수된 ${basis.source_text} 기준 전체`,
      stable_fingerprint: stableFingerprint,
      content_hash: nonEmpty(sourceItem.content_hash)
        ? sourceItem.content_hash.trim()
        : sha256({ ...fingerprintBase, stable_fingerprint: stableFingerprint }),
      provenance: isRecord(sourceItem.provenance) ? clone(sourceItem.provenance) : {},
    },
    basis: { amount: 100, unit: basis.unit },
    values,
  };
}

function sourceRowKey(providerCode, externalItemKey) {
  return `${providerCode}::${externalItemKey}`;
}

function resolutionValues(values) {
  return validateValues(values);
}

function requiredIngredient(rows, ingredientId) {
  const row = rows.find((item) => item?.ingredient_id === ingredientId);
  if (!row) fail("MANUAL_RESOLUTION_UNKNOWN_INGREDIENT");
  return row;
}

function integratedProvider(stagedRow) {
  const origin = String(stagedRow?.srcNm ?? stagedRow?.insttNm ?? "K-FIND");
  if (origin.includes("수산과학원")) {
    return {
      provider_code: "NIFS_KFIND",
      provider_label: "국립수산과학원 · K-FIND 통합 DB",
      priority_rank: 1,
      origin_provider: origin,
    };
  }
  if (origin.includes("농촌진흥청") || origin.includes("식량과학원")) return null;
  return {
    provider_code: "K_FIND",
    provider_label: `${origin} · K-FIND 통합 DB`,
    priority_rank: 3,
    origin_provider: origin,
  };
}

export function collectNormalizedCandidateSourceRows({ bundles, snapshotDate }) {
  if (
    !Array.isArray(bundles) ||
    !nonEmpty(snapshotDate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate)
  ) {
    fail("INVALID_REVIEW_SOURCE_BUNDLES");
  }
  const result = [];
  const seen = new Map();
  for (const descriptor of bundles) {
    const bundle = descriptor?.bundle;
    if (
      !["rda", "integrated", "mfds"].includes(descriptor?.kind) ||
      !isRecord(bundle) ||
      !isRecord(bundle.source) ||
      !Array.isArray(bundle.rows)
    ) {
      fail("INVALID_REVIEW_SOURCE_BUNDLES");
    }
    const stagedByKey = new Map(
      (Array.isArray(bundle.staged_rows) ? bundle.staged_rows : [])
        .map((row) => [String(row.foodCd ?? ""), row]),
    );
    for (const row of bundle.rows) {
      let provider;
      if (descriptor.kind === "rda") {
        provider = {
          provider_code: "RDA_10_4",
          provider_label: "농촌진흥청 국가표준식품성분 DB 10.4",
          priority_rank: 2,
          origin_provider: String(bundle.source.provider ?? "농촌진흥청"),
        };
      } else if (descriptor.kind === "mfds") {
        provider = {
          provider_code: "MFDS",
          provider_label: "식품의약품안전처 식품영양성분DB정보",
          priority_rank: 1,
          origin_provider: String(bundle.source.provider ?? "식품의약품안전처"),
        };
      } else {
        provider = integratedProvider(stagedByKey.get(String(row.external_item_key)));
        if (provider === null) continue;
      }
      const sourceUrl = bundle.source.source_url ?? bundle.source.endpoint_or_file_url;
      const licenseName = bundle.source.license ?? bundle.source.license_name;
      if (!nonEmpty(sourceUrl) || !nonEmpty(licenseName)) {
        fail("INVALID_REVIEW_SOURCE_BUNDLES");
      }
      const sourceRow = {
        provider_code: provider.provider_code,
        source: {
          provider_code: provider.provider_code,
          provider_label: provider.provider_label,
          dataset_name: `${String(bundle.source.dataset)} 사용자 검수 스냅샷 ${snapshotDate}`,
          source_version: String(bundle.source.source_version),
          data_basis_date: nonEmpty(bundle.source.data_basis_date)
            ? bundle.source.data_basis_date
            : null,
          source_url: sourceUrl,
          license_name: licenseName,
          license_url: nonEmpty(bundle.source.license_url) ? bundle.source.license_url : null,
          priority_rank: provider.priority_rank,
        },
        source_item: {
          external_item_key: String(row.external_item_key),
          external_name: String(row.external_name),
          preparation_state: nonEmpty(row.preparation_state)
            ? row.preparation_state
            : "as_published",
          basis: clone(row.basis),
          edible_portion: isRecord(row.edible_portion)
            ? clone(row.edible_portion)
            : { text: `가식부 ${row.basis?.source_text ?? "100g"} 기준` },
          values: clone(row.values),
          fingerprint: String(row.fingerprint),
          content_hash: String(row.content_hash),
          provenance: {
            origin_provider: provider.origin_provider,
            origin_dataset: String(bundle.source.dataset),
            origin_external_name: String(row.external_name),
            origin_source_version: String(bundle.source.source_version),
          },
        },
      };
      const key = sourceRowKey(provider.provider_code, row.external_item_key);
      const previous = seen.get(key);
      if (previous !== undefined) {
        if (
          previous.source_item.fingerprint !== sourceRow.source_item.fingerprint ||
          previous.source_item.content_hash !== sourceRow.source_item.content_hash
        ) {
          fail("AMBIGUOUS_REVIEW_SOURCE_ROW");
        }
        continue;
      }
      seen.set(key, sourceRow);
      result.push(sourceRow);
    }
  }
  return result;
}

export function buildUserNutritionManualResolutions({ rows, sourceRows }) {
  if (!Array.isArray(rows) || !Array.isArray(sourceRows)) fail("INVALID_REVIEW_INPUT");
  const clam = requiredIngredient(rows, "b5474e80-2330-42dd-99a2-dd16fd0fbf34");
  const mushroom = requiredIngredient(rows, "d7f3be61-d96c-4bee-b83e-5d2632ea0ce3");
  const zest = requiredIngredient(rows, "b503761d-c935-4e19-b687-1ce24361a50c");
  const juice = requiredIngredient(rows, "d2e9328e-456c-4ebc-9bc0-3838a90ea588");
  const greekYogurt = requiredIngredient(rows, "9dc0ee0f-7aab-416b-8eb7-4447a8139b0e");
  const wholeWheatBread = requiredIngredient(rows, "335eff99-f04c-4942-adee-5aea91c32dd9");
  const mushroomSource = sourceRows.find((row) =>
    row?.provider_code === "MFDS" &&
    row?.source_item?.external_item_key === "P116-702070100-0427"
  );
  if (!mushroomSource) fail("APPROVED_SOURCE_ROW_NOT_FOUND");

  const clamValues = {
    ...clone(clam.current?.values ?? {}),
    sodium_mg: 557,
  };
  return [
    {
      ingredient_id: clam.ingredient_id,
      ingredient_name: clam.ingredient_name,
      resolution_kind: "manual_source",
      decision_reason: "기존 식약처 모시조개 성분을 유지하고 네이버 지식백과 100g당 나트륨 557mg을 사용자 검수로 추가",
      source: {
        provider_code: "HOMECOOK_REVIEW",
        provider_label: "집밥 사용자 검수 결합 출처",
        dataset_name: "모시조개 식약처·네이버 지식백과 결합 검수 2026-07-22",
        source_version: "2026-07-22",
        source_url: "https://terms.naver.com/entry.naver?docId=1993184&cid=48180&categoryId=48250",
        license_name: "출처별 이용조건 · 사용자 검수 결합",
        license_url: null,
        priority_rank: 1,
      },
      source_item: {
        external_item_key: "HOMECOOK-MOSIJOGAE-MFDS-NAVER-20260722",
        external_name: clam.ingredient_name,
        preparation_state: "as_published",
        basis: { amount: 100, unit: "g", source_text: "100g" },
        edible_portion: { text: "가식부 100g 기준" },
        values: resolutionValues(clamValues),
        provenance: {
          origin_provider: "식품의약품안전처 + 네이버 지식백과(쿡쿡TV)",
          origin_external_name: "백합류,모시조개,전체,생것",
          augmentation: "sodium_mg=557",
          accessed_at: "2026-07-22",
        },
      },
    },
    {
      ingredient_id: mushroom.ingredient_id,
      ingredient_name: mushroom.ingredient_name,
      resolution_kind: "manual_source",
      decision_reason: "사용자가 식약처 P116-702070100-0427 표시값을 새송이버섯 대표 성분으로 지정",
      source: {
        provider_code: "MFDS",
        provider_label: "식품의약품안전처 식품영양성분DB정보",
        dataset_name: "식품영양성분DB정보 사용자 지정 검수 스냅샷 2026-07-22",
        source_version: "2026-06-04",
        data_basis_date: "2026-06-04",
        source_url: "https://various.foodsafetykorea.go.kr/nutrient/general/food/detail.do?searchFoodCd=P116-702070100-0427",
        license_name: "공공데이터 이용정책 · 사용자 지정 항목",
        license_url: "https://www.foodsafetykorea.go.kr/",
        priority_rank: 1,
      },
      source_item: {
        ...clone(mushroomSource.source_item),
        provenance: {
          ...(isRecord(mushroomSource.source_item.provenance)
            ? clone(mushroomSource.source_item.provenance)
            : {}),
          origin_provider: "식품의약품안전처",
          origin_external_name: mushroomSource.source_item.external_name,
          item_report_number: "2024057732113",
          accessed_at: "2026-07-22",
        },
      },
    },
    {
      ingredient_id: zest.ingredient_id,
      ingredient_name: zest.ingredient_name,
      resolution_kind: "manual_source",
      decision_reason: "사용자가 LogiFoodCoach 오렌지 제스트 100g 영양값을 지정",
      source: {
        provider_code: "LOGIFOODCOACH",
        provider_label: "LogiFoodCoach",
        dataset_name: "오렌지 제스트 사용자 검수 스냅샷 2026-07-22",
        source_version: "2026-07-22",
        source_url: "https://logifoodcoach.com/database/ko/orange-zest/",
        license_name: "웹페이지 이용조건 · 사용자 검수",
        license_url: null,
        priority_rank: 3,
      },
      source_item: {
        external_item_key: "LOGIFOODCOACH-ORANGE-ZEST-20260722",
        external_name: "오렌지 제스트",
        preparation_state: "as_published",
        basis: { amount: 100, unit: "g", source_text: "100g" },
        edible_portion: { text: "오렌지 제스트 100g 기준" },
        values: resolutionValues({
          energy_kcal: 97,
          carbohydrate_g: 25,
          protein_g: 1.5,
          fat_g: 0.2,
          saturated_fat_g: 0.03,
          sugars_g: 1.7,
          fiber_g: 10.6,
          sodium_mg: 0,
        }),
        provenance: {
          origin_provider: "LogiFoodCoach",
          origin_external_name: "오렌지 제스트",
          accessed_at: "2026-07-22",
        },
      },
    },
    {
      ingredient_id: juice.ingredient_id,
      ingredient_name: juice.ingredient_name,
      resolution_kind: "manual_source",
      decision_reason: "사용자가 돈시몬 100% 오렌지 주스의 100ml 제품 표시값을 오렌지즙 대표 성분으로 지정",
      source: {
        provider_code: "DONSIMON_LABEL",
        provider_label: "돈시몬 제품 표시값",
        dataset_name: "돈시몬 오렌지 주스 사용자 검수 스냅샷 2026-07-22",
        source_version: "2026-07-22",
        source_url: "https://www.kurly.com/goods/5071454",
        license_name: "제품 표시정보 · 사용자 검수",
        license_url: null,
        priority_rank: 1,
      },
      source_item: {
        external_item_key: "DONSIMON-ORANGE-JUICE-100ML-20260722",
        external_name: "돈시몬 오렌지 주스",
        preparation_state: "as_published",
        basis: { amount: 100, unit: "ml", source_text: "100ml" },
        edible_portion: { text: "제품 100ml 기준" },
        values: resolutionValues({
          energy_kcal: 43,
          carbohydrate_g: 10,
          protein_g: 0.6,
          fat_g: 0.1,
          saturated_fat_g: 0,
          sugars_g: 10,
          fiber_g: null,
          sodium_mg: 10,
        }),
        provenance: {
          origin_provider: "돈시몬 제품 표시값",
          origin_external_name: "돈시몬 오렌지 주스",
          corroborating_source_url: "https://www.costco.co.kr/Foods/Beverages/Juice/Don-Simon-Orange-NFC-Juice-1L-x-12/p/688043",
          accessed_at: "2026-07-22",
        },
      },
    },
    {
      ingredient_id: greekYogurt.ingredient_id,
      ingredient_name: greekYogurt.ingredient_name,
      resolution_kind: "manual_source",
      decision_reason: "사용자가 컬리 그릭요거트 100g 영양값을 대표 성분으로 지정",
      source: {
        provider_code: "KURLY_FOOD_CALORIE",
        provider_label: "컬리 식재료 영양정보",
        dataset_name: "컬리 식재료 칼로리·영양성분 사용자 검수 스냅샷 2026-07-22",
        source_version: "2026-07-22",
        data_basis_date: "2026-07-22",
        source_url: "https://www.kurly.com/food-calorie/greek-yogurt-calories-nutrition-facts-and-diet-benefits/",
        license_name: "컬리 웹페이지 이용조건 · 사용자 검수",
        license_url: null,
        priority_rank: 2,
      },
      source_item: {
        external_item_key: "KURLY-GREEK-YOGURT-100G-20260722",
        external_name: "그릭 요거트",
        preparation_state: "as_published",
        basis: { amount: 100, unit: "g", source_text: "100g" },
        edible_portion: { text: "그릭요거트 100g 기준" },
        values: resolutionValues({
          energy_kcal: 117,
          carbohydrate_g: 5.04,
          protein_g: 4.05,
          fat_g: 9.19,
          saturated_fat_g: null,
          sugars_g: 4.62,
          fiber_g: 0,
          sodium_mg: null,
        }),
        provenance: {
          origin_provider: "컬리",
          origin_external_name: "그릭요거트",
          unavailable_nutrients: ["saturated_fat_g", "sodium_mg"],
          accessed_at: "2026-07-22",
        },
      },
    },
    {
      ingredient_id: wholeWheatBread.ingredient_id,
      ingredient_name: wholeWheatBread.ingredient_name,
      resolution_kind: "manual_source",
      decision_reason: "사용자가 컬리 통밀빵 100g 영양값을 통밀 식빵 대표 성분으로 지정",
      source: {
        provider_code: "KURLY_FOOD_CALORIE",
        provider_label: "컬리 식재료 영양정보",
        dataset_name: "컬리 식재료 칼로리·영양성분 사용자 검수 스냅샷 2026-07-22",
        source_version: "2026-07-22",
        data_basis_date: "2026-07-22",
        source_url: "https://www.kurly.com/food-calorie/whole-wheat-bread-calories-nutrition-facts-and-diet-benefits/",
        license_name: "컬리 웹페이지 이용조건 · 사용자 검수",
        license_url: null,
        priority_rank: 2,
      },
      source_item: {
        external_item_key: "KURLY-WHOLE-WHEAT-BREAD-100G-20260722",
        external_name: "통밀빵",
        preparation_state: "as_published",
        basis: { amount: 100, unit: "g", source_text: "100g" },
        edible_portion: { text: "통밀빵 100g 기준" },
        values: resolutionValues({
          energy_kcal: 259,
          carbohydrate_g: 47.14,
          protein_g: 9.13,
          fat_g: 4.11,
          saturated_fat_g: null,
          sugars_g: 5.49,
          fiber_g: 4.4,
          sodium_mg: null,
        }),
        provenance: {
          origin_provider: "컬리",
          origin_external_name: "통밀빵",
          unavailable_nutrients: ["saturated_fat_g", "sodium_mg"],
          accessed_at: "2026-07-22",
        },
      },
    },
  ];
}

function withSourceManifests(entries) {
  const grouped = new Map();
  for (const entry of entries) {
    const source = entry.source;
    const key = `${source.provider_code}::${source.dataset_name}::${source.source_version}`;
    const group = grouped.get(key) ?? [];
    group.push(entry);
    grouped.set(key, group);
  }
  for (const group of grouped.values()) {
    const manifest = sha256({
      schema_version: "homecook-reviewed-nutrition-source-v1",
      items: group
        .map((entry) => ({
          ingredient_id: entry.ingredient_id,
          external_item_key: entry.source_item.external_item_key,
          stable_fingerprint: entry.source_item.stable_fingerprint,
        }))
        .sort((left, right) => left.ingredient_id.localeCompare(right.ingredient_id)),
    });
    for (const entry of group) entry.source.manifest_sha256 = manifest;
  }
  return entries;
}

function candidateDisplay(entry) {
  return {
    provider_code: entry.source.provider_code,
    provider_label: entry.source.provider_label,
    provider_rank: entry.source.priority_rank,
    source_version: entry.source.source_version,
    external_item_key: entry.source_item.external_item_key,
    external_name: entry.source_item.external_name,
    source_state: entry.preparation_state,
    basis: entry.basis,
    values: Object.fromEntries(
      Object.entries(entry.values).map(([code, value]) => [code, value.amount]),
    ),
    improvement_codes: [],
    known_nutrient_count: Object.values(entry.values)
      .filter((value) => value.amount !== null).length,
    match_method: "human_review",
    match_score: 120,
  };
}

function buildFinalReport(report, entryByIngredient, decisionByIngredient, generatedAt) {
  const rows = report.rows.map((row) => {
    const entry = entryByIngredient.get(row.ingredient_id);
    const decision = decisionByIngredient.get(row.ingredient_id);
    if (entry !== undefined) {
      const candidate = candidateDisplay(entry);
      return {
        ...clone(row),
        classification: "approved_replacement",
        reason_codes: [entry.resolution_kind === "manual_source"
          ? "USER_APPROVED_MANUAL_SOURCE"
          : "USER_APPROVED_OFFICIAL_CANDIDATE"],
        candidate_count: 1,
        shown_candidate_count: 1,
        candidates: [candidate],
        review_decision: {
          decision: "approve_candidate",
          external_item_key: candidate.external_item_key,
          reason_code: entry.resolution_kind === "manual_source"
            ? "USER_APPROVED_MANUAL_SOURCE"
            : "USER_APPROVED_OFFICIAL_CANDIDATE",
        },
      };
    }
    if (decision?.decision === "keep_current") {
      return {
        ...clone(row),
        classification: "keep_current",
        reason_codes: ["USER_APPROVED_KEEP_CURRENT"],
        review_decision: {
          decision: "keep_current",
          external_item_key: decision.external_item_key ?? null,
          reason_code: "USER_APPROVED_KEEP_CURRENT",
        },
      };
    }
    return {
      ...clone(row),
      classification: "needs_review",
      reason_codes: ["USER_DEFERRED_PRODUCT_SPECIFIC_ITEM"],
      review_decision: {
        decision: "hold",
        external_item_key: decision?.external_item_key ?? null,
        reason_code: "USER_DEFERRED_PRODUCT_SPECIFIC_ITEM",
      },
    };
  });
  const classificationCounts = {
    approved_replacement: rows.filter((row) => row.classification === "approved_replacement").length,
    needs_review: rows.filter((row) => row.classification === "needs_review").length,
    keep_current: rows.filter((row) => row.classification === "keep_current").length,
    no_compatible_source: 0,
  };
  const checksumBase = {
    schema_version: "nutrition-gap-final-review-v1",
    source_report_checksum: report.report_checksum,
    rows,
  };
  return {
    ...checksumBase,
    generated_at: generatedAt,
    target_count: rows.length,
    classification_counts: classificationCounts,
    unclassified_count: 0,
    production_db_writes: 0,
    report_checksum: sha256(checksumBase),
  };
}

export function finalizeNutritionReview({
  report,
  reviewExport,
  sourceRows,
  manualResolutions,
  reviewedBy,
  reviewedAt,
}) {
  if (!isRecord(report) || !Array.isArray(report.rows) || !isRecord(reviewExport)) {
    fail("INVALID_REVIEW_INPUT");
  }
  if (report.report_checksum !== reviewExport.report_checksum) {
    fail("REVIEW_CHECKSUM_MISMATCH");
  }
  if (
    !isRecord(reviewExport.decisions) ||
    !Array.isArray(sourceRows) ||
    !Array.isArray(manualResolutions) ||
    !nonEmpty(reviewedBy) ||
    !nonEmpty(reviewedAt) ||
    !Number.isFinite(Date.parse(reviewedAt))
  ) {
    fail("INVALID_REVIEW_INPUT");
  }

  const sourceByKey = new Map();
  for (const row of sourceRows) {
    const key = sourceRowKey(row?.provider_code, row?.source_item?.external_item_key);
    if (sourceByKey.has(key)) fail("AMBIGUOUS_REVIEW_SOURCE_ROW");
    sourceByKey.set(key, row);
  }
  const manualByIngredient = new Map();
  for (const resolution of manualResolutions) {
    if (!nonEmpty(resolution?.ingredient_id) || manualByIngredient.has(resolution.ingredient_id)) {
      fail("AMBIGUOUS_MANUAL_RESOLUTION");
    }
    manualByIngredient.set(resolution.ingredient_id, resolution);
  }

  const decisionByIngredient = new Map();
  const entries = [];
  let approvedCandidateCount = 0;
  let manualResolutionCount = 0;
  let keepCurrentCount = 0;
  let holdCount = 0;

  for (const row of report.rows) {
    const decision = reviewExport.decisions[row.ingredient_id];
    if (!isRecord(decision) || !["approve_candidate", "keep_current", "hold"].includes(decision.decision)) {
      fail("REVIEW_DECISION_MISSING");
    }
    decisionByIngredient.set(row.ingredient_id, decision);
    const manual = manualByIngredient.get(row.ingredient_id);
    if (manual !== undefined) {
      if (decision.decision !== "hold") fail("MANUAL_RESOLUTION_DECISION_CONFLICT");
      entries.push(buildEntry({
        ingredient: row,
        resolutionKind: "manual_source",
        source: manual.source,
        sourceItem: manual.source_item,
        reason: manual.decision_reason,
      }));
      manualResolutionCount += 1;
      continue;
    }
    if (decision.decision === "approve_candidate") {
      const candidate = row.candidates?.find(
        (item) => item.external_item_key === decision.external_item_key,
      );
      if (!candidate) fail("APPROVED_CANDIDATE_NOT_FOUND");
      const sourceRow = sourceByKey.get(
        sourceRowKey(candidate.provider_code, candidate.external_item_key),
      );
      if (!sourceRow) fail("APPROVED_SOURCE_ROW_NOT_FOUND");
      entries.push(buildEntry({
        ingredient: row,
        resolutionKind: "official_candidate",
        source: sourceRow.source,
        sourceItem: sourceRow.source_item,
        reason: "사용자가 공식 영양 후보를 검수 승인함",
      }));
      approvedCandidateCount += 1;
      continue;
    }
    if (decision.decision === "keep_current") keepCurrentCount += 1;
    else holdCount += 1;
  }
  for (const ingredientId of manualByIngredient.keys()) {
    if (!decisionByIngredient.has(ingredientId)) fail("MANUAL_RESOLUTION_UNKNOWN_INGREDIENT");
  }

  entries.sort((left, right) => left.ingredient_id.localeCompare(right.ingredient_id));
  withSourceManifests(entries);
  const summary = {
    total_count: report.rows.length,
    apply_count: entries.length,
    approved_candidate_count: approvedCandidateCount,
    manual_resolution_count: manualResolutionCount,
    keep_current_count: keepCurrentCount,
    hold_count: holdCount,
  };
  const base = {
    schema_version: "homecook-nutrition-review-apply-v1",
    reviewed_by: reviewedBy,
    reviewed_at: reviewedAt,
    decision_reason: "사용자 영양성분 검수 결과 반영",
    source_report_checksum: report.report_checksum,
    entries,
    summary,
  };
  const payloadChecksum = sha256(base);
  const entryByIngredient = new Map(entries.map((entry) => [entry.ingredient_id, entry]));
  const finalReport = buildFinalReport(
    report,
    entryByIngredient,
    decisionByIngredient,
    reviewedAt,
  );
  return {
    ...base,
    payload_checksum: payloadChecksum,
    final_report: finalReport,
    final_review_export: {
      version: 1,
      report_checksum: finalReport.report_checksum,
      exported_at: reviewedAt,
      decisions: Object.fromEntries(finalReport.rows.map((row) => [
        row.ingredient_id,
        {
          decision: row.review_decision.decision,
          external_item_key: row.review_decision.external_item_key,
        },
      ])),
    },
  };
}

export function renderNutritionReviewApplySql(payload) {
  if (!isRecord(payload)) fail("INVALID_REVIEW_INPUT");
  const databasePayload = Object.fromEntries(
    [
      "schema_version",
      "reviewed_by",
      "reviewed_at",
      "decision_reason",
      "source_report_checksum",
      "entries",
      "summary",
      "payload_checksum",
    ]
      .filter((key) => Object.hasOwn(payload, key))
      .map((key) => [key, payload[key]]),
  );
  const encoded = Buffer.from(JSON.stringify(databasePayload), "utf8").toString("base64");
  return `select public.apply_reviewed_ingredient_nutrition(convert_from(decode('${encoded}', 'base64'), 'UTF8')::jsonb)::text;`;
}
