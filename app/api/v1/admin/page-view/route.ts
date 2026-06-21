import { fail, ok } from "@/lib/api/response";
import { recordAdminAudit, type AdminAuditDbClient } from "@/lib/server/admin-audit";
import { requireAdminUser } from "@/lib/server/admin-auth";

const ALLOWED_ADMIN_PAGE_PATHS = new Set([
  "/admin",
  "/admin/users",
  "/admin/events",
  "/admin/feedback",
  "/admin/audit-logs",
]);

async function readAdminPagePath(request: Request) {
  try {
    const body = await request.json() as { path?: unknown };
    if (typeof body.path !== "string") {
      return "/admin";
    }
    const url = new URL(body.path, request.url);
    return ALLOWED_ADMIN_PAGE_PATHS.has(url.pathname) ? url.pathname : "/admin";
  } catch {
    return "/admin";
  }
}

export async function POST(request: Request) {
  const pagePath = await readAdminPagePath(request);
  const adminAuth = await requireAdminUser(request);
  if (adminAuth.response) {
    return adminAuth.response;
  }

  const dbClient = adminAuth.serviceRoleClient;
  const adminUser = adminAuth.adminUser;
  if (!dbClient || !adminUser) {
    return fail("ADMIN_SERVICE_ROLE_UNAVAILABLE", "관리자 조회에 필요한 서버 권한이 설정되지 않았어요.", 500);
  }

  const auditRequest = new Request(new URL(pagePath, request.url), {
    headers: request.headers,
    method: request.method,
  });

  const auditOk = await recordAdminAudit(dbClient as unknown as AdminAuditDbClient, {
    action: "admin_page_view",
    actorAdminUserId: adminUser.id,
    request: auditRequest,
    targetId: null,
    targetType: "admin_page",
  });

  if (!auditOk) {
    return fail("ADMIN_AUDIT_WRITE_FAILED", "관리자 감사 로그를 기록하지 못했어요.", 500);
  }

  return ok({ verified: true });
}
