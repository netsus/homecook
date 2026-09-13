"use client";

import React, { useEffect, useRef, useState } from "react";
import type { Round2Topic } from "@/lib/marketing-round2";

export const ROUND2_TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const UNAVAILABLE = "보안 확인을 준비하지 못했어요. 다시 시도해 주세요.";
type BaseProvider = NonNullable<Window["turnstile"]>;
type RenderOptions = Omit<Parameters<BaseProvider["render"]>[1], "size"> & { size: "compact"; "response-field": false };
type Provider = Omit<BaseProvider, "render"> & { render: (container: HTMLElement, options: RenderOptions) => string | number };
const currentProvider = () => window.turnstile as unknown as Provider | undefined;
let pendingScript: Promise<Provider> | undefined;

function loadProvider(): Promise<Provider> {
  const loaded = currentProvider();
  if (loaded) return Promise.resolve(loaded);
  if (pendingScript) return pendingScript;
  pendingScript = new Promise<Provider>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${ROUND2_TURNSTILE_SCRIPT_URL}"]`);
    const script = existing ?? document.createElement("script");
    const failure = () => { script.remove(); reject(new Error("TURNSTILE_UNAVAILABLE")); };
    script.addEventListener("load", () => { const api = currentProvider(); if (api) resolve(api); else failure(); }, { once: true });
    script.addEventListener("error", failure, { once: true });
    if (!existing) {
      script.src = ROUND2_TURNSTILE_SCRIPT_URL;
      script.async = true;
      script.defer = true;
      script.referrerPolicy = "no-referrer";
      document.head.append(script);
    }
  }).catch(error => { pendingScript = undefined; throw error; });
  return pendingScript;
}

export interface Round2TurnstileProps {
  siteKey: string;
  topic: Round2Topic;
  onToken: (token: string | null) => void;
  onError: (message: string) => void;
  resetKey: number;
}

export function Round2Turnstile({ siteKey, topic, onToken, onError, resetKey }: Round2TurnstileProps) {
  const container = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onToken, onError });
  useEffect(() => { callbacks.current = { onToken, onError }; }, [onToken, onError]);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let cancelled = false;
    let provider: Provider | undefined;
    let widget: string | number | undefined;
    callbacks.current.onToken(null);
    const fail = (text: string) => {
      if (cancelled) return;
      callbacks.current.onToken(null);
      callbacks.current.onError(text);
      setMessage(text);
    };
    if (!siteKey.trim()) { fail(UNAVAILABLE); return; }
    setMessage("");
    void loadProvider().then(api => {
      if (cancelled || !container.current) return;
      provider = api;
      widget = api.render(container.current, {
        action: `mumeok_r2_${topic}`,
        sitekey: siteKey,
        appearance: "interaction-only",
        size: "compact",
        "response-field": false,
        callback: token => {
          if (cancelled) return;
          callbacks.current.onToken(token.trim() || null);
          setMessage("");
        },
        "expired-callback": () => {
          fail("보안 확인이 만료됐어요. 다시 확인해 주세요.");
          if (!cancelled && widget !== undefined) api.reset(widget);
        },
        "error-callback": () => {
          fail("보안 확인을 다시 진행해 주세요.");
          if (!cancelled && widget !== undefined) api.reset(widget);
        },
      });
    }).catch(() => fail(UNAVAILABLE));
    return () => {
      cancelled = true;
      if (widget !== undefined) provider?.remove?.(widget);
      callbacks.current.onToken(null);
    };
  }, [siteKey, topic, resetKey]);
  return <div data-testid="round2-turnstile"><div ref={container} />{message && <p role="status" aria-live="polite">{message}</p>}</div>;
}
