"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getAuthSupabaseEnv } from "@/lib/supabase/auth-env";

type BrowserAuth = ReturnType<typeof createBrowserClient>["auth"];

export interface AuthSupabaseBrowserFacade {
  readonly auth: Readonly<{
    getSession: BrowserAuth["getSession"];
    getUserIdentities: BrowserAuth["getUserIdentities"];
    linkIdentity: BrowserAuth["linkIdentity"];
    onAuthStateChange: BrowserAuth["onAuthStateChange"];
    signInWithOAuth: BrowserAuth["signInWithOAuth"];
    signInWithPassword: BrowserAuth["signInWithPassword"];
    signUp: BrowserAuth["signUp"];
  }>;
}

let browserAuthFacade: AuthSupabaseBrowserFacade | null = null;

function authOnlyFetch(
  configuredUrl: string,
  fetchImpl: typeof globalThis.fetch,
): typeof globalThis.fetch {
  const configuredOrigin = new URL(configuredUrl).origin;

  return async (input, init) => {
    const requestUrl = new URL(
      input instanceof Request ? input.url : input.toString(),
      configuredOrigin,
    );
    const authPath = requestUrl.pathname === "/auth/v1"
      || requestUrl.pathname.startsWith("/auth/v1/");
    if (requestUrl.origin !== configuredOrigin || !authPath) {
      throw new Error("Browser Auth-only transport blocked a non-Auth request");
    }
    return fetchImpl(input, init);
  };
}

function bindAuthFacade(
  auth: BrowserAuth,
): AuthSupabaseBrowserFacade {
  return Object.freeze({
    auth: Object.freeze({
      getSession: auth.getSession.bind(auth),
      getUserIdentities: auth.getUserIdentities.bind(auth),
      linkIdentity: auth.linkIdentity.bind(auth),
      onAuthStateChange: auth.onAuthStateChange.bind(auth),
      signInWithOAuth: auth.signInWithOAuth.bind(auth),
      signInWithPassword: auth.signInWithPassword.bind(auth),
      signUp: auth.signUp.bind(auth),
    }),
  });
}

export function getAuthSupabaseBrowserClient(): AuthSupabaseBrowserFacade {
  if (browserAuthFacade) {
    return browserAuthFacade;
  }

  const { url, publishableKey } = getAuthSupabaseEnv();
  const client = createBrowserClient(url, publishableKey, {
    global: {
      fetch: authOnlyFetch(url, globalThis.fetch.bind(globalThis)),
    },
  });
  browserAuthFacade = bindAuthFacade(client.auth);

  return browserAuthFacade;
}
