import type { User } from "@supabase/supabase-js";

import { fail } from "@/lib/api/response";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";

import { recordOperationalEvent, type OperationalEventsDbClient } from "./admin-events";

interface QueryError {
  message: string;
}

interface AdminMemberRow {
  role: string;
  user_id: string;
}

interface AdminMemberQuery {
  eq(column: string, value: string): AdminMemberQuery;
  maybeSingle(): PromiseLike<{
    data: AdminMemberRow | null;
    error: QueryError | null;
  }>;
}

interface AdminMembersTable {
  select(columns: string): AdminMemberQuery;
}

export interface AdminServiceRoleClient {
  from(table: string): unknown;
}

interface AdminMembershipClient extends AdminServiceRoleClient {
  from(table: "admin_members"): AdminMembersTable;
}

export interface AdminAuthResult {
  adminUser: User | null;
  response: Response | null;
  serviceRoleClient: AdminServiceRoleClient | null;
}

function adminServiceRoleUnavailable() {
  return fail(
    "ADMIN_SERVICE_ROLE_UNAVAILABLE",
    "관리자 조회에 필요한 서버 권한이 설정되지 않았어요.",
    500,
  );
}

export async function requireAdminUser(request: Request): Promise<AdminAuthResult> {
  const routeClient = await createRouteHandlerClient();
  const authResult = await routeClient.auth.getUser();
  const user = authResult.data.user;

  if (!user) {
    return {
      adminUser: null,
      response: fail("UNAUTHORIZED", "로그인이 필요해요.", 401),
      serviceRoleClient: null,
    };
  }

  const serviceRoleClient = createServiceRoleClient() as AdminServiceRoleClient | null;

  if (!serviceRoleClient) {
    await recordOperationalEvent(null, {
      event_type: "admin_service_role_missing",
      severity: "critical",
      source: "admin",
      actor_user_id: user.id,
      request,
      http_status: 500,
      error_code: "ADMIN_SERVICE_ROLE_UNAVAILABLE",
      message_summary: "Admin API service role is unavailable",
    });

    return {
      adminUser: user,
      response: adminServiceRoleUnavailable(),
      serviceRoleClient: null,
    };
  }

  try {
    const memberResult = await (serviceRoleClient as AdminMembershipClient)
      .from("admin_members")
      .select("user_id, role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (memberResult.error) {
      await recordOperationalEvent(serviceRoleClient as unknown as OperationalEventsDbClient, {
        event_type: "unhandled_server_error",
        severity: "error",
        source: "admin",
        actor_user_id: user.id,
        request,
        http_status: 500,
        error_code: "ADMIN_MEMBERSHIP_QUERY_FAILED",
        message_summary: "Admin membership lookup failed",
      });

      return {
        adminUser: user,
        response: fail("INTERNAL_ERROR", "관리자 권한을 확인하지 못했어요.", 500),
        serviceRoleClient,
      };
    }

    if (!memberResult.data) {
      return {
        adminUser: user,
        response: fail("FORBIDDEN", "관리자 권한이 필요해요.", 403),
        serviceRoleClient,
      };
    }

    return {
      adminUser: user,
      response: null,
      serviceRoleClient,
    };
  } catch {
    await recordOperationalEvent(serviceRoleClient as unknown as OperationalEventsDbClient, {
      event_type: "unhandled_server_error",
      severity: "error",
      source: "admin",
      actor_user_id: user.id,
      request,
      http_status: 500,
      error_code: "ADMIN_MEMBERSHIP_UNHANDLED",
      message_summary: "Admin membership lookup threw unexpectedly",
    });

    return {
      adminUser: user,
      response: fail("INTERNAL_ERROR", "관리자 권한을 확인하지 못했어요.", 500),
      serviceRoleClient,
    };
  }
}
