import { after, NextRequest } from "next/server";

import { readE2EAuthOverrideHeader } from "@/lib/auth/e2e-auth-override";
import { fail, ok } from "@/lib/api/response";
import {
  ALL_INGREDIENT_CATEGORY,
  isValidIngredientCategory,
} from "@/lib/ingredient-categories";
import {
  normalizeIngredientIds,
  toPantryItems,
  type IngredientRow,
  type PantryIngredientRow,
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

interface QueryOrderOption {
  ascending: boolean;
}

type ArrayResult<T> = PromiseLike<{
  data: T[] | null;
  error: QueryError | null;
}>;

interface PantryItemsSelectQuery {
  eq(column: string, value: string): PantryItemsSelectQuery;
  ilike(column: string, value: string): PantryItemsSelectQuery;
  in(column: string, values: string[]): PantryItemsSelectQuery;
  order(column: string, options: QueryOrderOption): PantryItemsSelectQuery;
  then: ArrayResult<PantryItemJoinedRow>["then"];
}

interface PantryIngredientsSelectQuery {
  in(column: string, values: string[]): PantryIngredientsSelectQuery;
  then: ArrayResult<IngredientRow>["then"];
}

interface PantryExistingSelectQuery {
  eq(column: string, value: string): PantryExistingSelectQuery;
  in(column: string, values: string[]): PantryExistingSelectQuery;
  then: ArrayResult<PantryIngredientRow>["then"];
}

interface PantryInsertQuery {
  select(columns: string): ArrayResult<PantryItemJoinedRow>;
}

interface PantryProductJoinedRow {
  id: string;
  food_product_id: string;
  food_product_nutrition_version_id: string;
  created_at: string;
  food_products:
    | { name: string; brand: string | null }
    | Array<{ name: string; brand: string | null }>
    | null;
}

interface PantryProductSelectQuery {
  eq(column: string, value: string): PantryProductSelectQuery;
  in(column: string, values: string[]): PantryProductSelectQuery;
  order(column: string, options: QueryOrderOption): PantryProductSelectQuery;
  then: ArrayResult<PantryProductJoinedRow>["then"];
}

interface PantryProductInsertQuery {
  select(columns: string): ArrayResult<PantryProductJoinedRow>;
}

interface PantryDeleteQuery {
  eq(column: string, value: string): PantryDeleteQuery;
  in(column: string, values: string[]): PantryDeleteQuery;
  select(columns: string): ArrayResult<PantryIngredientRow>;
}

interface PantryItemsTable {
  select(columns: string): PantryItemsSelectQuery | PantryExistingSelectQuery;
  insert(
    values: Array<
      | { user_id: string; ingredient_id: string }
      | {
          user_id: string;
          food_product_id: string;
          food_product_nutrition_version_id: string;
        }
    >,
  ): PantryInsertQuery | PantryProductInsertQuery;
  delete(): PantryDeleteQuery;
}

interface IngredientsTable {
  select(columns: string): PantryIngredientsSelectQuery;
}

interface FoodProductRow {
  id: string;
  name: string;
  brand: string | null;
  owner_user_id: string | null;
  visibility: string;
  deleted_at: string | null;
}

interface FoodProductVersionRow {
  id: string;
  product_id: string;
}

interface ProductLookupQuery<T> {
  in(column: string, values: string[]): ProductLookupQuery<T>;
  then: ArrayResult<T>["then"];
}

interface ProductLookupTable<T> {
  select(columns: string): ProductLookupQuery<T>;
}

interface PantryDbClient {
  from(table: "pantry_items"): PantryItemsTable;
  from(table: "ingredients"): IngredientsTable;
  from(table: "food_products"): ProductLookupTable<FoodProductRow>;
  from(
    table: "food_product_nutrition_versions",
  ): ProductLookupTable<FoodProductVersionRow>;
}

const PANTRY_SELECT =
  "id, ingredient_id, created_at, ingredients!inner(standard_name, category, category_code)";
const PANTRY_SELECT_LEGACY =
  "id, ingredient_id, created_at, ingredients!inner(standard_name, category)";
const INGREDIENT_SELECT = "id, standard_name, category, category_code";
const INGREDIENT_SELECT_LEGACY = "id, standard_name, category";
const PANTRY_PRODUCT_SELECT =
  "id, food_product_id, food_product_nutrition_version_id, created_at, food_products!inner(name, brand)";

interface NormalizedProductInput {
  food_product_id: string;
  food_product_nutrition_version_id: string;
}

interface PantryAuthSuccess {
  dbClient: PantryDbClient & UserBootstrapDbClient & UserGrowthActivityDbClient;
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
        recordUserGrowthActivityEvent(auth.dbClient, {
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

  const dbClient = routeClient as unknown as
    PantryDbClient & UserBootstrapDbClient & UserGrowthActivityDbClient;

  try {
    await ensurePublicUserRow(dbClient, user);
    await ensureUserBootstrapState(dbClient, user.id);
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
    const product = Array.isArray(row.food_products)
      ? row.food_products[0]
      : row.food_products;

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

function getIngredientSelect(includeTaxonomyColumn: boolean) {
  return includeTaxonomyColumn ? INGREDIENT_SELECT : INGREDIENT_SELECT_LEGACY;
}

function buildPantryItemsQuery({
  auth,
  category,
  includeTaxonomyColumn,
  q,
}: {
  auth: PantryAuthSuccess;
  category?: string;
  includeTaxonomyColumn: boolean;
  q?: string;
}) {
  let query = auth.dbClient
    .from("pantry_items")
    .select(getPantrySelect(includeTaxonomyColumn)) as PantryItemsSelectQuery;

  query = query.eq("user_id", auth.user.id);

  if (q) {
    query = query.ilike("ingredients.standard_name", `%${q}%`);
  }

  if (category) {
    query = query.eq("ingredients.category", category);
  }

  return query
    .order("created_at", { ascending: false })
    .order("id", { ascending: true });
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

  let result = await buildPantryItemsQuery({
    auth,
    category,
    includeTaxonomyColumn: true,
    q,
  });

  if (isSchemaCacheMiss(result.error)) {
    result = await buildPantryItemsQuery({
      auth,
      category,
      includeTaxonomyColumn: false,
      q,
    });
  }

  if (result.error || !result.data) {
    return fail("INTERNAL_ERROR", "팬트리 목록을 불러오지 못했어요.", 500);
  }

  let productItems: PantryProductItem[] = [];

  if (!category) {
    let productQuery = auth.dbClient
      .from("pantry_items")
      .select(PANTRY_PRODUCT_SELECT) as PantryProductSelectQuery;
    productQuery = productQuery.eq("user_id", auth.user.id);
    const productResult = await productQuery
      .order("created_at", { ascending: false })
      .order("id", { ascending: true });

    if (productResult.error || !productResult.data) {
      return fail("INTERNAL_ERROR", "팬트리 목록을 불러오지 못했어요.", 500);
    }
    productItems = toPantryProductItems(productResult.data);

    if (q) {
      const normalizedQuery = q.toLocaleLowerCase();
      productItems = productItems.filter(
        (item) =>
          item.name.toLocaleLowerCase().includes(normalizedQuery) ||
          item.brand?.toLocaleLowerCase().includes(normalizedQuery),
      );
    }
  }

  return ok({ items: toPantryItems(result.data), product_items: productItems });
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
  let ingredientsResult = await auth.dbClient
    .from("ingredients")
    .select(getIngredientSelect(includeTaxonomyColumn))
    .in("id", ingredientIds);

  if (isSchemaCacheMiss(ingredientsResult.error)) {
    includeTaxonomyColumn = false;
    ingredientsResult = await auth.dbClient
      .from("ingredients")
      .select(getIngredientSelect(includeTaxonomyColumn))
      .in("id", ingredientIds);
  }

  if (ingredientsResult.error || !ingredientsResult.data) {
    return fail("INTERNAL_ERROR", "팬트리에 재료를 추가하지 못했어요.", 500);
  }

  const validIngredientIds = ingredientsResult.data.map((ingredient) => ingredient.id);

  const existingQuery = auth.dbClient
    .from("pantry_items")
    .select("ingredient_id") as PantryExistingSelectQuery;
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
    .select(PANTRY_PRODUCT_SELECT) as PantryProductSelectQuery;
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

  const insertResult = ingredientIdsToInsert.length > 0
    ? await (
        auth.dbClient
          .from("pantry_items")
          .insert(ingredientIdsToInsert.map((ingredientId) => ({
            user_id: auth.user.id,
            ingredient_id: ingredientId,
          }))) as PantryInsertQuery
      ).select(getPantrySelect(includeTaxonomyColumn))
    : { data: [], error: null };

  if (insertResult.error || !insertResult.data) {
    return fail("INTERNAL_ERROR", "팬트리에 재료를 추가하지 못했어요.", 500);
  }

  const productInsertResult = productItemsToInsert.length > 0
    ? await (
        auth.dbClient.from("pantry_items").insert(
          productItemsToInsert.map((item) => ({
            user_id: auth.user.id,
            food_product_id: item.food_product_id,
            food_product_nutrition_version_id:
              item.food_product_nutrition_version_id,
          })),
        ) as PantryProductInsertQuery
      ).select(PANTRY_PRODUCT_SELECT)
    : { data: [], error: null };

  if (productInsertResult.error || !productInsertResult.data) {
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
  const ingredientIds = normalizeIngredientIds(body?.ingredient_ids);

  if (!ingredientIds || ingredientIds.length === 0) {
    return fail("VALIDATION_ERROR", "삭제할 재료를 선택해 주세요.", 422, [
      { field: "ingredient_ids", reason: "required_non_empty" },
    ]);
  }

  const deleteResult = await auth.dbClient
    .from("pantry_items")
    .delete()
    .eq("user_id", auth.user.id)
    .in("ingredient_id", ingredientIds)
    .select("ingredient_id");

  if (deleteResult.error || !deleteResult.data) {
    return fail("INTERNAL_ERROR", "팬트리 재료를 삭제하지 못했어요.", 500);
  }

  return ok({ removed: deleteResult.data.length });
}
