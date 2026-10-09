/** Keep cuts, preparation states and punctuation; only normalize spelling layout. */
export function normalizeIngredientSearchName(value: string) {
  return stripIngredientFormatCharacters(value.normalize("NFKC"))
    .toLowerCase().replace(/\s+/gu, "").normalize("NFKC");
}

/** Invisible separators from copied captions are not food identity differences. */
export function stripIngredientFormatCharacters(value: string) {
  return value.replace(/[\u200B-\u200D\u2060\uFEFF]/gu, "");
}

export function ingredientSearchPattern(value: string) {
  return `%${normalizeIngredientSearchName(value).replace(/[\\%_]/gu, "\\$&")}%`;
}
