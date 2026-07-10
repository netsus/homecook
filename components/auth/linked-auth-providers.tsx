"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createAuthProviderAttemptCookie } from "@/lib/auth/provider-cookies";
import { AUTH_PROVIDER_META, getEnabledAuthProviders, getSupabaseAuthProvider, normalizeAuthProviderId, type AuthProviderId } from "@/lib/auth/providers";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import { isQaFixtureClientModeEnabled } from "@/lib/mock/qa-fixture-client";

type State = "loading" | "ready" | "error" | "unauthorized";

export function LinkedAuthProviders() {
  const [state, setState] = useState<State>("loading");
  const [linked, setLinked] = useState<AuthProviderId[]>([]);
  const [pending, setPending] = useState<AuthProviderId | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const result = searchParams.get("linkResult");
  const error = searchParams.get("linkError");
  const linkSucceeded = result === "linked" || result === "already_linked";
  const linkCancelled = error === "link_cancelled";

  useEffect(() => {
    if (isQaFixtureClientModeEnabled()) {
      const fixtureProviders = new URLSearchParams(window.location.search).get("linkedProviders")?.split(",") ?? ["google"];
      setLinked(fixtureProviders.map(normalizeAuthProviderId).filter((provider): provider is AuthProviderId => Boolean(provider)));
      setState("ready");
      return;
    }
    if (!hasSupabasePublicEnv()) { setState("unauthorized"); return; }
    void getSupabaseBrowserClient().auth.getUserIdentities().then(({ data, error: identityError }: {
      data: { identities: Array<{ provider: string }> } | null;
      error: unknown;
    }) => {
      if (identityError) { setState("error"); return; }
      setLinked(Array.from(new Set((data?.identities ?? []).map((identity: { provider: string }) => normalizeAuthProviderId(identity.provider)).filter((provider: AuthProviderId | null): provider is AuthProviderId => Boolean(provider)))));
      setState("ready");
    });
  }, []);

  useEffect(() => {
    if (!result && !error) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("linkResult");
    url.searchParams.delete("linkError");
    router.replace(`${url.pathname}${url.search}`);
  }, [error, result, router]);

  async function link(provider: AuthProviderId) {
    if (pending) return;
    setPending(provider);
    document.cookie = createAuthProviderAttemptCookie(provider);
    const callback = new URL("/auth/link/callback", window.location.origin);
    callback.searchParams.set("attemptedProvider", provider);
    const { error: linkError } = await getSupabaseBrowserClient().auth.linkIdentity({
      provider: getSupabaseAuthProvider(provider),
      options: { redirectTo: callback.toString() },
    });
    if (linkError) setState("error");
    setPending(null);
  }

  return (
    <section aria-label="연결된 로그인 방법" className="mt-4 border-t border-[var(--line)] pt-4">
      <h3 className="text-sm font-extrabold text-[var(--foreground)]">연결된 로그인 방법</h3>
      <p className="mt-1 text-xs leading-5 text-[var(--muted)]">로그인할 때 사용할 수 있는 방법이에요. 계정 소유 정보는 표시하지 않아요.</p>
      {linkSucceeded ? <p role="status" className="mt-3 text-sm text-[var(--success)]">로그인 방법이 연결됐어요.</p> : null}
      {linkCancelled ? <p role="status" className="mt-3 text-sm text-[var(--muted)]">연결을 취소했어요.</p> : null}
      {error && !linkCancelled ? <p role="alert" className="mt-3 text-sm text-[var(--danger)]">{error === "link_conflict" ? "이 로그인 방법을 현재 계정에 연결하지 못했어요." : "연결에 실패했어요. 잠시 후 다시 연결해 주세요."}</p> : null}
      {state === "loading" ? <p role="status" className="mt-3 text-sm text-[var(--muted)]">연결 상태를 불러오는 중...</p> : null}
      {state === "unauthorized" ? <p className="mt-3 text-sm text-[var(--muted)]">로그인 후 연결 상태를 확인할 수 있어요. <Link className="font-bold text-[var(--brand)]" href="/login?next=/mypage">로그인으로 이동</Link></p> : null}
      {state === "error" ? <p role="alert" className="mt-3 text-sm text-[var(--danger)]">연결 상태를 불러오지 못했어요.</p> : null}
      {state === "ready" && getEnabledAuthProviders().every((provider) => linked.includes(provider)) ? <p className="mt-3 text-sm text-[var(--muted)]">사용 가능한 로그인 방법이 모두 연결됐어요.</p> : null}
      {state === "ready" ? <div className="mt-3 space-y-2">{getEnabledAuthProviders().map((provider) => {
        const isLinked = linked.includes(provider);
        return <div className="flex min-h-11 items-center justify-between gap-3 rounded-[var(--radius-control)] bg-[var(--surface-fill)] px-3" key={provider}>
          <span className="min-w-0 truncate text-sm font-semibold">{AUTH_PROVIDER_META[provider].displayName} {isLinked ? "연결됨" : "미연결"}</span>
          {!isLinked ? <button className="min-h-11 shrink-0 px-3 text-sm font-bold text-[var(--brand)] disabled:opacity-60" disabled={pending === provider} onClick={() => void link(provider)} type="button">{pending === provider ? `${AUTH_PROVIDER_META[provider].displayName} 연결 중` : `${AUTH_PROVIDER_META[provider].displayName} 연결`}</button> : <span className="text-xs font-bold text-[var(--muted)]">읽기 전용</span>}
        </div>;
      })}</div> : null}
    </section>
  );
}
