"use client";

import { fetchJson } from "./fetch-json";

export interface AdminUserItem {
  id: string;
  email_masked: string | null;
  social_provider: string;
  nickname: string;
  created_at: string;
  counts: {
    recipe_books: number;
    meals: number;
    shopping_lists: number;
    pantry_items: number;
  };
  status: "active" | "deleted";
}

export interface AdminOperationalEventItem {
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

export interface AdminAuditLogItem {
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

export interface AdminListData<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}

export interface AdminPageViewData {
  verified: boolean;
}

function buildQuery(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export function verifyAdminPageView(path: string) {
  return fetchJson<AdminPageViewData>("/api/v1/admin/page-view", {
    body: JSON.stringify({ path }),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });
}

export function fetchAdminUsers(params: {
  q?: string;
  page?: number;
  limit?: number;
}) {
  return fetchJson<AdminListData<AdminUserItem>>(
    `/api/v1/admin/users${buildQuery(params)}`,
  );
}

export function fetchAdminOperationalEvents(params: {
  event_type?: string;
  severity?: string;
  source?: string;
  page?: number;
  limit?: number;
}) {
  return fetchJson<AdminListData<AdminOperationalEventItem>>(
    `/api/v1/admin/operational-events${buildQuery(params)}`,
  );
}

export function fetchAdminAuditLogs(params: {
  action?: string;
  actor_admin_user_id?: string;
  target_type?: string;
  page?: number;
  limit?: number;
}) {
  return fetchJson<AdminListData<AdminAuditLogItem>>(
    `/api/v1/admin/audit-logs${buildQuery(params)}`,
  );
}
