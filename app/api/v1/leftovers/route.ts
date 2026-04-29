import { NextRequest } from "next/server";

import { readE2EAuthOverrideHeader } from "@/lib/auth/e2e-auth-override";
import { fail, ok } from "@/lib/api/response";
import { getQaFixtureLeftovers, isQaFixtureModeEnabled } from "@/lib/mock/recipes";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import {
  normalizeLeftoverStatus,
  toLeftoverListItem,
  type LeftoverDishRow,
  type LeftoverRecipeRow,
} from "@/lib/server/leftovers";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { LeftoverListData } from "@/types/leftover";

interface QueryError {
  code?: string;
  message: string;
}

type ArrayQueryResult<T> = PromiseLike<{
  data: T[] | null;
  error: QueryError | null;
}>;

interface QueryOrderOption {
  ascending: boolean;
}

interface LeftoverSelectQuery {
  eq(column: string, value: string): LeftoverSelectQuery;
  gt(column: string, value: string): LeftoverSelectQuery;
  order(column: string, options: QueryOrderOption): LeftoverSelectQuery;
  then: ArrayQueryResult<LeftoverDishRow>["then"];
}

interface RecipeSelectQuery {
  in(column: string, values: string[]): RecipeSelectQuery;
  then: ArrayQueryResult<LeftoverRecipeRow>["then"];
}

interface LeftoverDishesTable {
  select(columns: string): LeftoverSelectQuery;
}

interface RecipesTable {
  select(columns: string): RecipeSelectQuery;
}

interface LeftoversDbClient {
  from(table: "leftover_dishes"): LeftoverDishesTable;
  from(table: "recipes"): RecipesTable;
}

async function requireUser(routeClient: Awaited<ReturnType<typeof createRouteHandlerClient>>) {
  const authResult = await routeClient.auth.getUser();
  return authResult.data.user;
}

export async function GET(request: NextRequest) {
  const status = normalizeLeftoverStatus(request.nextUrl.searchParams.get("status"));

  if (!status) {
    return fail("VALIDATION_ERROR", "요청 값을 확인해주세요.", 422, [
      { field: "status", reason: "invalid_value" },
    ]);
  }

  if (isQaFixtureModeEnabled()) {
    const authOverride = readE2EAuthOverrideHeader(request.headers);

    if (authOverride !== "authenticated") {
      return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
    }

    return ok(getQaFixtureLeftovers(status) satisfies LeftoverListData);
  }

  const routeClient = await createRouteHandlerClient();
  const user = await requireUser(routeClient);

  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  const dbClient = (createServiceRoleClient() ?? routeClient) as unknown as
    LeftoversDbClient & UserBootstrapDbClient;

  try {
    await ensurePublicUserRow(dbClient, user);
    await ensureUserBootstrapState(dbClient, user.id);
  } catch (bootstrapError) {
    return fail(
      "INTERNAL_ERROR",
      formatBootstrapErrorMessage(bootstrapError, "남은요리 목록을 불러오지 못했어요."),
      500,
    );
  }

  let leftoversQuery = dbClient
    .from("leftover_dishes")
    .select("id, user_id, recipe_id, status, cooked_at, eaten_at, auto_hide_at")
    .eq("user_id", user.id)
    .eq("status", status);

  if (status === "eaten") {
    leftoversQuery = leftoversQuery
      .gt("auto_hide_at", new Date().toISOString())
      .order("eaten_at", { ascending: false })
      .order("id", { ascending: false });
  } else {
    leftoversQuery = leftoversQuery
      .order("cooked_at", { ascending: false })
      .order("id", { ascending: false });
  }

  const leftoversResult = await leftoversQuery;

  if (leftoversResult.error || !leftoversResult.data) {
    return fail("INTERNAL_ERROR", "남은요리 목록을 불러오지 못했어요.", 500);
  }

  const recipeIds = [...new Set(leftoversResult.data.map((item) => item.recipe_id))];
  const recipeMap = new Map<string, LeftoverRecipeRow>();

  if (recipeIds.length > 0) {
    const recipesResult = await dbClient
      .from("recipes")
      .select("id, title, thumbnail_url")
      .in("id", recipeIds);

    if (recipesResult.error || !recipesResult.data) {
      return fail("INTERNAL_ERROR", "남은요리 목록을 불러오지 못했어요.", 500);
    }

    recipesResult.data.forEach((recipe) => {
      recipeMap.set(recipe.id, recipe);
    });
  }

  return ok({
    items: leftoversResult.data.map((row) => toLeftoverListItem(row, recipeMap)),
  } satisfies LeftoverListData);
}
