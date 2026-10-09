/** Keep cuts, preparation states and punctuation; only normalize spelling layout. */
export function normalizeIngredientSearchName(value: string) {
  return stripIngredientFormatCharacters(value.normalize("NFKC"))
    .toLowerCase().replace(/\s+/gu, "").normalize("NFKC");
}

/** Invisible separators from copied captions are not food identity differences. */
export function stripIngredientFormatCharacters(value: string) {
  return value.replace(/[\u200B-\u200D\u2060\uFEFF]/gu, "");
}

export interface IngredientLookupContext {
  name: string;
  unit?: string | null;
  rawText?: string | null;
}

export function buildIngredientLookupResultKey(value: string | IngredientLookupContext) {
  return typeof value === "string"
    ? value
    : JSON.stringify([value.name, value.unit ?? null, value.rawText ?? null]);
}

function isExplicitSpaghettiNoodleContext(context: IngredientLookupContext) {
  const unit = normalizeIngredientSearchName(context.unit ?? "");
  const rawText = stripIngredientFormatCharacters(context.rawText ?? "")
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim();
  const massUnitPattern = unit === "g" || unit === "그램"
    ? "(?:g|그램)"
    : unit === "kg" || unit === "킬로그램"
      ? "(?:kg|킬로그램)"
      : null;

  return normalizeIngredientSearchName(context.name) === "스파게티"
    && massUnitPattern !== null
    && new RegExp(
      `^spaghetti\\s+\\d+(?:[.,]\\d+)?\\s*${massUnitPattern}$`,
      "iu",
    ).test(rawText);
}

/**
 * Generate a small, ordered lookup-only candidate set without mutating source text.
 * Identity-bearing modifiers remain untouched. The context rule is intentionally
 * occurrence-scoped: the Korean word "스파게티" alone still stays unresolved.
 */
export function buildIngredientLookupNameCandidates(
  value: string | IngredientLookupContext,
) {
  const context = typeof value === "string" ? { name: value } : value;
  const exactName = context.name.trim();
  if (!exactName) {
    return [];
  }

  const candidates = [exactName];
  const normalizedSpacing = stripIngredientFormatCharacters(exactName.normalize("NFKC"))
    .replace(/\s+/gu, " ")
    .trim();
  const sizeWrapper = /^(?:큰|작은)\s+사이즈\s+(.+)$/u.exec(normalizedSpacing)?.[1]?.trim();
  if (sizeWrapper) {
    candidates.push(sizeWrapper);
  }
  if (isExplicitSpaghettiNoodleContext(context)) {
    candidates.push("스파게티면");
  }

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = normalizeIngredientSearchName(candidate);
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function ingredientSearchPattern(value: string) {
  return `%${normalizeIngredientSearchName(value).replace(/[\\%_]/gu, "\\$&")}%`;
}
