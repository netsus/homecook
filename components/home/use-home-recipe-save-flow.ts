"use client";

import { useCallback, useMemo, useState } from "react";

import {
  createCustomRecipeBook,
  fetchSaveableRecipeBooks,
  removeRecipeFromBook,
  saveRecipeToBooks,
} from "@/lib/api/recipe-save";
import type {
  RecipeBookSummary,
  RecipeCardItem,
} from "@/types/recipe";

type SaveModalState = "idle" | "loading" | "ready" | "error";

interface UseHomeRecipeSaveFlowArgs {
  isAuthenticated: boolean;
  onRecipeSaved: (recipeId: string, saveCount: number) => void;
  requestLogin: (recipeId: string) => void;
}

export function useHomeRecipeSaveFlow({
  isAuthenticated,
  onRecipeSaved,
  requestLogin,
}: UseHomeRecipeSaveFlowArgs) {
  const [savedRecipeIds, setSavedRecipeIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [savedBookIdsByRecipeId, setSavedBookIdsByRecipeId] = useState<
    Record<string, string[]>
  >({});
  const [saveTargetRecipe, setSaveTargetRecipe] =
    useState<RecipeCardItem | null>(null);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveModalState, setSaveModalState] = useState<SaveModalState>("idle");
  const [saveBooks, setSaveBooks] = useState<RecipeBookSummary[]>([]);
  const [selectedSaveBookIds, setSelectedSaveBookIds] = useState<string[]>([]);
  const [newSaveBookName, setNewSaveBookName] = useState("");
  const [saveLoadError, setSaveLoadError] = useState<string | null>(null);
  const [saveSubmitError, setSaveSubmitError] = useState<string | null>(null);
  const [isCreatingBook, setIsCreatingBook] = useState(false);
  const [isSavingRecipe, setIsSavingRecipe] = useState(false);

  const alreadySavedBookIds = useMemo(() => {
    if (!saveTargetRecipe) {
      return [];
    }

    return savedBookIdsByRecipeId[saveTargetRecipe.id] ?? [];
  }, [saveTargetRecipe, savedBookIdsByRecipeId]);

  const loadSaveBooks = useCallback(
    async (recipeId: string) => {
      setSaveModalState("loading");
      setSaveLoadError(null);
      setSaveSubmitError(null);

      try {
        const books = await fetchSaveableRecipeBooks();
        const availableBookIds = new Set(books.map((book) => book.id));
        const savedBookIds = savedBookIdsByRecipeId[recipeId] ?? [];
        const availableSavedBookIds = savedBookIds.filter((bookId) =>
          availableBookIds.has(bookId),
        );

        setSaveBooks(books);
        setSelectedSaveBookIds((currentBookIds) => {
          const retainedBookIds = currentBookIds.filter((bookId) =>
            availableBookIds.has(bookId),
          );

          if (retainedBookIds.length > 0) {
            return retainedBookIds;
          }

          if (availableSavedBookIds.length > 0) {
            return availableSavedBookIds;
          }

          return books[0] ? [books[0].id] : [];
        });
        setSaveModalState("ready");
      } catch (error) {
        setSaveLoadError(
          error instanceof Error
            ? error.message
            : "레시피북 목록을 불러오지 못했어요.",
        );
        setSaveModalState("error");
      }
    },
    [savedBookIdsByRecipeId],
  );

  const openRecipeSaveModal = useCallback(
    async (recipe: RecipeCardItem) => {
      if (!isAuthenticated) {
        requestLogin(recipe.id);
        return;
      }

      setSaveTargetRecipe(recipe);
      setIsSaveModalOpen(true);
      setSaveSubmitError(null);
      setNewSaveBookName("");

      await loadSaveBooks(recipe.id);
    },
    [isAuthenticated, loadSaveBooks, requestLogin],
  );

  const closeSaveModal = useCallback(() => {
    if (isSavingRecipe || isCreatingBook) {
      return;
    }

    setIsSaveModalOpen(false);
    setSaveTargetRecipe(null);
    setSaveSubmitError(null);
    setSaveLoadError(null);
    setSaveModalState("idle");
    setNewSaveBookName("");
    setSelectedSaveBookIds([]);
  }, [isCreatingBook, isSavingRecipe]);

  const retryLoadSaveBooks = useCallback(() => {
    if (!saveTargetRecipe) {
      return;
    }

    void loadSaveBooks(saveTargetRecipe.id);
  }, [loadSaveBooks, saveTargetRecipe]);

  const createSaveBook = useCallback(async () => {
    const normalizedName = newSaveBookName.trim();

    if (!normalizedName) {
      setSaveSubmitError("레시피북 이름을 입력해 주세요.");
      return;
    }

    if (normalizedName.length > 50) {
      setSaveSubmitError("레시피북 이름은 50자를 넘길 수 없어요.");
      return;
    }

    setIsCreatingBook(true);
    setSaveSubmitError(null);

    try {
      const createdBook = await createCustomRecipeBook(normalizedName);

      setSaveBooks((currentBooks) => {
        const nextBooks = currentBooks.some((book) => book.id === createdBook.id)
          ? currentBooks
          : [
              ...currentBooks,
              {
                id: createdBook.id,
                name: createdBook.name,
                book_type: createdBook.book_type,
                recipe_count: createdBook.recipe_count,
                sort_order: createdBook.sort_order,
              },
            ];

        return [...nextBooks].sort((left, right) => {
          if (left.sort_order === right.sort_order) {
            return left.id.localeCompare(right.id);
          }

          return left.sort_order - right.sort_order;
        });
      });
      setSelectedSaveBookIds((currentBookIds) =>
        currentBookIds.includes(createdBook.id)
          ? currentBookIds
          : [...currentBookIds, createdBook.id],
      );
      setNewSaveBookName("");
      setSaveModalState("ready");
    } catch (error) {
      setSaveSubmitError(
        error instanceof Error ? error.message : "레시피북을 만들지 못했어요.",
      );
    } finally {
      setIsCreatingBook(false);
    }
  }, [newSaveBookName]);

  const saveRecipe = useCallback(async () => {
    if (!saveTargetRecipe || isSavingRecipe) {
      return;
    }

    const newBookIds = selectedSaveBookIds.filter(
      (bookId) => !alreadySavedBookIds.includes(bookId),
    );
    const removedBookIds = alreadySavedBookIds.filter(
      (bookId) => !selectedSaveBookIds.includes(bookId),
    );

    if (newBookIds.length === 0 && removedBookIds.length === 0) {
      return;
    }

    setIsSavingRecipe(true);
    setSaveSubmitError(null);

    try {
      const recipeId = saveTargetRecipe.id;
      const saveResult = newBookIds.length > 0
        ? await saveRecipeToBooks(recipeId, newBookIds)
        : null;

      await Promise.all(
        removedBookIds.map((bookId) => removeRecipeFromBook(bookId, recipeId)),
      );

      const baseSaveCount = saveResult?.save_count ?? saveTargetRecipe.save_count;
      const nextSaveCount = Math.max(0, baseSaveCount - removedBookIds.length);
      const nextSavedBookIds = selectedSaveBookIds;

      setSavedRecipeIds((currentRecipeIds) => {
        const nextRecipeIds = new Set(currentRecipeIds);
        if (nextSavedBookIds.length > 0) {
          nextRecipeIds.add(recipeId);
        } else {
          nextRecipeIds.delete(recipeId);
        }
        return nextRecipeIds;
      });
      setSavedBookIdsByRecipeId((currentByRecipeId) => {
        return {
          ...currentByRecipeId,
          [recipeId]: nextSavedBookIds,
        };
      });
      onRecipeSaved(recipeId, nextSaveCount);
      setIsSaveModalOpen(false);
      setSaveTargetRecipe(null);
      setSaveModalState("idle");
      setSelectedSaveBookIds([]);
    } catch (error) {
      setSaveSubmitError(
        error instanceof Error ? error.message : "레시피를 저장하지 못했어요.",
      );
    } finally {
      setIsSavingRecipe(false);
    }
  }, [
    alreadySavedBookIds,
    isSavingRecipe,
    onRecipeSaved,
    saveTargetRecipe,
    selectedSaveBookIds,
  ]);

  const selectSaveBook = useCallback((bookId: string) => {
    setSelectedSaveBookIds((currentBookIds) =>
      currentBookIds.includes(bookId)
        ? currentBookIds.filter((currentBookId) => currentBookId !== bookId)
        : [...currentBookIds, bookId],
    );
  }, []);

  return {
    alreadySavedBookIds,
    closeSaveModal,
    createSaveBook,
    isCreatingBook,
    isSaveModalOpen,
    isSavingRecipe,
    newSaveBookName,
    openRecipeSaveModal,
    retryLoadSaveBooks,
    saveBooks,
    saveLoadError,
    saveModalState,
    saveRecipe,
    saveSubmitError,
    savedRecipeIds,
    selectSaveBook,
    selectedSaveBookIds,
    setNewSaveBookName,
  };
}
