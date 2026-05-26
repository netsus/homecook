import { fail, ok } from "@/lib/api/response";
import { recordAdminAudit, type AdminAuditDbClient } from "@/lib/server/admin-audit";
import { requireAdminUser, type AdminServiceRoleClient } from "@/lib/server/admin-auth";
import { maskEmail } from "@/lib/server/admin-log-sanitize";
import { parseAdminPagination, readOptionalQuery } from "@/lib/server/admin-pagination";

interface QueryError {
  message: string;
}

interface UserRow {
  id: string;
  email: string | null;
  social_provider: string;
  nickname: string;
  created_at: string;
  deleted_at?: string | null;
}

interface UserScopedRow {
  user_id: string;
}

interface QueryResult<T> {
  data: T | null;
  error: QueryError | null;
  count?: number | null;
}

interface UserListQuery {
  or(filter: string): UserListQuery;
  order(column: string, options?: { ascending?: boolean }): UserListQuery;
  range(from: number, to: number): PromiseLike<QueryResult<UserRow[]>>;
}

interface UserTable {
  select(columns: string, options?: { count?: "exact" }): UserListQuery;
}

interface UserCountQuery {
  in(column: string, values: string[]): PromiseLike<QueryResult<UserScopedRow[]>>;
}

interface UserCountTable {
  select(columns: string): UserCountQuery;
}

function table<T>(dbClient: AdminServiceRoleClient, tableName: string) {
  return dbClient.from(tableName) as T;
}

function escapeSearchTerm(value: string) {
  return value.replace(/[,%]/gu, " ").replace(/\s+/gu, " ").trim();
}

async function countRowsByUser(
  dbClient: AdminServiceRoleClient,
  tableName: string,
  userIds: string[],
) {
  const counts = new Map<string, number>();
  if (userIds.length === 0) {
    return { counts, error: null as QueryError | null };
  }

  const result = await table<UserCountTable>(dbClient, tableName)
    .select("user_id")
    .in("user_id", userIds);

  if (result.error || !result.data) {
    return { counts, error: result.error ?? { message: "count query failed" } };
  }

  for (const row of result.data) {
    counts.set(row.user_id, (counts.get(row.user_id) ?? 0) + 1);
  }

  return { counts, error: null };
}

async function getUserCounts(dbClient: AdminServiceRoleClient, userIds: string[]) {
  const [recipeBooks, meals, shoppingLists, pantryItems] = await Promise.all([
    countRowsByUser(dbClient, "recipe_books", userIds),
    countRowsByUser(dbClient, "meals", userIds),
    countRowsByUser(dbClient, "shopping_lists", userIds),
    countRowsByUser(dbClient, "pantry_items", userIds),
  ]);

  const error = recipeBooks.error ?? meals.error ?? shoppingLists.error ?? pantryItems.error;
  if (error) {
    return { countsByUser: new Map<string, never>(), error };
  }

  const countsByUser = new Map(
    userIds.map((userId) => [
      userId,
      {
        meals: meals.counts.get(userId) ?? 0,
        pantry_items: pantryItems.counts.get(userId) ?? 0,
        recipe_books: recipeBooks.counts.get(userId) ?? 0,
        shopping_lists: shoppingLists.counts.get(userId) ?? 0,
      },
    ]),
  );

  return { countsByUser, error: null };
}

export async function GET(request: Request) {
  const adminAuth = await requireAdminUser(request);
  if (adminAuth.response) {
    return adminAuth.response;
  }

  const dbClient = adminAuth.serviceRoleClient;
  const adminUser = adminAuth.adminUser;
  if (!dbClient || !adminUser) {
    return fail("ADMIN_SERVICE_ROLE_UNAVAILABLE", "관리자 조회에 필요한 서버 권한이 설정되지 않았어요.", 500);
  }

  const auditOk = await recordAdminAudit(dbClient as unknown as AdminAuditDbClient, {
    action: "list_users",
    actorAdminUserId: adminUser.id,
    request,
    targetId: null,
    targetType: "user_search",
  });

  if (!auditOk) {
    return fail("ADMIN_AUDIT_WRITE_FAILED", "관리자 감사 로그를 기록하지 못했어요.", 500);
  }

  const url = new URL(request.url);
  const { from, limit, page, to } = parseAdminPagination(url);
  const searchTerm = readOptionalQuery(url, "q");
  let query = table<UserTable>(dbClient, "users")
    .select("id, email, social_provider, nickname, created_at, deleted_at", { count: "exact" });

  if (searchTerm) {
    const escapedSearch = escapeSearchTerm(searchTerm);
    if (escapedSearch) {
      query = query.or(`email.ilike.%${escapedSearch}%,nickname.ilike.%${escapedSearch}%`);
    }
  }

  const usersResult = await query
    .order("created_at", { ascending: false })
    .range(from, to);

  if (usersResult.error || !usersResult.data) {
    return fail("INTERNAL_ERROR", "관리자 사용자 목록을 불러오지 못했어요.", 500);
  }

  const userIds = usersResult.data.map((user) => user.id);
  const countsResult = await getUserCounts(dbClient, userIds);
  if (countsResult.error) {
    return fail("INTERNAL_ERROR", "관리자 사용자 집계를 불러오지 못했어요.", 500);
  }

  return ok({
    items: usersResult.data.map((user) => ({
      id: user.id,
      email_masked: maskEmail(user.email),
      social_provider: user.social_provider,
      nickname: user.nickname,
      created_at: user.created_at,
      counts: countsResult.countsByUser.get(user.id) ?? {
        meals: 0,
        pantry_items: 0,
        recipe_books: 0,
        shopping_lists: 0,
      },
      status: user.deleted_at ? "deleted" : "active",
    })),
    page,
    limit,
    total: usersResult.count ?? usersResult.data.length,
  });
}
