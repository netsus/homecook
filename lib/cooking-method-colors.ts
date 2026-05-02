const COOKING_METHOD_COLORS: Record<string, string> = {
  orange: "var(--cook-stir)",
  red: "var(--cook-boil)",
  brown: "var(--cook-grill)",
  blue: "var(--cook-steam)",
  yellow: "var(--cook-fry)",
  green: "var(--cook-mix)",
  gray: "var(--cook-etc)",
  unassigned: "var(--cook-etc)",
  stir_fry: "var(--cook-stir)",
  boil: "var(--cook-boil)",
  grill: "var(--cook-grill)",
  steam: "var(--cook-steam)",
  deep_fry: "var(--cook-fry)",
  fry: "var(--cook-fry)",
  bake: "var(--cook-fry)",
  blanch: "var(--cook-blanch)",
  mix: "var(--cook-mix)",
  raw: "var(--cook-mix)",
  prep: "var(--cook-etc)",
  other: "var(--cook-etc)",
};

export function getCookingMethodColor(colorKey?: string | null): string {
  if (!colorKey) {
    return "var(--cook-etc)";
  }

  return COOKING_METHOD_COLORS[colorKey] ?? "var(--cook-etc)";
}
