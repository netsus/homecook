import { resolveRecipeImage } from "@/lib/recipe-image";
import type {
  RecipeBookCoverColorKey,
  RecipeBookSummary,
} from "@/types/recipe";

export const RECIPE_BOOK_COVER_TONES = [
  "sage",
  "sky",
  "coral",
  "lavender",
  "sand",
] as const satisfies readonly RecipeBookCoverColorKey[];

export interface RecipeBookCoverViewModel {
  imageSrc: string;
  tone: RecipeBookCoverColorKey;
}

export function isRecipeBookCoverTone(
  value: unknown,
): value is RecipeBookCoverColorKey {
  return (
    typeof value === "string" &&
    RECIPE_BOOK_COVER_TONES.includes(value as RecipeBookCoverColorKey)
  );
}

export function getRecipeBookCoverTone(
  book: Pick<
    RecipeBookSummary,
    "book_type" | "cover_color_key" | "sort_order"
  >,
): RecipeBookCoverColorKey {
  if (isRecipeBookCoverTone(book.cover_color_key)) {
    return book.cover_color_key;
  }

  if (book.book_type === "custom") {
    return (
      RECIPE_BOOK_COVER_TONES[
        Math.abs(book.sort_order) % RECIPE_BOOK_COVER_TONES.length
      ] ?? "sage"
    );
  }

  if (book.book_type === "saved") {
    return "sky";
  }
  if (book.book_type === "liked") {
    return "coral";
  }
  if (book.book_type === "my_added") {
    return "lavender";
  }

  return "sand";
}

export function getRecipeBookCoverViewModel(
  book: RecipeBookSummary,
  options: { loadedImageSrc?: string | null } = {},
): RecipeBookCoverViewModel {
  return {
    imageSrc:
      book.cover_image_url ??
      options.loadedImageSrc ??
      resolveRecipeImage({ id: book.id }),
    tone: getRecipeBookCoverTone(book),
  };
}

export function normalizeRecipeBookCoverImageUrl(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed || trimmed.length > 2048) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
  } catch {
    return null;
  }

  return trimmed;
}
