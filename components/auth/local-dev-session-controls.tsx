"use client";

import React from "react";
import { useEffect, useState, useTransition } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { isLocalDevAuthEnabled } from "@/lib/auth/local-dev-auth";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";

interface SessionSummary {
  email: string | null;
}

export function LocalDevSessionControls() {
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!isLocalDevAuthEnabled() || !hasSupabasePublicEnv()) {
      return;
    }

    const supabase = getSupabaseBrowserClient();
    let mounted = true;

    void supabase.auth
      .getSession()
      .then((result: { data: { session: { user: { email?: string | null } } | null } }) => {
        if (!mounted) {
          return;
        }

        setSessionSummary(
          result.data.session
            ? {
                email: result.data.session.user.email ?? null,
              }
            : null,
        );
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        setSessionSummary(
          session
            ? {
                email: session.user.email ?? null,
              }
            : null,
        );
      },
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (!isLocalDevAuthEnabled() || !sessionSummary) {
    return null;
  }

  const handleSignOut = () => {
    startTransition(async () => {
      try {
        setErrorMessage(null);

        const supabase = getSupabaseBrowserClient();
        const { error } = await supabase.auth.signOut();

        if (error) {
          throw error;
        }

        window.location.assign(`${window.location.pathname}${window.location.search}`);
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "세션을 종료하지 못했어요.",
        );
      }
    });
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="rounded-full border border-[color:rgba(46,166,122,0.18)] bg-[color:rgba(46,166,122,0.08)] px-3 py-1 text-xs font-medium text-[var(--olive)]">
          local session: {sessionSummary.email ?? "signed-in"}
        </div>
        <button
          className="rounded-full border border-[var(--line)] bg-white/80 px-3 py-1 text-xs font-semibold text-[var(--muted)] disabled:opacity-60"
          disabled={isPending}
          onClick={handleSignOut}
          type="button"
        >
          {isPending ? "세션 종료 중..." : "로컬 세션 종료"}
        </button>
      </div>
      {errorMessage ? (
        <p className="text-xs text-[var(--brand-deep)]">{errorMessage}</p>
      ) : null}
    </div>
  );
}
