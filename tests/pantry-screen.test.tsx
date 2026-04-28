// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PantryScreen } from "@/components/pantry/pantry-screen";

const mockFetchPantryList = vi.fn();
const mockDeletePantryItems = vi.fn();
const mockAddPantryItems = vi.fn();
const mockFetchPantryBundles = vi.fn();
const mockFetchIngredients = vi.fn();

vi.mock("@/lib/api/pantry", () => ({
  fetchPantryList: (...args: unknown[]) => mockFetchPantryList(...args),
  deletePantryItems: (...args: unknown[]) => mockDeletePantryItems(...args),
  addPantryItems: (...args: unknown[]) => mockAddPantryItems(...args),
  fetchPantryBundles: (...args: unknown[]) => mockFetchPantryBundles(...args),
  fetchIngredients: (...args: unknown[]) => mockFetchIngredients(...args),
  isPantryApiError: (error: unknown) => error instanceof Error && "status" in error,
}));

vi.mock("@/lib/supabase/browser", () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  }),
}));

vi.mock("@/lib/supabase/env", () => ({
  hasSupabasePublicEnv: () => false,
}));

vi.mock("@/lib/auth/e2e-auth-override", () => ({
  readE2EAuthOverride: () => null,
  withE2EAuthOverrideHeaders: (init?: RequestInit) => init ?? {},
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const MOCK_ITEMS = [
  {
    id: "p1",
    ingredient_id: "i1",
    standard_name: "양파",
    category: "채소",
    created_at: "2026-04-29T00:00:00Z",
  },
  {
    id: "p2",
    ingredient_id: "i2",
    standard_name: "마늘",
    category: "양념",
    created_at: "2026-04-29T01:00:00Z",
  },
  {
    id: "p3",
    ingredient_id: "i3",
    standard_name: "돼지고기",
    category: "육류",
    created_at: "2026-04-29T02:00:00Z",
  },
];

describe("PantryScreen", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mockFetchPantryList.mockReset();
    mockDeletePantryItems.mockReset();
    mockAddPantryItems.mockReset();
    mockFetchPantryBundles.mockReset();
    mockFetchIngredients.mockReset();

    mockFetchPantryList.mockResolvedValue({ items: MOCK_ITEMS });
    mockFetchIngredients.mockResolvedValue({ items: [] });
    mockFetchPantryBundles.mockResolvedValue({ bundles: [] });
  });

  it("shows the unauthorized gate when not authenticated", () => {
    render(<PantryScreen initialAuthenticated={false} />);

    expect(
      screen.getByRole("heading", { name: "이 화면은 로그인이 필요해요" }),
    ).toBeTruthy();
    expect(screen.getByText(/팬트리 화면으로 바로 복귀/)).toBeTruthy();
  });

  it("shows the pantry item list when authenticated", async () => {
    render(<PantryScreen initialAuthenticated />);

    expect(await screen.findByText("양파", { exact: false })).toBeTruthy();
    expect(screen.getByText("마늘", { exact: false })).toBeTruthy();
    expect(screen.getByText(/돼지고기/)).toBeTruthy();
    expect(screen.getByText("3개 재료 보유 중")).toBeTruthy();
  });

  it("shows the empty state when pantry has no items", async () => {
    mockFetchPantryList.mockResolvedValue({ items: [] });

    render(<PantryScreen initialAuthenticated />);

    expect(
      await screen.findByText(/아직 등록한 재료가 없어요/),
    ).toBeTruthy();
  });

  it("shows the error state and retries on failure", async () => {
    mockFetchPantryList.mockRejectedValueOnce(new Error("fail"));

    render(<PantryScreen initialAuthenticated />);

    expect(
      await screen.findByText("팬트리를 불러올 수 없어요"),
    ).toBeTruthy();

    mockFetchPantryList.mockResolvedValue({ items: MOCK_ITEMS });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "다시 시도" }));

    expect(await screen.findByText("양파", { exact: false })).toBeTruthy();
  });

  it("enters select mode and shows the delete action bar", async () => {
    render(<PantryScreen initialAuthenticated />);

    await screen.findByText("양파", { exact: false });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "선택" }));

    expect(screen.getByRole("button", { name: "취소" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /선택 삭제/ }),
    ).toBeTruthy();
  });

  it("selects items and shows the delete confirm modal", async () => {
    render(<PantryScreen initialAuthenticated />);

    await screen.findByText("양파", { exact: false });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "선택" }));

    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[0]);

    expect(screen.getByText("1개 선택됨")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /선택 삭제/ }));

    expect(
      screen.getByText("재료를 삭제할까요?"),
    ).toBeTruthy();
  });

  it("deletes selected items and shows success toast", async () => {
    mockDeletePantryItems.mockResolvedValue({ removed: 1 });

    render(<PantryScreen initialAuthenticated />);

    await screen.findByText("양파", { exact: false });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "선택" }));

    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[0]);
    await user.click(screen.getByRole("button", { name: /선택 삭제/ }));
    const confirmButtons = screen.getAllByRole("button", { name: /삭제/ });
    const confirmDeleteButton = confirmButtons.find(
      (btn) => btn.textContent?.trim() === "삭제 (1)",
    )!;
    await user.click(confirmDeleteButton);

    await waitFor(() => {
      expect(screen.getByText("1개 재료가 삭제됐어요")).toBeTruthy();
    });
  });

  it("keeps the add sheet open and shows feedback when add fails", async () => {
    mockFetchIngredients.mockResolvedValue({
      items: [{ id: "i4", standard_name: "대파", category: "채소" }],
    });
    mockAddPantryItems.mockRejectedValue(new Error("fail"));

    render(<PantryScreen initialAuthenticated />);

    await screen.findByText("양파", { exact: false });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /재료 추가/ }));

    expect(await screen.findByRole("dialog", { name: "재료 추가" })).toBeTruthy();

    await user.click(await screen.findByRole("checkbox", { name: "대파" }));
    await user.click(screen.getByRole("button", { name: "팬트리에 추가 (1)" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "추가에 실패했어요. 다시 시도해 주세요.",
    );
    expect(screen.getByRole("dialog", { name: "재료 추가" })).toBeTruthy();
  });

  it("keeps the bundle picker open and shows feedback when bundle add fails", async () => {
    mockFetchPantryBundles.mockResolvedValue({
      bundles: [
        {
          id: "b1",
          name: "기본 야채",
          display_order: 1,
          ingredients: [
            {
              ingredient_id: "i4",
              is_in_pantry: false,
              standard_name: "대파",
            },
          ],
        },
      ],
    });
    mockAddPantryItems.mockRejectedValue(new Error("fail"));

    render(<PantryScreen initialAuthenticated />);

    await screen.findByText("양파", { exact: false });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "묶음 추가" }));

    expect(
      await screen.findByRole("dialog", { name: "묶음으로 재료 추가" }),
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "1개 팬트리에 추가" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "추가에 실패했어요. 다시 시도해 주세요.",
    );
    expect(
      screen.getByRole("dialog", { name: "묶음으로 재료 추가" }),
    ).toBeTruthy();
  });

  it("shows category filter chips from the item list", async () => {
    render(<PantryScreen initialAuthenticated />);

    await screen.findByText("양파", { exact: false });

    expect(screen.getByRole("tab", { name: "전체" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "채소" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "양념" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "육류" })).toBeTruthy();
  });

  it("filters items by category when a chip is tapped", async () => {
    render(<PantryScreen initialAuthenticated />);

    await screen.findByText("양파", { exact: false });

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "채소" }));

    await waitFor(() => {
      expect(mockFetchPantryList).toHaveBeenCalledWith(
        expect.objectContaining({ category: "채소" }),
      );
    });
  });

  it("shows the search input with a searchbox role", async () => {
    render(<PantryScreen initialAuthenticated />);

    await screen.findByText("양파", { exact: false });

    expect(screen.getByRole("searchbox")).toBeTruthy();
  });
});
