"use client";

import { useCallback, useEffect, useState } from "react";

import {
  fetchAdminUsers,
  type AdminListData,
  type AdminUserItem,
} from "@/lib/api/admin";
import { isApiFetchError } from "@/lib/api/fetch-json";

import { AdminPagination } from "./admin-pagination";

type UsersState =
  | { status: "loading" }
  | { status: "data"; data: AdminListData<AdminUserItem> }
  | { status: "empty" }
  | { status: "error"; message: string };

export function AdminUsersScreen() {
  const [state, setState] = useState<UsersState>({ status: "loading" });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(async (q: string, p: number) => {
    setState({ status: "loading" });
    try {
      const data = await fetchAdminUsers({ q: q || undefined, page: p, limit: 20 });
      if (data.items.length === 0) {
        setState({ status: "empty" });
      } else {
        setState({ status: "data", data });
      }
    } catch (error) {
      const message = isApiFetchError(error)
        ? error.message
        : "사용자 목록을 불러오지 못했어요";
      setState({ status: "error", message });
    }
  }, []);

  useEffect(() => {
    void load(search, page);
  }, [load, search, page]);

  function handleSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  return (
    <div className="space-y-4">
      <div>
        <input
          className="h-11 w-full rounded-xl border bg-[var(--surface)] px-3 text-sm"
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="이메일 또는 닉네임 검색"
          style={{ borderColor: "var(--line-strong)" }}
          type="search"
          value={search}
        />
      </div>

      {state.status === "loading" && <UsersSkeleton />}

      {state.status === "empty" && (
        <div className="py-16 text-center text-sm text-[var(--text-3)]">
          사용자가 없어요
        </div>
      )}

      {state.status === "error" && (
        <div className="flex flex-col items-center py-16">
          <p className="text-lg font-bold text-[var(--foreground)]">
            {state.message}
          </p>
          <button
            className="mt-4 inline-flex h-11 items-center rounded-xl bg-[var(--brand)] px-6 text-sm font-semibold text-[var(--text-inverse)]"
            onClick={() => load(search, page)}
            type="button"
          >
            다시 시도
          </button>
        </div>
      )}

      {state.status === "data" && (
        <>
          <div className="hidden md:block">
            <UsersTable items={state.data.items} />
          </div>
          <div className="md:hidden">
            <UsersCardList items={state.data.items} />
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

function UsersTable({ items }: { items: AdminUserItem[] }) {
  return (
    <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--line-strong)" }}>
      <table className="w-full text-sm">
        <thead className="bg-[var(--surface-fill,var(--surface-fill))]">
          <tr>
            <th className="px-3 py-2 text-left font-semibold text-[var(--text-3)]">닉네임</th>
            <th className="px-3 py-2 text-left font-semibold text-[var(--text-3)]">이메일</th>
            <th className="px-3 py-2 text-left font-semibold text-[var(--text-3)]">소셜</th>
            <th className="px-3 py-2 text-right font-semibold text-[var(--text-3)]">레시피북</th>
            <th className="px-3 py-2 text-right font-semibold text-[var(--text-3)]">식사</th>
            <th className="px-3 py-2 text-right font-semibold text-[var(--text-3)]">장보기</th>
            <th className="px-3 py-2 text-right font-semibold text-[var(--text-3)]">팬트리</th>
            <th className="px-3 py-2 text-left font-semibold text-[var(--text-3)]">상태</th>
            <th className="px-3 py-2 text-left font-semibold text-[var(--text-3)]">가입일</th>
          </tr>
        </thead>
        <tbody className="divide-y" style={{ borderColor: "var(--line-strong)" }}>
          {items.map((user) => (
            <tr key={user.id} className="bg-[var(--surface)]">
              <td className="px-3 py-2 text-[var(--foreground)]">{user.nickname}</td>
              <td className="px-3 py-2 text-[var(--text-2)]">{user.email_masked ?? "-"}</td>
              <td className="px-3 py-2 text-[var(--text-3)]">{user.social_provider}</td>
              <td className="px-3 py-2 text-right text-[var(--text-2)]">{user.counts.recipe_books}</td>
              <td className="px-3 py-2 text-right text-[var(--text-2)]">{user.counts.meals}</td>
              <td className="px-3 py-2 text-right text-[var(--text-2)]">{user.counts.shopping_lists}</td>
              <td className="px-3 py-2 text-right text-[var(--text-2)]">{user.counts.pantry_items}</td>
              <td className="px-3 py-2">
                <StatusBadge status={user.status} />
              </td>
              <td className="px-3 py-2 text-[var(--text-3)]">
                {new Date(user.created_at).toLocaleDateString("ko-KR")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UsersCardList({ items }: { items: AdminUserItem[] }) {
  return (
    <div className="space-y-2">
      {items.map((user) => (
        <div
          key={user.id}
          className="rounded-xl bg-[var(--surface)] p-3 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="font-medium text-[var(--foreground)]">{user.nickname}</span>
            <StatusBadge status={user.status} />
          </div>
          <p className="mt-1 text-sm text-[var(--text-2)]">
            {user.email_masked ?? "-"} &middot; {user.social_provider}
          </p>
          <p className="mt-1 text-xs text-[var(--text-3)]">
            레시피북 {user.counts.recipe_books} &middot; 식사 {user.counts.meals} &middot; 장보기{" "}
            {user.counts.shopping_lists} &middot; 팬트리 {user.counts.pantry_items} &middot;{" "}
            {new Date(user.created_at).toLocaleDateString("ko-KR")}
          </p>
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isActive = status === "active";
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
        isActive
          ? "bg-[var(--success-soft)] text-[var(--success)]"
          : "bg-[var(--danger-soft)] text-[var(--danger)]"
      }`}
    >
      {isActive ? "활성" : "삭제"}
    </span>
  );
}

function UsersSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-xl bg-[var(--surface)] p-3 shadow-sm">
          <div className="h-4 w-24 animate-pulse rounded bg-[var(--line-strong)]" />
          <div className="mt-2 h-3 w-40 animate-pulse rounded bg-[var(--line-strong)]" />
          <div className="mt-2 h-3 w-32 animate-pulse rounded bg-[var(--line-strong)]" />
        </div>
      ))}
    </div>
  );
}
