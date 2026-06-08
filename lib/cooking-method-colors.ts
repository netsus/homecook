const COOKING_METHOD_COLORS: Record<string, string> = {
  orange: "var(--cook-stir)",
  red: "var(--cook-boil)",
  brown: "var(--cook-grill)",
  blue: "var(--cook-steam)",
  yellow: "var(--cook-fry)",
  lime: "var(--cook-blanch)",
  green: "var(--cook-mix)",
  gray: "var(--cook-etc)",
  unassigned: "var(--cook-etc)",
  slice: "var(--cook-etc)",
  mince: "var(--cook-etc)",
  thaw: "var(--cook-etc)",
  pre_season: "var(--cook-mix)",
  pickle: "var(--cook-mix)",
  stir_fry: "var(--cook-stir)",
  boil: "var(--cook-boil)",
  parboil: "var(--cook-boil)",
  grill: "var(--cook-grill)",
  steam: "var(--cook-steam)",
  pan_fry: "var(--cook-fry)",
  deep_fry: "var(--cook-fry)",
  fry: "var(--cook-fry)",
  bake: "var(--cook-fry)",
  oven_bake: "var(--cook-grill)",
  air_fryer: "var(--cook-fry)",
  microwave: "var(--cook-etc)",
  blanch: "var(--cook-blanch)",
  mix: "var(--cook-mix)",
  toss: "var(--cook-mix)",
  braise: "var(--cook-boil)",
  reduce: "var(--cook-boil)",
  raw: "var(--cook-mix)",
  prep: "var(--cook-etc)",
  other: "var(--cook-etc)",
};

const COOKING_METHOD_TINT_WEIGHTS: Record<string, number> = {
  red: 14,
  boil: 14,
  yellow: 18,
  deep_fry: 18,
  fry: 18,
  bake: 18,
};

function createCookingMethodTint(color: string, weight = 16) {
  return `color-mix(in srgb, ${color} ${weight}%, transparent)`;
}

interface CookingMethodVisualInput {
  code?: string | null;
  label?: string | null;
  color_key?: string | null;
}

export function getCookingMethodColor(colorKey?: string | null): string {
  if (!colorKey) {
    return "var(--cook-etc)";
  }

  return COOKING_METHOD_COLORS[colorKey] ?? "var(--cook-etc)";
}

export function getCookingMethodTint(colorKey?: string | null): string {
  const tintWeight = colorKey ? COOKING_METHOD_TINT_WEIGHTS[colorKey] : undefined;
  return createCookingMethodTint(getCookingMethodColor(colorKey), tintWeight);
}

export function getCookingMethodVisual(method?: CookingMethodVisualInput | null) {
  const colorKey = method?.color_key ?? method?.code ?? null;

  return {
    label: method?.label?.trim() || "기타",
    color: getCookingMethodColor(colorKey),
    tint: getCookingMethodTint(colorKey),
  };
}
