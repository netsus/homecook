const EXACT_PUBLIC_ROUTE_CONTRACTS = Object.freeze([
  {
    endpoint: "/api/v1/cooking-methods",
    file: "app/api/v1/cooking-methods/route.ts",
    method: "GET",
    scope: "cooking-methods",
  },
  {
    endpoint: "/api/v1/ingredients",
    file: "app/api/v1/ingredients/route.ts",
    method: "GET",
    scope: "ingredients",
  },
  {
    endpoint: "/api/v1/recipes/[id]/cook-mode",
    file: "app/api/v1/recipes/[id]/cook-mode/route.ts",
    method: "GET",
    scope: "recipe-cook-mode",
  },
  {
    endpoint: "/api/v1/recipes/[id]",
    file: "app/api/v1/recipes/[id]/route.ts",
    method: "GET",
    scope: "recipe-detail",
  },
  {
    endpoint: "/api/v1/recipes",
    file: "app/api/v1/recipes/route.ts",
    method: "GET",
    scope: "recipes",
  },
  {
    endpoint: "/api/v1/recipes/themes",
    file: "app/api/v1/recipes/themes/route.ts",
    method: "GET",
    scope: "recipe-themes",
  },
  {
    endpoint: "/api/v1/tags",
    file: "app/api/v1/tags/route.ts",
    method: "GET",
    scope: "tags",
  },
]);

export const HYBRID_PUBLIC_ROUTE_CONTRACTS = EXACT_PUBLIC_ROUTE_CONTRACTS;
export const HYBRID_PUBLIC_READ_SCOPES = new Set(
  EXACT_PUBLIC_ROUTE_CONTRACTS.map((contract) => contract.scope),
);

const INGREDIENT_SELECTS = new Set([
  "id,standard_name,category",
  "id,standard_name,category,category_code",
]);
const INGREDIENT_SYNONYM_SELECTS = new Set([
  "ingredient_id,ingredients!inner(id,standard_name,category)",
  "ingredient_id,ingredients!inner(id,standard_name,category,category_code)",
]);
const COOKING_METHOD_SELECTS = new Set([
  "id,code,label,color_key,is_system",
  "id,code,label,color_key,category_code,is_system",
]);
const RECIPE_LIST_SELECT =
  "id,title,thumbnail_url,tags,base_servings,view_count,like_count,save_count,plan_count,cook_count,created_at,source_type";
const RECIPE_DETAIL_SELECT =
  "id,title,description,thumbnail_url,base_servings,tags,source_type,created_by,view_count,like_count,save_count,plan_count,cook_count";
const RECIPE_DETAIL_INGREDIENT_SELECT =
  "id,ingredient_id,amount,unit,ingredient_type,display_text,component_label,scalable,sort_order,ingredients(standard_name)";
const RECIPE_NUTRITION_SELECT =
  "id,base_servings,scalable_values_json,fixed_values_json,nutrient_status_json,calculation_status,calculation_quality,reflected_ingredient_count,target_ingredient_count,warnings_json,sources_json,calculated_at";
const RECIPE_STEP_SELECTS = new Set([
  "id,step_number,instruction,component_label,ingredients_used,heat_level,duration_seconds,duration_text,cooking_methods(id,code,label,color_key,category_code),recipe_step_cooking_methods(position,cooking_methods(id,code,label,color_key,category_code))",
  "id,step_number,instruction,component_label,ingredients_used,heat_level,duration_seconds,duration_text,cooking_methods(id,code,label,color_key,category_code)",
]);
const COOK_MODE_INGREDIENT_SELECT =
  "ingredient_id,amount,unit,display_text,component_label,ingredient_type,scalable,sort_order,ingredients(standard_name)";
const COOK_MODE_STEP_SELECTS = new Set([
  "step_number,instruction,component_label,ingredients_used,heat_level,duration_seconds,duration_text,cooking_methods(code,label,color_key,category_code),recipe_step_cooking_methods(position,cooking_methods(code,label,color_key,category_code))",
  "step_number,instruction,component_label,ingredients_used,heat_level,duration_seconds,duration_text,cooking_methods(code,label,color_key,category_code)",
]);
const RECIPE_THEME_CARD_SELECT =
  "id,title,thumbnail_url,tags,base_servings,view_count,like_count,save_count,source_type";

function normalizeSearch(search) {
  const value = typeof search === "string" ? search : "";
  return new URLSearchParams(value.startsWith("?") ? value.slice(1) : value);
}

function hasOnlyKeys(params, allowedKeys) {
  return [...params.keys()].every((key) => allowedKeys.has(key));
}

function hasExactSingleValue(params, key, allowedValues) {
  const values = params.getAll(key);
  return values.length === 1 && allowedValues.has(values[0]);
}

function hasOptionalPrefixedValue(params, key, prefixes) {
  const values = params.getAll(key);
  return values.length <= 1
    && values.every((value) => prefixes.some((prefix) => value.startsWith(prefix)));
}

function hasRequiredPrefixedValue(params, key, prefix) {
  const values = params.getAll(key);
  return values.length === 1
    && values[0].startsWith(prefix)
    && values[0].length > prefix.length;
}

function isReadMethod(method) {
  return method === "GET";
}

function isExactBody(body, keys) {
  return Boolean(
    body
    && typeof body === "object"
    && !Array.isArray(body)
    && Object.keys(body).sort().join("\n") === [...keys].sort().join("\n"),
  );
}

function isIngredientsRead({ method, path, search }) {
  if (method !== "GET") {
    return false;
  }
  const params = normalizeSearch(search);
  if (path === "/ingredients") {
    return hasOnlyKeys(
      params,
      new Set(["select", "order", "category", "standard_name"]),
    )
      && hasExactSingleValue(params, "select", INGREDIENT_SELECTS)
      && hasExactSingleValue(params, "order", new Set(["standard_name.asc"]))
      && hasOptionalPrefixedValue(params, "category", ["eq."])
      && hasOptionalPrefixedValue(params, "standard_name", ["ilike."]);
  }
  if (path === "/ingredient_synonyms") {
    return hasOnlyKeys(
      params,
      new Set(["select", "order", "ingredients.category", "synonym"]),
    )
      && hasExactSingleValue(params, "select", INGREDIENT_SYNONYM_SELECTS)
      && hasExactSingleValue(params, "order", new Set(["ingredient_id.asc"]))
      && hasOptionalPrefixedValue(params, "ingredients.category", ["eq."])
      && hasOptionalPrefixedValue(params, "synonym", ["ilike."]);
  }
  return false;
}

function isCookingMethodsRead({ method, path, search }) {
  if (method !== "GET") {
    return false;
  }
  const params = normalizeSearch(search);
  if (path === "/cooking_methods") {
    return hasOnlyKeys(params, new Set(["select", "order"]))
      && hasExactSingleValue(params, "select", COOKING_METHOD_SELECTS)
      && hasExactSingleValue(
        params,
        "order",
        new Set(["display_order.asc,created_at.asc"]),
      );
  }
  if (path === "/cooking_method_synonyms") {
    return hasOnlyKeys(params, new Set(["select", "is_active", "order"]))
      && hasExactSingleValue(
        params,
        "select",
        new Set(["method_code,synonym"]),
      )
      && hasExactSingleValue(params, "is_active", new Set(["eq.true"]))
      && hasExactSingleValue(params, "order", new Set(["synonym.asc"]));
  }
  return false;
}

function isTagsRead({ method, path, body }) {
  return method === "POST"
    && path === "/rpc/list_public_recipe_tags"
    && isExactBody(
      body,
      ["p_q", "p_kind", "p_theme_eligible", "p_limit"],
    )
    && (body.p_q === null || typeof body.p_q === "string")
    && (
      body.p_kind === null
      || ["semantic", "ingredient", "method", "source", "user"]
        .includes(body.p_kind)
    )
    && (body.p_theme_eligible === null
      || typeof body.p_theme_eligible === "boolean")
    && Number.isInteger(body.p_limit)
    && body.p_limit >= 1
    && body.p_limit <= 100;
}

function isRecipeThemesRead({ method, path, search, body }) {
  if (path === "/rpc/list_home_theme_recipes") {
    return method === "POST"
      && isExactBody(body, ["p_tag_limit", "p_recipes_per_tag"])
      && Number.isInteger(body.p_tag_limit)
      && body.p_tag_limit >= 1
      && body.p_tag_limit <= 8
      && Number.isInteger(body.p_recipes_per_tag)
      && body.p_recipes_per_tag >= 1
      && body.p_recipes_per_tag <= 10;
  }
  if (!isReadMethod(method)) {
    return false;
  }
  const params = normalizeSearch(search);
  if (path === "/recipe_steps") {
    return hasOnlyKeys(params, new Set(["select", "recipe_id"]))
      && hasExactSingleValue(
        params,
        "select",
        new Set(["recipe_id,cooking_methods(code)"]),
      )
      && hasRequiredPrefixedValue(params, "recipe_id", "in.(");
  }
  if (path !== "/recipes") {
    return false;
  }
  if (
    !hasOnlyKeys(
      params,
      new Set([
        "select",
        "visibility",
        "deleted_at",
        "source_type",
        "id",
        "limit",
        "order",
      ]),
    )
    || !hasExactSingleValue(
      params,
      "select",
      new Set([RECIPE_THEME_CARD_SELECT]),
    )
    || !hasExactSingleValue(params, "visibility", new Set(["eq.public"]))
    || !hasExactSingleValue(params, "deleted_at", new Set(["is.null"]))
  ) {
    return false;
  }

  if (params.has("id")) {
    return params.getAll("id").length === 1
      && hasRequiredPrefixedValue(params, "id", "in.(")
      && !params.has("source_type")
      && !params.has("limit")
      && !params.has("order");
  }

  const orders = params.getAll("order");
  const limit = Number(params.get("limit"));
  return orders.length === 2
    && orders[0] === "view_count.desc"
    && orders[1] === "id.asc"
    && params.getAll("limit").length === 1
    && Number.isInteger(limit)
    && limit >= 1
    && limit <= 100
    && (
      !params.has("source_type")
      || hasExactSingleValue(params, "source_type", new Set(["eq.youtube"]))
    );
}

function isRecipeListRead({ method, path, search, body }) {
  if (path === "/rpc/find_recipe_ids_by_public_tags") {
    return method === "POST"
      && isExactBody(body, ["p_q", "p_tag"])
      && (body.p_q === null || typeof body.p_q === "string")
      && (body.p_tag === null || typeof body.p_tag === "string")
      && (typeof body.p_q === "string" || typeof body.p_tag === "string");
  }
  if (!isReadMethod(method)) {
    return false;
  }
  const params = normalizeSearch(search);
  if (path === "/recipe_ingredients") {
    return hasOnlyKeys(params, new Set(["select", "ingredient_id"]))
      && hasExactSingleValue(
        params,
        "select",
        new Set(["recipe_id,ingredient_id"]),
      )
      && hasRequiredPrefixedValue(params, "ingredient_id", "in.(");
  }
  if (
    path !== "/recipes"
    || !hasOnlyKeys(
      params,
      new Set([
        "select",
        "visibility",
        "deleted_at",
        "limit",
        "order",
        "id",
        "or",
        "title",
      ]),
    )
    || !hasExactSingleValue(params, "select", new Set([RECIPE_LIST_SELECT]))
    || !hasExactSingleValue(params, "visibility", new Set(["eq.public"]))
    || !hasExactSingleValue(params, "deleted_at", new Set(["is.null"]))
  ) {
    return false;
  }

  const limit = Number(params.get("limit"));
  const orders = params.getAll("order");
  const firstOrder = orders[0] ?? "";
  const isLatestOrder =
    firstOrder === "created_at.desc" && orders[1] === "id.desc";
  const isPopularityOrder =
    /^(?:view_count|like_count|save_count|plan_count|cook_count)\.desc$/u
      .test(firstOrder)
    && orders[1] === "id.asc";
  if (
    params.getAll("limit").length !== 1
    || !Number.isInteger(limit)
    || limit < 1
    || limit > 101
    || orders.length !== 2
    || (!isLatestOrder && !isPopularityOrder)
  ) {
    return false;
  }

  if (params.has("id") && !hasRequiredPrefixedValue(params, "id", "in.(")) {
    return false;
  }
  if (
    params.has("title")
    && !hasRequiredPrefixedValue(params, "title", "ilike.")
  ) {
    return false;
  }
  if (params.has("or")) {
    const cursor = params.getAll("or");
    if (
      cursor.length !== 1
      || !/^(?:(?:created_at|view_count|like_count|save_count|plan_count|cook_count)\.lt\..+,and\((?:created_at|view_count|like_count|save_count|plan_count|cook_count)\.eq\..+,id\.(?:lt|gt)\..+\))$/u
        .test(cursor[0])
    ) {
      return false;
    }
  }
  return true;
}

function isRecipeDetailRead({ method, path, search }) {
  if (!isReadMethod(method)) {
    return false;
  }
  const params = normalizeSearch(search);
  const contracts = {
    "/recipes": {
      select: new Set([RECIPE_DETAIL_SELECT]),
      filter: "id",
      order: null,
    },
    "/recipe_sources": {
      select: new Set([
        "youtube_url,youtube_video_id,extraction_meta_json",
      ]),
      filter: "recipe_id",
      order: null,
    },
    "/recipe_ingredients": {
      select: new Set([RECIPE_DETAIL_INGREDIENT_SELECT]),
      filter: "recipe_id",
      order: "sort_order.asc",
    },
    "/recipe_nutrition_snapshots": {
      select: new Set([RECIPE_NUTRITION_SELECT]),
      filter: "recipe_id",
      order: null,
      current: true,
    },
    "/recipe_steps": {
      select: RECIPE_STEP_SELECTS,
      filter: "recipe_id",
      order: "step_number.asc",
    },
  };
  const contract = contracts[path];
  if (!contract) {
    return false;
  }
  const keys = new Set(["select", contract.filter]);
  if (contract.order) {
    keys.add("order");
  }
  if (contract.current) {
    keys.add("is_current");
  }
  return hasOnlyKeys(params, keys)
    && hasExactSingleValue(params, "select", contract.select)
    && hasRequiredPrefixedValue(params, contract.filter, "eq.")
    && (
      !contract.order
      || hasExactSingleValue(params, "order", new Set([contract.order]))
    )
    && (
      !contract.current
      || hasExactSingleValue(params, "is_current", new Set(["eq.true"]))
    );
}

function isRecipeCookModeRead({ method, path, search }) {
  if (!isReadMethod(method)) {
    return false;
  }
  const params = normalizeSearch(search);
  const contracts = {
    "/recipes": {
      select: new Set(["id,title,base_servings"]),
      filter: "id",
      order: null,
    },
    "/recipe_ingredients": {
      select: new Set([COOK_MODE_INGREDIENT_SELECT]),
      filter: "recipe_id",
      order: "sort_order.asc",
    },
    "/recipe_steps": {
      select: COOK_MODE_STEP_SELECTS,
      filter: "recipe_id",
      order: "step_number.asc",
    },
  };
  const contract = contracts[path];
  if (!contract) {
    return false;
  }
  const keys = new Set(["select", contract.filter]);
  if (contract.order) {
    keys.add("order");
  }
  return hasOnlyKeys(params, keys)
    && hasExactSingleValue(params, "select", contract.select)
    && hasRequiredPrefixedValue(params, contract.filter, "eq.")
    && (
      !contract.order
      || hasExactSingleValue(params, "order", new Set([contract.order]))
    );
}

export function isAnonymousHybridPublicReadRequest({
  scope,
  method,
  path,
  search = "",
  body,
}) {
  const normalizedMethod = String(method ?? "").toUpperCase();
  if (!HYBRID_PUBLIC_READ_SCOPES.has(scope)) {
    return false;
  }
  const input = {
    scope,
    method: normalizedMethod,
    path,
    search,
    body,
  };
  if (scope === "ingredients") {
    return isIngredientsRead(input);
  }
  if (scope === "cooking-methods") {
    return isCookingMethodsRead(input);
  }
  if (scope === "tags") {
    return isTagsRead(input);
  }
  if (scope === "recipe-themes") {
    return isRecipeThemesRead(input);
  }
  if (scope === "recipes") {
    return isRecipeListRead(input);
  }
  if (scope === "recipe-detail") {
    return isRecipeDetailRead(input);
  }
  if (scope === "recipe-cook-mode") {
    return isRecipeCookModeRead(input);
  }
  return false;
}
