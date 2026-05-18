import { fetchJson } from "@/lib/api/fetch-json";
import type {
  RecipeBookCreateData,
  RecipeBookDeleteData,
  RecipeBookListData,
  RecipeBookSummary,
  RecipeSaveData,
} from "@/types/recipe";

const SAVEABLE_BOOK_TYPES = new Set(["saved", "custom"]);

function sortBooks(books: RecipeBookSummary[]) {
  return [...books].sort((left, right) => {
    if (left.sort_order === right.sort_order) {
      return left.id.localeCompare(right.id);
    }

    return left.sort_order - right.sort_order;
  });
}

export async function fetchSaveableRecipeBooks() {
  const data = await fetchJson<RecipeBookListData>("/api/v1/recipe-books");

  const books = data.books.filter((book) => SAVEABLE_BOOK_TYPES.has(book.book_type));

  return sortBooks(books);
}

export async function createCustomRecipeBook(name: string) {
  const normalizedName = name.trim();

  const createdBook = await fetchJson<RecipeBookCreateData>("/api/v1/recipe-books", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: normalizedName,
    }),
  });

  return createdBook;
}

export async function saveRecipeToBooks(recipeId: string, bookIds: string[]) {
  return fetchJson<RecipeSaveData>(`/api/v1/recipes/${recipeId}/save`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      book_ids: bookIds,
    }),
  });
}

export async function removeRecipeFromBook(bookId: string, recipeId: string) {
  return fetchJson<RecipeBookDeleteData>(
    `/api/v1/recipe-books/${bookId}/recipes/${recipeId}`,
    { method: "DELETE" },
  );
}
