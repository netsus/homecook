// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HomeScreen } from "@/components/home/home-screen";
import {
  getMockRecipeList,
  getMockRecipeThemes,
  MOCK_RECIPE_CARD,
} from "@/lib/mock/recipes";

const fetchJson = vi.fn();

vi.mock("@/lib/api/fetch-json", () => ({
  fetchJson: (...args: unknown[]) => fetchJson(...args),
}));

describe("home screen", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    fetchJson.mockReset();
    fetchJson.mockImplementation((input: string) => {
      if (input.startsWith("/api/v1/recipes/themes")) {
        return Promise.resolve(getMockRecipeThemes());
      }

      return Promise.resolve(getMockRecipeList());
    });
  });

  it("shows themed sections together with the recipe list on initial load", async () => {
    render(<HomeScreen />);

    expect(
      await screen.findByRole("heading", { name: "이번 주 인기 레시피" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "모든 레시피" }),
    ).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /집밥 김치찌개/i }).length).toBe(2);
  });

  it("shows the empty state when both recipes and themes are empty", async () => {
    fetchJson.mockImplementation((input: string) => {
      if (input.startsWith("/api/v1/recipes/themes")) {
        return Promise.resolve({ themes: [] });
      }

      return Promise.resolve({
        items: [],
        next_cursor: null,
        has_next: false,
      });
    });

    render(<HomeScreen />);

    expect(
      await screen.findByRole("heading", { name: "다른 조합을 찾아보세요" }),
    ).toBeTruthy();
  });

  it("filters the recipe list without removing the section shell", async () => {
    fetchJson.mockImplementation((input: string) => {
      if (input.startsWith("/api/v1/recipes/themes")) {
        return Promise.resolve(getMockRecipeThemes());
      }

      const url = new URL(input, "http://localhost:3000");

      if (url.searchParams.get("q")) {
        return Promise.resolve({
          items: [],
          next_cursor: null,
          has_next: false,
        });
      }

      return Promise.resolve({
        items: [MOCK_RECIPE_CARD],
        next_cursor: null,
        has_next: false,
      });
    });

    render(<HomeScreen />);

    const searchInput = await screen.findByPlaceholderText("레시피 제목 검색");
    await userEvent.type(searchInput, "없는");

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "검색 결과" }),
      ).toBeTruthy();
    });

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "다른 조합을 찾아보세요" }),
      ).toBeTruthy();
    });
  });
});
