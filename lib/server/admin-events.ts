import { createServiceRoleClient } from "@/lib/supabase/server";

import {
  normalizeRequestPath,
  sanitizeOperationalMetadata,
} from "./admin-log-sanitize";

interface QueryError {
  message: string;
}

interface InsertResult {
  error: QueryError | null;
}

interface OperationalEventsTable {
  insert(values: Record<string, unknown>): PromiseLike<InsertResult>;
}

export interface OperationalEventsDbClient {
  from(table: "operational_events"): OperationalEventsTable;
}

export interface OperationalEventInput {
  event_type: string;
  severity?: "info" | "warn" | "error" | "critical";
  source: string;
  actor_user_id?: string | null;
  target_user_id?: string | null;
  request?: Request | URL | string | null;
  request_path?: string | null;
  http_status?: number | null;
  error_code?: string | null;
  message_summary?: string | null;
  metadata_json?: Record<string, unknown> | null;
}

export async function recordOperationalEvent(
  dbClient: OperationalEventsDbClient | null | undefined,
  input: OperationalEventInput,
) {
  if (!dbClient) {
    return false;
  }

  const requestPath = input.request_path ?? normalizeRequestPath(input.request);

  try {
    const result = await dbClient.from("operational_events").insert({
      event_type: input.event_type,
      severity: input.severity ?? "info",
      source: input.source,
      actor_user_id: input.actor_user_id ?? null,
      target_user_id: input.target_user_id ?? null,
      request_path: requestPath,
      http_status: input.http_status ?? null,
      error_code: input.error_code ?? null,
      message_summary: input.message_summary ?? null,
      metadata_json: sanitizeOperationalMetadata(input.metadata_json),
    });

    return !result.error;
  } catch {
    return false;
  }
}

export async function recordOperationalEventFromServiceRole(input: OperationalEventInput) {
  return recordOperationalEvent(
    createServiceRoleClient() as unknown as OperationalEventsDbClient | null,
    input,
  );
}
