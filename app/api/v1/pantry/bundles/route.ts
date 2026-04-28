import { fail, ok } from "@/lib/api/response";
import {
  buildPantryBundles,
  type PantryBundleItemJoinedRow,
  type PantryBundleRow,
  type PantryIngredientRow,
} from "@/lib/server/pantry";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";

interface QueryError {
  message: string;
}

interface QueryOrderOption {
  ascending: boolean;
}

type ArrayResult<T> = PromiseLike<{
  data: T[] | null;
  error: QueryError | null;
}>;

interface BundlesSelectQuery {
  order(column: string, options: QueryOrderOption): BundlesSelectQuery;
  then: ArrayResult<PantryBundleRow>["then"];
}

interface BundleItemsSelectQuery {
  in(column: string, values: string[]): BundleItemsSelectQuery;
  then: ArrayResult<PantryBundleItemJoinedRow>["then"];
}

interface PantryItemsSelectQuery {
  eq(column: string, value: string): PantryItemsSelectQuery;
  in(column: string, values: string[]): PantryItemsSelectQuery;
  then: ArrayResult<PantryIngredientRow>["then"];
}

interface IngredientBundlesTable {
  select(columns: string): BundlesSelectQuery;
}

interface IngredientBundleItemsTable {
  select(columns: string): BundleItemsSelectQuery;
}

interface PantryItemsTable {
  select(columns: string): PantryItemsSelectQuery;
}

interface PantryBundlesDbClient {
  from(table: "ingredient_bundles"): IngredientBundlesTable;
  from(table: "ingredient_bundle_items"): IngredientBundleItemsTable;
  from(table: "pantry_items"): PantryItemsTable;
}

interface PantryBundlesAuthSuccess {
  dbClient: PantryBundlesDbClient & UserBootstrapDbClient;
  user: { id: string };
}

interface PantryBundlesAuthFailure {
  response: Response;
}

async function getAuthenticatedDb(): Promise<PantryBundlesAuthSuccess | PantryBundlesAuthFailure> {
  const routeClient = await createRouteHandlerClient();
  const authResult = await routeClient.auth.getUser();
  const user = authResult.data.user;

  if (!user) {
    return {
      response: fail("UNAUTHORIZED", "로그인이 필요해요.", 401),
    };
  }

  const dbClient = (createServiceRoleClient() ?? routeClient) as unknown as
    PantryBundlesDbClient & UserBootstrapDbClient;

  try {
    await ensurePublicUserRow(dbClient, user);
    await ensureUserBootstrapState(dbClient, user.id);
  } catch (bootstrapError) {
    return {
      response: fail(
        "INTERNAL_ERROR",
        formatBootstrapErrorMessage(bootstrapError, "팬트리 묶음을 불러오지 못했어요."),
        500,
      ),
    };
  }

  return {
    dbClient,
    user,
  };
}

export async function GET() {
  const auth = await getAuthenticatedDb();

  if ("response" in auth) {
    return auth.response;
  }

  const bundlesResult = await auth.dbClient
    .from("ingredient_bundles")
    .select("id, name, display_order")
    .order("display_order", { ascending: true })
    .order("id", { ascending: true });

  if (bundlesResult.error || !bundlesResult.data) {
    return fail("INTERNAL_ERROR", "팬트리 묶음을 불러오지 못했어요.", 500);
  }

  if (bundlesResult.data.length === 0) {
    return ok({ bundles: [] });
  }

  const bundleIds = bundlesResult.data.map((bundle) => bundle.id);
  const bundleItemsResult = await auth.dbClient
    .from("ingredient_bundle_items")
    .select("bundle_id, ingredient_id, ingredients!inner(standard_name)")
    .in("bundle_id", bundleIds);

  if (bundleItemsResult.error || !bundleItemsResult.data) {
    return fail("INTERNAL_ERROR", "팬트리 묶음을 불러오지 못했어요.", 500);
  }

  const ingredientIds = [
    ...new Set(bundleItemsResult.data.map((item) => item.ingredient_id)),
  ];
  let pantryItems: PantryIngredientRow[] = [];

  if (ingredientIds.length > 0) {
    const pantryItemsResult = await auth.dbClient
      .from("pantry_items")
      .select("ingredient_id")
      .eq("user_id", auth.user.id)
      .in("ingredient_id", ingredientIds);

    if (pantryItemsResult.error || !pantryItemsResult.data) {
      return fail("INTERNAL_ERROR", "팬트리 묶음을 불러오지 못했어요.", 500);
    }

    pantryItems = pantryItemsResult.data;
  }

  return ok({
    bundles: buildPantryBundles({
      bundles: bundlesResult.data,
      bundleItems: bundleItemsResult.data,
      pantryItems,
    }),
  });
}
