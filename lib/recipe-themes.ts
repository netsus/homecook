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
    id: "korean-home",
    title: "한식 집밥",
    keywords: [
      "한식",
      "김치",
      "된장",
      "고추장",
      "찌개",
      "국",
      "탕",
      "전골",
      "불고기",
      "비빔",
    ],
  },
  {
    id: "quick-meal",
    title: "간편 한끼",
    keywords: [
      "간편",
      "초간단",
      "한끼",
      "볶음밥",
      "덮밥",
      "도시락",
      "토스트",
      "샌드위치",
    ],
  },
  {
    id: "noodle-pasta",
    title: "면과 파스타",
    keywords: [
      "면",
      "국수",
      "파스타",
      "라면",
      "우동",
      "소바",
      "스파게티",
    ],
  },
  {
    id: "dessert",
    title: "디저트와 베이킹",
    keywords: [
      "디저트",
      "푸딩",
      "케이크",
      "쿠키",
      "빵",
      "타르트",
      "베이킹",
      "노오븐",
      "초콜릿",
      "딸기",
    ],
  },
  {
    id: "youtube",
    title: "유튜브에서 온 레시피",
    sourceTypes: ["youtube"],
  },
];

function normalizeSearchText(value: string) {
  return value.toLowerCase();
}

function getRecipeThemeText(recipe: RecipeCardItem) {
  return normalizeSearchText([recipe.title, ...recipe.tags].join(" "));
}

function recipeMatchesTheme(recipe: RecipeCardItem, theme: ThemeDefinition) {
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
  const themes: RecipeTheme[] = [];

  if (popularItems.length > 0) {
    themes.push(createTheme("popular", "이번 주 인기 레시피", popularItems));
  }

  groups.forEach((group) => {
    if (group.recipes.length === 0) {
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
    createTheme("popular", "이번 주 인기 레시피", items),
  ];

  THEME_DEFINITIONS.forEach((theme) => {
    const recipes = items.filter((recipe) => recipeMatchesTheme(recipe, theme));

    if (recipes.length > 0) {
      themes.push(createTheme(theme.id, theme.title, recipes));
    }
  });

  return themes;
}
