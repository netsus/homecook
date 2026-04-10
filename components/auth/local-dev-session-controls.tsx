"use client";

import React from "react";

import { isLocalDevAuthEnabled } from "@/lib/auth/local-dev-auth";
import { readE2EAuthOverride } from "@/lib/auth/e2e-auth-override";

export function buildLocalLogoutHref(locationLike: Pick<Location, "pathname" | "search">) {
  const nextPath = `${locationLike.pathname}${locationLike.search || ""}`;

  return `/auth/logout?next=${encodeURIComponent(nextPath || "/")}`;
}

export function LocalDevSessionControls() {
  const authOverride = readE2EAuthOverride();

  if (!isLocalDevAuthEnabled()) {
    return null;
  }

  const handleLogout = () => {
    window.location.assign(buildLocalLogoutHref(window.location));
  };

  return (
    <div className="hidden justify-end px-5 pb-4 sm:flex md:px-7 md:pb-5">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="rounded-full border border-[color:rgba(46,166,122,0.18)] bg-[color:rgba(46,166,122,0.08)] px-3 py-1 text-xs font-medium text-[var(--olive)]">
          {authOverride === true
            ? "fixture auth: authenticated"
            : authOverride === false
              ? "fixture auth: guest"
              : "local auth tools"}
        </div>
        <button
          className="rounded-full border border-[var(--line)] bg-white/80 px-3 py-1 text-xs font-semibold text-[var(--muted)]"
          onClick={handleLogout}
          type="button"
        >
          로컬 세션 종료
        </button>
      </div>
    </div>
  );
}
