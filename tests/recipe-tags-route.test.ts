import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createRouteHandlerClient = vi.fn();
const createServiceRoleClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createRouteHandlerClient,
  createServiceRoleClient,
}));

async function importTagsRoute() {
  return import("@/app/api/v1/tags/route");
}

describe("36c public tags route", () => {
  beforeEach(() => {
    vi.resetModules();
    createRouteHandlerClient.mockReset();
    createServiceRoleClient.mockReset();
    createRouteHandlerClient.mockResolvedValue({});
  });

  it("returns public autocomplete tags through the DB policy function", async () => {
    const dbClient = {
      rpc: vi.fn(async (functionName: string, args: Record<string, unknown>) => {
        expect(functionName).toBe("list_public_recipe_tags");
        expect(args).toEqual({
          p_q: "한",
          p_kind: "semantic",
          p_theme_eligible: true,
          p_limit: 5,
        });

        return {
          data: [
            {
              normalized_key: "한식",
              label: "한식",
              slug: "korean",
              kind: "semantic",
              is_system: true,
              theme_eligible: true,
              usage_count: 12,
            },
          ],
          error: null,
        };
      }),
    };
    createRouteHandlerClient.mockResolvedValue(dbClient);

    const { GET } = await importTagsRoute();
    const response = await GET(new NextRequest(
      "http://localhost:3000/api/v1/tags?q=%ED%95%9C&kind=semantic&theme_eligible=true&limit=5",
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        items: [
          {
            normalized_key: "한식",
            label: "한식",
            slug: "korean",
            kind: "semantic",
            is_system: true,
            theme_eligible: true,
            usage_count: 12,
          },
        ],
      },
      error: null,
    });
  });

  it("treats unsupported kind filters as an empty public list", async () => {
    const dbClient = {
      rpc: vi.fn(),
    };
    createRouteHandlerClient.mockResolvedValue(dbClient);

    const { GET } = await importTagsRoute();
    const response = await GET(new NextRequest(
      "http://localhost:3000/api/v1/tags?kind=spam",
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(dbClient.rpc).not.toHaveBeenCalled();
    expect(body).toEqual({
      success: true,
      data: { items: [] },
      error: null,
    });
  });
});
