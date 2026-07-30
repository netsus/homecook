import { beforeEach, describe, expect, it, vi } from "vitest";

const createRouteHandlerClient = vi.fn();
const createRemoteCompatibilityServiceRoleClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createRouteHandlerClient,
  createRemoteCompatibilityServiceRoleClient,
}));

vi.mock("@/lib/auth/e2e-auth-override", () => ({
  readE2EAuthOverrideHeader: vi.fn(() => null),
}));

vi.mock("@/lib/mock/recipes", () => ({
  getQaFixtureRecipeDetail: vi.fn(),
  isQaFixtureModeEnabled: vi.fn(() => false),
  MOCK_RECIPE_DETAIL: {},
  MOCK_RECIPE_ID: "mock-recipe-id",
}));

vi.mock("@/lib/server/user-bootstrap", () => ({
  formatBootstrapErrorMessage: vi.fn((_error: unknown, fallbackMessage: string) => fallbackMessage),
}));

vi.mock("@/lib/server/recipe-image-read", () => ({
  normalizeExpectedRecipeImageStorageOrigin: vi.fn((value: string) => new URL(value).origin),
  readRecipeImageProjection: vi.fn(),
  resolveRecipeImageReadUrl: vi.fn(),
}));

function createMissingRecipeQuery() {
  const query = {
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({
      data: null,
      error: null,
    })),
  };

  return query;
}

async function importRecipeDetailRoute() {
  return import("@/app/api/v1/recipes/[id]/route");
}

describe("personal recipe editor permission boundaries", () => {
  beforeEach(() => {
    vi.resetModules();
    createRouteHandlerClient.mockReset();
    createRemoteCompatibilityServiceRoleClient.mockReset();
    createRemoteCompatibilityServiceRoleClient.mockReturnValue({
      from: vi.fn(() => {
        throw new Error("service-role detail reads must not start before parent visibility passes");
      }),
    });
  });

  it("returns the same 404 envelope before any child-table read when the parent recipe is hidden", async () => {
    const recipesQuery = createMissingRecipeQuery();
    const routeClient = {
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: "viewer-1" } },
        })),
      },
      from: vi.fn((table: string) => {
        if (table === "recipes") {
          return {
            select: vi.fn(() => recipesQuery),
          };
        }

        throw new Error(`unexpected child read: ${table}`);
      }),
    };

    createRouteHandlerClient.mockResolvedValue(routeClient);

    const { GET } = await importRecipeDetailRoute();
    const response = await GET(
      new Request("http://localhost:3000/api/v1/recipes/550e8400-e29b-41d4-a716-446655440001"),
      {
        params: Promise.resolve({
          id: "550e8400-e29b-41d4-a716-446655440001",
        }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      success: false,
      data: null,
      error: {
        code: "RESOURCE_NOT_FOUND",
        message: "레시피를 찾을 수 없어요.",
        fields: [],
      },
    });
    expect(createRouteHandlerClient).toHaveBeenCalledWith({
      anonymousPublicReadScope: "recipe-detail",
    });
    expect(createRemoteCompatibilityServiceRoleClient).not.toHaveBeenCalled();
    expect(routeClient.from).toHaveBeenCalledTimes(1);
    expect(routeClient.from).toHaveBeenCalledWith("recipes");
    expect(recipesQuery.eq).toHaveBeenCalledWith("id", "550e8400-e29b-41d4-a716-446655440001");
  });

  it("keeps the parent recipe read ahead of child reads and exposes no PATCH or DELETE handler in the detail route", async () => {
    const source = await import("node:fs/promises").then(({ readFile }) =>
      readFile("app/api/v1/recipes/[id]/route.ts", "utf8"),
    );

    const getHandler = source.slice(source.indexOf("export async function GET"));
    const parentReadIndex = getHandler.indexOf("const recipeResult = await routeClient");
    const childReadIndex = getHandler.indexOf("const [");

    expect(parentReadIndex).toBeGreaterThan(-1);
    expect(childReadIndex).toBeGreaterThan(parentReadIndex);
    expect(source).not.toContain("export async function PATCH");
    expect(source).not.toContain("export async function DELETE");
    expect(source).toContain('return fail("RESOURCE_NOT_FOUND", "레시피를 찾을 수 없어요.", 404);');
  });
});
