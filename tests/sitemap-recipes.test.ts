import { beforeEach, describe, expect, it, vi } from "vitest";

const limit = vi.fn();
const range = vi.fn();
const query = { limit, order: vi.fn(), range };
query.order.mockReturnValue(query);
const select = vi.fn(() => query);

vi.mock("@/lib/supabase/server", () => ({
  createPublicDataClient: vi.fn(() => ({
    from: vi.fn(() => ({ select })),
  })),
}));

describe("recipe sitemap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SITE_URL = "https://zipbap.example";
  });

  it("includes public recipe detail URLs with their update time", async () => {
    const response = {
      data: [
        { id: "recipe-a", updated_at: "2026-07-10T00:00:00.000Z" },
        { id: "recipe-b", updated_at: "2026-07-09T00:00:00.000Z" },
      ],
      error: null,
    };
    limit.mockResolvedValue(response);
    range.mockResolvedValue(response);

    const { default: sitemap } = await import("@/app/sitemap");
    const result = await sitemap();

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          lastModified: new Date("2026-07-10T00:00:00.000Z"),
          url: "https://zipbap.example/recipe/recipe-a",
        }),
        expect.objectContaining({
          lastModified: new Date("2026-07-09T00:00:00.000Z"),
          url: "https://zipbap.example/recipe/recipe-b",
        }),
      ]),
    );
  });

  it("paginates beyond the PostgREST row limit", async () => {
    const firstPage = Array.from({ length: 1_000 }, (_, index) => ({
      id: `recipe-${index}`,
      updated_at: "2026-07-10T00:00:00.000Z",
    }));
    range
      .mockResolvedValueOnce({ data: firstPage, error: null })
      .mockResolvedValueOnce({
        data: [{ id: "recipe-1000", updated_at: "2026-07-09T00:00:00.000Z" }],
        error: null,
      });
    limit.mockResolvedValue({ data: firstPage, error: null });

    const { default: sitemap } = await import("@/app/sitemap");
    const result = await sitemap();

    expect(range).toHaveBeenNthCalledWith(1, 0, 999);
    expect(range).toHaveBeenNthCalledWith(2, 1_000, 1_999);
    expect(query.order).toHaveBeenCalledWith("id", { ascending: true });
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: "https://zipbap.example/recipe/recipe-1000",
        }),
      ]),
    );
  });
});
