import { randomUUID } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

import { calculateRecipeNutrition } from "@/lib/nutrition/recipe-nutrition-calculator";
import type { UserBootstrapDbClient } from "@/lib/server/user-bootstrap";
import {
  buildRecipeNutritionCalculation,
  createSupabaseRecipeNutritionBackfillRepository,
} from "@/scripts/lib/recipe-nutrition-backfill.mjs";

type JsonRecord = Record<string, unknown>;
type QueryResult<T> = { data: T; error: null };
type QueryErrorResult = { data: null; error: { message: string; code?: string } };
type Filter = { column: string; value: unknown };

const FOODSAFETY_SCOPE_MARKERS = [
  "pilot_30_quality_corrected",
  "pilot_30_quality_corrected_replacement",
];

export function assertSafeRecipeNutritionPostgres17Target(options: {
  host: string;
  port: string;
  database: string;
  user: string;
}) {
  const numericPort = Number(options.port);
  const hasCanonicalPort = /^[1-9]\d*$/.test(options.port)
    && String(numericPort) === options.port
    && Number.isInteger(numericPort)
    && numericPort >= 1
    && numericPort <= 65_535;

  if (!["127.0.0.1", "localhost", "::1"].includes(options.host)
    || !hasCanonicalPort
    || numericPort === 5_432
    || !options.database.startsWith("homecook_")
    || !/^[a-z_][a-z0-9_]*$/.test(options.user)) {
    throw new Error("Unsafe PostgreSQL closeout target");
  }
}

function sqlText(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sqlNullableText(value: string | null) {
  return value === null ? "null" : sqlText(value);
}

function sqlJson(value: unknown) {
  return `${sqlText(JSON.stringify(value))}::jsonb`;
}

function sqlUuidArray(values: string[]) {
  return `array[${values.map(sqlText).join(",")}]::uuid[]`;
}

function sqlTextArray(values: string[]) {
  return `array[${values.map(sqlText).join(",")}]::text[]`;
}

class TransactionalPsqlSession {
  private readonly child: ChildProcessWithoutNullStreams;
  private queue = Promise.resolve<unknown>(undefined);
  private markerSequence = 0;
  private closed = false;

  constructor(options: { host: string; port: string; database: string; user: string }) {
    this.child = spawn("psql", [
      "-X",
      "-qAt",
      "-w",
      "-h", options.host,
      "-p", options.port,
      "-U", options.user,
      "-d", options.database,
      "-v", "ON_ERROR_STOP=1",
    ], {
      env: {
        PATH: process.env.PATH ?? "",
        NODE_ENV: "test",
        PGPASSFILE: "/dev/null",
        PGAPPNAME: "homecook-recipe-nutrition-pg17-closeout",
      },
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private raw(sql: string): Promise<string> {
    return this.enqueue(() => new Promise((resolve, reject) => {
      if (this.closed || this.child.exitCode !== null) {
        reject(new Error("PostgreSQL closeout session is not available"));
        return;
      }

      const marker = `__homecook_closeout_${this.markerSequence += 1}__`;
      let stdout = "";
      let stderr = "";
      const onStdout = (chunk: Buffer | string) => {
        stdout += chunk.toString();
        const markerIndex = stdout.indexOf(marker);
        if (markerIndex < 0) return;
        cleanup();
        const lines = stdout.slice(0, markerIndex).trim().split("\n").filter(Boolean);
        resolve(lines.at(-1) ?? "");
      };
      const onStderr = (chunk: Buffer | string) => {
        stderr += chunk.toString();
      };
      const onClose = () => {
        cleanup();
        const errorLine = stderr.split("\n").find((line) => line.includes("ERROR:"));
        reject(new Error(errorLine?.trim() || "PostgreSQL closeout query failed"));
      };
      const cleanup = () => {
        this.child.stdout.off("data", onStdout);
        this.child.stderr.off("data", onStderr);
        this.child.off("close", onClose);
      };

      this.child.stdout.on("data", onStdout);
      this.child.stderr.on("data", onStderr);
      this.child.once("close", onClose);
      this.child.stdin.write(
        `${sql}\n\\echo ${marker}\n`,
        (error) => {
          if (!error) return;
          cleanup();
          reject(new Error("PostgreSQL closeout query write failed"));
        },
      );
    }));
  }

  async execute(sql: string) {
    await this.raw(sql);
  }

  async rows<T extends JsonRecord>(selectSql: string): Promise<T[]> {
    const encoded = await this.raw(`
      select encode(
        convert_to(coalesce((select jsonb_agg(to_jsonb(result)) from (${selectSql}) result), '[]'::jsonb)::text, 'UTF8'),
        'hex'
      );
    `);
    return JSON.parse(Buffer.from(encoded, "hex").toString("utf8")) as T[];
  }

  async mutationRows<T extends JsonRecord>(mutationSql: string): Promise<T[]> {
    const encoded = await this.raw(`
      with result as (${mutationSql})
      select encode(
        convert_to(coalesce((select jsonb_agg(to_jsonb(result)) from result), '[]'::jsonb)::text, 'UTF8'),
        'hex'
      );
    `);
    return JSON.parse(Buffer.from(encoded, "hex").toString("utf8")) as T[];
  }

  async scalar<T>(selectSql: string): Promise<T> {
    const [row] = await this.rows<{ value: T }>(selectSql);
    if (!row) throw new Error("PostgreSQL closeout scalar result is missing");
    return row.value;
  }

  async close() {
    await this.enqueue(() => new Promise<void>((resolve) => {
      if (this.closed || this.child.exitCode !== null) {
        this.closed = true;
        resolve();
        return;
      }
      this.closed = true;
      this.child.once("close", () => resolve());
      this.child.stdin.end("\\q\n");
    }));
  }
}

class BackfillSelectQuery implements PromiseLike<QueryResult<JsonRecord[]>> {
  private equalFilters: Filter[] = [];
  private inFilters: Filter[] = [];
  private greaterThanFilters: Filter[] = [];
  private orders: Array<{ column: string; ascending: boolean }> = [];
  private rowLimit: number | null = null;
  private rowOffset = 0;

  constructor(
    private readonly session: TransactionalPsqlSession,
    private readonly table: string,
  ) {}

  select() { return this; }

  eq(column: string, value: unknown) {
    this.equalFilters.push({ column, value });
    return this;
  }

  in(column: string, value: unknown[]) {
    this.inFilters.push({ column, value });
    return this;
  }

  gt(column: string, value: unknown) {
    this.greaterThanFilters.push({ column, value });
    return this;
  }

  order(column: string, options: { ascending: boolean }) {
    this.orders.push({ column, ascending: options.ascending });
    return this;
  }

  limit(value: number) {
    this.rowLimit = value;
    return this;
  }

  range(from: number, to: number) {
    this.rowOffset = from;
    this.rowLimit = to - from + 1;
    return this.execute();
  }

  then<TResult1 = QueryResult<JsonRecord[]>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<JsonRecord[]>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private filterValue(filters: Filter[], column: string) {
    return filters.find((filter) => filter.column === column)?.value;
  }

  private pagingSql() {
    const limit = this.rowLimit === null ? "" : ` limit ${this.rowLimit}`;
    const offset = this.rowOffset === 0 ? "" : ` offset ${this.rowOffset}`;
    return `${limit}${offset}`;
  }

  private orderSql(defaultOrder: string) {
    if (this.orders.length === 0) return ` order by ${defaultOrder}`;
    const safeColumns = new Set(["id", "recipe_id", "sort_order"]);
    return ` order by ${this.orders.map(({ column, ascending }) => {
      if (!safeColumns.has(column)) throw new Error("Unsupported closeout sort column");
      return `${column} ${ascending ? "asc" : "desc"}`;
    }).join(", ")}`;
  }

  private recipeSourcesSql() {
    const scope = this.filterValue(this.inFilters, "extraction_meta_json->>reviewed_scope");
    const provider = this.filterValue(this.equalFilters, "extraction_meta_json->>source_provider");
    const afterRecipeId = this.filterValue(this.greaterThanFilters, "recipe_id");
    if (!Array.isArray(scope) || typeof provider !== "string") {
      throw new Error("Recipe source closeout filters are incomplete");
    }
    return `
      select recipe_id
      from public.recipe_sources
      where extraction_meta_json ->> 'source_provider' = ${sqlText(provider)}
        and extraction_meta_json ->> 'reviewed_scope' = any(${sqlTextArray(scope as string[])})
        ${typeof afterRecipeId === "string" ? `and recipe_id > ${sqlText(afterRecipeId)}::uuid` : ""}
      ${this.orderSql("recipe_id")}${this.pagingSql()}
    `;
  }

  private recipesSql() {
    const ids = this.filterValue(this.inFilters, "id");
    if (!Array.isArray(ids)) throw new Error("Recipe closeout ids are missing");
    return `
      select id, base_servings::float8 as base_servings, updated_at
      from public.recipes where id = any(${sqlUuidArray(ids as string[])})
      ${this.orderSql("id")}${this.pagingSql()}
    `;
  }

  private ingredientsSql() {
    const ids = this.filterValue(this.inFilters, "recipe_id");
    if (!Array.isArray(ids)) throw new Error("Recipe ingredient closeout ids are missing");
    return `
      select id, recipe_id, ingredient_id, amount::float8 as amount, unit,
        ingredient_type::text as ingredient_type, scalable, sort_order
      from public.recipe_ingredients where recipe_id = any(${sqlUuidArray(ids as string[])})
      ${this.orderSql("recipe_id, sort_order, id")}${this.pagingSql()}
    `;
  }

  private snapshotsSql() {
    const ids = this.filterValue(this.inFilters, "recipe_id");
    const current = this.filterValue(this.equalFilters, "is_current");
    if (!Array.isArray(ids) || current !== true) {
      throw new Error("Current snapshot closeout filters are incomplete");
    }
    return `
      select recipe_id, id from public.recipe_nutrition_snapshots
      where recipe_id = any(${sqlUuidArray(ids as string[])}) and is_current
      ${this.orderSql("recipe_id")}${this.pagingSql()}
    `;
  }

  private nutritionLinksSql() {
    const ingredientIds = this.filterValue(this.inFilters, "ingredient_id");
    if (!Array.isArray(ingredientIds)) throw new Error("Nutrition link closeout ids are missing");
    return `
      select
        link.id, link.ingredient_id, link.nutrition_profile_id, link.preparation_state,
        link.review_status::text as review_status, link.is_active, link.is_primary,
        jsonb_build_object(
          'id', profile.id,
          'source_item_id', profile.source_item_id,
          'profile_kind', profile.profile_kind,
          'normalization_method', profile.normalization_method,
          'basis_amount', profile.basis_amount::float8,
          'basis_unit', profile.basis_unit,
          'review_status', profile.review_status,
          'is_active', profile.is_active,
          'nutrition_values', coalesce((
            select jsonb_agg(jsonb_build_object(
              'profile_id', value.profile_id,
              'nutrient_code', value.nutrient_code,
              'amount', value.amount::float8,
              'value_status', value.value_status
            ) order by value.nutrient_code collate "C")
            from public.nutrition_values value where value.profile_id = profile.id
          ), '[]'::jsonb),
          'nutrition_source_items', jsonb_build_object(
            'id', item.id,
            'source_id', item.source_id,
            'review_status', item.review_status,
            'nutrition_sources', jsonb_build_object(
              'id', source.id,
              'provider_code', source.provider_code,
              'dataset_name', source.dataset_name,
              'source_version', source.source_version,
              'data_basis_date', source.data_basis_date,
              'license_name', source.license_name,
              'source_url', source.source_url,
              'review_status', source.review_status,
              'freshness_status', source.freshness_status,
              'is_active', source.is_active
            )
          )
        ) as nutrition_profiles
      from public.ingredient_nutrition_profiles link
      join public.nutrition_profiles profile on profile.id = link.nutrition_profile_id
      join public.nutrition_source_items item on item.id = profile.source_item_id
      join public.nutrition_sources source on source.id = item.source_id
      where link.ingredient_id = any(${sqlUuidArray(ingredientIds as string[])})
        and link.review_status = 'approved' and link.is_active and link.is_primary
      ${this.orderSql("link.id")}${this.pagingSql()}
    `;
  }

  private conversionAssignmentsSql() {
    const ingredientIds = this.filterValue(this.inFilters, "ingredient_id");
    if (!Array.isArray(ingredientIds)) throw new Error("Conversion assignment closeout ids are missing");
    return `
      select
        assignment.id, assignment.ingredient_id, assignment.conversion_profile_id,
        assignment.evidence_id, assignment.preparation_state,
        assignment.review_status::text as review_status, assignment.is_active,
        jsonb_build_object(
          'id', profile.id,
          'code', profile.code,
          'basis_volume_ml', profile.basis_volume_ml::float8,
          'representative_weight_g', profile.representative_weight_g::float8,
          'is_active', profile.is_active
        ) as measurement_conversion_profiles,
        jsonb_build_object(
          'id', evidence.id,
          'source_id', evidence.source_id,
          'evidence_kind', evidence.evidence_kind,
          'preparation_state', evidence.preparation_state,
          'review_status', evidence.review_status,
          'is_active', evidence.is_active,
          'nutrition_sources', jsonb_build_object(
            'id', source.id,
            'provider_code', source.provider_code,
            'dataset_name', source.dataset_name,
            'source_version', source.source_version,
            'data_basis_date', source.data_basis_date,
            'license_name', source.license_name,
            'source_url', source.source_url,
            'review_status', source.review_status,
            'freshness_status', source.freshness_status,
            'is_active', source.is_active
          )
        ) as measurement_source_evidence
      from public.ingredient_conversion_assignments assignment
      join public.measurement_conversion_profiles profile on profile.id = assignment.conversion_profile_id
      join public.measurement_source_evidence evidence on evidence.id = assignment.evidence_id
      join public.nutrition_sources source on source.id = evidence.source_id
      where assignment.ingredient_id = any(${sqlUuidArray(ingredientIds as string[])})
        and assignment.review_status = 'approved' and assignment.is_active
      ${this.orderSql("assignment.id")}${this.pagingSql()}
    `;
  }

  private async execute(): Promise<QueryResult<JsonRecord[]>> {
    let sql: string;
    switch (this.table) {
      case "recipe_sources": sql = this.recipeSourcesSql(); break;
      case "recipes": sql = this.recipesSql(); break;
      case "recipe_ingredients": sql = this.ingredientsSql(); break;
      case "recipe_nutrition_snapshots": sql = this.snapshotsSql(); break;
      case "ingredient_nutrition_profiles": sql = this.nutritionLinksSql(); break;
      case "ingredient_conversion_assignments": sql = this.conversionAssignmentsSql(); break;
      default: throw new Error(`Unsupported closeout table: ${this.table}`);
    }
    return { data: await this.session.rows(sql), error: null };
  }
}

function createBackfillClient(session: TransactionalPsqlSession) {
  return {
    from(table: string) {
      return new BackfillSelectQuery(session, table);
    },
    async rpc(name: string, args: JsonRecord): Promise<QueryResult<JsonRecord> | QueryErrorResult> {
      if (name === "write_recipe_nutrition_snapshot") {
        const data = await session.scalar<JsonRecord>(`
          select public.write_recipe_nutrition_snapshot(
            ${sqlText(args.p_recipe_id as string)}::uuid,
            ${sqlJson(args.p_snapshot)},
            ${sqlText(args.p_expected_recipe_updated_at as string)}::timestamptz,
            ${sqlJson(args.p_input_guard)}
          ) as value
        `);
        return { data, error: null };
      }
      if (name === "restore_recipe_nutrition_snapshot_current") {
        const data = await session.scalar<JsonRecord>(`
          select public.restore_recipe_nutrition_snapshot_current(
            ${sqlText(args.p_recipe_id as string)}::uuid,
            ${sqlNullableText(args.p_snapshot_id as string | null)}::uuid,
            ${sqlText(args.p_expected_current_snapshot_id as string)}::uuid
          ) as value
        `);
        return { data, error: null };
      }
      return { data: null, error: { message: "Unsupported closeout RPC" } };
    },
  };
}

class BootstrapSelectQuery implements PromiseLike<QueryResult<JsonRecord[]>> {
  private userId: string | null = null;

  constructor(
    private readonly session: TransactionalPsqlSession,
    private readonly table: "recipe_books" | "meal_plan_columns",
  ) {}

  eq(column: string, value: string) {
    if (column !== "user_id") throw new Error("Unsupported bootstrap owner filter");
    this.userId = value;
    return this;
  }

  order() { return this; }

  then<TResult1 = QueryResult<JsonRecord[]>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<JsonRecord[]>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<QueryResult<JsonRecord[]>> {
    if (!this.userId) throw new Error("Bootstrap owner filter is missing");
    const columns = this.table === "recipe_books"
      ? "id, name, book_type::text as book_type, sort_order, cover_color_key, cover_image_url"
      : "id, name, sort_order";
    return {
      data: await this.session.rows(`
        select ${columns} from public.${this.table}
        where user_id = ${sqlText(this.userId)}::uuid order by sort_order, id
      `),
      error: null,
    };
  }
}

class BootstrapMutationQuery {
  private userId: string | null = null;

  constructor(
    private readonly session: TransactionalPsqlSession,
    private readonly table: "users" | "recipe_books" | "meal_plan_columns",
    private readonly operation: "insert" | "update",
    private readonly values: JsonRecord,
  ) {}

  eq(column: string, value: string) {
    if (column !== "id" || this.table !== "users" || this.operation !== "update") {
      throw new Error("Unsupported bootstrap mutation filter");
    }
    this.userId = value;
    return this;
  }

  select() { return this; }

  async maybeSingle(): Promise<QueryResult<JsonRecord | null>> {
    let sql: string;
    if (this.table === "users" && this.operation === "insert") {
      sql = `
        insert into public.users (
          id, nickname, email, profile_image_url, social_provider, social_id,
          settings_json, created_at, updated_at, deleted_at
        ) values (
          ${sqlText(this.values.id as string)}::uuid,
          ${sqlText(this.values.nickname as string)},
          ${sqlNullableText(this.values.email as string | null)},
          ${sqlNullableText(this.values.profile_image_url as string | null)},
          ${sqlText(this.values.social_provider as string)}::public.social_provider_type,
          ${sqlText(this.values.social_id as string)},
          ${sqlJson(this.values.settings_json)},
          ${sqlText(this.values.created_at as string)}::timestamptz,
          ${sqlText(this.values.updated_at as string)}::timestamptz,
          null
        ) returning id, nickname, email, profile_image_url, settings_json
      `;
    } else if (this.table === "users" && this.operation === "update") {
      if (!this.userId) throw new Error("Bootstrap user update filter is missing");
      sql = `
        update public.users set
          settings_json = ${sqlJson(this.values.settings_json)},
          updated_at = ${sqlText(this.values.updated_at as string)}::timestamptz
        where id = ${sqlText(this.userId)}::uuid
        returning id, nickname, email, profile_image_url, settings_json
      `;
    } else if (this.table === "recipe_books" && this.operation === "insert") {
      sql = `
        insert into public.recipe_books (
          id, user_id, name, book_type, cover_color_key, cover_image_url,
          sort_order, created_at, updated_at
        ) values (
          ${sqlText(this.values.id as string)}::uuid,
          ${sqlText(this.values.user_id as string)}::uuid,
          ${sqlText(this.values.name as string)},
          ${sqlText(this.values.book_type as string)}::public.recipe_book_type,
          ${sqlNullableText(this.values.cover_color_key as string | null)},
          ${sqlNullableText(this.values.cover_image_url as string | null)},
          ${this.values.sort_order as number},
          ${sqlText(this.values.created_at as string)}::timestamptz,
          ${sqlText(this.values.updated_at as string)}::timestamptz
        ) returning id, name, book_type::text as book_type, sort_order, cover_color_key, cover_image_url
      `;
    } else if (this.table === "meal_plan_columns" && this.operation === "insert") {
      sql = `
        insert into public.meal_plan_columns (id, user_id, name, sort_order, created_at)
        values (
          ${sqlText(this.values.id as string)}::uuid,
          ${sqlText(this.values.user_id as string)}::uuid,
          ${sqlText(this.values.name as string)},
          ${this.values.sort_order as number},
          ${sqlText(this.values.created_at as string)}::timestamptz
        ) returning id, name, sort_order
      `;
    } else {
      throw new Error("Unsupported bootstrap mutation");
    }
    const [data = null] = await this.session.mutationRows(sql);
    return { data, error: null };
  }
}

class UsersSelectQuery {
  private userId: string | null = null;

  constructor(private readonly session: TransactionalPsqlSession) {}

  eq(column: string, value: string) {
    if (column !== "id") throw new Error("Unsupported bootstrap user filter");
    this.userId = value;
    return this;
  }

  async maybeSingle(): Promise<QueryResult<JsonRecord | null>> {
    if (!this.userId) throw new Error("Bootstrap user filter is missing");
    const [data = null] = await this.session.rows(`
      select id, nickname, email, profile_image_url, settings_json
      from public.users where id = ${sqlText(this.userId)}::uuid
    `);
    return { data, error: null };
  }
}

function createBootstrapClient(session: TransactionalPsqlSession): UserBootstrapDbClient {
  return {
    from(table: "users" | "recipe_books" | "meal_plan_columns") {
      if (table === "users") {
        return {
          select: () => new UsersSelectQuery(session),
          insert: (values: JsonRecord) => new BootstrapMutationQuery(session, table, "insert", values),
          update: (values: JsonRecord) => new BootstrapMutationQuery(session, table, "update", values),
        };
      }
      return {
        select: () => new BootstrapSelectQuery(session, table),
        insert: (values: JsonRecord) => new BootstrapMutationQuery(session, table, "insert", values),
      };
    },
  } as unknown as UserBootstrapDbClient;
}

class MealRouteLookupQuery {
  private id: string | null = null;

  constructor(
    private readonly session: TransactionalPsqlSession,
    private readonly table: "recipes" | "meal_plan_columns" | "leftover_dishes",
  ) {}

  eq(column: string, value: string) {
    if (column !== "id") throw new Error("Unsupported Meal route lookup filter");
    this.id = value;
    return this;
  }

  async maybeSingle(): Promise<QueryResult<JsonRecord | null>> {
    if (!this.id) throw new Error("Meal route lookup id is missing");
    const columns = this.table === "recipes"
      ? "id"
      : this.table === "meal_plan_columns"
        ? "id, user_id, name"
        : "id, user_id, recipe_id";
    const [data = null] = await this.session.rows(`
      select ${columns} from public.${this.table}
      where id = ${sqlText(this.id)}::uuid
    `);
    return { data, error: null };
  }
}

class MealRouteInsertQuery {
  constructor(
    private readonly session: TransactionalPsqlSession,
    private readonly values: JsonRecord,
  ) {}

  select() { return this; }

  async maybeSingle(): Promise<QueryResult<JsonRecord | null>> {
    const leftoverDishId = this.values.leftover_dish_id as string | null;
    const [data = null] = await this.session.mutationRows(`
      insert into public.meals (
        user_id, recipe_id, plan_date, column_id, planned_servings,
        status, is_leftover, leftover_dish_id, shopping_list_id, cooked_at
      ) values (
        ${sqlText(this.values.user_id as string)}::uuid,
        ${sqlText(this.values.recipe_id as string)}::uuid,
        ${sqlText(this.values.plan_date as string)}::date,
        ${sqlText(this.values.column_id as string)}::uuid,
        ${this.values.planned_servings as number},
        ${sqlText(this.values.status as string)}::public.meal_status_type,
        ${this.values.is_leftover === true ? "true" : "false"},
        ${sqlNullableText(leftoverDishId)}::uuid,
        null,
        null
      ) returning
        id, recipe_id, plan_date::text as plan_date, column_id,
        planned_servings, status::text as status, is_leftover, leftover_dish_id,
        recipe_nutrition_snapshot_id
    `);
    return { data, error: null };
  }
}

class MealRouteMealSelectQuery {
  private id: string | null = null;

  constructor(private readonly session: TransactionalPsqlSession) {}

  eq(column: string, value: string) {
    if (column !== "id") throw new Error("Unsupported Meal detail lookup filter");
    this.id = value;
    return this;
  }

  async maybeSingle(): Promise<QueryResult<JsonRecord | null>> {
    if (!this.id) throw new Error("Meal detail lookup id is missing");
    const [data = null] = await this.session.rows(`
      select id, user_id, planned_servings, status::text as status
      from public.meals where id = ${sqlText(this.id)}::uuid
    `);
    return { data, error: null };
  }
}

class MealRouteMealMutationQuery {
  private id: string | null = null;
  private userId: string | null = null;

  constructor(
    private readonly session: TransactionalPsqlSession,
    private readonly operation: "update" | "delete",
    private readonly values: JsonRecord | null,
  ) {}

  eq(column: string, value: string) {
    if (column === "id") this.id = value;
    else if (column === "user_id") this.userId = value;
    else throw new Error("Unsupported Meal detail mutation filter");
    return this;
  }

  select() { return this; }

  async maybeSingle(): Promise<QueryResult<JsonRecord | null>> {
    if (!this.id || !this.userId) throw new Error("Meal detail mutation owner filters are incomplete");
    const mutationSql = this.operation === "update"
      ? `
        update public.meals set planned_servings = ${this.values?.planned_servings as number}
        where id = ${sqlText(this.id)}::uuid and user_id = ${sqlText(this.userId)}::uuid
        returning id, user_id, planned_servings, status::text as status
      `
      : `
        delete from public.meals
        where id = ${sqlText(this.id)}::uuid and user_id = ${sqlText(this.userId)}::uuid
        returning id
      `;
    const [data = null] = await this.session.mutationRows(mutationSql);
    return { data, error: null };
  }
}

function createMealRouteClient(
  session: TransactionalPsqlSession,
  bootstrapClient: UserBootstrapDbClient,
) {
  const bootstrapTables = new Set(["users", "recipe_books", "meal_plan_columns"]);
  const bootstrap = bootstrapClient as unknown as { from(table: string): unknown };

  return {
    from(table: string) {
      if (bootstrapTables.has(table)) {
        if (table === "meal_plan_columns") {
          return {
            select: (columns: string) => columns.includes("user_id")
              ? new MealRouteLookupQuery(session, table)
              : new BootstrapSelectQuery(session, table),
            insert: (values: JsonRecord) => new BootstrapMutationQuery(
              session,
              table,
              "insert",
              values,
            ),
          };
        }
        return bootstrap.from(table);
      }
      if (table === "recipes" || table === "leftover_dishes") {
        return {
          select: () => new MealRouteLookupQuery(session, table),
        };
      }
      if (table === "meals") {
        return {
          select: () => new MealRouteMealSelectQuery(session),
          insert: (values: JsonRecord) => new MealRouteInsertQuery(session, values),
          update: (values: JsonRecord) => new MealRouteMealMutationQuery(
            session,
            "update",
            values,
          ),
          delete: () => new MealRouteMealMutationQuery(session, "delete", null),
        };
      }
      throw new Error(`Unsupported Meal route table: ${table}`);
    },
  };
}

export interface RecipeNutritionPostgres17CloseoutHarness {
  repository: ReturnType<typeof createSupabaseRecipeNutritionBackfillRepository>;
  bootstrapClient: UserBootstrapDbClient;
  mealRouteClient: unknown;
  begin(): Promise<void>;
  rollback(): Promise<void>;
  close(): Promise<void>;
  assertTargetDatabase(): Promise<void>;
  readScopeSnapshotState(): Promise<{ currentSnapshotIds: Record<string, string>; snapshotCount: number }>;
  readScopeCurrentSnapshotIds(): Promise<Record<string, string>>;
  readCurrentSnapshotId(recipeId: string): Promise<string | null>;
  readFirstScopeRecipeId(): Promise<string>;
  writePriorCurrentSnapshotFromSharedCalculator(): Promise<{
    recipeId: string;
    snapshotId: string;
    previousSnapshotId: string | null;
  }>;
  restorePriorCurrentSnapshot(prior: {
    recipeId: string;
    snapshotId: string;
    previousSnapshotId: string | null;
  }): Promise<void>;
  ensureCurrentSnapshot(recipeId: string): Promise<string>;
  seedUser(userId: string): Promise<void>;
  readPlannerColumnNames(userId: string): Promise<string[]>;
  readPlannerColumnId(userId: string, name: string): Promise<string>;
  seedLeftoverDish(options: { userId: string; recipeId: string }): Promise<string>;
  seedMeal(options: {
    userId: string;
    recipeId: string;
    plannedServings: number;
  }): Promise<string>;
  readMealState(mealId: string): Promise<{
    id: string;
    userId: string;
    plannedServings: number;
    status: string;
  } | null>;
  countMealsForUsers(userIds: string[]): Promise<number>;
  insertMeal(options: { userId: string; recipeId: string }): Promise<{
    recipeNutritionSnapshotId: string | null;
    nutritionSnapshotOrigin: string | null;
  }>;
}

export async function createRecipeNutritionPostgres17CloseoutHarness(): Promise<RecipeNutritionPostgres17CloseoutHarness> {
  const host = process.env.HOMECOOK_RECIPE_NUTRITION_PGHOST ?? "";
  const port = process.env.HOMECOOK_RECIPE_NUTRITION_PGPORT ?? "";
  const database = process.env.HOMECOOK_RECIPE_NUTRITION_PGDATABASE ?? "";
  const user = process.env.HOMECOOK_RECIPE_NUTRITION_PGUSER ?? "postgres";
  assertSafeRecipeNutritionPostgres17Target({ host, port, database, user });

  const session = new TransactionalPsqlSession({ host, port, database, user });
  const backfillClient = createBackfillClient(session);
  const repository = createSupabaseRecipeNutritionBackfillRepository(backfillClient as never);
  const bootstrapClient = createBootstrapClient(session);
  const mealRouteClient = createMealRouteClient(session, bootstrapClient);

  async function scopeRecipeIds() {
    return session.rows<{ recipe_id: string }>(`
      select recipe_id from public.recipe_sources
      where extraction_meta_json ->> 'source_provider' = 'foodsafety-cookrcp'
        and extraction_meta_json ->> 'reviewed_scope' = any(${sqlTextArray(FOODSAFETY_SCOPE_MARKERS)})
      order by recipe_id
    `);
  }

  async function readScopeCurrentSnapshotIds() {
    const rows = await session.rows<{ recipe_id: string; id: string }>(`
      select snapshot.recipe_id, snapshot.id
      from public.recipe_nutrition_snapshots snapshot
      join public.recipe_sources source on source.recipe_id = snapshot.recipe_id
      where snapshot.is_current
        and source.extraction_meta_json ->> 'source_provider' = 'foodsafety-cookrcp'
        and source.extraction_meta_json ->> 'reviewed_scope' = any(${sqlTextArray(FOODSAFETY_SCOPE_MARKERS)})
      order by snapshot.recipe_id
    `);
    return Object.fromEntries(rows.map((row) => [row.recipe_id, row.id]));
  }

  async function readCurrentSnapshotId(recipeId: string) {
    return session.scalar<string | null>(`
      select (select id::text from public.recipe_nutrition_snapshots
        where recipe_id = ${sqlText(recipeId)}::uuid and is_current) as value
    `);
  }

  async function readFirstScopeRecipeId() {
    const [row] = await scopeRecipeIds();
    if (!row) throw new Error("FoodSafety closeout scope is empty");
    return row.recipe_id;
  }

  async function writeSharedSnapshot(recipeId: string, calculationVersion?: string) {
    const [recipe] = await repository.loadRecipes([recipeId]);
    const ingredients = await repository.loadIngredients([recipeId]);
    const predecessors = await repository.loadPredecessors(
      [...new Set(ingredients.map((ingredient: { ingredient_id: string }) => ingredient.ingredient_id))],
    );
    const calculation = buildRecipeNutritionCalculation(
      recipe,
      ingredients,
      predecessors,
      calculateRecipeNutrition,
    );
    const inputGuard = (await import("@/scripts/lib/recipe-nutrition-predecessor.mjs"))
      .buildRecipeNutritionInputGuard(ingredients, predecessors);
    const versionedCalculation = calculationVersion
      ? { ...calculation, calculation_version: calculationVersion }
      : calculation;
    const written = await repository.writeSnapshot(
      recipeId,
      versionedCalculation,
      "2026-07-16T00:00:00.000Z",
      recipe.updated_at,
      inputGuard,
    );
    return written.snapshot_id as string;
  }

  return {
    repository,
    bootstrapClient,
    mealRouteClient,
    async begin() { await session.execute("begin;"); },
    async rollback() { await session.execute("rollback;"); },
    async close() { await session.close(); },
    async assertTargetDatabase() {
      const state = await session.scalar<JsonRecord>(`
        select jsonb_build_object(
          'major', current_setting('server_version_num')::integer / 10000,
          'sentinel', shobj_description(oid, 'pg_database'),
          'scope_count', (
            select count(distinct recipe_id) from public.recipe_sources
            where extraction_meta_json ->> 'source_provider' = 'foodsafety-cookrcp'
              and extraction_meta_json ->> 'reviewed_scope' = any(${sqlTextArray(FOODSAFETY_SCOPE_MARKERS)})
          ),
          'scope_ingredient_count', (
            select count(distinct ingredient.ingredient_id)
            from public.recipe_ingredients ingredient
            join public.recipe_sources source on source.recipe_id = ingredient.recipe_id
            where source.extraction_meta_json ->> 'source_provider' = 'foodsafety-cookrcp'
              and source.extraction_meta_json ->> 'reviewed_scope' = any(${sqlTextArray(FOODSAFETY_SCOPE_MARKERS)})
          ),
          'approved_link_count', (
            select count(distinct link.id)
            from public.ingredient_nutrition_profiles link
            join (
              select distinct ingredient.ingredient_id
              from public.recipe_ingredients ingredient
              join public.recipe_sources source on source.recipe_id = ingredient.recipe_id
              where source.extraction_meta_json ->> 'source_provider' = 'foodsafety-cookrcp'
                and source.extraction_meta_json ->> 'reviewed_scope' = any(${sqlTextArray(FOODSAFETY_SCOPE_MARKERS)})
            ) scoped_ingredient on scoped_ingredient.ingredient_id = link.ingredient_id
            where link.review_status = 'approved' and link.is_active and link.is_primary
          ),
          'linked_recipe_count', (
            select count(distinct recipe.id)
            from public.recipes recipe
            join public.recipe_sources source on source.recipe_id = recipe.id
            join public.recipe_ingredients ingredient on ingredient.recipe_id = recipe.id
            join public.ingredient_nutrition_profiles link on link.ingredient_id = ingredient.ingredient_id
            where source.extraction_meta_json ->> 'source_provider' = 'foodsafety-cookrcp'
              and source.extraction_meta_json ->> 'reviewed_scope' = any(${sqlTextArray(FOODSAFETY_SCOPE_MARKERS)})
              and link.review_status = 'approved' and link.is_active and link.is_primary
          ),
          'has_writer', to_regprocedure('public.write_recipe_nutrition_snapshot(uuid,jsonb,timestamptz,jsonb)') is not null,
          'has_bootstrap', to_regclass('public.meal_plan_columns') is not null,
          'snapshot_rls', (
            select relrowsecurity from pg_class
            where oid = 'public.recipe_nutrition_snapshots'::regclass
          ),
          'service_snapshot_select', has_table_privilege(
            'service_role', 'public.recipe_nutrition_snapshots', 'SELECT'
          ),
          'service_snapshot_write_count', (
            select count(*) from unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) privilege
            where has_table_privilege(
              'service_role', 'public.recipe_nutrition_snapshots', privilege
            )
          )
        ) as value
        from pg_database where datname = current_database()
      `);
      if (state.major !== 17 || state.sentinel !== "homecook-isolated-local-v1" ||
        state.scope_count !== 30 || state.scope_ingredient_count !== 124 ||
        state.approved_link_count !== 13 || state.linked_recipe_count !== 21 ||
        state.has_writer !== true || state.has_bootstrap !== true || state.snapshot_rls !== true ||
        state.service_snapshot_select !== true || state.service_snapshot_write_count !== 0) {
        throw new Error("PostgreSQL 17 closeout target does not match the isolated approved baseline");
      }
    },
    async readScopeSnapshotState() {
      return {
        currentSnapshotIds: await readScopeCurrentSnapshotIds(),
        snapshotCount: await session.scalar<number>(`
          select count(*)::integer as value
          from public.recipe_nutrition_snapshots snapshot
          join public.recipe_sources source on source.recipe_id = snapshot.recipe_id
          where source.extraction_meta_json ->> 'source_provider' = 'foodsafety-cookrcp'
            and source.extraction_meta_json ->> 'reviewed_scope' = any(${sqlTextArray(FOODSAFETY_SCOPE_MARKERS)})
        `),
      };
    },
    readScopeCurrentSnapshotIds,
    readCurrentSnapshotId,
    readFirstScopeRecipeId,
    async writePriorCurrentSnapshotFromSharedCalculator() {
      const recipeId = await readFirstScopeRecipeId();
      const previousSnapshotId = await readCurrentSnapshotId(recipeId);
      const snapshotId = await writeSharedSnapshot(recipeId, "recipe-nutrition-v1-closeout-prior");
      return { recipeId, snapshotId, previousSnapshotId };
    },
    async restorePriorCurrentSnapshot(prior) {
      await repository.restoreCurrent(prior.recipeId, prior.previousSnapshotId, prior.snapshotId);
    },
    async ensureCurrentSnapshot(recipeId) {
      return writeSharedSnapshot(recipeId);
    },
    async seedUser(userId) {
      await session.execute(`
        insert into public.users (
          id, nickname, email, social_provider, social_id, settings_json
        ) values (
          ${sqlText(userId)}::uuid, 'closeout-user', null, 'google', ${sqlText(userId)}, '{}'::jsonb
        );
      `);
    },
    async readPlannerColumnNames(userId) {
      const rows = await session.rows<{ name: string }>(`
        select name from public.meal_plan_columns
        where user_id = ${sqlText(userId)}::uuid order by sort_order, id
      `);
      return rows.map((row) => row.name);
    },
    async readPlannerColumnId(userId, name) {
      return session.scalar<string>(`
        select id::text as value from public.meal_plan_columns
        where user_id = ${sqlText(userId)}::uuid and name = ${sqlText(name)}
      `);
    },
    async seedLeftoverDish({ userId, recipeId }) {
      const id = randomUUID();
      await session.execute(`
        insert into public.leftover_dishes (
          id, user_id, recipe_id, status, cooked_at, cooking_servings
        ) values (
          ${sqlText(id)}::uuid,
          ${sqlText(userId)}::uuid,
          ${sqlText(recipeId)}::uuid,
          'leftover',
          '2026-07-16T00:00:00.000Z'::timestamptz,
          1
        );
      `);
      return id;
    },
    async seedMeal({ userId, recipeId, plannedServings }) {
      const id = randomUUID();
      const columnId = await session.scalar<string>(`
        select id::text as value from public.meal_plan_columns
        where user_id = ${sqlText(userId)}::uuid and name = '아침'
      `);
      await session.execute(`
        insert into public.meals (
          id, user_id, recipe_id, plan_date, column_id, planned_servings
        ) values (
          ${sqlText(id)}::uuid,
          ${sqlText(userId)}::uuid,
          ${sqlText(recipeId)}::uuid,
          '2026-07-16',
          ${sqlText(columnId)}::uuid,
          ${plannedServings}
        );
      `);
      return id;
    },
    async readMealState(mealId) {
      const [row = null] = await session.rows<{
        id: string;
        user_id: string;
        planned_servings: number;
        status: string;
      }>(`
        select id, user_id, planned_servings, status::text as status
        from public.meals where id = ${sqlText(mealId)}::uuid
      `);
      return row === null
        ? null
        : {
          id: row.id,
          userId: row.user_id,
          plannedServings: row.planned_servings,
          status: row.status,
        };
    },
    async countMealsForUsers(userIds) {
      return session.scalar<number>(`
        select count(*)::integer as value from public.meals
        where user_id = any(${sqlUuidArray(userIds)})
      `);
    },
    async insertMeal({ userId, recipeId }) {
      const columnId = await session.scalar<string>(`
        select id::text as value from public.meal_plan_columns
        where user_id = ${sqlText(userId)}::uuid and name = '아침'
      `);
      const [row] = await session.mutationRows<{
        recipe_nutrition_snapshot_id: string | null;
        nutrition_snapshot_origin: string | null;
      }>(`
        insert into public.meals (
          id, user_id, recipe_id, plan_date, column_id, planned_servings
        ) values (
          ${sqlText(randomUUID())}::uuid,
          ${sqlText(userId)}::uuid,
          ${sqlText(recipeId)}::uuid,
          '2026-07-16',
          ${sqlText(columnId)}::uuid,
          2
        ) returning recipe_nutrition_snapshot_id, nutrition_snapshot_origin
      `);
      if (!row) throw new Error("Closeout Meal insert returned no row");
      return {
        recipeNutritionSnapshotId: row.recipe_nutrition_snapshot_id,
        nutritionSnapshotOrigin: row.nutrition_snapshot_origin,
      };
    },
  };
}
