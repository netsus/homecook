/** Keep cuts, preparation states and punctuation; only normalize spelling layout. */
export function normalizeIngredientSearchName(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/gu, "");
}

export function ingredientSearchPattern(value: string) {
  return `%${normalizeIngredientSearchName(value).replace(/[\\%_]/gu, "\\$&")}%`;
}
