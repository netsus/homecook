// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SaveModal } from "@/components/recipe/save-modal";
import type { RecipeBookSummary } from "@/types/recipe";

const BOOKS: RecipeBookSummary[] = [
  {
    book_type: "saved",
    id: "book-saved",
    name: "저장한 레시피",
    recipe_count: 8,
    sort_order: 1,
  },
  {
    book_type: "custom",
    id: "book-custom",
    name: "주말 파티",
    recipe_count: 2,
    sort_order: 2,
  },
];

function renderSaveModal(overrides: Partial<React.ComponentProps<typeof SaveModal>> = {}) {
  const props: React.ComponentProps<typeof SaveModal> = {
    alreadySavedBookIds: [],
    books: BOOKS,
    isCreatingBook: false,
    isOpen: true,
    isSavingRecipe: false,
    loadErrorMessage: null,
    newBookName: "",
    onClose: vi.fn(),
    onCreateBook: vi.fn(),
    onNewBookNameChange: vi.fn(),
    onRetry: vi.fn(),
    onSaveRecipe: vi.fn(),
    onSelectBook: vi.fn(),
    saveErrorMessage: null,
    selectedBookIds: ["book-saved"],
    viewState: "ready",
    ...overrides,
  };

  render(<SaveModal {...props} />);

  const appDialog = screen
    .getAllByRole("dialog", { name: "레시피 저장" })
    .find((dialog) => dialog.getAttribute("data-app-overlay-shell") === "bottom-sheet");

  if (!appDialog) {
    throw new Error("SaveModal app bottom sheet was not rendered");
  }

  return { appDialog, props };
}

function renderDesktopSaveModal(
  overrides: Partial<React.ComponentProps<typeof SaveModal>> = {},
) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: query === "(min-width: 1024px)",
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  });

  const props: React.ComponentProps<typeof SaveModal> = {
    alreadySavedBookIds: [],
    books: BOOKS,
    isCreatingBook: false,
    isOpen: true,
    isSavingRecipe: false,
    loadErrorMessage: null,
    newBookName: "",
    onClose: vi.fn(),
    onCreateBook: vi.fn(),
    onNewBookNameChange: vi.fn(),
    onRetry: vi.fn(),
    onSaveRecipe: vi.fn(),
    onSelectBook: vi.fn(),
    saveErrorMessage: null,
    selectedBookIds: ["book-saved"],
    viewState: "ready",
    ...overrides,
  };

  render(<SaveModal {...props} />);

  return {
    desktopDialog: screen.getByRole("dialog", { name: "레시피 저장" }),
    props,
  };
}

describe("SaveModal", () => {
  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, "matchMedia");
  });

  it("renders the app bottom-sheet shell and fires shared footer actions", async () => {
    const { appDialog, props } = renderSaveModal();

    expect(appDialog.getAttribute("data-app-overlay-shell")).toBe("bottom-sheet");
    expect(within(appDialog).getByTestId("app-modal-footer-actions")).toBeTruthy();

    await userEvent.click(within(appDialog).getByRole("button", { name: "저장" }));
    expect(props.onSaveRecipe).toHaveBeenCalledTimes(1);

    await userEvent.click(within(appDialog).getByRole("button", { name: "취소" }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps book selection delegated to the parent", async () => {
    const { appDialog, props } = renderSaveModal();

    await userEvent.click(
      within(appDialog).getByRole("button", { name: /주말 파티/ }),
    );

    expect(props.onSelectBook).toHaveBeenCalledWith("book-custom");
  });

  it("allows already-saved books to be toggled off before final confirmation", async () => {
    const { appDialog, props } = renderSaveModal({
      alreadySavedBookIds: ["book-saved"],
      selectedBookIds: ["book-saved"],
    });

    const savedBookButton = within(appDialog).getByRole("button", {
      name: /저장한 레시피/,
    }) as HTMLButtonElement;

    expect(savedBookButton.disabled).toBe(false);

    await userEvent.click(savedBookButton);

    expect(props.onSelectBook).toHaveBeenCalledWith("book-saved");
  });

  it("omits the redundant app multi-select helper copy", () => {
    const { appDialog } = renderSaveModal();

    expect(within(appDialog).queryByText("레시피북 다중 선택")).toBeNull();
  });

  it("shows an in-modal skeleton while recipe books are loading", () => {
    const { appDialog } = renderSaveModal({
      books: [],
      selectedBookIds: [],
      viewState: "loading",
    });

    expect(within(appDialog).getByTestId("save-modal-loading-skeleton")).toBeTruthy();
    expect(within(appDialog).queryByText(/불러오는 중이에요/)).toBeNull();
  });

  it("keeps desktop quick-create collapsed until requested", async () => {
    const { desktopDialog, props } = renderDesktopSaveModal();
    const dialog = within(desktopDialog);

    expect(dialog.queryByPlaceholderText("레시피북 이름")).toBeNull();

    await userEvent.click(dialog.getByRole("button", { name: "새 레시피북 만들기" }));

    expect(dialog.getByPlaceholderText("레시피북 이름")).toBeTruthy();

    await userEvent.type(dialog.getByPlaceholderText("레시피북 이름"), "오늘 저녁");
    expect(props.onNewBookNameChange).toHaveBeenCalled();

    cleanup();

    const { desktopDialog: readyDialog, props: readyProps } = renderDesktopSaveModal({
      newBookName: "오늘 저녁",
    });
    const readyScope = within(readyDialog);

    await userEvent.click(readyScope.getByRole("button", { name: "새 레시피북 만들기" }));
    await userEvent.click(readyScope.getByRole("button", { name: "추가" }));

    expect(readyProps.onCreateBook).toHaveBeenCalledTimes(1);
  });
});
