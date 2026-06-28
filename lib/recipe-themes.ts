import type { RecipeCardItem, RecipeTheme } from "@/types/recipe";

const MAX_RECIPES_PER_THEME = 10;

export interface RecipeTagThemeGroup {
  id: string;
  tag_key: string;
  tag_label: string;
  recipes: RecipeCardItem[];
}

export interface RecipeThemeInput {
  recentPlannerItems?: RecipeCardItem[];
  pantryItems?: RecipeCardItem[];
  youtubeItems?: RecipeCardItem[];
  noFlameItems?: RecipeCardItem[];
  heartyMainItems?: RecipeCardItem[];
  tagGroups?: RecipeTagThemeGroup[];
}

export interface RecipeMethodCodeRow {
  recipe_id: string;
  method_code: string | null;
}

function createTheme(id: string, title: string, recipes: RecipeCardItem[]) {
  return {
    id,
    title,
    recipes: recipes.slice(0, MAX_RECIPES_PER_THEME),
  } satisfies RecipeTheme;
}

function pushTheme(themes: RecipeTheme[], id: string, title: string, recipes: RecipeCardItem[] | undefined) {
  if (!recipes?.length) {
    return;
  }

  themes.push(createTheme(id, title, recipes));
}

function createTagTheme(group: RecipeTagThemeGroup) {
  return {
    id: group.id,
    title: group.tag_label,
    tag_key: group.tag_key,
    tag_label: group.tag_label,
    recipes: group.recipes.slice(0, MAX_RECIPES_PER_THEME),
  } satisfies RecipeTheme;
}

const NO_FLAME_APPLIANCE_METHOD_CODES = new Set([
  "air_fryer",
  "microwave",
  "oven_bake",
]);

const NO_FLAME_ALLOWED_METHOD_CODES = new Set([
  ...NO_FLAME_APPLIANCE_METHOD_CODES,
  "mince",
  "mix",
  "pickle",
  "pre_season",
  "slice",
  "thaw",
  "toss",
]);

const HEARTY_MAIN_INCLUDE_TAGS = new Set([
  "고단백",
  "한그릇요리",
]);

const HEARTY_MAIN_EXCLUDE_TAGS = new Set([
  "디저트",
  "밑반찬",
  "샐러드",
]);

export function selectNoFlameApplianceRecipeIds(rows: RecipeMethodCodeRow[]) {
  const recipeMethods = new Map<string, {
    hasApplianceMethod: boolean;
    hasDisallowedMethod: boolean;
  }>();

  rows.forEach((row) => {
    const methodCode = row.method_code;
    const state = recipeMethods.get(row.recipe_id) ?? {
      hasApplianceMethod: false,
      hasDisallowedMethod: false,
    };

    if (!methodCode || !NO_FLAME_ALLOWED_METHOD_CODES.has(methodCode)) {
      state.hasDisallowedMethod = true;
    }

    if (methodCode && NO_FLAME_APPLIANCE_METHOD_CODES.has(methodCode)) {
      state.hasApplianceMethod = true;
    }

    recipeMethods.set(row.recipe_id, state);
  });

  return [...recipeMethods.entries()]
    .filter(([, state]) => state.hasApplianceMethod && !state.hasDisallowedMethod)
    .map(([recipeId]) => recipeId);
}

export function selectHeartyMainThemeRecipes(items: RecipeCardItem[]) {
  return items.filter((recipe) => {
    const tagSet = new Set(recipe.tags);
    const hasMainSignal = recipe.tags.some((tag) => HEARTY_MAIN_INCLUDE_TAGS.has(tag));
    const hasExcludedSignal = recipe.tags.some((tag) => HEARTY_MAIN_EXCLUDE_TAGS.has(tag));

    return hasMainSignal && !hasExcludedSignal && tagSet.size > 0;
  });
}

export function createRecipeThemes({
  recentPlannerItems = [],
  pantryItems = [],
  youtubeItems = [],
  noFlameItems = [],
  heartyMainItems = [],
  tagGroups = [],
}: RecipeThemeInput) {
  const themes: RecipeTheme[] = [];

  pushTheme(themes, "recent-planner", "요즘 플래너에 많이 담은 메뉴", recentPlannerItems);
  pushTheme(themes, "pantry-cleanout", "냉장고 비우는 한 끼", pantryItems);
  pushTheme(themes, "youtube", "유튜브에서 가져온 레시피", youtubeItems);
  pushTheme(themes, "no-flame-appliance", "불 없이 만드는 요리", noFlameItems);
  pushTheme(themes, "hearty-main", "밥상 든든한 메인", heartyMainItems);

  tagGroups.forEach((group) => {
    if (group.recipes.length === 0 || themes.some((theme) => theme.id === group.id)) {
      return;
    }

    themes.push(createTagTheme(group));
  });

  return themes;
}
