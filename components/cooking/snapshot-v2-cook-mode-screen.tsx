"use client";

import React, { useEffect, useRef, useState } from "react";
import { SnapshotV2CookModeView } from "@/components/cooking/snapshot-v2-cook-mode-view";
import { cancelSnapshotV2CookingSession, fetchSnapshotV2CookMode, isCookingApiError } from "@/lib/api/cooking";
import type { SnapshotV2CookModeData } from "@/types/cooking";

export function SnapshotV2CookModeScreen({ initialAuthenticated, sessionId }: { initialAuthenticated: boolean; sessionId: string }) {
  const [data, setData] = useState<SnapshotV2CookModeData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error" | "unauthorized">(initialAuthenticated ? "loading" : "unauthorized");
  const [cancelling, setCancelling] = useState(false);
  const cancelKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!initialAuthenticated) return;
    let active = true;
    void fetchSnapshotV2CookMode(sessionId).then((value) => { if (active) { setData(value); setState("ready"); } }).catch((error) => { if (active) setState(isCookingApiError(error) && error.status === 401 ? "unauthorized" : "error"); });
    return () => { active = false; };
  }, [initialAuthenticated, sessionId]);

  if (state === "unauthorized") return <main className="p-6"><h1 className="text-xl font-bold">로그인이 필요해요</h1><p>요리 기록은 소유자만 볼 수 있어요.</p></main>;
  if (state === "loading") return <main aria-busy="true" className="p-6" role="status">고정된 레시피를 불러오고 있어요.</main>;
  if (state === "error" || !data) return <main className="p-6" role="alert"><h1 className="text-xl font-bold">요리 기록을 불러오지 못했어요</h1><p>잠시 후 다시 시도해 주세요.</p></main>;

  return <SnapshotV2CookModeView cancelling={cancelling} data={data} onCancel={() => {
    if (cancelling || data.status !== "in_progress") return;
    setCancelling(true);
    const idempotencyKey = cancelKeyRef.current ?? crypto.randomUUID();
    cancelKeyRef.current = idempotencyKey;
    void cancelSnapshotV2CookingSession(sessionId, idempotencyKey).then(() => { cancelKeyRef.current = null; setData({ ...data, status: "cancelled" }); }).catch(() => setState("error")).finally(() => setCancelling(false));
  }} />;
}
