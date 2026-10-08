import { prepareRecipeNutritionSnapshot, type RecipeNutritionServiceClient } from "@/lib/server/recipe-nutrition-service";
import { createRecipeNutritionSnapshotPayload } from "@/lib/server/recipe-nutrition-snapshot";

export interface IngredientAiRecipeRefreshClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}

export class IngredientAiRecipeRefreshError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "IngredientAiRecipeRefreshError";
  }
}

type Row = Record<string, unknown>;
interface RefreshBundle {
  job_id: string;
  recipe_id: string;
  recipe: Row;
  recipe_ingredients: Row[];
  ingredient_nutrition_profiles: Row[];
  ingredient_conversion_assignments: Row[];
  piece_unit_weights: Row[];
  product_predecessors: Row[];
  input_guard: Row;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXPECTED_RPC_ERRORS = new Set([
  "AI_NUTRITION_DISABLED", "AI_NUTRITION_REFRESH_NOT_PENDING", "AI_NUTRITION_UNAUTHORIZED",
  "AI_NUTRITION_REFRESH_INPUT_TOO_LARGE", "RECIPE_NOT_FOUND", "RECIPE_NUTRITION_INPUT_STALE",
]);
function isRow(value: unknown): value is Row {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function failRpc(error: unknown, fallback: string): never {
  const message = isRow(error) ? error.message : undefined;
  throw new IngredientAiRecipeRefreshError(
    typeof message === "string" && EXPECTED_RPC_ERRORS.has(message) ? message : fallback,
  );
}
function validateBundle(value: unknown, jobId: string, recipeId: string): asserts value is RefreshBundle {
  if (!isRow(value) || value.job_id !== jobId || value.recipe_id !== recipeId ||
    !isRow(value.recipe) || value.recipe.id !== recipeId || !isRow(value.input_guard) ||
    ["recipe_ingredients", "ingredient_nutrition_profiles", "ingredient_conversion_assignments",
      "piece_unit_weights", "product_predecessors"].some((key) =>
      !Array.isArray(value[key]) || !value[key].every(isRow)) ||
    (value.recipe_ingredients as Row[]).length > 200 ||
    (value.recipe_ingredients as Row[]).some((row) => row.recipe_id !== recipeId)) {
    throw new IngredientAiRecipeRefreshError("AI_NUTRITION_REFRESH_INVALID_BUNDLE");
  }
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isRow(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

type ListResult = { data: Row[]; error: null };
/** Implements only local projection/filter/paging; it has no database connection. */
class BundleQuery implements PromiseLike<ListResult> {
  constructor(private rows: Row[]) {}
  select(columns: string) { void columns; return this; }
  eq(column: string, value: unknown) {
    this.rows = this.rows.filter((row) => row[column] === value);
    return this;
  }
  in(column: string, values: string[]) {
    this.rows = this.rows.filter((row) => values.includes(row[column] as string));
    return this;
  }
  order(column: string, options: { ascending: boolean }) {
    this.rows = [...this.rows].sort((a, b) => {
      const left = a[column], right = b[column];
      if (left === right) return 0;
      if ((typeof left !== "string" && typeof left !== "number") ||
        (typeof right !== "string" && typeof right !== "number")) return 0;
      return (left < right ? -1 : 1) * (options.ascending ? 1 : -1);
    });
    return this;
  }
  range(from: number, to: number) { this.rows = this.rows.slice(from, to + 1); return this; }
  async maybeSingle() { return { data: this.rows.length === 1 ? this.rows[0] : null, error: null }; }
  then<TResult1 = ListResult, TResult2 = never>(
    onfulfilled?: ((value: ListResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({ data: this.rows, error: null }).then(onfulfilled, onrejected);
  }
}

function bundleClient(bundle: RefreshBundle) {
  const tables: Record<string, Row[]> = {
    recipes: [bundle.recipe], recipe_ingredients: bundle.recipe_ingredients,
    ingredient_nutrition_profiles: bundle.ingredient_nutrition_profiles,
    ingredient_conversion_assignments: bundle.ingredient_conversion_assignments,
    piece_unit_weights: bundle.piece_unit_weights,
  };
  return {
    from(table: string) {
      if (!Object.hasOwn(tables, table)) throw new IngredientAiRecipeRefreshError("AI_NUTRITION_REFRESH_INVALID_BUNDLE");
      return new BundleQuery(tables[table]);
    },
    async rpc(name: string, args: Record<string, unknown>) {
      if (name !== "read_recipe_product_nutrition_predecessors" ||
        args.p_owner_uuid !== (bundle.recipe.created_by ?? null) || !Array.isArray(args.p_ingredients)) {
        throw new IngredientAiRecipeRefreshError("AI_NUTRITION_REFRESH_INVALID_BUNDLE");
      }
      const data = args.p_ingredients.map((pin: unknown) => {
        if (!isRow(pin) || !bundle.recipe_ingredients.some((row) =>
          ["id", "ingredient_id", "food_product_id", "food_product_nutrition_version_id"]
            .every((key) => row[key] === pin[key]))) {
          throw new IngredientAiRecipeRefreshError("AI_NUTRITION_REFRESH_INVALID_BUNDLE");
        }
        const matches = bundle.product_predecessors.filter((row) => row.id === pin.id);
        if (matches.length !== 1 || !Object.hasOwn(matches[0], "product_predecessor")) {
          throw new IngredientAiRecipeRefreshError("AI_NUTRITION_REFRESH_INVALID_BUNDLE");
        }
        return matches[0];
      });
      return { data, error: null };
    },
  };
}

/** Refresh one pending current recipe. The job runner acknowledges only after success. */
export async function refreshIngredientAiRecipeNutrition(
  client: IngredientAiRecipeRefreshClient,
  options: { jobId: string; recipeId: string; calculatedAt?: string },
): Promise<{ snapshot_id: string; created: boolean; is_current: boolean }> {
  if (!UUID.test(options.jobId) || !UUID.test(options.recipeId) ||
    (options.calculatedAt !== undefined && !Number.isFinite(Date.parse(options.calculatedAt)))) {
    throw new IngredientAiRecipeRefreshError("AI_NUTRITION_REFRESH_INVALID_INPUT");
  }
  const read = await client.rpc("get_ingredient_ai_recipe_refresh_input", {
    p_job_id: options.jobId, p_recipe_id: options.recipeId,
  });
  if (read.error) failRpc(read.error, "AI_NUTRITION_REFRESH_READ_FAILED");
  validateBundle(read.data, options.jobId, options.recipeId);
  const memory = bundleClient(read.data);
  // The adapter intentionally has only in-memory read behavior, not a snapshot
  // writer or any general service-role REST access.
  const prepared = await prepareRecipeNutritionSnapshot(
    memory as unknown as RecipeNutritionServiceClient, options.recipeId,
  );
  if (canonical(prepared.inputGuard) !== canonical(read.data.input_guard)) {
    throw new IngredientAiRecipeRefreshError("AI_NUTRITION_REFRESH_GUARD_MISMATCH");
  }
  const result = await client.rpc("write_ingredient_ai_recipe_refresh", {
    p_job_id: options.jobId, p_recipe_id: options.recipeId,
    p_snapshot: createRecipeNutritionSnapshotPayload(prepared.calculation, options.calculatedAt),
    p_expected_recipe_updated_at: prepared.expectedRecipeVersion, p_input_guard: prepared.inputGuard,
  });
  if (result.error) failRpc(result.error, "AI_NUTRITION_REFRESH_WRITE_FAILED");
  if (!isRow(result.data) || typeof result.data.snapshot_id !== "string" ||
    result.data.snapshot_id.length === 0 || typeof result.data.created !== "boolean" ||
    typeof result.data.is_current !== "boolean") {
    throw new IngredientAiRecipeRefreshError("AI_NUTRITION_REFRESH_WRITE_FAILED");
  }
  return { snapshot_id: result.data.snapshot_id, created: result.data.created, is_current: result.data.is_current };
}
