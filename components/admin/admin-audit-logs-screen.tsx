"use client";

import { useCallback, useEffect, useState } from "react";

import {
  fetchAdminAuditLogs,
  type AdminListData,
  type AdminAuditLogItem,
} from "@/lib/api/admin";
import { isApiFetchError } from "@/lib/api/fetch-json";

import { AdminPagination } from "./admin-pagination";

type AuditLogsState =
  | { status: "loading" }
  | { status: "data"; data: AdminListData<AdminAuditLogItem> }
  | { status: "empty" }
  | { status: "error"; message: string };

const ACTION_OPTIONS = ["", "list_users", "list_operational_events", "list_audit_logs", "admin_page_view"] as const;
const TARGET_TYPE_OPTIONS = ["", "user_search", "operational_event_list", "audit_log_list", "admin_page"] as const;

export function AdminAuditLogsScreen() {
  const [state, setState] = useState<AuditLogsState>({ status: "loading" });
  const [action, setAction] = useState("");
  const [actorAdminUserId, setActorAdminUserId] = useState("");
  const [targetType, setTargetType] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(async (act: string, actor: string, tt: string, p: number) => {
    setState({ status: "loading" });
    try {
      const data = await fetchAdminAuditLogs({
        action: act || undefined,
        actor_admin_user_id: actor || undefined,
        target_type: tt || undefined,
        page: p,
        limit: 20,
      });
      if (data.items.length === 0) {
        setState({ status: "empty" });
      } else {
        setState({ status: "data", data });
      }
    } catch (error) {
      const message = isApiFetchError(error)
        ? error.message
        : "감사 로그를 불러오지 못했어요";
      setState({ status: "error", message });
    }
  }, []);

  useEffect(() => {
    void load(action, actorAdminUserId, targetType, page);
  }, [load, action, actorAdminUserId, targetType, page]);

  function handleFilterChange(setter: (v: string) => void) {
    return (value: string) => {
      setter(value);
      setPage(1);
    };
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <FilterSelect
          label="액션"
          onChange={handleFilterChange(setAction)}
          options={ACTION_OPTIONS}
          value={action}
        />
        <input
          aria-label="관리자 UUID"
          className="h-11 min-w-0 flex-1 rounded-lg border bg-[var(--surface,#ffffff)] px-2 text-sm sm:flex-none"
          onChange={(event) => {
            setActorAdminUserId(event.target.value.trim());
            setPage(1);
          }}
          placeholder="관리자 UUID"
          style={{ borderColor: "var(--line, #E9ECEF)" }}
          value={actorAdminUserId}
        />
        <FilterSelect
          label="대상 유형"
          onChange={handleFilterChange(setTargetType)}
          options={TARGET_TYPE_OPTIONS}
          value={targetType}
        />
      </div>

      {state.status === "loading" && <AuditLogsSkeleton />}

      {state.status === "empty" && (
        <div className="py-16 text-center text-sm text-[var(--text-3,#868E96)]">
          감사 로그가 없어요
        </div>
      )}

      {state.status === "error" && (
        <div className="flex flex-col items-center py-16">
          <p className="text-lg font-bold text-[var(--foreground,#212529)]">
            {state.message}
          </p>
          <button
            className="mt-4 inline-flex h-11 items-center rounded-xl bg-[var(--brand,#F97316)] px-6 text-sm font-semibold text-white"
            onClick={() => load(action, actorAdminUserId, targetType, page)}
            type="button"
          >
            다시 시도
          </button>
        </div>
      )}

      {state.status === "data" && (
        <>
          <div className="hidden md:block">
            <AuditLogsTable items={state.data.items} />
          </div>
          <div className="md:hidden">
            <AuditLogsCardList items={state.data.items} />
          </div>
          <AdminPagination
            limit={state.data.limit}
            onPageChange={setPage}
            page={state.data.page}
            total={state.data.total}
          />
        </>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select
      aria-label={label}
      className="h-11 rounded-lg border bg-[var(--surface,#ffffff)] px-2 text-sm"
      onChange={(e) => onChange(e.target.value)}
      style={{ borderColor: "var(--line, #E9ECEF)" }}
      value={value}
    >
      <option value="">{label} 전체</option>
      {options.filter(Boolean).map((opt) => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  );
}

function ResultPill({ result }: { result: string }) {
  const styles: Record<string, string> = {
    success: "bg-green-50 text-green-700",
    failure: "bg-red-50 text-red-700",
    forbidden: "bg-amber-50 text-amber-800",
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${styles[result] ?? "bg-gray-100 text-gray-700"}`}>
      {result}
    </span>
  );
}

function AuditLogsTable({ items }: { items: AdminAuditLogItem[] }) {
  return (
    <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--line, #E9ECEF)" }}>
      <table className="w-full text-sm">
        <thead className="bg-[var(--surface-fill,#F8F9FA)]">
          <tr>
            <th className="px-3 py-2 text-left font-semibold text-[var(--text-3,#868E96)]">액션</th>
            <th className="px-3 py-2 text-left font-semibold text-[var(--text-3,#868E96)]">관리자</th>
            <th className="px-3 py-2 text-left font-semibold text-[var(--text-3,#868E96)]">대상</th>
            <th className="px-3 py-2 text-left font-semibold text-[var(--text-3,#868E96)]">경로</th>
            <th className="px-3 py-2 text-left font-semibold text-[var(--text-3,#868E96)]">결과</th>
            <th className="px-3 py-2 text-left font-semibold text-[var(--text-3,#868E96)]">IP 해시</th>
            <th className="px-3 py-2 text-left font-semibold text-[var(--text-3,#868E96)]">UA 해시</th>
            <th className="px-3 py-2 text-left font-semibold text-[var(--text-3,#868E96)]">시간</th>
          </tr>
        </thead>
        <tbody className="divide-y" style={{ borderColor: "var(--line, #E9ECEF)" }}>
          {items.map((log) => (
            <tr key={log.id} className="bg-[var(--surface,#ffffff)]">
              <td className="px-3 py-2 text-[var(--foreground,#212529)]">{log.action}</td>
              <td className="max-w-28 truncate px-3 py-2 text-[var(--text-2,#495057)]">
                {shorten(log.actor_admin_user_id)}
              </td>
              <td className="px-3 py-2 text-[var(--text-2,#495057)]">{log.target_type ?? "-"}</td>
              <td className="px-3 py-2 text-[var(--text-3,#868E96)]">{log.request_path}</td>
              <td className="px-3 py-2"><ResultPill result={log.result} /></td>
              <td className="max-w-28 truncate px-3 py-2 text-[var(--text-3,#868E96)]">
                {shortenHash(log.ip_hash)}
              </td>
              <td className="max-w-28 truncate px-3 py-2 text-[var(--text-3,#868E96)]">
                {shortenHash(log.user_agent_hash)}
              </td>
              <td className="px-3 py-2 text-[var(--text-3,#868E96)]">
                {new Date(log.created_at).toLocaleString("ko-KR")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AuditLogsCardList({ items }: { items: AdminAuditLogItem[] }) {
  return (
    <div className="space-y-2">
      {items.map((log) => (
        <div
          key={log.id}
          className="rounded-xl bg-[var(--surface,#ffffff)] p-3 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="font-medium text-[var(--foreground,#212529)]">{log.action}</span>
            <ResultPill result={log.result} />
          </div>
          <p className="mt-1 text-sm text-[var(--text-2,#495057)]">
            관리자 {shorten(log.actor_admin_user_id)} &middot; {log.target_type ?? "-"}
          </p>
          <p className="mt-1 break-all text-sm text-[var(--text-2,#495057)]">
            {log.request_path}
          </p>
          <p className="mt-1 text-xs text-[var(--text-3,#868E96)]">
            {new Date(log.created_at).toLocaleString("ko-KR")}
          </p>
        </div>
      ))}
    </div>
  );
}

function shorten(value: string) {
  return value.length > 8 ? `${value.slice(0, 8)}...` : value;
}

function shortenHash(value: string | null) {
  if (!value) {
    return "-";
  }
  return value.length > 14 ? `${value.slice(0, 14)}...` : value;
}

function AuditLogsSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-xl bg-[var(--surface,#ffffff)] p-3 shadow-sm">
          <div className="h-4 w-24 animate-pulse rounded bg-[var(--line,#E9ECEF)]" />
          <div className="mt-2 h-3 w-40 animate-pulse rounded bg-[var(--line,#E9ECEF)]" />
          <div className="mt-2 h-3 w-24 animate-pulse rounded bg-[var(--line,#E9ECEF)]" />
        </div>
      ))}
    </div>
  );
}
