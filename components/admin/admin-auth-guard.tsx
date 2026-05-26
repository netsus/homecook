"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import { isApiFetchError } from "@/lib/api/fetch-json";
import { verifyAdminPageView } from "@/lib/api/admin";

type AdminAuthState =
  | { status: "loading" }
  | { status: "verified" }
  | { status: "unauthorized" }
  | { status: "forbidden" }
  | { status: "error"; message: string };

export function AdminAuthGuard({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AdminAuthState>({ status: "loading" });
  const pathname = usePathname();

  const verify = useCallback(async () => {
    setState({ status: "loading" });
    try {
      await verifyAdminPageView(pathname);
      setState({ status: "verified" });
    } catch (error) {
      if (isApiFetchError(error)) {
        if (error.status === 401) {
          setState({ status: "unauthorized" });
          return;
        }
        if (error.status === 403) {
          setState({ status: "forbidden" });
          return;
        }
        setState({ status: "error", message: error.message });
        return;
      }
      setState({ status: "error", message: "관리자 인증을 확인하지 못했어요." });
    }
  }, [pathname]);

  useEffect(() => {
    void verify();
  }, [verify]);

  if (state.status === "loading") {
    return <AdminLoadingState />;
  }

  if (state.status === "unauthorized") {
    return <AdminUnauthorizedState />;
  }

  if (state.status === "forbidden") {
    return <AdminForbiddenState />;
  }

  if (state.status === "error") {
    return <AdminErrorState message={state.message} onRetry={verify} />;
  }

  return <>{children}</>;
}

function AdminLoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--line,#E9ECEF)] border-t-[var(--brand,#F97316)]" />
      <p className="mt-4 text-sm text-[var(--text-3,#868E96)]">관리자 인증 확인 중...</p>
    </div>
  );
}

function AdminUnauthorizedState() {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="mb-4 text-4xl">&#128274;</div>
      <h2 className="text-lg font-bold text-[var(--foreground,#212529)]">
        로그인이 필요합니다
      </h2>
      <a
        className="mt-4 inline-flex h-11 items-center rounded-xl bg-[var(--brand,#F97316)] px-6 text-sm font-semibold text-white"
        href="/login"
      >
        로그인하기
      </a>
    </div>
  );
}

function AdminForbiddenState() {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="mb-4 text-4xl">&#128683;</div>
      <h2 className="text-lg font-bold text-[var(--foreground,#212529)]">
        관리자 권한이 없습니다
      </h2>
      <p className="mt-2 text-sm text-[var(--text-3,#868E96)]">
        관리자 등록은 운영팀에 문의해 주세요
      </p>
    </div>
  );
}

function AdminErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="mb-4 text-4xl">&#9888;&#65039;</div>
      <h2 className="text-lg font-bold text-[var(--foreground,#212529)]">
        {message}
      </h2>
      <button
        className="mt-4 inline-flex h-11 items-center rounded-xl bg-[var(--brand,#F97316)] px-6 text-sm font-semibold text-white"
        onClick={onRetry}
        type="button"
      >
        다시 시도
      </button>
    </div>
  );
}
