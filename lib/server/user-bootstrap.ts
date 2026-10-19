import type { User } from "@supabase/supabase-js";

import { normalizeAuthProviderId } from "@/lib/auth/providers";
import { DEFAULT_PLANNER_COLUMN_NAMES } from "@/types/planner";

interface QueryError {
  code?: string;
  message: string;
}

type MaybeSingleQueryResult<T> = PromiseLike<{
  data: T | null;
  error: QueryError | null;
}>;

type ArrayQueryResult<T> = PromiseLike<{
  data: T[] | null;
  error: QueryError | null;
}>;

interface QueryOrderOption {
  ascending: boolean;
}

const USER_COLUMNS = "id, nickname, email, profile_image_url, settings_json";
const RECIPE_BOOK_COLUMNS = "id, name, book_type, sort_order, cover_color_key, cover_image_url";
const PLANNER_COLUMN_COLUMNS = "id, name, sort_order";

interface SelectedSingleRowQuery<T> {
  maybeSingle(): MaybeSingleQueryResult<T>;
}

interface UserRow {
  id: string;
  nickname: string;
  email: string | null;
  profile_image_url: string | null;
  settings_json: unknown;
}

interface UsersSelectQuery {
  match(filters: { id: string }): SelectedSingleRowQuery<UserRow>;
}

interface UsersInsertQuery {
  select(columns: typeof USER_COLUMNS): SelectedSingleRowQuery<UserRow>;
}

interface UsersUpdateQuery {
  match(filters: { id: string }): {
    select(columns: typeof USER_COLUMNS): SelectedSingleRowQuery<UserRow>;
  };
}

interface UsersTable {
  select(columns: typeof USER_COLUMNS): UsersSelectQuery;
  insert(values: {
    id: string;
    nickname: string;
    email: string | null;
    profile_image_url: string | null;
    social_provider: "kakao" | "naver" | "google";
    social_id: string;
    settings_json: Record<string, unknown>;
    created_at: string;
    updated_at: string;
    deleted_at: null;
  }): UsersInsertQuery;
  update(values: Partial<{
    nickname: string;
    email: string | null;
    profile_image_url: string | null;
    settings_json: Record<string, unknown>;
    updated_at: string;
  }>): UsersUpdateQuery;
}

interface RecipeBookRow {
  id: string;
  name: string;
  book_type: "my_added" | "saved" | "liked" | "custom";
  sort_order: number;
  cover_color_key: string | null;
  cover_image_url: string | null;
}

interface RecipeBooksSelectQuery {
  match(filters: { user_id: string }): RecipeBooksSelectQuery;
  order(column: string, options: QueryOrderOption): RecipeBooksSelectQuery;
  then: ArrayQueryResult<RecipeBookRow>["then"];
}

interface RecipeBooksInsertQuery {
  select(columns: typeof RECIPE_BOOK_COLUMNS): SelectedSingleRowQuery<RecipeBookRow>;
}

interface RecipeBooksTable {
  select(columns: typeof RECIPE_BOOK_COLUMNS): RecipeBooksSelectQuery;
  insert(values: {
    id: string;
    user_id: string;
    name: string;
    book_type: "my_added" | "saved" | "liked";
    cover_color_key?: string | null;
    cover_image_url?: string | null;
    sort_order: number;
    created_at: string;
    updated_at: string;
  }): RecipeBooksInsertQuery;
}

interface PlannerColumnRow {
  id: string;
  name: string;
  sort_order: number;
}

interface PlannerColumnsSelectQuery {
  match(filters: { user_id: string }): PlannerColumnsSelectQuery;
  order(column: string, options: QueryOrderOption): PlannerColumnsSelectQuery;
  then: ArrayQueryResult<PlannerColumnRow>["then"];
}

interface PlannerColumnsInsertQuery {
  select(columns: typeof PLANNER_COLUMN_COLUMNS): SelectedSingleRowQuery<PlannerColumnRow>;
}

interface PlannerColumnsTable {
  select(columns: typeof PLANNER_COLUMN_COLUMNS): PlannerColumnsSelectQuery;
  insert(values: {
    id: string;
    user_id: string;
    name: string;
    sort_order: number;
    created_at: string;
  }): PlannerColumnsInsertQuery;
}

export interface UserBootstrapDbClient {
  from(table: "users"): UsersTable;
  from(table: "recipe_books"): RecipeBooksTable;
  from(table: "meal_plan_columns"): PlannerColumnsTable;
}

export const USER_BOOTSTRAP_VERSION = 3;

const USER_BOOTSTRAP_VERSION_KEY = "user_bootstrap_version";
const DEFAULT_RECIPE_BOOKS = [
  { name: "내가 추가한 레시피", book_type: "my_added" as const, cover_color_key: "lavender", sort_order: 0 },
  { name: "저장한 레시피", book_type: "saved" as const, cover_color_key: "sky", sort_order: 1 },
  { name: "좋아요한 레시피", book_type: "liked" as const, cover_color_key: "coral", sort_order: 2 },
];
const DEFAULT_PLANNER_COLUMNS = DEFAULT_PLANNER_COLUMN_NAMES.map((name, sort_order) => ({
  name,
  sort_order,
}));

function normalizeMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Record<string, unknown>;
  }

  return value as Record<string, unknown>;
}

function normalizeNickname(value: unknown) {
  const normalized = typeof value === "string" ? value.trim() : "";

  return normalized || "무먹러";
}

export function normalizeUserEmail(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function normalizeProfileImage(user: Pick<User, "user_metadata">) {
  const metadata = normalizeMetadata(user.user_metadata);
  const image = metadata.avatar_url ?? metadata.picture;

  return typeof image === "string" ? image : null;
}

function normalizeProvider(user: Pick<User, "app_metadata" | "user_metadata">) {
  const appMetadata = normalizeMetadata(user.app_metadata);
  const userMetadata = normalizeMetadata(user.user_metadata);
  const provider =
    normalizeAuthProviderId(appMetadata.provider)
    ?? normalizeAuthProviderId(userMetadata.provider);

  if (provider) {
    return provider;
  }

  return "google";
}

function normalizeSocialId(user: Pick<User, "id" | "user_metadata">) {
  const metadata = normalizeMetadata(user.user_metadata);
  const socialId = metadata.sub ?? metadata.provider_id;

  if (typeof socialId === "string" && socialId.length > 0) {
    return socialId;
  }

  return user.id;
}

function normalizeSettings(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Record<string, unknown>;
  }

  return { ...(value as Record<string, unknown>) };
}

export function buildLegacyAuthCallbackProfile(
  user: Pick<User, "id" | "email" | "app_metadata" | "user_metadata">,
) {
  return {
    email: normalizeUserEmail(user.email),
    nickname: normalizeNickname(normalizeMetadata(user.user_metadata).nickname),
    ownerUuid: user.id,
    profileImageUrl: normalizeProfileImage(user),
    socialId: normalizeSocialId(user),
    socialProvider: normalizeProvider(user),
  };
}

function getBootstrapVersion(settings: Record<string, unknown>) {
  const rawValue = settings[USER_BOOTSTRAP_VERSION_KEY];

  return typeof rawValue === "number" && Number.isFinite(rawValue)
    ? rawValue
    : 0;
}

function isDuplicateKeyConflict(error: QueryError | null) {
  if (!error) {
    return false;
  }

  return error.code === "23505" || error.message.toLowerCase().includes("duplicate key");
}

async function readUserRow(dbClient: UserBootstrapDbClient, userId: string) {
  const result = await dbClient
    .from("users")
    .select(USER_COLUMNS)
    .match({ id: userId })
    .maybeSingle();

  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.data;
}

async function listRecipeBooks(dbClient: UserBootstrapDbClient, userId: string) {
  const result = await dbClient
    .from("recipe_books")
    .select(RECIPE_BOOK_COLUMNS)
    .match({ user_id: userId })
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.data ?? [];
}

async function listPlannerColumns(dbClient: UserBootstrapDbClient, userId: string) {
  const result = await dbClient
    .from("meal_plan_columns")
    .select(PLANNER_COLUMN_COLUMNS)
    .match({ user_id: userId })
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.data ?? [];
}

function findPlannerColumnByName(columns: PlannerColumnRow[], name: string) {
  return columns.find((column) => column.name.trim() === name) ?? null;
}

function getNextSortOrder(rows: Array<{ sort_order: number }>) {
  if (rows.length === 0) {
    return 0;
  }

  return rows.reduce((maxValue, row) => Math.max(maxValue, row.sort_order), -1) + 1;
}

export function formatBootstrapErrorMessage(error: unknown, fallbackMessage: string) {
  if (error instanceof Error) {
    if (
      error.message.includes("schema cache")
      || error.message.includes("Could not find the table 'public.")
      || error.message.includes("relation")
    ) {
      return "Supabase 스키마가 준비되지 않았어요. 마이그레이션을 먼저 적용해 주세요.";
    }
  }

  return fallbackMessage;
}

export async function ensurePublicUserRow(
  dbClient: UserBootstrapDbClient,
  user: Pick<User, "id" | "email" | "app_metadata" | "user_metadata">,
) {
  const existingRow = await readUserRow(dbClient, user.id);

  if (existingRow) {
    return existingRow;
  }

  const now = new Date().toISOString();
  const insertResult = await dbClient
    .from("users")
    .insert({
      id: user.id,
      nickname: normalizeNickname(normalizeMetadata(user.user_metadata).nickname),
      email: normalizeUserEmail(user.email),
      profile_image_url: normalizeProfileImage(user),
      social_provider: normalizeProvider(user),
      social_id: normalizeSocialId(user),
      settings_json: {},
      created_at: now,
      updated_at: now,
      deleted_at: null,
    })
    .select(USER_COLUMNS)
    .maybeSingle();

  if (insertResult.error || !insertResult.data) {
    throw new Error(insertResult.error?.message ?? "users row insert failed");
  }

  return insertResult.data;
}

export async function ensureUserBootstrapState(
  dbClient: UserBootstrapDbClient,
  userId: string,
) {
  const userRow = await readUserRow(dbClient, userId);

  if (!userRow) {
    throw new Error("public.users row is missing");
  }

  const settings = normalizeSettings(userRow.settings_json);

  if (getBootstrapVersion(settings) >= USER_BOOTSTRAP_VERSION) {
    return userRow;
  }

  const currentBooks = await listRecipeBooks(dbClient, userId);
  let nextBookSortOrder = getNextSortOrder(currentBooks);

  for (const defaultBook of DEFAULT_RECIPE_BOOKS) {
    const existing = currentBooks.find((book) => book.book_type === defaultBook.book_type);

    if (existing) {
      continue;
    }

    const createResult = await dbClient
      .from("recipe_books")
      .insert({
        id: crypto.randomUUID(),
        user_id: userId,
        name: defaultBook.name,
        book_type: defaultBook.book_type,
        cover_color_key: defaultBook.cover_color_key,
        cover_image_url: null,
        sort_order: currentBooks.length === 0 ? defaultBook.sort_order : nextBookSortOrder,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select(RECIPE_BOOK_COLUMNS)
      .maybeSingle();

    if (!isDuplicateKeyConflict(createResult.error) && (createResult.error || !createResult.data)) {
      throw new Error(createResult.error?.message ?? "recipe_books insert failed");
    }

    if (createResult.data) {
      currentBooks.push(createResult.data);
      nextBookSortOrder = getNextSortOrder(currentBooks);
    }
  }

  const currentColumns = await listPlannerColumns(dbClient, userId);

  for (const defaultColumn of DEFAULT_PLANNER_COLUMNS) {
    const existing = findPlannerColumnByName(currentColumns, defaultColumn.name);

    if (existing) {
      continue;
    }

    const createResult = await dbClient
      .from("meal_plan_columns")
      .insert({
        id: crypto.randomUUID(),
        user_id: userId,
        name: defaultColumn.name,
        sort_order:
          currentColumns.length === 0
            ? defaultColumn.sort_order
            : getNextSortOrder(currentColumns),
        created_at: new Date().toISOString(),
      })
      .select(PLANNER_COLUMN_COLUMNS)
      .maybeSingle();

    if (!isDuplicateKeyConflict(createResult.error) && (createResult.error || !createResult.data)) {
      throw new Error(createResult.error?.message ?? "meal_plan_columns insert failed");
    }

    if (createResult.data) {
      currentColumns.push(createResult.data);
    }
  }

  const updateResult = await dbClient
    .from("users")
    .update({
      settings_json: {
        ...settings,
        [USER_BOOTSTRAP_VERSION_KEY]: USER_BOOTSTRAP_VERSION,
      },
      updated_at: new Date().toISOString(),
    })
    .match({ id: userId })
    .select(USER_COLUMNS)
    .maybeSingle();

  if (updateResult.error || !updateResult.data) {
    throw new Error(updateResult.error?.message ?? "users settings update failed");
  }

  return updateResult.data;
}
