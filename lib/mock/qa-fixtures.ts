import fixtureData from "@/qa/fixtures/slices-01-05.json";
import { buildFixedPlannerColumns } from "@/lib/planner/fixed-slots";
import type {
  IngredientItem,
  IngredientListData,
  RecipeBookCreateData,
  RecipeBookListData,
  RecipeBookSummary,
  RecipeDetail,
  RecipeLikeData,
  RecipeListData,
  RecipeThemesData,
  RecipeUserStatus,
  RecipeSaveData,
  RecipeCardItem,
} from "@/types/recipe";
import type { MealCreateData } from "@/types/meal";
import type {
  MealStatus,
  PlannerColumnData,
  PlannerData,
} from "@/types/planner";

type DateAnchor = "start" | "mid" | "end";

interface FixtureBookState extends RecipeBookSummary {
  book_type: "saved" | "custom";
}

interface PlannerMealTemplate {
  id: string;
  column_id: string;
  planned_servings: number;
  status: MealStatus;
  is_leftover: boolean;
  date_anchor: DateAnchor;
}

interface QaFixtureState {
  isLiked: boolean;
  likeCount: number;
  saveCount: number;
  savedBookIds: string[];
  books: FixtureBookState[];
  nextBookSortOrder: number;
  plannerColumns: PlannerColumnData[];
  plannerMealTemplates: PlannerMealTemplate[];
  createdMeals: MealCreateData[];
}

const globalFixtureStoreKey = "__homecookQaFixtureState";

function toIngredientItem(value: (typeof fixtureData.ingredients)[number]): IngredientItem {
  return {
    id: value.id,
    standard_name: value.standardName,
    category: value.category,
  };
}

function toRecipeBookSummary(value: (typeof fixtureData.fixture.books)[number]): FixtureBookState {
  return {
    id: value.id,
    name: value.name,
    book_type: value.bookType as "saved" | "custom",
    recipe_count: value.recipeCount,
    sort_order: value.sortOrder,
  };
}

function toPlannerColumn(value: (typeof fixtureData.planner.columns)[number]): PlannerColumnData {
  return {
    id: value.id,
    name: value.name,
    sort_order: value.sortOrder,
  };
}

function toPlannerMealTemplate(
  value: (typeof fixtureData.planner.meals)[number],
): PlannerMealTemplate {
  return {
    id: value.id,
    column_id: value.columnId,
    planned_servings: value.plannedServings,
    status: value.status as MealStatus,
    is_leftover: value.isLeftover,
    date_anchor: value.dateAnchor as DateAnchor,
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function buildInitialFixtureState(): QaFixtureState {
  return {
    isLiked: false,
    likeCount: fixtureData.fixture.recipe.likeCount,
    saveCount: fixtureData.fixture.recipe.saveCount,
    savedBookIds: [],
    books: fixtureData.fixture.books.map(toRecipeBookSummary),
    nextBookSortOrder: fixtureData.fixture.books.length + 1,
    plannerColumns: fixtureData.planner.columns.map(toPlannerColumn),
    plannerMealTemplates: fixtureData.planner.meals.map(toPlannerMealTemplate),
    createdMeals: [],
  };
}

function getGlobalStore(): {
  [globalFixtureStoreKey]?: QaFixtureState;
} {
  return globalThis as typeof globalThis & {
    [globalFixtureStoreKey]?: QaFixtureState;
  };
}

export function getQaFixtureState() {
  const globalStore = getGlobalStore();

  if (!globalStore[globalFixtureStoreKey]) {
    globalStore[globalFixtureStoreKey] = buildInitialFixtureState();
  }

  return globalStore[globalFixtureStoreKey]!;
}

export function resetQaFixtureState() {
  getGlobalStore()[globalFixtureStoreKey] = buildInitialFixtureState();
}

export const MOCK_RECIPE_ID = fixtureData.ids.mockRecipeId;
export const DB_SMOKE_RECIPE_ID = fixtureData.ids.dbSmokeRecipeId;
export const MOCK_DISCOVERY_FILTER_ONION_ID = fixtureData.ingredients[0]!.id;
export const MOCK_DISCOVERY_FILTER_GREEN_ONION_ID = fixtureData.ingredients[1]!.id;
export const MOCK_DISCOVERY_FILTER_BEEF_ID = fixtureData.ingredients[2]!.id;
export const QA_FIXTURE_MAIN_USER_ID = fixtureData.ids.mainFixtureUserId;
export const QA_FIXTURE_OTHER_USER_ID = fixtureData.ids.otherFixtureUserId;

export function isQaFixtureModeEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.HOMECOOK_ENABLE_QA_FIXTURES === "1";
}

export function isDiscoveryFilterManualMockEnabled() {
  return process.env.HOMECOOK_ENABLE_DISCOVERY_FILTER_MOCK === "1" || isQaFixtureModeEnabled();
}

function buildRecipeCardFromState(state: QaFixtureState): RecipeCardItem {
  return {
    id: MOCK_RECIPE_ID,
    title: fixtureData.recipe.title,
    thumbnail_url: fixtureData.recipe.thumbnailUrl,
    tags: clone(fixtureData.recipe.tags),
    base_servings: fixtureData.recipe.baseServings,
    view_count: fixtureData.fixture.recipe.cardViewCount,
    like_count: state.likeCount,
    save_count: state.saveCount,
    source_type: fixtureData.recipe.sourceType as "system",
  };
}

function buildRecipeUserStatusFromState(state: QaFixtureState): RecipeUserStatus {
  return {
    is_liked: state.isLiked,
    is_saved: state.savedBookIds.length > 0,
    saved_book_ids: clone(state.savedBookIds),
  };
}

function buildRecipeDetailFromState(state: QaFixtureState): RecipeDetail {
  return {
    id: MOCK_RECIPE_ID,
    title: fixtureData.recipe.title,
    description: fixtureData.recipe.description,
    thumbnail_url: fixtureData.recipe.thumbnailUrl,
    base_servings: fixtureData.recipe.baseServings,
    tags: clone(fixtureData.recipe.tags),
    source_type: fixtureData.recipe.sourceType as "system",
    source: null,
    view_count: fixtureData.fixture.recipe.detailViewCount,
    like_count: state.likeCount,
    save_count: state.saveCount,
    plan_count: fixtureData.fixture.recipe.planCount,
    cook_count: fixtureData.fixture.recipe.cookCount,
    ingredients: fixtureData.recipe.ingredients.map((ingredient) => ({
      id: ingredient.id,
      ingredient_id: ingredient.ingredientId,
      standard_name: ingredient.standardName,
      amount: ingredient.amount,
      unit: ingredient.unit,
      ingredient_type: ingredient.ingredientType as "QUANT" | "TO_TASTE",
      display_text: ingredient.displayText,
      scalable: ingredient.scalable,
      sort_order: ingredient.sortOrder,
    })),
    steps: fixtureData.recipe.steps.map((step) => {
      const method = fixtureData.cookingMethods.find(
        (value) => value.id === step.cookingMethodId,
      );

      return {
        id: step.id,
        step_number: step.stepNumber,
        instruction: step.instruction,
        cooking_method: method
          ? {
              id: method.id,
              code: method.code,
              label: method.label,
              color_key: method.colorKey,
            }
          : null,
        ingredients_used: clone(step.ingredientsUsed),
        heat_level: step.heatLevel,
        duration_seconds: step.durationSeconds,
        duration_text: step.durationText,
      };
    }),
    user_status: buildRecipeUserStatusFromState(state),
  };
}

function matchesIngredientQuery(
  ingredient: IngredientItem,
  synonyms: string[],
  query: string,
) {
  if (query.length === 0) {
    return true;
  }

  return (
    ingredient.standard_name.includes(query)
    || synonyms.some((synonym) => synonym.includes(query))
  );
}

export function getMockIngredientList(
  query?: string | null,
  category?: string | null,
): IngredientListData {
  const normalizedQuery = query?.trim() ?? "";
  const normalizedCategory = category?.trim() ?? "";

  const items = fixtureData.ingredients
    .map(toIngredientItem)
    .filter((ingredient) => {
      const synonyms = fixtureData.ingredientSynonyms
        .filter((value) => value.ingredientId === ingredient.id)
        .map((value) => value.synonym);
      const matchesCategory =
        normalizedCategory.length === 0 || ingredient.category === normalizedCategory;

      return matchesCategory && matchesIngredientQuery(ingredient, synonyms, normalizedQuery);
    });

  return { items };
}

export function getMockRecipeList(
  query?: string | null,
  ingredientIds?: string[] | null,
): RecipeListData {
  const normalized = query?.trim().toLowerCase() ?? "";
  const hasRequiredIngredients = !ingredientIds?.length
    || ingredientIds.every((ingredientId) =>
      fixtureData.recipe.recipeCardIngredientIds.includes(ingredientId),
    );
  const state = getQaFixtureState();
  const recipeCard = buildRecipeCardFromState(state);
  const matchesQuery =
    normalized.length === 0
    || recipeCard.title.toLowerCase().includes(normalized)
    || recipeCard.tags.some((tag) => tag.toLowerCase().includes(normalized));

  return {
    items: hasRequiredIngredients && matchesQuery ? [recipeCard] : [],
    next_cursor: null,
    has_next: false,
  };
}

export function getMockRecipeThemes(): RecipeThemesData {
  return {
    themes: [
      {
        id: "popular",
        title: "이번 주 인기 레시피",
        recipes: [buildRecipeCardFromState(getQaFixtureState())],
      },
    ],
  };
}

export const MOCK_RECIPE_CARD = buildRecipeCardFromState(buildInitialFixtureState());
export const MOCK_RECIPE_DETAIL = {
  ...buildRecipeDetailFromState(buildInitialFixtureState()),
  user_status: null,
} satisfies RecipeDetail;

export function getQaFixtureRecipeDetail() {
  return buildRecipeDetailFromState(getQaFixtureState());
}

export function toggleQaFixtureRecipeLike() {
  const state = getQaFixtureState();
  state.isLiked = !state.isLiked;
  state.likeCount = state.isLiked
    ? state.likeCount + 1
    : Math.max(0, state.likeCount - 1);

  return {
    is_liked: state.isLiked,
    like_count: state.likeCount,
  } satisfies RecipeLikeData;
}

export function getQaFixtureRecipeBooks() {
  const state = getQaFixtureState();

  return {
    books: clone(state.books).sort((left, right) => {
      if (left.sort_order === right.sort_order) {
        return left.id.localeCompare(right.id);
      }

      return left.sort_order - right.sort_order;
    }),
  } satisfies RecipeBookListData;
}

export function createQaFixtureRecipeBook(name: string) {
  const state = getQaFixtureState();
  const normalizedName = name.trim();
  const now = new Date().toISOString();
  const createdBook: FixtureBookState = {
    id: crypto.randomUUID(),
    name: normalizedName,
    book_type: "custom",
    recipe_count: 0,
    sort_order: state.nextBookSortOrder,
  };

  state.nextBookSortOrder += 1;
  state.books = [...state.books, createdBook];

  return {
    id: createdBook.id,
    name: createdBook.name,
    book_type: "custom",
    recipe_count: 0,
    sort_order: createdBook.sort_order,
    created_at: now,
    updated_at: now,
  } satisfies RecipeBookCreateData;
}

export function saveQaFixtureRecipeToBook(bookId: string) {
  const state = getQaFixtureState();
  const selectedBook = state.books.find((book) => book.id === bookId);

  if (!selectedBook) {
    return {
      ok: false as const,
      code: "RESOURCE_NOT_FOUND",
      message: "레시피북을 찾을 수 없어요.",
      status: 404,
    };
  }

  if (state.savedBookIds.includes(bookId)) {
    return {
      ok: false as const,
      code: "CONFLICT",
      message: "이미 저장된 레시피예요.",
      status: 409,
    };
  }

  state.savedBookIds = [...state.savedBookIds, bookId];
  state.saveCount += 1;
  state.books = state.books.map((book) =>
    book.id === bookId
      ? {
          ...book,
          recipe_count: book.recipe_count + 1,
        }
      : book,
  );

  return {
    ok: true as const,
    data: {
      saved: true,
      save_count: state.saveCount,
      book_id: bookId,
    } satisfies RecipeSaveData,
  };
}

function addDays(value: string, offset: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function resolveAnchoredDate(startDate: string, endDate: string, anchor: DateAnchor) {
  if (anchor === "start") {
    return startDate;
  }

  if (anchor === "end") {
    return endDate;
  }

  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const middle = new Date((start.getTime() + end.getTime()) / 2);
  return middle.toISOString().slice(0, 10);
}

export function getQaFixturePlannerData(startDate: string, endDate: string) {
  const state = getQaFixtureState();
  const normalizedColumns = buildFixedPlannerColumns(state.plannerColumns);
  const createdMeals = state.createdMeals.filter((meal) => meal.plan_date >= startDate && meal.plan_date <= endDate);

  return {
    columns: normalizedColumns.columns,
    meals: [
      ...clone(state.plannerMealTemplates).map((meal) => ({
        id: meal.id,
        recipe_id: MOCK_RECIPE_ID,
        recipe_title: fixtureData.recipe.title,
        recipe_thumbnail_url: fixtureData.recipe.thumbnailUrl,
        plan_date: resolveAnchoredDate(startDate, endDate, meal.date_anchor),
        column_id: normalizedColumns.getFixedColumnId(meal.column_id),
        planned_servings: meal.planned_servings,
        status: meal.status,
        is_leftover: meal.is_leftover,
      })),
      ...createdMeals.map((meal) => ({
        ...meal,
        recipe_title: fixtureData.recipe.title,
        recipe_thumbnail_url: fixtureData.recipe.thumbnailUrl,
        column_id: normalizedColumns.getFixedColumnId(meal.column_id),
      })),
    ],
  } satisfies PlannerData;
}

export function createQaFixtureMeal({
  planDate,
  columnId,
  plannedServings,
  leftoverDishId,
}: {
  planDate: string;
  columnId: string;
  plannedServings: number;
  leftoverDishId: string | null;
}) {
  const state = getQaFixtureState();
  const selectedColumn = state.plannerColumns.find((column) => column.id === columnId);

  if (!selectedColumn) {
    return {
      ok: false as const,
      code: "RESOURCE_NOT_FOUND",
      message: "끼니 컬럼을 찾을 수 없어요.",
      status: 404,
    };
  }

  const meal: MealCreateData = {
    id: crypto.randomUUID(),
    recipe_id: MOCK_RECIPE_ID,
    plan_date: planDate,
    column_id: columnId,
    planned_servings: plannedServings,
    status: "registered",
    is_leftover: leftoverDishId !== null,
    leftover_dish_id: leftoverDishId,
  };

  state.createdMeals = [...state.createdMeals, meal];

  return {
    ok: true as const,
    data: meal,
  };
}

export function createQaFixturePlannerColumn(name: string) {
  const state = getQaFixtureState();

  if (state.plannerColumns.length >= 5) {
    return {
      ok: false as const,
      code: "MAX_COLUMNS_REACHED",
      message: "최대 5개까지 추가할 수 있어요",
      status: 409,
    };
  }

  const createdColumn: PlannerColumnData = {
    id: crypto.randomUUID(),
    name: name.trim(),
    sort_order: state.plannerColumns.length,
  };

  state.plannerColumns = [...state.plannerColumns, createdColumn];

  return {
    ok: true as const,
    data: createdColumn,
  };
}

export function updateQaFixturePlannerColumn(
  columnId: string,
  updates: {
    name?: string;
    sort_order?: number;
  },
) {
  const state = getQaFixtureState();
  const orderedColumns = clone(state.plannerColumns).sort(
    (left, right) => left.sort_order - right.sort_order,
  );
  const currentIndex = orderedColumns.findIndex((column) => column.id === columnId);

  if (currentIndex < 0) {
    return {
      ok: false as const,
      code: "RESOURCE_NOT_FOUND",
      message: "끼니 컬럼을 찾을 수 없어요.",
      status: 404,
    };
  }

  const target = orderedColumns[currentIndex]!;

  if (typeof updates.name === "string") {
    target.name = updates.name.trim();
  }

  if (typeof updates.sort_order === "number") {
    const nextIndex = Math.max(0, Math.min(updates.sort_order, orderedColumns.length - 1));

    if (currentIndex !== nextIndex) {
      const swapColumn = orderedColumns[nextIndex];
      orderedColumns[currentIndex] = swapColumn!;
      orderedColumns[nextIndex] = target;
    }
  }

  state.plannerColumns = orderedColumns.map((column, index) => ({
    ...column,
    sort_order: index,
  }));

  return {
    ok: true as const,
    data: state.plannerColumns.find((column) => column.id === columnId)!,
  };
}

export function deleteQaFixturePlannerColumn(columnId: string) {
  const state = getQaFixtureState();
  const exists = state.plannerColumns.some((column) => column.id === columnId);

  if (!exists) {
    return {
      ok: false as const,
      code: "RESOURCE_NOT_FOUND",
      message: "끼니 컬럼을 찾을 수 없어요.",
      status: 404,
    };
  }

  if (state.plannerMealTemplates.some((meal) => meal.column_id === columnId)) {
    return {
      ok: false as const,
      code: "COLUMN_HAS_MEALS",
      message: "식사가 등록된 컬럼은 삭제할 수 없어요.",
      status: 409,
    };
  }

  state.plannerColumns = state.plannerColumns
    .filter((column) => column.id !== columnId)
    .map((column, index) => ({
      ...column,
      sort_order: index,
    }));

  return {
    ok: true as const,
  };
}

export function getQaFixtureIds() {
  return clone(fixtureData.ids);
}

export function getQaFixtureDiscoveryIngredients() {
  return fixtureData.ingredients
    .slice(0, 3)
    .map(toIngredientItem);
}

export function getQaFixtureRecipePath() {
  return `/recipe/${MOCK_RECIPE_ID}`;
}

export function getQaFixtureDateWindow(startDate: string) {
  return {
    startDate,
    midDate: addDays(startDate, 3),
    endDate: addDays(startDate, 6),
  };
}
