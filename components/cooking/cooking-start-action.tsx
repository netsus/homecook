"use client";

import React, { useRef, useState } from "react";
import { getCookingSessionCookModeHref, type CookingSessionIdentity } from "@/lib/cooking/session-version-dispatch";

export function CookingStartAction({ label, navigate, start }: {
  label: string;
  navigate: (href: string) => void;
  start: () => Promise<CookingSessionIdentity>;
}) {
  const latch = useRef(false);
  const [state, setState] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function run() {
    if (latch.current) return;
    latch.current = true;
    setState("pending");
    setMessage("");
    try {
      const identity = await start();
      const href = getCookingSessionCookModeHref(identity);
      setState("success");
      navigate(href);
    } catch (error) {
      latch.current = false;
      setState("error");
      setMessage(error instanceof Error ? error.message : "요리 세션을 만들지 못했어요.");
    }
  }

  return <div className="space-y-2">
    <button aria-label={state === "error" ? "다시 시도" : label} className="min-h-11 rounded-[var(--radius-control)] bg-[var(--brand)] px-4 font-bold text-[var(--text-inverse)] disabled:opacity-60" disabled={state === "pending"} onClick={() => void run()} type="button">
      {state === "error" ? "다시 시도" : "요리하기"}
    </button>
    {state === "pending" ? <p aria-live="polite">세션 생성 중…</p> : null}
    {state === "success" ? <p aria-live="polite">이동 준비 완료</p> : null}
    {state === "error" ? <p role="alert">{message}</p> : null}
  </div>;
}
