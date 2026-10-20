import type { CookedWeightSummary } from "@/types/cooking";
import type { MealLogWeightBasis } from "@/types/meal-log";

const sources = new Set(["conditional_estimate", "unavailable", "historical_estimate", "reported_measured", "manual_estimate", "legacy_unknown"]);
function isWeightSource(value: unknown): value is CookedWeightSummary["source"] {
  return typeof value === "string" && sources.has(value);
}

export function cookedWeightSourceLabel(source: CookedWeightSummary["source"], modelVersion?: string | null): string {
  if (source === "conditional_estimate" && modelVersion === "recipe-mass-proxy-v1") return "재료량 기준 거친 추정";
  if (source === "conditional_estimate" && modelVersion === "ingredient-mass-75-v1") return "재료량 75% 추정";
  return {
    conditional_estimate: "조건별 추정", unavailable: "근거 부족", historical_estimate: "이전 방식의 추정",
    reported_measured: "사용자가 보고한 실측", manual_estimate: "직접 입력한 추정", legacy_unknown: "이전 기록 · 출처 미확인",
  }[source];
}

export function isCookedWeightAssumptionCodes(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 32
    && value.every(code => typeof code === "string" && /^[a-z][a-z_]{0,95}$/.test(code));
}

export const COOKED_MIX_ASSUMPTION_TEXT = "가열 없는 섞기 단계와 적힌 재료가 모두 남는다는 가정이에요. 따로 버린 물·기름, 남긴 재료, 용기 무게나 적히지 않은 추가 물·기름은 확인하지 못했어요.";

export const COOKED_MASS_FALLBACK_ASSUMPTION_TEXT = "재료 무게 합계의 75%로 계산한 대략적인 추정이에요. 실측값이 아니며, 조리 중 더한 물·기름이나 버린 양은 반영하지 못해요.";

export function cookedWeightAssumptionText(codes: readonly string[] = []): string | null {
  if (codes.includes("raw_ingredient_mass_proxy")) return "재료량 합계로 채운 거친 추정이에요. 소량 양념·비표준 숟가락에는 가정이 포함될 수 있어요. 증발·조리손실을 보정하지 않아 실제 완성무게는 더 작을 수 있어요. 값이 다르면 추정값을 수정하거나 실측값을 입력해 주세요.";
  if (codes.includes("ingredient_mass_seventy_five_percent")) return COOKED_MASS_FALLBACK_ASSUMPTION_TEXT;
  return codes.includes("all_declared_inputs_retained") ? COOKED_MIX_ASSUMPTION_TEXT : null;
}

export function cookedWeightUnavailableReasonText(reasonCodes: readonly string[] = []): string {
  if (reasonCodes.includes("unquantified_ingredient")) {
    return "적당량처럼 양이 정해지지 않은 재료가 있어 전체무게를 추정하지 못했어요.";
  }
  if (reasonCodes.includes("invalid_quantity")) {
    return "일부 재료의 양을 확인하지 못해 전체무게를 추정하지 못했어요.";
  }
  if (reasonCodes.some(code => code === "quantity_conversion_missing" || code === "invalid_grams_evidence")) {
    return "일부 재료의 무게 환산 근거가 없어 전체무게를 추정하지 못했어요.";
  }
  return "조리 조건을 확인할 근거가 부족해 전체무게를 추정하지 못했어요.";
}

/** Public owner projection contains summaries, never the private input history. */
export function isCookedWeightSummary(value: unknown): value is CookedWeightSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return ["source", "predicted_g", "model_version", "reason_codes"].every(key => Object.hasOwn(row, key))
    && Object.keys(row).every(key => ["source", "predicted_g", "model_version", "reason_codes", "assumption_codes"].includes(key))
    && isWeightSource(row.source)
    && (row.predicted_g === null || (typeof row.predicted_g === "number" && Number.isFinite(row.predicted_g) && row.predicted_g > 0))
    && (row.source !== "conditional_estimate" || row.predicted_g !== null)
    && (row.source !== "unavailable" || row.predicted_g === null)
    && (row.model_version === null || typeof row.model_version === "string")
    && (row.assumption_codes === undefined || isCookedWeightAssumptionCodes(row.assumption_codes))
    && Array.isArray(row.reason_codes) && row.reason_codes.every(code => typeof code === "string");
}

export function isMealLogWeightBasis(value: unknown): value is MealLogWeightBasis {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  const keys = ["schema_version", "batch_id", "recipe_content_snapshot_id", "finished_weight_g", "source", "model_version", "prediction_id", "observation_id", "batch_revision"];
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
  return Object.keys(row).length === keys.length && Object.keys(row).every(key => keys.includes(key))
    && row.schema_version === "cooked-weight-basis-v1" && typeof row.batch_id === "string" && uuid.test(row.batch_id)
    && [row.recipe_content_snapshot_id, row.prediction_id, row.observation_id].every(id => id === null || (typeof id === "string" && uuid.test(id)))
    && (row.finished_weight_g === null || (typeof row.finished_weight_g === "number" && Number.isFinite(row.finished_weight_g) && row.finished_weight_g > 0))
    && (row.batch_revision === null || (typeof row.batch_revision === "number" && Number.isSafeInteger(row.batch_revision) && row.batch_revision > 0))
    && isWeightSource(row.source) && (row.model_version === null || typeof row.model_version === "string");
}
