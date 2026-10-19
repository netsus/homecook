// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecipeSearchPicker } from "@/components/planner/recipe-search-picker";

const recipe = (id: string) => ({ id, title: id, base_servings: 2, thumbnail_url: null,
  tags: [], source_type: "system", view_count: 0, save_count: 0, like_count: 0 });
const page = (ids: string[], cursor: string | null = null) => Response.json({ success: true,
  data: { items: ids.map(recipe), next_cursor: cursor, has_next: cursor !== null }, error: null });
function mountPicker() {
  render(<RecipeSearchPicker selectedRecipe={null} isCreating={false} onRecipeSelect={vi.fn()}
    onServingsConfirm={vi.fn()} onServingsCancel={vi.fn()} />);
}
function search(query: string) {
  fireEvent.change(screen.getByRole("textbox", { name: "레시피 검색" }), { target: { value: query } });
  fireEvent.click(screen.getByRole("button", { name: "검색" }));
}
beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("recipe picker real API query normalization", () => {
  it.each(["", "   "])("omits empty/whitespace q from initial and paginated wire URLs (%j)", async query => {
    const urls: URL[] = [];
    vi.mocked(fetch).mockImplementation(async input => {
      const url = new URL(String(input), "http://localhost");
      urls.push(url);
      return url.searchParams.has("cursor") ? page(["next"]) : page(["initial"], "empty-next");
    });
    mountPicker();
    await screen.findByRole("button", { name: "initial 선택" });
    if (query) {
      fireEvent.change(screen.getByRole("textbox", { name: "레시피 검색" }), { target: { value: query } });
      await waitFor(() => expect(urls).toHaveLength(2));
      await screen.findByRole("button", { name: "initial 선택" });
    }
    fireEvent.click(screen.getByRole("button", { name: "레시피 더 보기" }));
    await screen.findByRole("button", { name: "next 선택" });
    expect(urls.every(url => url.pathname === "/api/v1/recipes" && !url.searchParams.has("q"))).toBe(true);
    expect(urls.every(url => url.searchParams.get("limit") === "10")).toBe(true);
    expect(urls.at(-1)?.searchParams.get("cursor")).toBe("empty-next");
  });

  it("trims search q, keeps it on pagination, deduplicates rows and does not reconsume a cursor", async () => {
    const urls: URL[] = [];
    vi.mocked(fetch).mockImplementation(async input => {
      const url = new URL(String(input), "http://localhost"); urls.push(url);
      if (!url.searchParams.has("q")) return page(["initial"]);
      return url.searchParams.has("cursor") ? page(["query", "next"], "cursor 1") : page(["query"], "cursor 1");
    });
    mountPicker(); await screen.findByRole("button", { name: "initial 선택" });
    search("  김치  "); await screen.findByRole("button", { name: "query 선택" });
    fireEvent.click(screen.getByRole("button", { name: "레시피 더 보기" }));
    await screen.findByRole("button", { name: "next 선택" });
    expect(urls.slice(1).map(url => url.searchParams.get("q"))).toEqual(["김치", "김치"]);
    expect(urls.at(-1)?.searchParams.get("cursor")).toBe("cursor 1");
    expect(screen.getAllByRole("button", { name: "query 선택" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "레시피 더 보기" })).toBeNull();
    expect(urls).toHaveLength(3);
  });

  it("retries a failed page with the same query/cursor without discarding existing results", async () => {
    const urls: URL[] = []; let failed = false;
    vi.mocked(fetch).mockImplementation(async input => {
      const url = new URL(String(input), "http://localhost"); urls.push(url);
      if (!url.searchParams.has("q")) return page(["initial"]);
      if (!url.searchParams.has("cursor")) return page(["query"], "retry-next");
      if (!failed) { failed = true; return Response.json({ success: false, data: null,
        error: { code: "INTERNAL_ERROR", message: "page failure", fields: [] } }, { status: 500 }); }
      return page(["retried"]);
    });
    mountPicker(); await screen.findByRole("button", { name: "initial 선택" });
    search("김치"); await screen.findByRole("button", { name: "query 선택" });
    fireEvent.click(screen.getByRole("button", { name: "레시피 더 보기" }));
    fireEvent.click(await screen.findByRole("button", { name: "다시 불러오기" }));
    await screen.findByRole("button", { name: "retried 선택" });
    expect(screen.getByRole("button", { name: "query 선택" })).toBeTruthy();
    expect(urls.slice(-2).map(url => [url.searchParams.get("q"), url.searchParams.get("cursor")]))
      .toEqual([["김치", "retry-next"], ["김치", "retry-next"]]);
  });

  it("ignores an old search response after a newer query completes", async () => {
    let finishOld: (response: Response) => void = () => { throw new Error("old request missing"); };
    vi.mocked(fetch).mockImplementation(async input => {
      const url = new URL(String(input), "http://localhost");
      if (url.searchParams.get("q") === "old") return new Promise<Response>(resolve => { finishOld = resolve; });
      return page([url.searchParams.get("q") === "new" ? "new-result" : "initial"]);
    });
    mountPicker(); await screen.findByRole("button", { name: "initial 선택" });
    search("old"); search("new"); await screen.findByRole("button", { name: "new-result 선택" });
    await act(async () => { finishOld(page(["old-result"])); });
    expect(screen.queryByRole("button", { name: "old-result 선택" })).toBeNull();
    expect(screen.getByRole("button", { name: "new-result 선택" })).toBeTruthy();
  });

  it("ignores an old page response after changing the query", async () => {
    let finishPage: (response: Response) => void = () => { throw new Error("page request missing"); };
    vi.mocked(fetch).mockImplementation(async input => {
      const url = new URL(String(input), "http://localhost");
      if (url.searchParams.has("cursor")) return new Promise<Response>(resolve => { finishPage = resolve; });
      return url.searchParams.get("q") === "new" ? page(["new-result"]) : page(["initial"], "old-page");
    });
    mountPicker(); await screen.findByRole("button", { name: "initial 선택" });
    fireEvent.click(screen.getByRole("button", { name: "레시피 더 보기" }));
    search("new"); await screen.findByRole("button", { name: "new-result 선택" });
    await act(async () => { finishPage(page(["old-page-result"])); });
    expect(screen.queryByRole("button", { name: "old-page-result 선택" })).toBeNull();
    expect(screen.getByRole("button", { name: "new-result 선택" })).toBeTruthy();
  });
});
