"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  fetchAdminUsers,
  fetchAdminOperationalEvents,
  type AdminListData,
  type AdminUserItem,
  type AdminOperationalEventItem,
} from "@/lib/api/admin";
import { isApiFetchError } from "@/lib/api/fetch-json";

interface DashboardSummary {
  totalUsers: number;
  recentEvents: number;
  warnErrorCount: number;
}

type DashboardState =
  | { status: "loading" }
  | { status: "data"; summary: DashboardSummary }
  | { status: "error"; message: string };

export function AdminDashboardScreen() {
  const [state, setState] = useState<DashboardState>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const [usersData, eventsData] = await Promise.all([
        fetchAdminUsers({ page: 1, limit: 1 }),
        fetchAdminOperationalEvents({ page: 1, limit: 1 }),
      ]) as [AdminListData<AdminUserItem>, AdminListData<AdminOperationalEventItem>];

      setState({
        status: "data",
        summary: {
          totalUsers: usersData.total,
          recentEvents: eventsData.total,
          warnErrorCount: 0,
        },
      });
    } catch (error) {
      const message = isApiFetchError(error)
        ? error.message
        : "대시보드를 불러오지 못했어요";
      setState({ status: "error", message });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.status === "loading") {
    return <DashboardSkeleton />;
  }

  if (state.status === "error") {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="mb-4 text-4xl">&#9888;&#65039;</div>
        <h2 className="text-lg font-bold text-[var(--foreground)]">
          {state.message}
        </h2>
        <button
          className="mt-4 inline-flex h-11 items-center rounded-xl bg-[var(--brand)] px-6 text-sm font-semibold text-[var(--text-inverse)]"
          onClick={load}
          type="button"
        >
          다시 시도
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 text-sm font-semibold text-[var(--text-3)]">
          사용자 현황
        </h2>
        <div className="grid grid-cols-2 gap-3 rounded-xl bg-[var(--surface)] p-3 shadow-sm">
          <SummaryCell label="총 사용자" value={state.summary.totalUsers} />
          <SummaryCell label="운영 이벤트" value={state.summary.recentEvents} />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-[var(--text-3)]">
          바로가기
        </h2>
        <div className="space-y-2">
          <NavRow href="/admin/users" label="사용자 목록 조회" />
          <NavRow href="/admin/events" label="운영 이벤트 로그" />
          <NavRow href="/admin/audit-logs" label="감사 로그" />
        </div>
      </section>
    </div>
  );
}

function SummaryCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-[var(--text-3)]">{label}</p>
      <p className="text-2xl font-extrabold text-[var(--foreground)]">
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function NavRow({ href, label }: { href: string; label: string }) {
  return (
    <Link
      className="flex h-[52px] items-center justify-between rounded-xl bg-[var(--surface)] px-4 shadow-sm transition-colors active:bg-[var(--surface-fill,var(--surface-fill))]"
      href={href}
      role="link"
    >
      <span className="text-base font-medium text-[var(--foreground)]">
        {label}
      </span>
      <span className="text-[var(--text-3)]">&#8250;</span>
    </Link>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <section>
        <div className="mb-2 h-4 w-20 animate-pulse rounded bg-[var(--line-strong)]" />
        <div className="grid grid-cols-2 gap-3 rounded-xl bg-[var(--surface)] p-3 shadow-sm">
          <div className="space-y-1">
            <div className="h-3 w-12 animate-pulse rounded bg-[var(--line-strong)]" />
            <div className="h-8 w-16 animate-pulse rounded bg-[var(--line-strong)]" />
          </div>
          <div className="space-y-1">
            <div className="h-3 w-16 animate-pulse rounded bg-[var(--line-strong)]" />
            <div className="h-8 w-16 animate-pulse rounded bg-[var(--line-strong)]" />
          </div>
        </div>
      </section>
      <section>
        <div className="mb-2 h-4 w-16 animate-pulse rounded bg-[var(--line-strong)]" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex h-[52px] items-center rounded-xl bg-[var(--surface)] px-4 shadow-sm"
            >
              <div className="h-4 w-32 animate-pulse rounded bg-[var(--line-strong)]" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
