"use client";

import React from "react";
import { useMemo } from "react";

import { isLocalDevAuthEnabled } from "@/lib/auth/local-dev-auth";
import { readE2EAuthOverride } from "@/lib/auth/e2e-auth-override";

export function LocalDevSessionControls() {
  const nextPath = useMemo(() => {
    if (typeof window === "undefined") {
      return "/";
    }

    return `${window.location.pathname}${window.location.search}`;
  }, []);
  const authOverride = readE2EAuthOverride();

  if (!isLocalDevAuthEnabled()) {
    return null;
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="rounded-full border border-[color:rgba(46,166,122,0.18)] bg-[color:rgba(46,166,122,0.08)] px-3 py-1 text-xs font-medium text-[var(--olive)]">
          {authOverride === true
            ? "fixture auth: authenticated"
            : authOverride === false
              ? "fixture auth: guest"
              : "local auth tools"}
        </div>
        <a
          className="rounded-full border border-[var(--line)] bg-white/80 px-3 py-1 text-xs font-semibold text-[var(--muted)]"
          href={`/auth/logout?next=${encodeURIComponent(nextPath)}`}
        >
          로컬 세션 종료
        </a>
      </div>
    </div>
  );
}
