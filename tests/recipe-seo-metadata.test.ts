import { beforeEach, describe, expect, it, vi } from "vitest";

const maybeSingle = vi.fn();
const eq = vi.fn(() => ({ maybeSingle }));
const select = vi.fn(() => ({ eq }));

vi.mock("@/lib/supabase/server", () => ({
  createPublicDataClient: vi.fn(() => ({
    from: vi.fn(() => ({ select })),
  })),
  createServerComponentClient: vi.fn(async () => ({
    from: vi.fn(() => ({ select })),
  })),
  getServerAuthUser: vi.fn(async () => null),
}));

describe("recipe SEO metadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SITE_URL = "https://zipbap.example";
  });

  it("uses the public recipe title, description, image, and canonical URL", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        description: "매콤하고 부드러운 집밥 제육볶음",
        thumbnail_url: "https://images.example/jeyuk.jpg",
        title: "제육볶음",
      },
      error: null,
    });

    const page = await import("@/app/recipe/[id]/page");

    expect(page.generateMetadata).toBeTypeOf("function");
    if (typeof page.generateMetadata !== "function") return;

    await expect(
      page.generateMetadata({
        params: Promise.resolve({ id: "recipe-123" }),
        searchParams: Promise.resolve({}),
      }),
    ).resolves.toMatchObject({
      alternates: { canonical: "/recipe/recipe-123" },
      description: "매콤하고 부드러운 집밥 제육볶음",
      openGraph: {
        description: "매콤하고 부드러운 집밥 제육볶음",
        images: ["https://images.example/jeyuk.jpg"],
        title: "제육볶음",
        type: "article",
        url: "/recipe/recipe-123",
      },
      title: "제육볶음",
      twitter: {
        card: "summary_large_image",
        images: ["https://images.example/jeyuk.jpg"],
        title: "제육볶음",
      },
    });
  });

  it("keeps undisclosed recipe metadata neutral and non-indexable without an authenticated lookup", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const page = await import("@/app/recipe/[id]/page");

    expect(page.generateMetadata).toBeTypeOf("function");
    if (typeof page.generateMetadata !== "function") return;

    const metadata = await page.generateMetadata({
      params: Promise.resolve({ id: "missing" }),
      searchParams: Promise.resolve({}),
    });
    expect(metadata).toEqual({
      robots: { follow: false, index: false },
      title: "레시피 상세",
    });
    expect(select).toHaveBeenCalledWith("title, description, thumbnail_url");
    expect(eq).toHaveBeenCalledWith("id", "missing");
    const server = await import("@/lib/supabase/server");
    expect(server.createServerComponentClient).not.toHaveBeenCalled();
  });

  it("keeps a canonical fallback indexable during a temporary metadata lookup error", async () => {
    maybeSingle.mockResolvedValue({
      data: null,
      error: { message: "temporary database error" },
    });
    const page = await import("@/app/recipe/[id]/page");

    const metadata = await page.generateMetadata({
      params: Promise.resolve({ id: "recipe-123" }),
      searchParams: Promise.resolve({}),
    });

    expect(metadata).toMatchObject({
      alternates: { canonical: "/recipe/recipe-123" },
      title: "레시피 상세",
    });
    expect(metadata.robots).toBeUndefined();
  });
});
