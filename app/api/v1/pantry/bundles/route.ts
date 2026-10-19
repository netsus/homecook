import { fail, ok } from "@/lib/api/response";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildPantryBundles,
} from "@/lib/server/pantry";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import { createRouteHandlerClient } from "@/lib/supabase/server";

// Consumed fields and the real bundle-item ingredient FK; no runtime wrapper.
export type PantryBundlesDbClient = Pick<SupabaseClient<{
  public: {
    Tables: {
      ingredient_bundles: {
        Row: { id: string; name: string; display_order: number };
        Insert: never; Update: never; Relationships: [];
      };
      ingredient_bundle_items: {
        Row: { bundle_id: string; ingredient_id: string };
        Insert: never; Update: never;
        Relationships: [{ foreignKeyName: "ingredient_bundle_items_ingredient_id_fkey";
          columns: ["ingredient_id"]; isOneToOne: false;
          referencedRelation: "ingredients"; referencedColumns: ["id"]; }];
      };
      ingredients: {
        Row: { id: string; standard_name: string };
        Insert: never; Update: never; Relationships: [];
      };
      pantry_items: {
        Row: { user_id: string; ingredient_id: string | null };
        Insert: never; Update: never; Relationships: [];
      };
    };
    Views: Record<never, never>; Functions: Record<never, never>;
  };
}>, "from">;

interface PantryBundlesAuthSuccess {
  dbClient: PantryBundlesDbClient;
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

  const bootstrapClient: UserBootstrapDbClient = routeClient;
  const dbClient: PantryBundlesDbClient = routeClient;

  try {
    await ensurePublicUserRow(bootstrapClient, user);
    await ensureUserBootstrapState(bootstrapClient, user.id);
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
  let pantryItems: Array<{ ingredient_id: string | null }> = [];

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
