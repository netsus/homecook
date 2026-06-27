import type { RecipeCardItem, RecipeTheme } from "@/types/recipe";

const MAX_RECIPES_PER_THEME = 10;

interface ThemeDefinition {
  id: string;
  title: string;
  keywords?: string[];
  sourceTypes?: RecipeCardItem["source_type"][];
}

export interface RecipeTagThemeGroup {
  id: string;
  tag_key: string;
  tag_label: string;
  recipes: RecipeCardItem[];
}

const THEME_DEFINITIONS: ThemeDefinition[] = [
  {
    id: "youtube",
    title: "유튜브에서 가져온 레시피",
    sourceTypes: ["youtube"],
  },
  {
    id: "pantry-cleanout",
    title: "냉장고 재료 쓰기",
    keywords: [
      "냉장고",
      "냉털",
      "남은",
      "자투리",
      "비우",
      "털기",
    ],
  },
  {
    id: "soup-stew",
    title: "국물 있는 한 끼",
    keywords: [
      "국물",
      "국수",
      "스프",
      "전골",
      "찌개",
      "탕",
    ],
  },
  {
    id: "rice-bowl",
    title: "밥 한 그릇 메뉴",
    keywords: [
      "덮밥",
      "리조또",
      "볶음밥",
      "비빔밥",
      "주먹밥",
    ],
  },
  {
    id: "fruit-dessert",
    title: "과일 디저트",
    keywords: [
      "과일",
      "디저트",
      "바나나",
      "복숭아",
      "사과",
      "젤리",
      "젤라틴",
      "딸기",
      "푸딩",
      "케이크",
    ],
  },
];

function normalizeSearchText(value: string) {
  return value.toLowerCase();
}

function getRecipeThemeText(recipe: RecipeCardItem) {
  return normalizeSearchText([recipe.title, ...recipe.tags].join(" "));
}

function recipeMatchesTheme(recipe: RecipeCardItem, theme: ThemeDefinition) {
  if (!theme.sourceTypes?.length && !theme.keywords?.length) {
    return true;
  }

  if (theme.sourceTypes?.includes(recipe.source_type)) {
    return true;
  }

  const searchText = getRecipeThemeText(recipe);

  return theme.keywords?.some((keyword) =>
    searchText.includes(normalizeSearchText(keyword)),
  ) ?? false;
}

function createTheme(id: string, title: string, recipes: RecipeCardItem[]) {
  return {
    id,
    title,
    recipes: recipes.slice(0, MAX_RECIPES_PER_THEME),
  } satisfies RecipeTheme;
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

export function createRecipeThemesFromTagGroups(
  popularItems: RecipeCardItem[],
  groups: RecipeTagThemeGroup[],
) {
  const themes = createRecipeThemesFromCards(popularItems);

  groups.forEach((group) => {
    if (group.recipes.length === 0 || themes.some((theme) => theme.id === group.id)) {
      return;
    }

    themes.push(createTagTheme(group));
  });

  return themes;
}

export function createRecipeThemesFromCards(items: RecipeCardItem[]) {
  if (items.length === 0) {
    return [];
  }

  const themes: RecipeTheme[] = [
    createTheme("popular", "조회 많은 레시피", items),
  ];

  THEME_DEFINITIONS.forEach((theme) => {
    const recipes = items.filter((recipe) => recipeMatchesTheme(recipe, theme));

    if (recipes.length > 0) {
      themes.push(createTheme(theme.id, theme.title, recipes));
    }
  });

  return themes;
}
