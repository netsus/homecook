import type { RecipeCardUserStatus } from "@/types/recipe";

interface QueryError {
  message: string;
}

interface SavedRecipeBookItemRow {
  recipe_id: string;
  book_id: string;
}

type ArrayResult<T> = PromiseLike<{
  data: T[] | null;
  error: QueryError | null;
}>;

interface SavedRecipeBookItemsQuery {
  eq(column: string, value: string): SavedRecipeBookItemsQuery;
  in(column: string, values: string[]): SavedRecipeBookItemsQuery;
  then: ArrayResult<SavedRecipeBookItemRow>["then"];
}

interface SavedRecipeBookItemsTable {
  select(columns: string): SavedRecipeBookItemsQuery;
}

export interface RecipeCardUserStatusDbClient {
  from(table: "recipe_book_items"): SavedRecipeBookItemsTable;
}

function buildEmptyRecipeCardUserStatuses(recipeIds: string[]) {
  return new Map<string, RecipeCardUserStatus>(
    recipeIds.map((recipeId) => [
      recipeId,
      {
        is_saved: false,
        saved_book_ids: [],
      },
    ]),
  );
}

export async function readRecipeCardUserStatuses({
  dbClient,
  recipeIds,
  userId,
}: {
  dbClient: RecipeCardUserStatusDbClient;
  recipeIds: string[];
  userId: string | null;
}) {
  const uniqueRecipeIds = [...new Set(recipeIds)];
  const statuses = buildEmptyRecipeCardUserStatuses(uniqueRecipeIds);

  if (!userId || uniqueRecipeIds.length === 0) {
    return statuses;
  }

  const result = await dbClient
    .from("recipe_book_items")
    .select("recipe_id, book_id, recipe_books!inner(book_type, user_id)")
    .in("recipe_id", uniqueRecipeIds)
    .eq("recipe_books.user_id", userId)
    .in("recipe_books.book_type", ["saved", "custom"]);

  if (result.error || !result.data) {
    return statuses;
  }

  result.data.forEach((item) => {
    const currentStatus = statuses.get(item.recipe_id);

    if (!currentStatus) {
      return;
    }

    if (!currentStatus.saved_book_ids.includes(item.book_id)) {
      currentStatus.saved_book_ids.push(item.book_id);
      currentStatus.is_saved = true;
    }
  });

  return statuses;
}
