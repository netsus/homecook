import { fail, ok } from "@/lib/api/response";
import { recordAdminAudit, type AdminAuditDbClient } from "@/lib/server/admin-audit";
import { requireAdminUser, type AdminServiceRoleClient } from "@/lib/server/admin-auth";
import { parseAdminPagination, readOptionalQuery } from "@/lib/server/admin-pagination";

interface QueryError {
  message: string;
}

interface AdminAuditLogRow {
  id: string;
  actor_admin_user_id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  request_path: string;
  result: string;
  ip_hash: string | null;
  user_agent_hash: string | null;
  created_at: string;
}

interface QueryResult<T> {
  data: T | null;
  error: QueryError | null;
  count?: number | null;
}

interface AdminAuditLogsQuery {
  eq(column: string, value: string): AdminAuditLogsQuery;
  order(column: string, options?: { ascending?: boolean }): AdminAuditLogsQuery;
  range(from: number, to: number): PromiseLike<QueryResult<AdminAuditLogRow[]>>;
}

interface AdminAuditLogsTable {
  select(columns: string, options?: { count?: "exact" }): AdminAuditLogsQuery;
}

function table<T>(dbClient: AdminServiceRoleClient, tableName: string) {
  return dbClient.from(tableName) as T;
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
    action: "list_audit_logs",
    actorAdminUserId: adminUser.id,
    request,
    targetId: null,
    targetType: "audit_log_list",
  });

  if (!auditOk) {
    return fail("ADMIN_AUDIT_WRITE_FAILED", "관리자 감사 로그를 기록하지 못했어요.", 500);
  }

  const url = new URL(request.url);
  const { from, limit, page, to } = parseAdminPagination(url);
  let query = table<AdminAuditLogsTable>(dbClient, "admin_audit_logs")
    .select(
      "id, actor_admin_user_id, action, target_type, target_id, request_path, result, ip_hash, user_agent_hash, created_at",
      { count: "exact" },
    );

  for (const key of ["action", "actor_admin_user_id", "target_type"]) {
    const value = readOptionalQuery(url, key);
    if (value) {
      query = query.eq(key, value);
    }
  }

  const auditLogsResult = await query
    .order("created_at", { ascending: false })
    .range(from, to);

  if (auditLogsResult.error || !auditLogsResult.data) {
    return fail("INTERNAL_ERROR", "관리자 감사 로그를 불러오지 못했어요.", 500);
  }

  return ok({
    items: auditLogsResult.data,
    page,
    limit,
    total: auditLogsResult.count ?? auditLogsResult.data.length,
  });
}
