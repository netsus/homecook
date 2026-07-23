import { ok } from "@/lib/api/response";
import {
  getMockRecipeThemes,
  isDiscoveryFilterManualMockEnabled,
} from "@/lib/mock/recipes";
import { normalizeFoodSafetyImageUrl } from "@/lib/recipe-image";
import {
  createRecipeThemes,
  selectHeartyMainThemeRecipes,
  selectNoFlameApplianceRecipeIds,
  type RecipeMethodCodeRow,
  type RecipeTagThemeGroup,
  type RecipeThemeInput,
} from "@/lib/recipe-themes";
import {
  readRecipeCardUserStatuses,
  type RecipeCardUserStatusDbClient,
} from "@/lib/server/recipe-card-user-status";
import {
  createRouteHandlerClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import type { RecipeCardItem, RecipeThemesData } from "@/types/recipe";

interface ThemeRecipeRow {
  tag_normalized_key: string;
  tag_label: string;
  tag_slug: string | null;
  theme_rank: number;
  recipe_rank: number;
  id: string;
  title: string;
  thumbnail_url: string | null;
  tags: string[] | null;
  base_servings: number;
  view_count: number;
  like_count: number;
  save_count: number;
  source_type: "system" | "youtube" | "manual";
}

type RecipeCardRow = Omit<ThemeRecipeRow,
  "recipe_rank" | "tag_label" | "tag_normalized_key" | "tag_slug" | "theme_rank"
>;

interface MealThemeRow {
  recipe_id: string | null;
}

interface PantryItemRow {
  ingredient_id: string;
}

interface RecipeIngredientRow {
  recipe_id: string;
  ingredient_id: string;
}

interface RecipeStepMethodRow {
  recipe_id: string;
  cooking_methods: { code: string | null } | Array<{ code: string | null }> | null;
}

interface QueryError {
  message: string;
}

type ArrayResult<T> = PromiseLike<{
  data: T[] | null;
  error: QueryError | null;
}>;

interface ThemeSelectQuery<T> {
  eq(column: string, value: string): ThemeSelectQuery<T>;
  gte(column: string, value: string): ThemeSelectQuery<T>;
  in(column: string, values: string[]): ThemeSelectQuery<T>;
  is(column: string, value: null): ThemeSelectQuery<T>;
  limit(count: number): ThemeSelectQuery<T>;
  order(column: string, options?: { ascending?: boolean }): ThemeSelectQuery<T>;
  then: ArrayResult<T>["then"];
}

interface ThemeTable<T> {
  select(columns: string): ThemeSelectQuery<T>;
}

interface ThemeDbClient {
  rpc(
    functionName: "list_home_theme_recipes",
    args: {
      p_tag_limit: number;
      p_recipes_per_tag: number;
    },
  ): PromiseLike<{
    data: ThemeRecipeRow[] | null;
      error: { message: string } | null;
    }>;

  from(table: "meals"): ThemeTable<MealThemeRow>;
  from(table: "pantry_items"): ThemeTable<PantryItemRow>;
  from(table: "recipe_ingredients"): ThemeTable<RecipeIngredientRow>;
  from(table: "recipe_steps"): ThemeTable<RecipeStepMethodRow>;
  from(table: "recipes"): ThemeTable<RecipeCardRow>;
}

const RECENT_PLANNER_THEME_DAYS = 3;
const RECIPES_PER_THEME = 10;
const CARD_QUERY_LIMIT = 100;
const RECENT_PLANNER_ROW_LIMIT = 500;
const RECIPE_CARD_COLUMNS =
  "id, title, thumbnail_url, tags, base_servings, view_count, like_count, save_count, source_type";

function createThemeResponse(input: RecipeThemeInput): RecipeThemesData {
  return {
    themes: createRecipeThemes(input),
  };
}

function mapRecipeCard(recipe: {
  id: string;
  title: string;
  thumbnail_url: string | null;
  tags: string[] | null;
  base_servings: number;
  view_count: number;
  like_count: number;
  save_count: number;
  source_type: "system" | "youtube" | "manual";
}, userStatus?: RecipeCardItem["user_status"]): RecipeCardItem {
  return {
    id: recipe.id,
    title: recipe.title,
    thumbnail_url: normalizeFoodSafetyImageUrl(recipe.thumbnail_url),
    tags: recipe.tags ?? [],
    base_servings: recipe.base_servings,
    view_count: recipe.view_count,
    like_count: recipe.like_count,
    save_count: recipe.save_count,
    source_type: recipe.source_type,
    user_status: userStatus ?? null,
  };
}

function uniqueIds(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function firstJoin<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function getRecentPlannerSinceIso(now = new Date()) {
  return new Date(
    now.getTime() - RECENT_PLANNER_THEME_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
}

function rankRecipeIdsByRecentPlannerUse(
  rows: MealThemeRow[],
  limit = RECIPES_PER_THEME,
) {
  const counts = new Map<string, number>();

  rows.forEach((row) => {
    if (!row.recipe_id) {
      return;
    }

    counts.set(row.recipe_id, (counts.get(row.recipe_id) ?? 0) + 1);
  });

  return [...counts.entries()]
    .sort(([leftId, leftCount], [rightId, rightCount]) => {
      if (leftCount !== rightCount) {
        return rightCount - leftCount;
      }

      return leftId.localeCompare(rightId);
    })
    .map(([recipeId]) => recipeId)
    .slice(0, limit);
}

function normalizeMethodRows(rows: RecipeStepMethodRow[]): RecipeMethodCodeRow[] {
  return rows.map((row) => ({
    recipe_id: row.recipe_id,
    method_code: firstJoin(row.cooking_methods)?.code ?? null,
  }));
}

function sortRecipeIdsByCardPopularity(recipeIds: string[], rowById: Map<string, RecipeCardRow>) {
  return [...recipeIds]
    .filter((recipeId) => rowById.has(recipeId))
    .sort((leftId, rightId) => {
      const left = rowById.get(leftId);
      const right = rowById.get(rightId);

      if ((left?.view_count ?? 0) !== (right?.view_count ?? 0)) {
        return (right?.view_count ?? 0) - (left?.view_count ?? 0);
      }

      return leftId.localeCompare(rightId);
    })
    .slice(0, RECIPES_PER_THEME);
}

async function readRecipeCardsByIds(
  dbClient: ThemeDbClient,
  recipeIds: string[],
  maxRows = Number.POSITIVE_INFINITY,
) {
  const ids = uniqueIds(recipeIds);

  if (ids.length === 0) {
    return [];
  }

  const visibleRows: RecipeCardRow[] = [];

  for (let offset = 0; offset < ids.length; offset += CARD_QUERY_LIMIT) {
    const result = await dbClient
      .from("recipes")
      .select(RECIPE_CARD_COLUMNS)
      .eq("visibility", "public")
      .is("deleted_at", null)
      .in("id", ids.slice(offset, offset + CARD_QUERY_LIMIT));

    if (result.error || !result.data) {
      return [];
    }

    visibleRows.push(...result.data);

    if (visibleRows.length >= maxRows) {
      break;
    }
  }

  const rowById = new Map(visibleRows.map((row) => [row.id, row]));

  return ids
    .map((id) => rowById.get(id))
    .filter((row): row is RecipeCardRow => Boolean(row))
    .slice(0, maxRows);
}

function collectRecipeIngredientSets(rows: RecipeIngredientRow[]) {
  const map = new Map<string, Set<string>>();

  rows.forEach((row) => {
    if (!map.has(row.recipe_id)) {
      map.set(row.recipe_id, new Set<string>());
    }

    map.get(row.recipe_id)?.add(row.ingredient_id);
  });

  return map;
}

async function readPantryMatchedRecipeIds(dbClient: ThemeDbClient, userId: string | null) {
  if (!userId) {
    return [];
  }

  const pantryItemsResult = await dbClient
    .from("pantry_items")
    .select("ingredient_id")
    .eq("user_id", userId);

  if (pantryItemsResult.error || !pantryItemsResult.data) {
    return [];
  }

  const pantryIngredientIds = uniqueIds(
    pantryItemsResult.data.map((item) => item.ingredient_id),
  );

  if (pantryIngredientIds.length === 0) {
    return [];
  }

  const matchedIngredientsResult = await dbClient
    .from("recipe_ingredients")
    .select("recipe_id, ingredient_id")
    .in("ingredient_id", pantryIngredientIds);

  if (matchedIngredientsResult.error || !matchedIngredientsResult.data) {
    return [];
  }

  const matchedByRecipe = collectRecipeIngredientSets(matchedIngredientsResult.data);
  const candidateRecipeIds = [...matchedByRecipe.keys()];

  if (candidateRecipeIds.length === 0) {
    return [];
  }

  const recipeIngredientsResult = await dbClient
    .from("recipe_ingredients")
    .select("recipe_id, ingredient_id")
    .in("recipe_id", candidateRecipeIds);

  if (recipeIngredientsResult.error || !recipeIngredientsResult.data) {
    return [];
  }

  const pantryIngredientSet = new Set(pantryIngredientIds);
  const totalByRecipe = collectRecipeIngredientSets(recipeIngredientsResult.data);

  return candidateRecipeIds
    .map((recipeId) => {
      const matchedIngredients = matchedByRecipe.get(recipeId)?.size ?? 0;
      const totalIngredients = totalByRecipe.get(recipeId)?.size ?? 0;
      const missingIngredients = [...(totalByRecipe.get(recipeId) ?? new Set<string>())]
        .filter((ingredientId) => !pantryIngredientSet.has(ingredientId))
        .length;

      return {
        recipeId,
        matchedIngredients: Math.min(matchedIngredients, totalIngredients),
        missingIngredients,
        totalIngredients,
      };
    })
    .filter((item) => item.totalIngredients > 0)
    .sort((left, right) => {
      const leftScore = left.matchedIngredients / left.totalIngredients;
      const rightScore = right.matchedIngredients / right.totalIngredients;

      if (leftScore !== rightScore) {
        return rightScore - leftScore;
      }

      if (left.missingIngredients !== right.missingIngredients) {
        return left.missingIngredients - right.missingIngredients;
      }

      if (left.matchedIngredients !== right.matchedIngredients) {
        return right.matchedIngredients - left.matchedIngredients;
      }

      return left.recipeId.localeCompare(right.recipeId);
    })
    .map((item) => item.recipeId)
    .slice(0, RECIPES_PER_THEME);
}

function createTagGroups(
  rows: ThemeRecipeRow[],
  userStatusByRecipeId: Map<string, RecipeCardItem["user_status"]>,
) {
  const groupsByKey = new Map<string, RecipeTagThemeGroup>();

  rows
    .slice()
    .sort((left, right) => {
      if (left.theme_rank !== right.theme_rank) {
        return left.theme_rank - right.theme_rank;
      }

      if (left.recipe_rank !== right.recipe_rank) {
        return left.recipe_rank - right.recipe_rank;
      }

      return left.id.localeCompare(right.id);
    })
    .forEach((row) => {
      const group = groupsByKey.get(row.tag_normalized_key) ?? {
        id: row.tag_slug || row.tag_normalized_key,
        tag_key: row.tag_normalized_key,
        tag_label: row.tag_label,
        recipes: [],
      };

      group.recipes.push(mapRecipeCard(
        row,
        userStatusByRecipeId.get(row.id) ?? null,
      ));
      groupsByKey.set(row.tag_normalized_key, group);
    });

  return Array.from(groupsByKey.values());
}

export async function GET() {
  if (isDiscoveryFilterManualMockEnabled()) {
    return ok(getMockRecipeThemes());
  }

  try {
    const routeClient = await createRouteHandlerClient();
    const serviceClient = createServiceRoleClient() ?? routeClient;
    const supabase = routeClient;
    const themeDbClient = supabase as unknown as ThemeDbClient;
    const privateThemeDbClient = serviceClient as unknown as ThemeDbClient;
    const [
      baseRowsResult,
      youtubeRowsResult,
      recentPlannerRowsResult,
      themeRowsResult,
    ] = await Promise.all([
      supabase
      .from("recipes")
      .select(
        RECIPE_CARD_COLUMNS,
      )
      .eq("visibility", "public")
      .is("deleted_at", null)
      .order("view_count", { ascending: false })
      .order("id", { ascending: true })
        .limit(CARD_QUERY_LIMIT),
      themeDbClient
        .from("recipes")
        .select(RECIPE_CARD_COLUMNS)
        .eq("visibility", "public")
        .is("deleted_at", null)
        .eq("source_type", "youtube")
        .order("view_count", { ascending: false })
        .order("id", { ascending: true })
        .limit(RECIPES_PER_THEME),
      privateThemeDbClient
        .from("meals")
        .select("recipe_id")
        .gte("created_at", getRecentPlannerSinceIso())
        .order("created_at", { ascending: false })
        .limit(RECENT_PLANNER_ROW_LIMIT),
      themeDbClient.rpc("list_home_theme_recipes", {
        p_tag_limit: 8,
        p_recipes_per_tag: 10,
      }),
    ]);

    if (baseRowsResult.error) {
      return ok(getMockRecipeThemes());
    }

    const rows = baseRowsResult.data ?? [];
    const youtubeRows = youtubeRowsResult.error ? [] : (youtubeRowsResult.data ?? []);
    const recentPlannerRows = recentPlannerRowsResult.error
      ? []
      : (recentPlannerRowsResult.data ?? []);
    const visibleRecentPlannerRows = await readRecipeCardsByIds(
      themeDbClient,
      rankRecipeIdsByRecentPlannerUse(
        recentPlannerRows,
        RECENT_PLANNER_ROW_LIMIT,
      ),
      RECIPES_PER_THEME,
    );
    const visibleRecentPlannerIds = new Set(
      visibleRecentPlannerRows.map((recipe) => recipe.id),
    );
    const recentPlannerRecipeIds = rankRecipeIdsByRecentPlannerUse(
      recentPlannerRows.filter(
        (row) => row.recipe_id !== null && visibleRecentPlannerIds.has(row.recipe_id),
      ),
    );
    const themeRows = themeRowsResult.error ? [] : (themeRowsResult.data ?? []);
    const methodRowsResult = rows.length === 0
      ? { data: [], error: null }
      : await themeDbClient
        .from("recipe_steps")
        .select("recipe_id, cooking_methods(code)")
        .in("recipe_id", rows.map((recipe) => recipe.id));
    const noFlameRecipeIds = methodRowsResult.error
      ? []
      : selectNoFlameApplianceRecipeIds(normalizeMethodRows(methodRowsResult.data ?? []));
    let userId: string | null = null;

    try {
      const authResult = typeof routeClient.auth?.getUser === "function"
        ? await routeClient.auth.getUser()
        : { data: { user: null } };
      userId = authResult.data.user?.id ?? null;
    } catch {
      userId = null;
    }

    const pantryRecipeIds = await readPantryMatchedRecipeIds(themeDbClient, userId);
    const supplementalRows = await readRecipeCardsByIds(themeDbClient, [
      ...pantryRecipeIds,
      ...noFlameRecipeIds,
    ]);
    const rowById = new Map<string, RecipeCardRow>();
    [
      ...rows,
      ...youtubeRows,
      ...visibleRecentPlannerRows,
      ...supplementalRows,
    ].forEach((row) => {
      rowById.set(row.id, row);
    });
    const noFlameThemeRecipeIds = sortRecipeIdsByCardPopularity(noFlameRecipeIds, rowById);
    const hydrateRows = (recipeRows: RecipeCardRow[]) =>
      recipeRows.map((recipe) => mapRecipeCard(
        recipe,
        userStatusByRecipeId.get(recipe.id) ?? null,
      ));
    const hydrateByIds = (recipeIds: string[]) =>
      recipeIds
        .map((recipeId) => rowById.get(recipeId))
        .filter((recipe): recipe is RecipeCardRow => Boolean(recipe))
        .map((recipe) => mapRecipeCard(
          recipe,
          userStatusByRecipeId.get(recipe.id) ?? null,
        ));
    const allThemeRecipeIds = uniqueIds([
      ...recentPlannerRecipeIds,
      ...pantryRecipeIds,
      ...youtubeRows.map((recipe) => recipe.id),
      ...noFlameThemeRecipeIds,
      ...rows.map((recipe) => recipe.id),
      ...themeRows.map((recipe) => recipe.id),
    ]);
    const userStatusByRecipeId = await readRecipeCardUserStatuses({
      dbClient: serviceClient as unknown as RecipeCardUserStatusDbClient,
      recipeIds: allThemeRecipeIds,
      userId,
    });

    return ok(createThemeResponse({
      recentPlannerItems: hydrateByIds(recentPlannerRecipeIds),
      pantryItems: hydrateByIds(pantryRecipeIds),
      youtubeItems: hydrateRows(youtubeRows),
      noFlameItems: hydrateByIds(noFlameThemeRecipeIds),
      heartyMainItems: selectHeartyMainThemeRecipes(hydrateRows(rows)),
      tagGroups: createTagGroups(themeRows, userStatusByRecipeId),
    }));
  } catch {
    return ok(getMockRecipeThemes());
  }
}
