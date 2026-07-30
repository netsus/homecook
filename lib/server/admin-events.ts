import {
  createOperationalEventInternalClient,
} from "@/lib/supabase/server";

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

export interface OperationalEventsRpcClient {
  rpc(
    functionName: "record_internal_operational_event",
    args: Record<string, unknown>,
  ): PromiseLike<{
    data: boolean | null;
    error: QueryError | null;
  }>;
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

export async function recordOperationalEventThroughRpc(
  dbClient: OperationalEventsRpcClient | null | undefined,
  input: OperationalEventInput,
) {
  if (!dbClient) {
    return false;
  }

  const requestPath = input.request_path ?? normalizeRequestPath(input.request);
  try {
    const result = await dbClient.rpc("record_internal_operational_event", {
      p_actor_user_id: input.actor_user_id ?? null,
      p_error_code: input.error_code ?? null,
      p_event_type: input.event_type,
      p_http_status: input.http_status ?? null,
      p_message_summary: input.message_summary ?? null,
      p_metadata_json: sanitizeOperationalMetadata(input.metadata_json),
      p_request_path: requestPath,
      p_severity: input.severity ?? "info",
      p_source: input.source,
      p_target_user_id: input.target_user_id ?? null,
    });
    return !result.error && result.data === true;
  } catch {
    return false;
  }
}

export async function recordOperationalEventFromServiceRole(input: OperationalEventInput) {
  try {
    const stored = await recordOperationalEventThroughRpc(
      createOperationalEventInternalClient(),
      input,
    );
    if (stored) {
      return true;
    }
  } catch {
    // Emit the same PII-free diagnostic used for RPC failures below.
  }

  console.error("HOMECOOK_OPERATIONAL_EVENT_WRITE_FAILED", {
    event_type: input.event_type,
    source: input.source,
  });
  return false;
}
