import { fail, ok } from "@/lib/api/response";
import { recordAdminAudit, type AdminAuditDbClient } from "@/lib/server/admin-audit";
import { requireAdminUser, type AdminServiceRoleClient } from "@/lib/server/admin-auth";
import { parseAdminPagination, readOptionalQuery } from "@/lib/server/admin-pagination";

interface QueryError {
  message: string;
}

interface OperationalEventRow {
  id: string;
  event_type: string;
  severity: string;
  source: string;
  actor_user_id: string | null;
  target_user_id: string | null;
  request_path: string | null;
  http_status: number | null;
  error_code: string | null;
  message_summary: string | null;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
}

interface QueryResult<T> {
  data: T | null;
  error: QueryError | null;
  count?: number | null;
}

interface OperationalEventsQuery {
  eq(column: string, value: string): OperationalEventsQuery;
  order(column: string, options?: { ascending?: boolean }): OperationalEventsQuery;
  range(from: number, to: number): PromiseLike<QueryResult<OperationalEventRow[]>>;
}

interface OperationalEventsTable {
  select(columns: string, options?: { count?: "exact" }): OperationalEventsQuery;
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
    action: "list_operational_events",
    actorAdminUserId: adminUser.id,
    request,
    targetId: null,
    targetType: "operational_event_list",
  });

  if (!auditOk) {
    return fail("ADMIN_AUDIT_WRITE_FAILED", "관리자 감사 로그를 기록하지 못했어요.", 500);
  }

  const url = new URL(request.url);
  const { from, limit, page, to } = parseAdminPagination(url);
  let query = table<OperationalEventsTable>(dbClient, "operational_events")
    .select(
      "id, event_type, severity, source, actor_user_id, target_user_id, request_path, http_status, error_code, message_summary, metadata_json, created_at",
      { count: "exact" },
    );

  for (const key of ["event_type", "severity", "source"]) {
    const value = readOptionalQuery(url, key);
    if (value) {
      query = query.eq(key, value);
    }
  }

  const eventsResult = await query
    .order("created_at", { ascending: false })
    .range(from, to);

  if (eventsResult.error || !eventsResult.data) {
    return fail("INTERNAL_ERROR", "운영 이벤트를 불러오지 못했어요.", 500);
  }

  return ok({
    items: eventsResult.data,
    page,
    limit,
    total: eventsResult.count ?? eventsResult.data.length,
  });
}
