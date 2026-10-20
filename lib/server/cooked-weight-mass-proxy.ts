import { createHash } from "node:crypto";
import type { CookingModeIngredient, CookingModeStep } from "@/types/cooking";
import type { SnapshotWeightPrediction } from "@/lib/server/cooked-weight-snapshot-prediction";
import { snapshotIngredients } from "@/lib/server/cooked-batch-weight-estimate";
import { isQuantityInputSnapshot } from "@/lib/quantity-input";

/** Product policy, not a validated cooking yield or a nutrition conversion table. */
export const MASS_PROXY_VERSION = "recipe-mass-proxy-v1";
export const MASS_PROXY_POLICY = "household-minor-dose-20261020-v1";
export const MASS_PROXY_SOURCES = Object.freeze([
  "https://park.ajinomoto.co.jp/contents/basic/chomiryo_bunryou/",
  "https://www.nisshin-oillio.com/customer/faq_detail.html?id=4000032",
  "https://www.sbfoods-worldwide.com/recipes/433.html",
  "https://www.kikkoman.co.jp/homecook/search/recipe/00059936/",
]);
// Bounds below are disclosed product assumptions. Manufacturer references supply
// reference weights/doses; they do not establish the user's spoon or a confidence interval.
const POLICY = { version: MASS_PROXY_POLICY, sources: MASS_PROXY_SOURCES,
  waterMl: [1, 1, 1], saltPinch: [1, 0.5, 1.5], pepperPerTwoServings: [0.2, 0.05, 0.5],
  oilPerTwoServings: [7, 3.5, 14], mirinSpoon: [18, 6, 22.5], soySpoon: [18, 6, 22.5],
  ketchupSpoon: [15, 5, 22.5], ketchupHeapedSpoon: [22.5, 15, 30],
  maxAssumedFraction: 0.1, cookingLoss: "unmodelled" };
export const MASS_PROXY_POLICY_SHA256 = createHash("sha256").update(JSON.stringify(POLICY)).digest("hex");
export interface MassProxyRow {
  readonly rowKey: string; readonly sourceId: string; readonly label: string;
  readonly kind: "confirmed_mass" | "water_ml" | "salt_pinch" | "pepper_small" | "oil_small" | "mirin_spoon" | "soy_spoon" | "ketchup_spoon" | "ketchup_heaped_spoon";
  readonly grams: number; readonly lowGrams: number; readonly highGrams: number;
}
export interface MassProxyEvidence {
  readonly policyVersion: typeof MASS_PROXY_POLICY; readonly policySha256: string;
  readonly labelSource: "authorized_cook_mode";
  readonly cookingLoss: "unmodelled";
  readonly inputMassGrams: number; readonly inputLowGrams: number; readonly inputHighGrams: number;
  readonly rows: readonly MassProxyRow[];
}
// Decimal multiplication and rounding must both agree with PostgreSQL numeric.
function roundedProduct(factors: readonly number[], divideBy = 1): number {
  let digits = BigInt(1), scale = 0;
  for (const n of factors) {
    const [mantissa, exponent = "0"] = String(n).toLowerCase().split("e");
    const [whole, fraction = ""] = mantissa.split(".");
    digits *= BigInt(whole + fraction); scale += fraction.length - Number(exponent);
  }
  const numerator = digits * BigInt(10) ** BigInt(Math.max(0, 2 - scale));
  const denominator = BigInt(divideBy) * BigInt(10) ** BigInt(Math.max(0, scale - 2));
  return Number((numerator * BigInt(2) + denominator) / (denominator * BigInt(2))) / 100;
}
const round = (n: number) => roundedProduct([n]);
const positive = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function validUnavailableProof(raw: Record<string, unknown>) {
  if (!Object.hasOwn(raw, "quantity_input")) return true;
  if (!record(raw.quantity_input)) return false;
  const proof = { ...raw.quantity_input };
  if (Object.hasOwn(proof, "context_sha256") && (typeof proof.context_sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(proof.context_sha256))) return false;
  delete proof.context_sha256;
  return isQuantityInputSnapshot(proof, { amount: raw.amount as number, unit: raw.unit as string })
    && proof.quality === "unavailable" && proof.normalized === null;
}
/** Labels and instructions must come from the owner-authorized cook-mode read,
 * bound to every immutable source row. Never pass request-provided display text. */
export function withRecipeMassProxy(evidence: SnapshotWeightPrediction, rawRows: readonly unknown[], labels: readonly CookingModeIngredient[], rawSteps: readonly unknown[], steps: readonly CookingModeStep[]): SnapshotWeightPrediction {
  const input = evidence.prediction.input;
  if (evidence.prediction.totalGrams !== null || evidence.prediction.scope !== "candidate" || !input
    || !positive(evidence.baseServings) || !positive(evidence.cookingServings)
    || rawRows.length < 1 || rawRows.length > 200 || input.rows.length !== rawRows.length || labels.length !== rawRows.length
    || new Set(input.rows.map(row => row.rowKey)).size !== rawRows.length || !steps.length || steps.length !== rawSteps.length) return evidence;
  const instructions: string[] = [];
  for (const [i, raw] of rawSteps.entries()) {
    if (!record(raw) || raw.step_number !== i + 1 || raw.instruction !== steps[i]?.instruction || typeof raw.instruction !== "string") return evidence;
    instructions.push(raw.instruction);
  }
  // No proxy for explicit discard/deep fry/unlisted additions. Evaporation is
  // deliberately unmodelled and visibly disclosed, rather than inventing a yield.
  if (/물기|배수|건져|버리|버려|따라\s*(?:내|낸)|짜\s*내|(?:물|국물|기름)(?:을|를)?\s*(?:빼|뺀)|체(?:에|로)\s*(?:거르|걸러)|튀(?:기|겨|긴)|\b(?:drain|discard|strain|deep.fry)\b|(?:물|기름)(?:을|를)?\s*(?:더|추가)|\badd\s+more\s+(?:water|oil)\b/iu.test(instructions.join("\n"))) return evidence;
  if (/(?:물|water)(?:을|를)?[^.\n]{0,8}(?:넣|붓|add)/iu.test(instructions.join("\n"))
    && !labels.some(row => ["물", "생수", "정수", "water"].includes(row.standard_name.replace(/\s+/gu, "").toLowerCase()))) return evidence;
  const parsed = snapshotIngredients(rawRows as unknown[]);
  if (!parsed) return evidence;
  let known = 0, assumedHigh = 0;
  const proofRows: MassProxyRow[] = [];
  for (const [i, row] of input.rows.entries()) {
    const raw = rawRows[i], label = labels[i], source = parsed[i];
    if (!record(raw) || !label || !source || source.id !== row.rowKey
      || row.sourceId !== (source.food_product_id ?? source.ingredient_id)
      || (label.row_key ?? null) !== (raw.row_key ?? null) || label.ingredient_id !== raw.ingredient_id
      || (label.food_product_id ?? null) !== (raw.food_product_id ?? null)
      || (label.food_product_nutrition_version_id ?? null) !== (raw.food_product_nutrition_version_id ?? null)
      || !["planned", "reported_actual"].includes(row.quantityOrigin) || !row.sourceId
      || typeof label.standard_name !== "string" || !label.standard_name.trim() || label.standard_name.length > 200) return evidence;
    const name = label.standard_name.replace(/\s+/gu, "").toLowerCase();
    let kind: MassProxyRow["kind"] = "confirmed_mass";
    let mass: readonly number[] | null = null;
    if (positive(row.grams) && row.gramsEvidence?.status === "confirmed") {
      mass = [row.grams, row.grams, row.grams]; known += round(row.grams);
    } else {
      if (row.sourceKind === "food_product" || !validUnavailableProof(raw)) return evidence;
      const amount = row.amount, unit = row.unit?.replace(/\s+/gu, "").toLowerCase();
      const doseServings = source.scalable ? evidence.cookingServings : evidence.baseServings;
      if (["물", "생수", "정수", "water"].includes(name) && positive(amount) && ["ml", "l"].includes(unit ?? "")) {
        const grams = roundedProduct([amount, unit === "l" ? 1000 : 1]); mass = [grams, grams, grams]; kind = "water_ml"; known += round(grams);
      } else if (["소금", "salt"].includes(name) && positive(amount) && unit === "꼬집" && amount <= 10) {
        mass = POLICY.saltPinch.map(n => roundedProduct([n, amount])); kind = "salt_pinch";
      } else if (["후추", "흑후추", "후춧가루", "pepper"].includes(name) && amount === null && row.quantityKind === "to_taste" && (unit === undefined || unit === "약간")) {
        mass = POLICY.pepperPerTwoServings.map(n => roundedProduct([n, doseServings], 2)); kind = "pepper_small";
      } else if (["식용유", "올리브유", "카놀라유", "vegetableoil"].includes(name) && amount === null && (unit === undefined || unit === "약간")
        && /(?:식용유|올리브유|카놀라유|기름)(?:을|를)?\s*(?:약간|조금|살짝)/u.test(instructions.join("\n"))) {
        mass = POLICY.oilPerTwoServings.map(n => roundedProduct([n, doseServings], 2)); kind = "oil_small";
      } else if (positive(amount) && amount <= 10 && ["스푼", "큰술", "tbsp", "크게스푼"].includes(unit ?? "")) {
        if (["맛술", "미림", "mirin"].includes(name) && unit !== "크게스푼") { mass = POLICY.mirinSpoon.map(n => roundedProduct([n, amount])); kind = "mirin_spoon"; }
        if (["간장", "국간장", "진간장", "soysauce"].includes(name) && unit !== "크게스푼") { mass = POLICY.soySpoon.map(n => roundedProduct([n, amount])); kind = "soy_spoon"; }
        if (["케첩", "토마토케첩", "ketchup"].includes(name)) { kind = unit === "크게스푼" ? "ketchup_heaped_spoon" : "ketchup_spoon"; mass = (unit === "크게스푼" ? POLICY.ketchupHeapedSpoon : POLICY.ketchupSpoon).map(n => roundedProduct([n, amount])); }
      }
      if (!mass) return evidence; // Unknown main food, water, or conversion is never silently omitted.
      if (kind !== "water_ml") assumedHigh += round(mass[2]);
    }
    if (mass.some(n => !positive(n) || round(n) <= 0) || mass[0] > 1000000 || mass[1] > mass[0] || mass[2] < mass[0]) return evidence;
    proofRows.push(Object.freeze({ rowKey: row.rowKey, sourceId: row.sourceId, label: label.standard_name, kind,
      grams: round(mass[0]), lowGrams: round(mass[1]), highGrams: round(mass[2]) }));
  }
  if (known <= 0 || assumedHigh > known * POLICY.maxAssumedFraction) return evidence;
  const sum = (key: "grams" | "lowGrams" | "highGrams") => proofRows.reduce((n, row) => n + Math.round(row[key] * 100), 0) / 100;
  const massProxy: MassProxyEvidence = Object.freeze({ policyVersion: MASS_PROXY_POLICY, policySha256: MASS_PROXY_POLICY_SHA256,
    labelSource: "authorized_cook_mode", cookingLoss: "unmodelled", inputMassGrams: sum("grams"), inputLowGrams: sum("lowGrams"), inputHighGrams: sum("highGrams"), rows: Object.freeze(proofRows) });
  return Object.freeze({ ...evidence, prediction: Object.freeze({ ...evidence.prediction, modelVersion: MASS_PROXY_VERSION,
    status: "estimated", totalGrams: massProxy.inputMassGrams, learningEligible: false, appliedRules: Object.freeze([]), massProxy,
    assumptions: Object.freeze(["raw_ingredient_mass_proxy", "cooking_loss_unmodelled", ...(assumedHigh > 0 ? ["minor_seasoning_household_assumptions"] : [])]) }) });
}
