import type { RecipeCardItem, RecipeTheme } from "@/types/recipe";

const MAX_RECIPES_PER_THEME = 10;

interface ThemeDefinition {
  id: string;
  title: string;
  keywords?: string[];
  minimumSaveCount?: number;
  sortBy?: "save_count" | "view_count";
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
    id: "saved-favorites",
    title: "많이 저장한 레시피",
    minimumSaveCount: 1,
    sortBy: "save_count",
  },
  {
    id: "beginner-safe",
    title: "실패 걱정 없는 메뉴",
    keywords: [
      "간편",
      "간단",
      "초간단",
      "10분",
      "30분",
      "쉬운",
      "쉽게",
      "걱정",
      "성공",
      "따라",
    ],
  },
  {
    id: "pantry-cleanout",
    title: "냉장고 비우는 한 끼",
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
    id: "hearty-main",
    title: "밥상 든든한 메인",
    keywords: [
      "찌개",
      "덮밥",
      "두부",
      "고기",
      "불고기",
      "김치",
      "한끼",
      "메인",
    ],
  },
  {
    id: "sweet-no-oven",
    title: "불 없이 달달하게",
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
];

function normalizeSearchText(value: string) {
  return value.toLowerCase();
}

function getRecipeThemeText(recipe: RecipeCardItem) {
  return normalizeSearchText([recipe.title, ...recipe.tags].join(" "));
}

function recipeMatchesTheme(recipe: RecipeCardItem, theme: ThemeDefinition) {
  if (theme.minimumSaveCount && recipe.save_count < theme.minimumSaveCount) {
    return false;
  }

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

function sortThemeRecipes(recipes: RecipeCardItem[], theme: ThemeDefinition) {
  if (theme.sortBy === "save_count") {
    return recipes.slice().sort((left, right) => {
      if (left.save_count !== right.save_count) {
        return right.save_count - left.save_count;
      }

      if (left.view_count !== right.view_count) {
        return right.view_count - left.view_count;
      }

      return left.id.localeCompare(right.id);
    });
  }

  if (theme.sortBy === "view_count") {
    return recipes.slice().sort((left, right) => {
      if (left.view_count !== right.view_count) {
        return right.view_count - left.view_count;
      }

      return left.id.localeCompare(right.id);
    });
  }

  return recipes;
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
    createTheme("popular", "이번 주 인기 레시피", items),
  ];

  THEME_DEFINITIONS.forEach((theme) => {
    const recipes = sortThemeRecipes(
      items.filter((recipe) => recipeMatchesTheme(recipe, theme)),
      theme,
    );

    if (recipes.length > 0) {
      themes.push(createTheme(theme.id, theme.title, recipes));
    }
  });

  return themes;
}
