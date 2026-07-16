import { spawn, spawnSync } from "node:child_process";

import {
  ensureUserBootstrapState,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";

export interface ProductEntryPostgresConnection {
  host: string;
  port: string;
  database: string;
}

export function productEntryPsql(connection: ProductEntryPostgresConnection, sql: string) {
  return spawnSync("psql", [
    "-h", connection.host,
    "-p", connection.port,
    "-U", "postgres",
    "-d", connection.database,
    "-At",
    "-v", "ON_ERROR_STOP=1",
    "-c", sql,
  ], {
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "", NODE_ENV: "test" },
  });
}

export function productEntryPsqlAsync(
  connection: ProductEntryPostgresConnection,
  sql: string,
): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("psql", [
      "-h", connection.host,
      "-p", connection.port,
      "-U", "postgres",
      "-d", connection.database,
      "-At",
      "-v", "ON_ERROR_STOP=1",
      "-c", sql,
    ], { env: { PATH: process.env.PATH ?? "", NODE_ENV: "test" } });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (status) => resolve({ status, stdout, stderr }));
  });
}

type BootstrapTable = "users" | "recipe_books" | "meal_plan_columns";
type Row = Record<string, unknown>;

function textSql(value: string) {
  return `convert_from(decode('${Buffer.from(value, "utf8").toString("base64")}', 'base64'), 'UTF8')`;
}

function valueSql(value: unknown, column?: string, table?: BootstrapTable) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") {
    const expression = textSql(value);
    if (column === "id" || column === "user_id") return `${expression}::uuid`;
    if (column === "social_provider") return `${expression}::public.social_provider_type`;
    if (column === "book_type" && table === "recipe_books") {
      return `${expression}::public.recipe_book_type`;
    }
    if (column === "created_at" || column === "updated_at") return `${expression}::timestamptz`;
    return expression;
  }
  return `${textSql(JSON.stringify(value))}::jsonb`;
}

function resultError(stderr: string) {
  return {
    code: /duplicate key/i.test(stderr) ? "23505" : undefined,
    message: stderr.trim() || "PostgreSQL bootstrap query failed",
  };
}

function parseJsonOutput<T>(stdout: string): T {
  const line = stdout.trim().split("\n").filter(Boolean).at(-1) ?? "null";
  return JSON.parse(line) as T;
}

class BootstrapSelectQuery implements PromiseLike<{ data: Row[] | null; error: { code?: string; message: string } | null }> {
  private filters: Array<{ column: string; value: string }> = [];
  private orders: Array<{ column: string; ascending: boolean }> = [];

  constructor(
    private readonly connection: ProductEntryPostgresConnection,
    private readonly table: BootstrapTable,
  ) {}

  eq(column: string, value: string) {
    this.filters.push({ column, value });
    return this;
  }

  order(column: string, options: { ascending: boolean }) {
    this.orders.push({ column, ascending: options.ascending });
    return this;
  }

  async maybeSingle() {
    const result = this.execute();
    return {
      data: result.data?.[0] ?? null,
      error: result.error,
    };
  }

  then<TResult1 = { data: Row[] | null; error: { code?: string; message: string } | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[] | null; error: { code?: string; message: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }

  private execute() {
    const allowedColumns = new Set(["id", "user_id", "sort_order"]);
    const where = this.filters.length === 0 ? "" : `where ${this.filters.map(({ column, value }) => {
      if (!allowedColumns.has(column)) throw new Error(`Unsupported bootstrap filter: ${column}`);
      return `${column} = ${textSql(value)}::uuid`;
    }).join(" and ")}`;
    const order = this.orders.length === 0 ? "" : `order by ${this.orders.map(({ column, ascending }) => {
      if (!allowedColumns.has(column)) throw new Error(`Unsupported bootstrap order: ${column}`);
      return `${column} ${ascending ? "asc" : "desc"}`;
    }).join(", ")}`;
    const result = productEntryPsql(this.connection, `
      select coalesce(json_agg(row_to_json(rows)), '[]'::json)::text
      from (select * from public.${this.table} ${where} ${order}) rows;
    `);
    if (result.status !== 0) return { data: null, error: resultError(result.stderr) };
    return { data: parseJsonOutput<Row[]>(result.stdout), error: null };
  }
}

class BootstrapMutationQuery {
  private idFilter: string | null = null;

  constructor(
    private readonly connection: ProductEntryPostgresConnection,
    private readonly table: BootstrapTable,
    private readonly operation: "insert" | "update",
    private readonly values: Row,
  ) {}

  eq(column: string, value: string) {
    if (column !== "id") throw new Error(`Unsupported bootstrap mutation filter: ${column}`);
    this.idFilter = value;
    return this;
  }

  select() { return this; }

  async maybeSingle() {
    const columns = Object.keys(this.values);
    const sql = this.operation === "insert"
      ? `insert into public.${this.table} (${columns.join(", ")}) values (${columns.map((column) => valueSql(this.values[column], column, this.table)).join(", ")}) returning *`
      : `update public.${this.table} set ${columns.map((column) => `${column} = ${valueSql(this.values[column], column, this.table)}`).join(", ")} where id = ${textSql(this.idFilter ?? "")}::uuid returning *`;
    const result = productEntryPsql(this.connection, `
      with changed as (${sql}) select row_to_json(changed)::text from changed;
    `);
    if (result.status !== 0) return { data: null, error: resultError(result.stderr) };
    return { data: parseJsonOutput<Row | null>(result.stdout), error: null };
  }
}

class BootstrapTableClient {
  constructor(
    private readonly connection: ProductEntryPostgresConnection,
    private readonly table: BootstrapTable,
  ) {}

  select() {
    return new BootstrapSelectQuery(this.connection, this.table);
  }

  insert(values: Row) {
    return new BootstrapMutationQuery(this.connection, this.table, "insert", values);
  }

  update(values: Row) {
    return new BootstrapMutationQuery(this.connection, this.table, "update", values);
  }
}

export async function bootstrapProductEntryPlannerUser(
  connection: ProductEntryPostgresConnection,
  userId: string,
) {
  const client = {
    from(table: BootstrapTable) {
      return new BootstrapTableClient(connection, table);
    },
  } as unknown as UserBootstrapDbClient;
  return ensureUserBootstrapState(client, userId);
}
