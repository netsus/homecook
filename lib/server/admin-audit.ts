import {
  hashPrivateValue,
  normalizeRequestPath,
} from "./admin-log-sanitize";

interface QueryError {
  message: string;
}

interface InsertResult {
  error: QueryError | null;
}

interface AdminAuditTable {
  insert(values: Record<string, unknown>): PromiseLike<InsertResult>;
}

export interface AdminAuditDbClient {
  from(table: "admin_audit_logs"): AdminAuditTable;
}

export interface AdminAuditInput {
  actorAdminUserId: string;
  action: string;
  targetType: string | null;
  targetId?: string | null;
  request: Request | URL | string;
  result?: "success" | "failure" | "forbidden";
}

function readClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? null;
  }

  return request.headers.get("x-real-ip");
}

export async function recordAdminAudit(
  dbClient: AdminAuditDbClient,
  input: AdminAuditInput,
) {
  const requestPath = normalizeRequestPath(input.request) ?? "/";
  const ipHash = input.request instanceof Request
    ? hashPrivateValue(readClientIp(input.request))
    : null;
  const userAgentHash = input.request instanceof Request
    ? hashPrivateValue(input.request.headers.get("user-agent"))
    : null;

  try {
    const result = await dbClient.from("admin_audit_logs").insert({
      actor_admin_user_id: input.actorAdminUserId,
      action: input.action,
      target_type: input.targetType,
      target_id: input.targetId ?? null,
      request_path: requestPath,
      result: input.result ?? "success",
      ip_hash: ipHash,
      user_agent_hash: userAgentHash,
    });

    return !result.error;
  } catch {
    return false;
  }
}
