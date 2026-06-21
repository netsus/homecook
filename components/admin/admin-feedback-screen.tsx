"use client";

import { useCallback, useEffect, useState } from "react";

import {
  fetchAdminOperationalEvents,
  type AdminListData,
  type AdminOperationalEventItem,
} from "@/lib/api/admin";
import { isApiFetchError } from "@/lib/api/fetch-json";

import { AdminPagination } from "./admin-pagination";

const FEEDBACK_EVENT_TYPE = "not_found_feedback";
const FEEDBACK_SOURCE = "web";
const PAGE_LIMIT = 20;

type FeedbackState =
  | { status: "loading" }
  | { status: "data"; data: AdminListData<AdminOperationalEventItem> }
  | { status: "empty" }
  | { status: "error"; message: string };

function readString(
  metadata: Record<string, unknown> | null,
  key: string,
) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readBoolean(
  metadata: Record<string, unknown> | null,
  key: string,
) {
  const value = metadata?.[key];
  return typeof value === "boolean" ? value : null;
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString("ko-KR");
}

function getFeedbackText(event: AdminOperationalEventItem) {
  return (
    readString(event.metadata_json, "feedback_text")
    ?? event.message_summary
    ?? "-"
  );
}

function getCurrentPath(event: AdminOperationalEventItem) {
  return (
    readString(event.metadata_json, "current_path")
    ?? event.request_path
    ?? "-"
  );
}

function getReferrerPath(event: AdminOperationalEventItem) {
  return readString(event.metadata_json, "referrer_path") ?? "없음";
}

function getOccurredAt(event: AdminOperationalEventItem) {
  return readString(event.metadata_json, "occurred_at") ?? event.created_at;
}

function getUserLabel(event: AdminOperationalEventItem) {
  const isAuthenticated = readBoolean(event.metadata_json, "is_authenticated");
  if (isAuthenticated ?? Boolean(event.actor_user_id)) {
    return "로그인";
  }

  return "비로그인";
}

export function AdminFeedbackScreen() {
  const [state, setState] = useState<FeedbackState>({ status: "loading" });
  const [page, setPage] = useState(1);

  const load = useCallback(async (targetPage: number) => {
    setState({ status: "loading" });
    try {
      const data = await fetchAdminOperationalEvents({
        event_type: FEEDBACK_EVENT_TYPE,
        limit: PAGE_LIMIT,
        page: targetPage,
        source: FEEDBACK_SOURCE,
      });

      setState(data.items.length > 0 ? { status: "data", data } : { status: "empty" });
    } catch (error) {
      const message = isApiFetchError(error)
        ? error.message
        : "피드백을 불러오지 못했어요";
      setState({ status: "error", message });
    }
  }, []);

  useEffect(() => {
    void load(page);
  }, [load, page]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-[var(--foreground)]">
            404 피드백
          </h2>
          <p className="text-sm text-[var(--text-3)]">
            404 페이지에서 사용자가 남긴 내용을 확인해요
          </p>
        </div>
        {state.status === "data" && (
          <p className="text-sm font-medium text-[var(--text-3)]">
            총 {state.data.total.toLocaleString("ko-KR")}개
          </p>
        )}
      </div>

      {state.status === "loading" && <FeedbackSkeleton />}

      {state.status === "empty" && (
        <div className="rounded-xl border bg-[var(--surface)] py-16 text-center text-sm text-[var(--text-3)]" style={{ borderColor: "var(--line-strong)" }}>
          아직 404 피드백이 없어요
        </div>
      )}

      {state.status === "error" && (
        <div className="flex flex-col items-center rounded-xl border bg-[var(--surface)] py-16" style={{ borderColor: "var(--line-strong)" }}>
          <p className="text-lg font-bold text-[var(--foreground)]">
            {state.message}
          </p>
          <button
            className="mt-4 inline-flex h-11 items-center rounded-xl bg-[var(--brand)] px-6 text-sm font-semibold text-[var(--text-inverse)]"
            onClick={() => load(page)}
            type="button"
          >
            다시 시도
          </button>
        </div>
      )}

      {state.status === "data" && (
        <>
          <div className="hidden md:block">
            <FeedbackTable items={state.data.items} />
          </div>
          <div className="md:hidden">
            <FeedbackCardList items={state.data.items} />
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

function FeedbackTable({ items }: { items: AdminOperationalEventItem[] }) {
  return (
    <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--line-strong)" }}>
      <table className="w-full table-fixed text-sm">
        <thead className="bg-[var(--surface-fill,var(--surface-fill))]">
          <tr>
            <th className="w-40 px-3 py-2 text-left font-semibold text-[var(--text-3)]">
              접수시간
            </th>
            <th className="px-3 py-2 text-left font-semibold text-[var(--text-3)]">
              피드백
            </th>
            <th className="w-52 px-3 py-2 text-left font-semibold text-[var(--text-3)]">
              현재 경로
            </th>
            <th className="w-52 px-3 py-2 text-left font-semibold text-[var(--text-3)]">
              이전 경로
            </th>
            <th className="w-24 px-3 py-2 text-left font-semibold text-[var(--text-3)]">
              사용자
            </th>
          </tr>
        </thead>
        <tbody className="divide-y" style={{ borderColor: "var(--line-strong)" }}>
          {items.map((event) => (
            <tr key={event.id} className="bg-[var(--surface)] align-top">
              <td className="px-3 py-3 text-[var(--text-3)]">
                {formatDate(getOccurredAt(event))}
              </td>
              <td className="px-3 py-3 text-[var(--foreground)]">
                <p className="line-clamp-3 break-words">{getFeedbackText(event)}</p>
              </td>
              <td className="px-3 py-3 text-[var(--text-2)]">
                <span className="block truncate" title={getCurrentPath(event)}>
                  {getCurrentPath(event)}
                </span>
              </td>
              <td className="px-3 py-3 text-[var(--text-2)]">
                <span className="block truncate" title={getReferrerPath(event)}>
                  {getReferrerPath(event)}
                </span>
              </td>
              <td className="px-3 py-3">
                <span className="inline-flex rounded-full bg-[var(--surface-fill)] px-2 py-1 text-xs font-medium text-[var(--text-2)]">
                  {getUserLabel(event)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FeedbackCardList({ items }: { items: AdminOperationalEventItem[] }) {
  return (
    <div className="space-y-2">
      {items.map((event) => (
        <article
          key={event.id}
          className="rounded-xl border bg-[var(--surface)] p-3"
          style={{ borderColor: "var(--line-strong)" }}
        >
          <div className="flex items-center justify-between gap-2">
            <time className="text-xs text-[var(--text-3)]">
              {formatDate(getOccurredAt(event))}
            </time>
            <span className="inline-flex rounded-full bg-[var(--surface-fill)] px-2 py-1 text-xs font-medium text-[var(--text-2)]">
              {getUserLabel(event)}
            </span>
          </div>
          <p className="mt-2 break-words text-sm font-medium text-[var(--foreground)]">
            {getFeedbackText(event)}
          </p>
          <dl className="mt-3 space-y-1 text-xs">
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-[var(--text-3)]">현재</dt>
              <dd className="min-w-0 flex-1 truncate text-[var(--text-2)]">
                {getCurrentPath(event)}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-[var(--text-3)]">이전</dt>
              <dd className="min-w-0 flex-1 truncate text-[var(--text-2)]">
                {getReferrerPath(event)}
              </dd>
            </div>
          </dl>
        </article>
      ))}
    </div>
  );
}

function FeedbackSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map((item) => (
        <div
          key={item}
          className="rounded-xl border bg-[var(--surface)] p-3"
          style={{ borderColor: "var(--line-strong)" }}
        >
          <div className="h-4 w-36 animate-pulse rounded bg-[var(--line-strong)]" />
          <div className="mt-3 h-4 w-4/5 animate-pulse rounded bg-[var(--line-strong)]" />
          <div className="mt-2 h-3 w-2/5 animate-pulse rounded bg-[var(--line-strong)]" />
        </div>
      ))}
    </div>
  );
}
