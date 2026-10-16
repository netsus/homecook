import type { SupabaseClient } from "@supabase/supabase-js";
import type { RecipeBookType, RecipeCardUserStatus } from "@/types/recipe";

type SavedRecipeBookItemRow = {
  recipe_id: string;
  book_id: string;
};

// Selected-row projections and the existing book FK, not a replacement DB schema.
// Native builders expose delete despite never Insert/Update payloads; this is
// not deep-readonly typing or a runtime grant. This consumer only selects.
export type RecipeCardUserStatusDbClient = Pick<SupabaseClient<{
  public: {
    Tables: {
      recipe_book_items: {
        Row: SavedRecipeBookItemRow;
        Insert: never;
        Update: never;
        Relationships: [{
          foreignKeyName: "recipe_book_items_book_id_fkey";
          columns: ["book_id"];
          isOneToOne: false;
          referencedRelation: "recipe_books";
          referencedColumns: ["id"];
        }];
      };
      recipe_books: {
        Row: { id: string; user_id: string; book_type: RecipeBookType };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
  };
}>, "from">;

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
