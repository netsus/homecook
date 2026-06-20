"use client";

import { useCallback, useEffect, useState } from "react";

import {
  fetchAdminOperationalEvents,
  type AdminListData,
  type AdminOperationalEventItem,
} from "@/lib/api/admin";
import { isApiFetchError } from "@/lib/api/fetch-json";

import { AdminPagination } from "./admin-pagination";

type EventsState =
  | { status: "loading" }
  | { status: "data"; data: AdminListData<AdminOperationalEventItem> }
  | { status: "empty" }
  | { status: "error"; message: string };

const EVENT_TYPE_OPTIONS = ["", "auth_failure", "youtube_provider_failure", "account_delete_success", "account_delete_failure", "admin_service_role_missing", "unhandled_server_error", "not_found_feedback"] as const;
const SEVERITY_OPTIONS = ["", "info", "warn", "error", "critical"] as const;
const SOURCE_OPTIONS = ["", "auth", "youtube", "account", "admin", "api", "web"] as const;
const BLOCKED_METADATA_KEY_PATTERNS = [
  /token/iu,
  /^code$/iu,
  /^next$/iu,
  /^error$/iu,
  /youtube.*url/iu,
  /url/iu,
  /transcript/iu,
  /raw_?source_?text/iu,
  /source_?text/iu,
  /search/iu,
  /query/iu,
  /email/iu,
  /nickname/iu,
  /shopping/iu,
  /pantry/iu,
];
const EMAIL_VALUE_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu;
const YOUTUBE_VALUE_PATTERN = /(?:youtube\.com|youtu\.be)/iu;

function isSafeMetadataValue(value: unknown): boolean {
  if (typeof value === "string") {
    return !EMAIL_VALUE_PATTERN.test(value) && !YOUTUBE_VALUE_PATTERN.test(value);
  }
  if (Array.isArray(value)) {
    return value.every(isSafeMetadataValue);
  }
  if (value && typeof value === "object") {
    return Object.entries(value).every(
      ([key, nestedValue]) =>
        !BLOCKED_METADATA_KEY_PATTERNS.some((pattern) => pattern.test(key)) &&
        isSafeMetadataValue(nestedValue),
    );
  }
  return true;
}

function shouldDisplayMetadataField(key: string, value: unknown) {
  return (
    !BLOCKED_METADATA_KEY_PATTERNS.some((pattern) => pattern.test(key)) &&
    isSafeMetadataValue(value)
  );
}

export function AdminEventsScreen() {
  const [state, setState] = useState<EventsState>({ status: "loading" });
  const [eventType, setEventType] = useState("");
  const [severity, setSeverity] = useState("");
  const [source, setSource] = useState("");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async (et: string, sev: string, src: string, p: number) => {
    setState({ status: "loading" });
    try {
      const data = await fetchAdminOperationalEvents({
        event_type: et || undefined,
        severity: sev || undefined,
        source: src || undefined,
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
        : "운영 이벤트를 불러오지 못했어요";
      setState({ status: "error", message });
    }
  }, []);

  useEffect(() => {
    void load(eventType, severity, source, page);
  }, [load, eventType, severity, source, page]);

  function handleFilterChange(setter: (v: string) => void) {
    return (value: string) => {
      setter(value);
      setPage(1);
      setExpandedId(null);
    };
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <FilterSelect
          label="유형"
          onChange={handleFilterChange(setEventType)}
          options={EVENT_TYPE_OPTIONS}
          value={eventType}
        />
        <FilterSelect
          label="심각도"
          onChange={handleFilterChange(setSeverity)}
          options={SEVERITY_OPTIONS}
          value={severity}
        />
        <FilterSelect
          label="소스"
          onChange={handleFilterChange(setSource)}
          options={SOURCE_OPTIONS}
          value={source}
        />
      </div>

      {state.status === "loading" && <EventsSkeleton />}

      {state.status === "empty" && (
        <div className="py-16 text-center text-sm text-[var(--text-3)]">
          운영 이벤트가 없어요
        </div>
      )}

      {state.status === "error" && (
        <div className="flex flex-col items-center py-16">
          <p className="text-lg font-bold text-[var(--foreground)]">
            {state.message}
          </p>
          <button
            className="mt-4 inline-flex h-11 items-center rounded-xl bg-[var(--brand)] px-6 text-sm font-semibold text-[var(--text-inverse)]"
            onClick={() => load(eventType, severity, source, page)}
            type="button"
          >
            다시 시도
          </button>
        </div>
      )}

      {state.status === "data" && (
        <>
          <div className="hidden md:block">
            <EventsTable
              expandedId={expandedId}
              items={state.data.items}
              onToggle={(id) => setExpandedId(expandedId === id ? null : id)}
            />
          </div>
          <div className="md:hidden">
            <EventsCardList
              expandedId={expandedId}
              items={state.data.items}
              onToggle={(id) => setExpandedId(expandedId === id ? null : id)}
            />
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
      className="h-11 rounded-lg border bg-[var(--surface)] px-2 text-sm"
      onChange={(e) => onChange(e.target.value)}
      style={{ borderColor: "var(--line-strong)" }}
      value={value}
    >
      <option value="">{label} 전체</option>
      {options.filter(Boolean).map((opt) => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  );
}

function SeverityPill({ severity }: { severity: string }) {
  const styles: Record<string, string> = {
    info: "bg-[var(--brand-soft)] text-[var(--olive)]",
    warn: "bg-[var(--warning-soft)] text-[var(--warning)]",
    error: "bg-[var(--danger-soft)] text-[var(--danger)]",
    critical: "bg-[var(--danger-soft)] text-[var(--danger-strong)]",
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${styles[severity] ?? "bg-[var(--surface-fill)] text-[var(--text-2)]"}`}>
      {severity}
    </span>
  );
}

function EventDetailPanel({ event }: { event: AdminOperationalEventItem }) {
  const displayFields: [string, unknown][] = [];
  if (event.http_status !== null) displayFields.push(["http_status", event.http_status]);
  if (event.error_code) displayFields.push(["error_code", event.error_code]);
  if (event.target_user_id) displayFields.push(["target_user_id", event.target_user_id]);
  if (event.message_summary) displayFields.push(["message_summary", event.message_summary]);
  if (event.metadata_json) {
    for (const [key, value] of Object.entries(event.metadata_json)) {
      if (shouldDisplayMetadataField(key, value)) {
        displayFields.push([key, value]);
      }
    }
  }

  if (displayFields.length === 0) {
    return (
      <p className="py-2 text-xs text-[var(--text-3)]">상세 메타데이터 없음</p>
    );
  }

  return (
    <div className="border-t py-2" style={{ borderColor: "var(--line-strong)" }}>
      <p className="mb-1 text-xs font-semibold text-[var(--text-3)]">
        상세 메타데이터
      </p>
      <dl className="space-y-1">
        {displayFields.map(([key, value]) => (
          <div key={key} className="flex gap-2 text-sm">
            <dt className="w-28 shrink-0 text-xs text-[var(--text-3)]">{key}</dt>
            <dd className="break-all text-sm text-[var(--foreground)]">
              {typeof value === "object" ? JSON.stringify(value) : String(value ?? "")}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function EventsTable({
  items,
  expandedId,
  onToggle,
}: {
  items: AdminOperationalEventItem[];
  expandedId: string | null;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--line-strong)" }}>
      <table className="w-full text-sm">
        <thead className="bg-[var(--surface-fill,var(--surface-fill))]">
          <tr>
            <th className="px-3 py-2 text-left font-semibold text-[var(--text-3)]">유형</th>
            <th className="px-3 py-2 text-left font-semibold text-[var(--text-3)]">심각도</th>
            <th className="px-3 py-2 text-left font-semibold text-[var(--text-3)]">소스</th>
            <th className="px-3 py-2 text-left font-semibold text-[var(--text-3)]">요약</th>
            <th className="px-3 py-2 text-left font-semibold text-[var(--text-3)]">시간</th>
            <th className="w-8 px-3 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y" style={{ borderColor: "var(--line-strong)" }}>
          {items.map((event) => (
            <tr key={event.id} className="cursor-pointer bg-[var(--surface)]" onClick={() => onToggle(event.id)}>
              <td className="px-3 py-2 text-[var(--foreground)]">{event.event_type}</td>
              <td className="px-3 py-2"><SeverityPill severity={event.severity} /></td>
              <td className="px-3 py-2 text-[var(--text-3)]">{event.source}</td>
              <td className="max-w-xs truncate px-3 py-2 text-[var(--text-2)]">{event.message_summary ?? "-"}</td>
              <td className="px-3 py-2 text-[var(--text-3)]">
                {new Date(event.created_at).toLocaleString("ko-KR")}
              </td>
              <td className="px-3 py-2 text-[var(--text-3)]">
                {expandedId === event.id ? "\u25B4" : "\u25BE"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {expandedId && items.find((e) => e.id === expandedId) && (
        <div className="border-t bg-[var(--surface)] px-4 py-2" style={{ borderColor: "var(--line-strong)" }}>
          <EventDetailPanel event={items.find((e) => e.id === expandedId)!} />
        </div>
      )}
    </div>
  );
}

function EventsCardList({
  items,
  expandedId,
  onToggle,
}: {
  items: AdminOperationalEventItem[];
  expandedId: string | null;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      {items.map((event) => (
        <button
          key={event.id}
          className="w-full rounded-xl bg-[var(--surface)] p-3 text-left shadow-sm"
          onClick={() => onToggle(event.id)}
          type="button"
        >
          <div className="flex items-center justify-between">
            <span className="font-medium text-[var(--foreground)]">{event.event_type}</span>
            <div className="flex items-center gap-2">
              <SeverityPill severity={event.severity} />
              <span className="text-xs text-[var(--text-3)]">
                {expandedId === event.id ? "\u25B4" : "\u25BE"}
              </span>
            </div>
          </div>
          <p className="mt-1 truncate text-sm text-[var(--text-2)]">
            {event.message_summary ?? "-"}
          </p>
          <p className="mt-1 text-xs text-[var(--text-3)]">
            {event.source} &middot; {new Date(event.created_at).toLocaleString("ko-KR")}
          </p>
          {expandedId === event.id && <EventDetailPanel event={event} />}
        </button>
      ))}
    </div>
  );
}

function EventsSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-xl bg-[var(--surface)] p-3 shadow-sm">
          <div className="h-4 w-32 animate-pulse rounded bg-[var(--line-strong)]" />
          <div className="mt-2 h-3 w-48 animate-pulse rounded bg-[var(--line-strong)]" />
          <div className="mt-2 h-3 w-24 animate-pulse rounded bg-[var(--line-strong)]" />
        </div>
      ))}
    </div>
  );
}
