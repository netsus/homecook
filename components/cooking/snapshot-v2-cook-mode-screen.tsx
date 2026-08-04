"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { MobileCookModeLoadingBoard } from "@/components/cooking/cook-mode-loading-board";
import { SnapshotV2CookModeView } from "@/components/cooking/snapshot-v2-cook-mode-view";
import { cancelSnapshotV2CookingSession, fetchSnapshotV2CookMode, isCookingApiError } from "@/lib/api/cooking";
import { createPostAuthNextCookie } from "@/lib/auth/post-auth-next";
import type { SnapshotV2CookModeData } from "@/types/cooking";

export function SnapshotV2CookModeScreen({ initialAuthenticated, sessionId }: { initialAuthenticated: boolean; sessionId: string }) {
  const [data, setData] = useState<SnapshotV2CookModeData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error" | "unauthorized">(initialAuthenticated ? "loading" : "unauthorized");
  const [cancelling, setCancelling] = useState(false);
  const cancelKeyRef = useRef<string | null>(null);
  const requestIdRef = useRef(0);
  const recoveryFocusRef = useRef<HTMLAnchorElement | HTMLButtonElement | null>(null);

  const loadSnapshot = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setData(null);
    setState("loading");
    try {
      const value = await fetchSnapshotV2CookMode(sessionId);
      if (requestId === requestIdRef.current) {
        setData(value);
        setState("ready");
      }
    } catch (error) {
      if (requestId === requestIdRef.current) {
        setState(isCookingApiError(error) && error.status === 401 ? "unauthorized" : "error");
      }
    }
  }, [sessionId]);

  useEffect(() => {
    if (!initialAuthenticated) return;
    void loadSnapshot();
    return () => { requestIdRef.current += 1; };
  }, [initialAuthenticated, loadSnapshot]);

  useEffect(() => {
    if (state === "error" || state === "unauthorized") {
      recoveryFocusRef.current?.focus();
    }
  }, [state]);

  const returnPath = `/cooking/session-attempts/${sessionId}/cook-mode`;
  const loginHref = `/login?next=${encodeURIComponent(returnPath)}`;

  if (state === "unauthorized") return <CookModeRecoveryShell
    description="요리 기록은 소유자만 볼 수 있어요. 로그인하면 이 기록으로 돌아와요."
    primaryAction={<a className="inline-flex min-h-12 w-full items-center justify-center rounded-[16px] bg-[var(--brand)] px-5 font-bold text-[var(--text-inverse)]" href={loginHref} onClick={() => { document.cookie = createPostAuthNextCookie(returnPath); }} ref={recoveryFocusRef as React.RefObject<HTMLAnchorElement | null>}>로그인</a>}
    title="로그인이 필요해요"
  />;

  if (state === "loading") return <div role="status"><MobileCookModeLoadingBoard description="고정된 레시피를 불러오고 있어요." loadingTestId="snapshot-v2-cook-mode-loading-content" screenTestId="snapshot-v2-cook-mode-loading" title="요리 기록 준비 중" /></div>;
  if (state === "error" || !data) return <CookModeRecoveryShell
    description="잠시 후 다시 시도해 주세요. 고정된 레시피 기록만 다시 불러와요."
    primaryAction={<button className="min-h-12 w-full rounded-[16px] bg-[var(--brand)] px-5 font-bold text-[var(--text-inverse)]" onClick={() => void loadSnapshot()} ref={recoveryFocusRef as React.RefObject<HTMLButtonElement | null>} type="button">다시 시도</button>}
    title="요리 기록을 불러오지 못했어요"
  />;

  return <SnapshotV2CookModeView cancelling={cancelling} data={data} onCancel={() => {
    if (cancelling || data.status !== "in_progress") return;
    setCancelling(true);
    const idempotencyKey = cancelKeyRef.current ?? crypto.randomUUID();
    cancelKeyRef.current = idempotencyKey;
    void cancelSnapshotV2CookingSession(sessionId, idempotencyKey).then(() => { cancelKeyRef.current = null; setData({ ...data, status: "cancelled" }); }).catch(() => setState("error")).finally(() => setCancelling(false));
  }} />;
}

function CookModeRecoveryShell({
  description,
  primaryAction,
  title,
}: {
  description: string;
  primaryAction: React.ReactNode;
  title: string;
}) {
  return <main
    className="cook-mobile-whole-screen relative mx-auto flex min-h-dvh max-w-[430px] flex-col items-center justify-center overflow-hidden px-5 py-8 text-center"
    data-cook-theme="dark"
    data-testid="snapshot-v2-cook-mode-recovery"
    role="alert"
  >
    <section className="w-full rounded-[16px] bg-[var(--surface-alpha-08)] p-5 shadow-[var(--shadow-2)]">
      <p aria-hidden="true" className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-alpha-12)] text-2xl">!</p>
      <h1 className="cook-mobile-whole-title text-xl font-extrabold">{title}</h1>
      <p className="cook-mobile-whole-subtitle mt-2 text-sm leading-6">{description}</p>
      <div className="mt-6 flex flex-col gap-3">
        {primaryAction}
        <button className="min-h-12 w-full rounded-[16px] border border-[var(--surface-alpha-24)] bg-transparent px-5 font-bold text-[var(--text-inverse)]" onClick={() => window.history.back()} type="button">이전 화면</button>
      </div>
    </section>
  </main>;
}
