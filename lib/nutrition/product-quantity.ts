export interface ProductBasisRelation {
  from: { amount: number; unit: string };
  to: { amount: number; unit: string };
}

function canonicalQuantity(amount: number, unit: string) {
  switch (unit) {
    case "kg": return { amount: amount * 1000, unit: "g" };
    case "l": case "L": return { amount: amount * 1000, unit: "ml" };
    case "mL": return { amount, unit: "ml" };
    default: return { amount, unit };
  }
}

/** A unique direct relation, or two relations with the same pinned basis. */
export function productQuantityConversionPath(unit: string, target: string, relations: readonly ProductBasisRelation[]) {
  const candidates = relations.flatMap((relation) => [
    { from: relation.from, to: relation.to }, { from: relation.to, to: relation.from },
  ]);
  const direct = candidates.filter((relation) => relation.from.unit === unit && relation.to.unit === target);
  const paths = direct.map((relation) => [relation]).concat(candidates.flatMap((first) => {
    if (first.from.unit !== unit || first.to.unit === unit || first.to.unit === target) return [];
    return candidates.flatMap((second) => second.from.unit === first.to.unit && second.to.unit === target
      ? [[first, second]] : []);
  }));
  if (paths.length !== 1 || paths[0].some((relation) => !Number.isFinite(relation.from.amount)
    || relation.from.amount <= 0 || !Number.isFinite(relation.to.amount) || relation.to.amount <= 0)) return null;
  return paths[0];
}

/** Conversions use only positive relations on the exact immutable product version. */
export function convertProductQuantity(amount: number, unit: string, targetUnit: string,
  relations: readonly ProductBasisRelation[]): number | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const input = canonicalQuantity(amount, unit);
  const target = canonicalQuantity(1, targetUnit);
  if (!Number.isFinite(input.amount)) return null;
  if (input.unit === target.unit) return input.amount / target.amount;
  const path = productQuantityConversionPath(input.unit, target.unit, relations);
  if (!path) return null;
  const converted = path.reduce((value, relation) => value / relation.from.amount * relation.to.amount, input.amount) / target.amount;
  return Number.isFinite(converted) && converted > 0 ? converted : null;
}

export function scaleProductAmount(amount: number, multiplier: number, base: number) {
  if (![amount, multiplier, base].every((value) => Number.isFinite(value) && value > 0)) return null;
  const input = productQuantityDecimalRatio(amount);
  const factor = productQuantityDecimalRatio(multiplier);
  const divisor = productQuantityDecimalRatio(base);
  return Number(input.numerator * factor.numerator * divisor.denominator)
    / Number(input.denominator * factor.denominator * divisor.numerator);
}
// Decimal inputs retain their exact integer boundary when deriving a reference
// purchase count; binary floating-point noise must never add an extra package.
export function productQuantityDecimalRatio(value: number) {
  const [mantissa, exponentText = "0"] = value.toString().split("e");
  const [whole, fraction = ""] = mantissa.split(".");
  const power = fraction.length - Number(exponentText);
  return {
    numerator: BigInt(`${whole}${fraction}`) * (power < 0 ? BigInt(10) ** BigInt(-power) : BigInt(1)),
    denominator: power > 0 ? BigInt(10) ** BigInt(power) : BigInt(1),
  };
}
