"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

import { MARKETING_VALIDATION_TURNSTILE_ACTION } from "@/lib/marketing/demand-validation";

const TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const DEFAULT_ERROR_MESSAGE = "보안 확인을 준비 중입니다. 잠시 후 다시 시도해 주세요.";
const SITE_KEY = process.env.NEXT_PUBLIC_MARKETING_TURNSTILE_SITE_KEY?.trim()
  || (process.env.NEXT_PUBLIC_HOMECOOK_ENABLE_QA_FIXTURES === "1" ? "qa-fixture-site-key" : "");

type TurnstileResult = { ok: true; token: string } | { ok: false; message: string };
type TurnstileWidgetId = string | number;

interface TurnstileApi {
  render: (
    container: HTMLElement,
    options: {
      action: string;
      appearance: "interaction-only";
      callback: (token: string) => void;
      "error-callback": () => void;
      "expired-callback": () => void;
      size: "flexible";
      sitekey: string;
    },
  ) => TurnstileWidgetId;
  reset: (widgetId?: TurnstileWidgetId) => void;
  remove?: (widgetId?: TurnstileWidgetId) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
    __homecookMarketingTurnstileScriptPromise__?: Promise<TurnstileApi>;
  }
}

export interface MarketingTurnstileController {
  getToken: () => Promise<TurnstileResult>;
  reset: () => void;
}

interface MarketingTurnstileProps {
  onControllerChange?: (controller: MarketingTurnstileController | null) => void;
}

function createTurnstileResult(token: string | null): TurnstileResult {
  return token
    ? { ok: true, token }
    : { ok: false, message: "보안 확인을 완료한 뒤 다시 시도해 주세요." };
}

async function loadTurnstileScript(): Promise<TurnstileApi> {
  if (window.turnstile) return window.turnstile;
  if (!window.__homecookMarketingTurnstileScriptPromise__) {
    window.__homecookMarketingTurnstileScriptPromise__ = new Promise<TurnstileApi>((resolve, reject) => {
      const existing = document.querySelector(`script[src="${TURNSTILE_SCRIPT_URL}"]`);
      const script = existing instanceof HTMLScriptElement ? existing : document.createElement("script");
      const handleLoad = () => {
        if (window.turnstile) resolve(window.turnstile);
        else reject(new Error("TURNSTILE_UNAVAILABLE"));
      };
      const handleError = () => reject(new Error("TURNSTILE_LOAD_FAILED"));
      script.addEventListener("load", handleLoad, { once: true });
      script.addEventListener("error", handleError, { once: true });
      if (!existing) {
        script.src = TURNSTILE_SCRIPT_URL;
        script.async = true;
        script.defer = true;
        script.setAttribute("data-homecook-marketing-turnstile", "1");
        document.head.append(script);
      }
    }).catch((error) => {
      window.__homecookMarketingTurnstileScriptPromise__ = undefined;
      throw error;
    });
  }
  return window.__homecookMarketingTurnstileScriptPromise__;
}

export function MarketingTurnstile({ onControllerChange }: MarketingTurnstileProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<TurnstileWidgetId | null>(null);
  const tokenRef = useRef<string | null>(null);
  const [errorMessage, setErrorMessage] = useState(SITE_KEY ? "" : DEFAULT_ERROR_MESSAGE);

  const reset = useMemo<MarketingTurnstileController["reset"]>(() => () => {
    tokenRef.current = null;
    setErrorMessage("");
    if (widgetIdRef.current !== null) {
      window.turnstile?.reset(widgetIdRef.current);
    }
  }, []);

  const controller = useMemo<MarketingTurnstileController>(() => ({
    getToken: async () => {
      if (!SITE_KEY) return { ok: false, message: DEFAULT_ERROR_MESSAGE };
      return createTurnstileResult(tokenRef.current);
    },
    reset,
  }), [reset]);

  useEffect(() => {
    onControllerChange?.(controller);
    return () => onControllerChange?.(null);
  }, [controller, onControllerChange]);

  useEffect(() => {
    if (!SITE_KEY || !containerRef.current || widgetIdRef.current !== null) return undefined;
    let cancelled = false;

    void loadTurnstileScript()
      .then((turnstile) => {
        if (cancelled || !containerRef.current || widgetIdRef.current !== null) return;
        widgetIdRef.current = turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          action: MARKETING_VALIDATION_TURNSTILE_ACTION,
          appearance: "interaction-only",
          size: "flexible",
          callback: (token) => {
            tokenRef.current = token.trim() || null;
            setErrorMessage("");
          },
          "expired-callback": () => {
            tokenRef.current = null;
            setErrorMessage("보안 확인이 만료됐어요. 다시 확인해 주세요.");
            window.turnstile?.reset(widgetIdRef.current ?? undefined);
          },
          "error-callback": () => {
            tokenRef.current = null;
            setErrorMessage("보안 확인을 다시 진행해 주세요.");
            window.turnstile?.reset(widgetIdRef.current ?? undefined);
          },
        });
      })
      .catch(() => {
        if (!cancelled) {
          tokenRef.current = null;
          setErrorMessage(DEFAULT_ERROR_MESSAGE);
        }
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current !== null) {
        window.turnstile?.remove?.(widgetIdRef.current);
        widgetIdRef.current = null;
      }
      tokenRef.current = null;
    };
  }, []);

  return (
    <div className="mdv2-turnstile" data-testid="marketing-turnstile">
      <div ref={containerRef} />
      {errorMessage ? (
        <p className="mdv2-turnstile-status" role="status" aria-live="polite">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}

export { TURNSTILE_SCRIPT_URL };
