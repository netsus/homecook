const COOKING_METHOD_COLORS: Record<string, string> = {
  orange: "var(--cook-stir)",
  red: "var(--cook-boil)",
  brown: "var(--cook-grill)",
  blue: "var(--cook-steam)",
  yellow: "var(--cook-deep-fry)",
  lime: "var(--cook-blanch)",
  green: "var(--cook-mix)",
  gray: "var(--cook-etc)",
  unassigned: "var(--cook-etc)",
  slice: "var(--cook-slice)",
  mince: "var(--cook-mince)",
  thaw: "var(--cook-thaw)",
  pre_season: "var(--cook-pre-season)",
  pickle: "var(--cook-pickle)",
  stir_fry: "var(--cook-stir)",
  boil: "var(--cook-boil)",
  parboil: "var(--cook-parboil)",
  grill: "var(--cook-grill)",
  steam: "var(--cook-steam)",
  pan_fry: "var(--cook-pan-fry)",
  deep_fry: "var(--cook-deep-fry)",
  fry: "var(--cook-deep-fry)",
  bake: "var(--cook-oven-bake)",
  oven_bake: "var(--cook-oven-bake)",
  air_fryer: "var(--cook-air-fryer)",
  microwave: "var(--cook-microwave)",
  blanch: "var(--cook-blanch)",
  mix: "var(--cook-mix)",
  toss: "var(--cook-toss)",
  braise: "var(--cook-braise)",
  reduce: "var(--cook-reduce)",
  raw: "var(--cook-mix)",
  prep: "var(--cook-slice)",
  grind: "var(--cook-mince)",
  mash: "var(--cook-mince)",
  roll: "var(--cook-slice)",
  sieve: "var(--cook-slice)",
  infuse: "var(--cook-pickle)",
  cook_rice: "var(--cook-boil)",
  fill: "var(--cook-mix)",
  finish: "var(--cook-mix)",
  other: "var(--cook-etc)",
};

const COOKING_METHOD_TINT_WEIGHTS: Record<string, number> = {
  red: 14,
  boil: 14,
  reduce: 14,
  steam: 14,
  thaw: 14,
  yellow: 18,
  deep_fry: 18,
  fry: 18,
  air_fryer: 18,
  bake: 18,
  oven_bake: 18,
};

function createCookingMethodTint(color: string, weight = 16) {
  return `color-mix(in srgb, ${color} ${weight}%, transparent)`;
}

interface CookingMethodVisualInput {
  code?: string | null;
  label?: string | null;
  color_key?: string | null;
}

type CookingMethodColorInput = string | CookingMethodVisualInput | null | undefined;

function normalizeColorKey(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function resolveCookingMethodColorKey(input?: CookingMethodColorInput) {
  if (typeof input === "string") {
    return normalizeColorKey(input);
  }

  return normalizeColorKey(input?.code) ?? normalizeColorKey(input?.color_key);
}

export function getCookingMethodColor(input?: CookingMethodColorInput): string {
  const colorKey = resolveCookingMethodColorKey(input);

  if (!colorKey) {
    return "var(--cook-etc)";
  }

  return COOKING_METHOD_COLORS[colorKey] ?? "var(--cook-etc)";
}

export function getCookingMethodTint(input?: CookingMethodColorInput): string {
  const colorKey = resolveCookingMethodColorKey(input);
  const tintWeight = colorKey ? COOKING_METHOD_TINT_WEIGHTS[colorKey] : undefined;
  return createCookingMethodTint(getCookingMethodColor(input), tintWeight);
}

export function getCookingMethodVisual(method?: CookingMethodVisualInput | null) {
  return {
    label: method?.label?.trim() || "기타",
    color: getCookingMethodColor(method),
    tint: getCookingMethodTint(method),
  };
}
