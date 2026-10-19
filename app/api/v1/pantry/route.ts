import { after, NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { readE2EAuthOverrideHeader } from "@/lib/auth/e2e-auth-override";
import { fail, ok } from "@/lib/api/response";
import {
  ALL_INGREDIENT_CATEGORY,
  isValidIngredientCategory,
} from "@/lib/ingredient-categories";
import { ingredientSearchPattern, normalizeIngredientSearchName } from "@/lib/ingredient-search";
import { expandIngredientIdentityIds, loadIngredientAliases, type IngredientAliases } from "@/lib/server/ingredient-canonical-search";
import {
  normalizeIngredientIds,
  toPantryItems,
  type IngredientRow,
  type PantryItemJoinedRow,
} from "@/lib/server/pantry";
import {
  getQaFixturePantryItems,
  isQaFixtureModeEnabled,
} from "@/lib/mock/recipes";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import {
  recordUserGrowthActivityEvent,
  type UserGrowthActivityDbClient,
} from "@/lib/server/user-growth-activity";
import { createRouteHandlerClient } from "@/lib/supabase/server";
import type { PantryMutationBody } from "@/types/pantry";
import type { PantryProductItem } from "@/types/pantry";

interface QueryError {
  message: string;
}

type ArrayResult<T> = PromiseLike<{
  data: T[] | null;
  error: QueryError | null;
}>;

interface PantryProductJoinedRow {
  id: string;
  food_product_id: string;
  food_product_nutrition_version_id: string;
  created_at: string;
  food_product_nutrition_versions:
    | {
        food_products:
          | { name: string; brand: string | null }
          | Array<{ name: string; brand: string | null }>
          | null;
      }
    | Array<{
        food_products:
          | { name: string; brand: string | null }
          | Array<{ name: string; brand: string | null }>
          | null;
      }>
    | null;
}

// Actual consumed native read/DML phases, including the nullable XOR identities
// and pinned composite product-version FK. Request RLS remains authoritative.
export type PantryDbClient = Pick<SupabaseClient<{
  public: {
    Tables: {
      pantry_items: {
        Row: { id: string; user_id: string; ingredient_id: string | null;
          food_product_id: string | null; food_product_nutrition_version_id: string | null; created_at: string };
        Insert: { user_id: string; ingredient_id: string } | { user_id: string;
          food_product_id: string; food_product_nutrition_version_id: string };
        Update: never;
        Relationships: [
          { foreignKeyName: "pantry_items_ingredient_id_fkey"; columns: ["ingredient_id"];
            isOneToOne: false; referencedRelation: "ingredients"; referencedColumns: ["id"]; },
          { foreignKeyName: "pantry_items_product_version_fkey";
            columns: ["food_product_id", "food_product_nutrition_version_id"]; isOneToOne: false;
            referencedRelation: "food_product_nutrition_versions"; referencedColumns: ["product_id", "id"]; },
        ];
      };
      ingredients: {
        Row: { id: string; standard_name: string; category: string; category_code: string | null; search_name: string };
        Insert: never; Update: never; Relationships: [];
      };
      ingredient_synonyms: {
        Row: { id: string; ingredient_id: string; synonym: string; search_name: string };
        Insert: never; Update: never; Relationships: [];
      };
      food_products: {
        Row: { id: string; name: string; brand: string | null; owner_user_id: string | null;
          visibility: "public" | "private"; deleted_at: string | null };
        Insert: never; Update: never; Relationships: [];
      };
      food_product_nutrition_versions: {
        Row: { id: string; product_id: string };
        Insert: never; Update: never;
        Relationships: [{ foreignKeyName: "food_product_nutrition_versions_product_id_fkey";
          columns: ["product_id"]; isOneToOne: false; referencedRelation: "food_products"; referencedColumns: ["id"]; }];
      };
    };
    Views: {
      ingredient_catalog_aliases: {
        Row: { ingredient_id: string; representative_ingredient_id: string; representative_standard_name: string;
          representative_category: string; representative_category_code: string | null };
        Relationships: [];
      };
    };
    Functions: Record<never, never>;
  };
}>, "from">;

const PANTRY_SELECT =
  "id, ingredient_id, created_at, ingredients!inner(standard_name, category, category_code)";
const PANTRY_SELECT_LEGACY =
  "id, ingredient_id, created_at, ingredients!inner(standard_name, category)";
const INGREDIENT_SELECT = "id, standard_name, category, category_code";
const INGREDIENT_SELECT_LEGACY = "id, standard_name, category";
// Product pantry rows reach food_products through their pinned composite version FK.
const PANTRY_PRODUCT_SELECT =
  "id, food_product_id, food_product_nutrition_version_id, created_at, food_product_nutrition_versions!pantry_items_product_version_fkey!inner(food_products!food_product_nutrition_versions_product_id_fkey!inner(name, brand))";

interface NormalizedProductInput {
  food_product_id: string;
  food_product_nutrition_version_id: string;
}

interface PantryAuthSuccess {
  dbClient: PantryDbClient;
  growthClient: UserGrowthActivityDbClient;
  user: { id: string };
}

interface PantryAuthFailure {
  response: Response;
}

function scheduleAfterResponse(task: () => Promise<void>) {
  try {
    after(task);
  } catch {
    void task();
  }
}

function schedulePantryItemAddedActivityRecords({
  auth,
  items,
}: {
  auth: PantryAuthSuccess;
  items: ReturnType<typeof toPantryItems>;
}) {
  scheduleAfterResponse(async () => {
    try {
      await Promise.allSettled(items.map((item) =>
        recordUserGrowthActivityEvent(auth.growthClient, {
          userId: auth.user.id,
          activityType: "pantry_item_added",
          category: "pantry",
          sourceKey: `pantry_item_added:${item.id}`,
          sourceTable: "pantry_items",
          sourceId: item.id,
          sourceMeta: { ingredient_id: item.ingredient_id },
          occurredAt: item.created_at,
        }),
      ));
    } catch {
      // Activity history is secondary; pantry mutation remains authoritative.
    }
  });
}

async function getAuthenticatedDb(
  fallbackMessage: string,
): Promise<PantryAuthSuccess | PantryAuthFailure> {
  const routeClient = await createRouteHandlerClient();
  const authResult = await routeClient.auth.getUser();
  const user = authResult.data.user;

  if (!user) {
    return {
      response: fail("UNAUTHORIZED", "로그인이 필요해요.", 401),
    };
  }

  const dbClient: PantryDbClient = routeClient;
  const bootstrapClient: UserBootstrapDbClient = routeClient;
  const growthClient: UserGrowthActivityDbClient = routeClient;

  try {
    await ensurePublicUserRow(bootstrapClient, user);
    await ensureUserBootstrapState(bootstrapClient, user.id);
  } catch (bootstrapError) {
    return {
      response: fail(
        "INTERNAL_ERROR",
        formatBootstrapErrorMessage(bootstrapError, fallbackMessage),
        500,
      ),
    };
  }

  return {
    dbClient,
    growthClient,
    user,
  };
}

async function readMutationBody(request: Request) {
  try {
    return (await request.json()) as PantryMutationBody;
  } catch {
    return null;
  }
}

function invalidIngredientIdsResponse() {
  return fail("VALIDATION_ERROR", "추가할 재료를 선택해 주세요.", 422, [
    { field: "ingredient_ids", reason: "required_non_empty" },
  ]);
}

function normalizeProductItems(value: unknown): NormalizedProductInput[] | null {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    return null;
  }

  const normalized: NormalizedProductInput[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (
      !item ||
      typeof item !== "object" ||
      typeof (item as Record<string, unknown>).food_product_id !== "string" ||
      typeof (item as Record<string, unknown>).food_product_nutrition_version_id !==
        "string"
    ) {
      return null;
    }

    const productId = (
      item as Record<string, string>
    ).food_product_id.trim();
    const versionId = (
      item as Record<string, string>
    ).food_product_nutrition_version_id.trim();

    if (!productId || !versionId) {
      return null;
    }

    const key = `${productId}:${versionId}`;
    if (!seen.has(key)) {
      seen.add(key);
      normalized.push({
        food_product_id: productId,
        food_product_nutrition_version_id: versionId,
      });
    }
  }

  return normalized;
}

function toPantryProductItems(rows: PantryProductJoinedRow[]): PantryProductItem[] {
  return rows.map((row) => {
    const version = Array.isArray(row.food_product_nutrition_versions)
      ? row.food_product_nutrition_versions[0]
      : row.food_product_nutrition_versions;
    const product = Array.isArray(version?.food_products)
      ? version.food_products[0]
      : version?.food_products;

    return {
      id: row.id,
      food_product_id: row.food_product_id,
      food_product_nutrition_version_id:
        row.food_product_nutrition_version_id,
      name: product?.name ?? "",
      brand: product?.brand ?? null,
      created_at: row.created_at,
    };
  });
}

// The ingredient inner join and product composite FK/XOR guarantee these
// branch-specific identities for valid rows; do not narrow the whole table.
function hasIngredientIdentity<T extends { ingredient_id: string | null }>(row: T): row is T & { ingredient_id: string } {
  return typeof row.ingredient_id === "string";
}

function hasProductIdentity<T extends { food_product_id: string | null; food_product_nutrition_version_id: string | null }>(
  row: T,
): row is T & { food_product_id: string; food_product_nutrition_version_id: string } {
  return typeof row.food_product_id === "string" && typeof row.food_product_nutrition_version_id === "string";
}

function productItemField(index: number) {
  return `product_items[${index}].food_product_nutrition_version_id`;
}

function isSchemaCacheMiss(error: QueryError | null | undefined) {
  return /category_code|schema cache|column .* does not exist/i.test(
    error?.message ?? "",
  );
}

function getPantrySelect(includeTaxonomyColumn: boolean) {
  return includeTaxonomyColumn ? PANTRY_SELECT : PANTRY_SELECT_LEGACY;
}

function buildPantryItemsQuery({
  auth,
  includeTaxonomyColumn,
  ingredientIds,
}: {
  auth: PantryAuthSuccess;
  includeTaxonomyColumn: boolean;
  ingredientIds?: string[];
}) {
  let query = auth.dbClient
    .from("pantry_items")
    .select(getPantrySelect(includeTaxonomyColumn));

  query = query.eq("user_id", auth.user.id);

  if (ingredientIds) {
    query = query.in("ingredient_id", ingredientIds);
  }

  return query
    .order("created_at", { ascending: false })
    .order("id", { ascending: true });
}

async function findPantryIngredientIds(dbClient: PantryDbClient, q: string, aliases: IngredientAliases) {
  const ids = new Set<string>();
  const pattern = ingredientSearchPattern(q);
  const normalizedQuery = normalizeIngredientSearchName(q);
  const pageSize = 1000;
  let ingredientsFinished = false;
  let synonymsFinished = false;
  for (let offset = 0; ; offset += pageSize) {
    const [ingredients, synonyms]: [
      Awaited<ArrayResult<Pick<IngredientRow, "id" | "standard_name">>>,
      Awaited<ArrayResult<{ ingredient_id: string; synonym: string }>>,
    ] = await Promise.all([
      ingredientsFinished ? Promise.resolve({ data: [], error: null }) : dbClient
        .from("ingredients")
        .select("id, standard_name")
        .like("search_name", pattern)
        .order("id", { ascending: true })
        .range(offset, offset + pageSize - 1),
      synonymsFinished ? Promise.resolve({ data: [], error: null }) : dbClient
        .from("ingredient_synonyms")
        .select("ingredient_id, synonym")
        .like("search_name", pattern)
        .order("id", { ascending: true })
        .range(offset, offset + pageSize - 1),
    ]);
    if (ingredients.error || synonyms.error || !ingredients.data || !synonyms.data) {
      return null;
    }
    for (const ingredient of ingredients.data) {
      if (normalizeIngredientSearchName(ingredient.standard_name).includes(normalizedQuery)) ids.add(ingredient.id);
    }
    for (const synonym of synonyms.data) {
      if (normalizeIngredientSearchName(synonym.synonym).includes(normalizedQuery)) ids.add(synonym.ingredient_id);
    }
    ingredientsFinished = ingredients.data.length < pageSize;
    synonymsFinished = synonyms.data.length < pageSize;
    if (ingredientsFinished && synonymsFinished) return expandIngredientIdentityIds([...ids], aliases);
  }
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  const rawCategory = request.nextUrl.searchParams.get("category")?.trim();
  const category = rawCategory && rawCategory !== ALL_INGREDIENT_CATEGORY
    ? rawCategory
    : undefined;

  if (isQaFixtureModeEnabled()) {
    const authOverride = readE2EAuthOverrideHeader(request.headers);

    if (authOverride !== "authenticated") {
      return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
    }

    if (category && !isValidIngredientCategory(category)) {
      return ok({ items: [], product_items: [] });
    }

    return ok({
      ...getQaFixturePantryItems({ category, q }),
      product_items: [],
    });
  }

  const auth = await getAuthenticatedDb("팬트리 목록을 불러오지 못했어요.");

  if ("response" in auth) {
    return auth.response;
  }

  if (category && !isValidIngredientCategory(category)) {
    return ok({ items: [], product_items: [] });
  }

  if (q && q.length > 100) {
    return fail("VALIDATION_ERROR", "검색어는 100자 이하로 입력해 주세요.", 422, [
      { field: "q", reason: "too_long" },
    ]);
  }
  let aliases: IngredientAliases;
  let ingredientIds: string[] | null | undefined;
  try {
    aliases = await loadIngredientAliases(auth.dbClient);
    ingredientIds = q ? await findPantryIngredientIds(auth.dbClient, q, aliases) : undefined;
  } catch {
    return fail("INTERNAL_ERROR", "팬트리 검색을 불러오지 못했어요. 다시 시도해 주세요.", 500);
  }
  if (ingredientIds === null) {
    return fail("INTERNAL_ERROR", "팬트리 검색을 불러오지 못했어요. 다시 시도해 주세요.", 500);
  }
  const pantryRows: PantryItemJoinedRow[] = [];
  const pageSize = 1000;
  let includeTaxonomyColumn = true;
  for (let offset = 0; ; offset += pageSize) {
    const readPage = () => buildPantryItemsQuery({ auth, includeTaxonomyColumn, ingredientIds })
      .range(offset, offset + pageSize - 1);
    let result = await readPage();
    if (includeTaxonomyColumn && isSchemaCacheMiss(result.error)) {
      includeTaxonomyColumn = false;
      result = await readPage();
    }
    if (result.error || !result.data || !result.data.every(hasIngredientIdentity)) {
      return fail("INTERNAL_ERROR", "팬트리 목록을 불러오지 못했어요.", 500);
    }
    pantryRows.push(...result.data);
    if (result.data.length < pageSize) break;
  }

  let productItems: PantryProductItem[] = [];

  if (!category) {
    let productQuery = auth.dbClient
      .from("pantry_items")
      .select(PANTRY_PRODUCT_SELECT);
    productQuery = productQuery.eq("user_id", auth.user.id);
    const productResult = await productQuery
      .order("created_at", { ascending: false })
      .order("id", { ascending: true });

    if (productResult.error || !productResult.data || !productResult.data.every(hasProductIdentity)) {
      return fail("INTERNAL_ERROR", "팬트리 목록을 불러오지 못했어요.", 500);
    }
    productItems = toPantryProductItems(productResult.data);

    if (q) {
      const normalizedQuery = normalizeIngredientSearchName(q);
      productItems = productItems.filter(
        (item) =>
          normalizeIngredientSearchName(item.name).includes(normalizedQuery) ||
          normalizeIngredientSearchName(item.brand ?? "").includes(normalizedQuery),
      );
    }
  }

  // Normalize only display metadata; inventory identities remain separate.
  const items = toPantryItems(pantryRows.map((row) => {
    const representative = aliases.get(row.ingredient_id);
    return representative ? { ...row, ingredients: representative } : row;
  })).filter((item) => !category || item.category === category);
  return ok({ items, product_items: productItems });
}

export async function POST(request: Request) {
  const auth = await getAuthenticatedDb("팬트리에 재료를 추가하지 못했어요.");

  if ("response" in auth) {
    return auth.response;
  }

  const body = await readMutationBody(request);
  const ingredientIds = body?.ingredient_ids === undefined
    ? []
    : normalizeIngredientIds(body.ingredient_ids);
  const productItems = normalizeProductItems(body?.product_items);

  if (
    !ingredientIds ||
    !productItems ||
    (ingredientIds.length === 0 && productItems.length === 0)
  ) {
    return invalidIngredientIdsResponse();
  }

  let includeTaxonomyColumn = true;
  let ingredientsResult: { data: IngredientRow[] | null; error: QueryError | null } = await auth.dbClient
    .from("ingredients")
    .select(INGREDIENT_SELECT)
    .in("id", ingredientIds);

  if (isSchemaCacheMiss(ingredientsResult.error)) {
    includeTaxonomyColumn = false;
    ingredientsResult = await auth.dbClient
      .from("ingredients")
      .select(INGREDIENT_SELECT_LEGACY)
      .in("id", ingredientIds);
  }

  if (ingredientsResult.error || !ingredientsResult.data) {
    return fail("INTERNAL_ERROR", "팬트리에 재료를 추가하지 못했어요.", 500);
  }

  const validIngredientIds = ingredientsResult.data.map((ingredient) => ingredient.id);

  const existingQuery = auth.dbClient
    .from("pantry_items")
    .select("ingredient_id");
  const existingResult = validIngredientIds.length > 0
    ? await existingQuery
        .eq("user_id", auth.user.id)
        .in("ingredient_id", validIngredientIds)
    : { data: [], error: null };

  if (existingResult.error || !existingResult.data) {
    return fail("INTERNAL_ERROR", "팬트리에 재료를 추가하지 못했어요.", 500);
  }

  const existingIngredientIds = new Set(existingResult.data.map((item) => item.ingredient_id));
  const ingredientIdsToInsert = validIngredientIds.filter(
    (ingredientId) => !existingIngredientIds.has(ingredientId),
  );

  const versionIds = productItems.map(
    (item) => item.food_product_nutrition_version_id,
  );
  const versionResult = versionIds.length > 0
    ? await auth.dbClient
        .from("food_product_nutrition_versions")
        .select("id, product_id")
        .in("id", versionIds)
    : { data: [], error: null };

  if (versionResult.error || !versionResult.data) {
    return fail("INTERNAL_ERROR", "팬트리에 재료를 추가하지 못했어요.", 500);
  }

  const versionById = new Map(
    versionResult.data.map((version) => [version.id, version]),
  );
  for (const [index, item] of productItems.entries()) {
    const version = versionById.get(item.food_product_nutrition_version_id);
    if (version && version.product_id !== item.food_product_id) {
      return fail("VALIDATION_ERROR", "상품과 영양 버전이 일치하지 않아요.", 422, [
        { field: productItemField(index), reason: "product_version_mismatch" },
      ]);
    }
  }

  const productIds = productItems.map((item) => item.food_product_id);
  const productResult = productIds.length > 0
    ? await auth.dbClient
        .from("food_products")
        .select("id, name, brand, owner_user_id, visibility, deleted_at")
        .in("id", productIds)
    : { data: [], error: null };

  if (productResult.error || !productResult.data) {
    return fail("INTERNAL_ERROR", "팬트리에 재료를 추가하지 못했어요.", 500);
  }

  const visibleProductIds = new Set(
    productResult.data
      .filter(
        (product) =>
          !product.deleted_at &&
          (product.visibility === "public" ||
            (product.visibility === "private" &&
              product.owner_user_id === auth.user.id)),
      )
      .map((product) => product.id),
  );
  const unavailableProduct = productItems.some(
    (item) =>
      !versionById.has(item.food_product_nutrition_version_id) ||
      !visibleProductIds.has(item.food_product_id),
  );
  if (unavailableProduct) {
    return fail("RESOURCE_NOT_FOUND", "상품을 찾을 수 없어요.", 404);
  }

  const productExistingQuery = auth.dbClient
    .from("pantry_items")
    .select(PANTRY_PRODUCT_SELECT);
  const productExistingResult = productIds.length > 0
    ? await productExistingQuery
        .eq("user_id", auth.user.id)
        .in("food_product_id", productIds)
    : { data: [], error: null };

  if (productExistingResult.error || !productExistingResult.data) {
    return fail("INTERNAL_ERROR", "팬트리에 재료를 추가하지 못했어요.", 500);
  }
  const existingPairs = new Set(
    productExistingResult.data.map(
      (item) =>
        `${item.food_product_id}:${item.food_product_nutrition_version_id}`,
    ),
  );
  const productItemsToInsert = productItems.filter(
    (item) =>
      !existingPairs.has(
        `${item.food_product_id}:${item.food_product_nutrition_version_id}`,
      ),
  );

  const insertResult: { data: Array<Omit<PantryItemJoinedRow, "ingredient_id"> & { ingredient_id: string | null }> | null;
    error: QueryError | null } = ingredientIdsToInsert.length > 0
    ? await (
        auth.dbClient
          .from("pantry_items")
          .insert(ingredientIdsToInsert.map((ingredientId) => ({
            user_id: auth.user.id,
            ingredient_id: ingredientId,
          })))
      ).select(getPantrySelect(includeTaxonomyColumn))
    : { data: [], error: null };

  if (insertResult.error || !insertResult.data || !insertResult.data.every(hasIngredientIdentity)) {
    return fail("INTERNAL_ERROR", "팬트리에 재료를 추가하지 못했어요.", 500);
  }

  const productInsertResult: { data: Array<Omit<PantryProductJoinedRow, "food_product_id" | "food_product_nutrition_version_id"> & {
    food_product_id: string | null; food_product_nutrition_version_id: string | null }> | null;
    error: QueryError | null } = productItemsToInsert.length > 0
    ? await (
        auth.dbClient.from("pantry_items").insert(
          productItemsToInsert.map((item) => ({
            user_id: auth.user.id,
            food_product_id: item.food_product_id,
            food_product_nutrition_version_id:
              item.food_product_nutrition_version_id,
          })),
        )
      ).select(PANTRY_PRODUCT_SELECT)
    : { data: [], error: null };

  if (productInsertResult.error || !productInsertResult.data || !productInsertResult.data.every(hasProductIdentity)) {
    return fail("INTERNAL_ERROR", "팬트리에 재료를 추가하지 못했어요.", 500);
  }

  const items = toPantryItems(insertResult.data);
  const addedProductItems = toPantryProductItems(productInsertResult.data);

  schedulePantryItemAddedActivityRecords({ auth, items });

  return ok(
    {
      added: items.length,
      items,
      product_added: addedProductItems.length,
      product_items: addedProductItems,
    },
    { status: 201 },
  );
}

export async function DELETE(request: Request) {
  const auth = await getAuthenticatedDb("팬트리 재료를 삭제하지 못했어요.");

  if ("response" in auth) {
    return auth.response;
  }

  const body = await readMutationBody(request);
  const ingredientIds = normalizeDeleteIds(body?.ingredient_ids);
  const pantryItemIds = normalizeDeleteIds(body?.pantry_item_ids);

  if (!ingredientIds || !pantryItemIds || ingredientIds.length + pantryItemIds.length === 0) {
    return fail("VALIDATION_ERROR", "삭제할 항목을 선택해 주세요.", 422, [
      { field: !pantryItemIds ? "pantry_item_ids" : "ingredient_ids", reason: "invalid_or_empty_ids" },
    ]);
  }

  let query = auth.dbClient
    .from("pantry_items")
    .delete()
    .eq("user_id", auth.user.id);
  if (ingredientIds.length > 0 && pantryItemIds.length > 0) {
    // Both lists contain validated UUIDs. Keep ownership outside the OR group.
    query = query.or(`ingredient_id.in.(${ingredientIds.join(",")}),id.in.(${pantryItemIds.join(",")})`);
  } else if (pantryItemIds.length > 0) {
    query = query.in("id", pantryItemIds);
  } else {
    query = query.in("ingredient_id", ingredientIds);
  }
  const deleteResult = await query.select("id");

  if (deleteResult.error || !deleteResult.data) {
    return fail("INTERNAL_ERROR", "팬트리 재료를 삭제하지 못했어요.", 500);
  }

  return ok({ removed: deleteResult.data.length });
}

function normalizeDeleteIds(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 500) return null;
  const ids: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(entry.trim())) {
      return null;
    }
    ids.push(entry.trim().toLowerCase());
  }
  return [...new Set(ids)];
}
