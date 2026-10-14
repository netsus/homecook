import { QUANTITY_INPUT_VERSION, type QuantityInputDraft, type QuantityInputSnapshot } from "@/types/quantity-input";

export interface ParsedQuantityInput {
  raw_value: string;
  amount: number;
  numerator: string;
  denominator: string;
}

function gcd(left: bigint, right: bigint): bigint {
  while (right !== BigInt(0)) [left, right] = [right, left % right];
  return left;
}

export function parseQuantityInput(value: string): ParsedQuantityInput | null {
  const raw = value.trim();
  if (raw.length > 64 || !/^(?:\d+(?:\.\d*)?|\.\d+|\d+\s*\/\s*\d+)$/u.test(raw)) return null;
  const [whole, decimals = ""] = raw.split(".");
  const fraction = raw.includes("/") ? raw.split("/").map(part => part.trim()) : null;
  const numerator = fraction ? BigInt(fraction[0]) : BigInt((whole || "0") + decimals);
  const denominator = fraction ? BigInt(fraction[1]) : BigInt(10) ** BigInt(decimals.length);
  if (denominator === BigInt(0)) return null;
  const amount = Number(numerator) / Number(denominator);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const factor = gcd(numerator, denominator);
  return { raw_value: raw, amount, numerator: String(numerator / factor), denominator: String(denominator / factor) };
}

/** Display only; never use this rounded value to calculate or save a quantity. */
export function formatQuantityAmount(amount: number): string {
  if (!Number.isFinite(amount)) return "-";
  if (amount > 0 && amount < 0.001) return "<0.001";
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 3 }).format(amount);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exact(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every(key => key in value);
}

export function isQuantityInputDraft(value: unknown, quantity: { amount: number; unit: string }): value is QuantityInputDraft {
  if (!record(value) || !exact(value, ["schema_version", "raw_value", "raw_unit",
    ...("expected_batch_revision" in value ? ["expected_batch_revision"] : []),
    ...("expected_product_nutrition_version_id" in value ? ["expected_product_nutrition_version_id"] : [])])
    || value.schema_version !== QUANTITY_INPUT_VERSION || typeof value.raw_value !== "string"
    || typeof value.raw_unit !== "string" || !value.raw_unit.trim() || value.raw_unit.length > 24
    || !Number.isFinite(quantity.amount) || quantity.amount <= 0) return false;
  const parsed = parseQuantityInput(value.raw_value);
  if ("expected_product_nutrition_version_id" in value && (typeof value.expected_product_nutrition_version_id !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value.expected_product_nutrition_version_id))) return false;
  if ("expected_batch_revision" in value && "expected_product_nutrition_version_id" in value) return false;
  // Different display units are verified by the server's actual evidence.
  return Boolean(parsed && (value.raw_unit !== quantity.unit || Math.abs(parsed.amount - quantity.amount) <= Math.max(1, parsed.amount) * 1e-12)
    && (!("expected_batch_revision" in value) || (Number.isSafeInteger(value.expected_batch_revision)
      && Number(value.expected_batch_revision) > 0)));
}

export function isQuantityInputSnapshot(value: unknown, quantity?: { amount: number; unit: string }): value is QuantityInputSnapshot {
  if (!record(value) || !exact(value, ["schema_version", "raw_value", "raw_unit", "numerator", "denominator",
    "normalized", "quality", "reason", "evidence_ids", "source_versions", "batch_basis",
    ...("display_quantity" in value ? ["display_quantity"] : [])])
    || value.schema_version !== QUANTITY_INPUT_VERSION || typeof value.raw_value !== "string"
    || typeof value.raw_unit !== "string" || !value.raw_unit.trim()
    || typeof value.numerator !== "string" || !/^\d+$/u.test(value.numerator)
    || typeof value.denominator !== "string" || !/^\d+$/u.test(value.denominator)
    || Number(value.numerator) <= 0 || Number(value.denominator) <= 0
    || !["direct", "estimated", "unavailable"].includes(String(value.quality))
    || (value.reason !== null && typeof value.reason !== "string")
    || ![value.evidence_ids, value.source_versions].every(list => Array.isArray(list)
      && list.every(item => typeof item === "string" && item.trim().length > 0))) return false;
  const parsed = parseQuantityInput(value.raw_value);
  if (!parsed || Math.abs(parsed.amount - Number(value.numerator) / Number(value.denominator)) > Math.max(1, parsed.amount) * 1e-12) return false;
  if (value.normalized !== null && (!record(value.normalized) || !exact(value.normalized, ["amount", "unit"])
    || typeof value.normalized.amount !== "number" || !Number.isFinite(value.normalized.amount) || value.normalized.amount <= 0
    || !["g", "ml"].includes(String(value.normalized.unit)))) return false;
  if (value.display_quantity !== undefined && (!record(value.display_quantity) || !exact(value.display_quantity, ["amount", "unit"])
    || typeof value.display_quantity.amount !== "number" || !Number.isFinite(value.display_quantity.amount) || value.display_quantity.amount <= 0
    || typeof value.display_quantity.unit !== "string" || !value.display_quantity.unit.trim() || value.display_quantity.unit.length > 24)) return false;
  if (quantity && record(value.display_quantity) && (value.display_quantity.unit !== quantity.unit
    || Math.abs(Number(value.display_quantity.amount) - quantity.amount) > Math.max(1, quantity.amount) * 1e-12)) return false;
  if (value.batch_basis !== null && (!record(value.batch_basis)
    || !exact(value.batch_basis, ["batch_id", "revision", "cooking_servings", "finished_weight_g", "weight_source"])
    || typeof value.batch_basis.batch_id !== "string"
    || !Number.isSafeInteger(value.batch_basis.revision) || Number(value.batch_basis.revision) <= 0
    || typeof value.batch_basis.cooking_servings !== "number" || !Number.isFinite(value.batch_basis.cooking_servings) || value.batch_basis.cooking_servings <= 0
    || typeof value.batch_basis.finished_weight_g !== "number" || !Number.isFinite(value.batch_basis.finished_weight_g) || value.batch_basis.finished_weight_g <= 0
    || (value.batch_basis.weight_source !== null && !["estimated", "measured"].includes(String(value.batch_basis.weight_source))))) return false;
  return true;
}
