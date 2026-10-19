import { fail, ok } from "@/lib/api/response";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import { groupShoppingItemsByCategory } from "@/lib/shopping-categories";
import { createRouteHandlerClient } from "@/lib/supabase/server";
import type { ShoppingShareTextData } from "@/types/shopping";

interface RouteContext {
  params: Promise<{
    list_id: string;
  }>;
}

type ShoppingListRow = {
  id: string;
  user_id: string;
  title: string;
  date_range_start: string;
  is_completed: boolean;
};

interface ShoppingListShareItemRow {
  id: string;
  display_text: string;
  ingredients?: { category: string | null } | null;
  is_checked: boolean;
  is_pantry_excluded: boolean;
  sort_order: number;
}

// Scope to the read projection and actual ingredient FK. SDK preserves
// maybeSingle/list phases; no new runtime client or permission boundary.
export type ShoppingShareTextDbClient = Pick<SupabaseClient<{
  public: {
    Tables: {
      shopping_lists: {
        Row: ShoppingListRow;
        Insert: never; Update: never; Relationships: [];
      };
      shopping_list_items: {
        Row: { id: string; shopping_list_id: string; ingredient_id: string | null;
          display_text: string; is_checked: boolean; is_pantry_excluded: boolean; sort_order: number };
        Insert: never; Update: never;
        Relationships: [{ foreignKeyName: "shopping_list_items_ingredient_id_fkey";
          columns: ["ingredient_id"]; isOneToOne: false;
          referencedRelation: "ingredients"; referencedColumns: ["id"]; }];
      };
      ingredients: {
        Row: { id: string; category: string };
        Insert: never; Update: never; Relationships: [];
      };
    };
    Views: Record<never, never>; Functions: Record<never, never>;
  };
}>, "from">;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

function buildFallbackTitle(dateIso: string) {
  const date = new Date(`${dateIso}T00:00:00.000Z`);
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();

  return `${month}/${day} 장보기`;
}

function buildShoppingShareText(list: ShoppingListRow, items: ShoppingListShareItemRow[]): string {
  const title = list.title.trim() || buildFallbackTitle(list.date_range_start);
  const header = `📋 ${title}`;

  if (items.length === 0) {
    return header;
  }

  const groups = groupShoppingItemsByCategory(
    items.map((item) => ({
      ...item,
      category: item.ingredients?.category ?? null,
    })),
  );

  const body = groups
    .map((group) => {
      const lines = group.items.map(
        (item) => `${item.is_checked ? "☑" : "☐"} ${item.display_text}`,
      );
      return [`[${group.category}]`, ...lines].join("\n");
    })
    .join("\n\n");

  return `${header}\n\n${body}`;
}

export async function GET(_request: Request, context: RouteContext) {
  const { list_id: listId } = await context.params;

  if (!isUuid(listId)) {
    return fail("RESOURCE_NOT_FOUND", "장보기 리스트를 찾을 수 없어요.", 404);
  }

  const routeClient = await createRouteHandlerClient();
  const authResult = await routeClient.auth.getUser();
  const user = authResult.data.user;

  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  const bootstrapClient: UserBootstrapDbClient = routeClient;
  const dbClient: ShoppingShareTextDbClient = routeClient;

  try {
    await ensurePublicUserRow(bootstrapClient, user);
    await ensureUserBootstrapState(bootstrapClient, user.id);
  } catch (bootstrapError) {
    return fail(
      "INTERNAL_ERROR",
      formatBootstrapErrorMessage(bootstrapError, "장보기 공유 텍스트를 만들지 못했어요."),
      500,
    );
  }

  const listResult = await dbClient
    .from("shopping_lists")
    .select("id, user_id, title, date_range_start, is_completed")
    .eq("id", listId)
    .maybeSingle();

  if (listResult.error || !listResult.data) {
    return fail("RESOURCE_NOT_FOUND", "장보기 리스트를 찾을 수 없어요.", 404);
  }

  if (listResult.data.user_id !== user.id) {
    return fail("FORBIDDEN", "내 장보기 리스트만 공유할 수 있어요.", 403);
  }

  const itemsResult = await dbClient
    .from("shopping_list_items")
    .select("id, display_text, is_checked, is_pantry_excluded, sort_order, ingredients(category)")
    .eq("shopping_list_id", listId)
    .eq("is_pantry_excluded", false)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (itemsResult.error || !itemsResult.data) {
    return fail("INTERNAL_ERROR", "장보기 공유 텍스트를 만들지 못했어요.", 500);
  }

  return ok({
    text: buildShoppingShareText(listResult.data, itemsResult.data),
  } satisfies ShoppingShareTextData);
}
